# encoding: UTF-8
# ═══════════════════════════════════════════════════════════════════════════
# SignEng — Desenho Geométrico (ferramenta de toolbar) — FASE 1
# ═══════════════════════════════════════════════════════════════════════════
# FOTO → MOSAICO LOW-POLY em ACM (estilo "quadro geométrico de pet"):
# o usuário carrega uma imagem (JPG/PNG), o SERVIDOR (geoArtCompute) faz o
# recorte de fundo + amostragem por bordas + triangulação de Delaunay +
# cores médias (anti-pirataria: o cérebro NASCE no servidor — o plugin só
# envia a foto e desenha os triângulos que voltam), o painel mostra o
# preview e o Gerar desenha o mosaico 3D: cada triângulo é uma peça de ACM
# extrudada na cor média, com junta (folga) opcional entre as peças.
# PRÉ-LANÇAMENTO: sem card no dashboard e sem entrada no site/admin.
# ═══════════════════════════════════════════════════════════════════════════

module SignEng
  module Generator
    module GeoArt

      @dialog  = nil
      @img_b64 = nil
      @img_fmt = "jpeg"
      @result  = nil   # { "w"=>, "h"=>, "tris"=>[{"p"=>[[x,y]×3],"c"=>[r,g,b]}] }
      @mesh3d  = nil   # { "verts"=>[[x,y,z]…], "faces"=>[[a,b,c]…] } (glTF: Y pra cima)

      def self.ativar
        abrir_dialogo
      end

      def self.abrir_dialogo
        if @dialog && @dialog.visible?
          @dialog.bring_to_front
          return
        end
        @dialog = UI::HtmlDialog.new(
          dialog_title:    "SignEng — Desenho Geométrico",
          preferences_key: "com.signeng.geoart",
          width:           460,
          height:          760,
          min_width:       400,
          min_height:      600,
          resizable:       true,
          style:           UI::HtmlDialog::STYLE_DIALOG
        )
        @dialog.set_file(File.join(SignEng::UI_DIR, 'tools', 'desenho_geometrico', 'index.html'))
        registrar_callbacks(@dialog)
        @dialog.set_on_closed { @dialog = nil }
        @dialog.show
      end

      def self.registrar_callbacks(dlg)
        dlg.add_action_callback("geoart_ctx") do |_ctx, json|
          data  = SignEng.parse_payload(json)
          lang  = Sketchup.read_default(SignEng::DEFAULT_NS, "lang", "pt").to_s
          lang  = "pt" unless %w[pt es en].include?(lang)
          SignEng.resolver(dlg, data["id"], { ok: true, lang: lang, version: Core::VERSION })
        end

        # Carrega a FOTO (JPG/PNG) → guarda base64 + devolve data-url pro preview
        dlg.add_action_callback("geoart_carregar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            path = UI.openpanel("Selecione a foto (JPG/PNG)", "", "Imagens|*.jpg;*.jpeg;*.png||")
            if path.nil?
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.cancelled" })
              next
            end
            ext = File.extname(path).downcase.delete('.')
            ext = 'jpeg' if ext == 'jpg'
            unless %w[jpeg png].include?(ext)
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.invalid_ext" })
              next
            end
            bytes = File.binread(path)
            if bytes.bytesize > 12 * 1024 * 1024
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.too_big" })
              next
            end
            require 'base64'
            @img_b64 = Base64.strict_encode64(bytes)
            @img_fmt = ext
            @result  = nil
            @mesh3d  = nil
            SignEng.resolver(dlg, data["id"], {
              ok: true, filename: File.basename(path),
              data_url: "data:image/#{ext};base64,#{@img_b64}"
            })
          rescue => e
            SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.exception", error: e.message })
          end
        end

        # Processa no SERVIDOR (Delaunay + cores) → devolve triângulos pro preview
        dlg.add_action_callback("geoart_processar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            unless @img_b64
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.no_image" })
              next
            end
            r = solicitar_geoart_servidor({
              "img"           => @img_b64,
              "pontos"        => (data["pontos"] || 350).to_i,
              "remover_fundo" => data["remover_fundo"] == true,
              "tol"           => (data["tol"] || 40).to_i
            })
            unless r[:ok]
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.server", error: r[:error] })
              next
            end
            @result = r[:result]
            SignEng.resolver(dlg, data["id"], {
              ok: true, w: @result["w"], h: @result["h"],
              n: (@result["tris"] || []).length, tris: @result["tris"]
            })
          rescue => e
            SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.exception", error: e.message })
          end
        end

        # Gera o MOSAICO 3D: cada triângulo = peça de ACM extrudada na cor média
        dlg.add_action_callback("geoart_gerar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            v = Core::Auth.assert_valid!
            unless v[:ok]
              SignEng.resolver(dlg, data["id"], v.merge(blocked: true))
              next
            end
            unless @result && @result["tris"] && !@result["tris"].empty?
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.no_result" })
              next
            end
            n = gerar_mosaico(
              (data["larg_mm"]  || 600).to_f,
              (data["esp_mm"]   || 3).to_f,
              (data["folga_mm"] || 2).to_f
            )
            SignEng.resolver(dlg, data["id"], { ok: true, n: n })
          rescue => e
            Sketchup.active_model.abort_operation rescue nil
            SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.exception", error: e.message })
          end
        end

        # 3D COM IA: foto → Hunyuan3D-2 (via servidor) → malha low-poly decimada
        dlg.add_action_callback("geoart_3d_processar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            unless @img_b64
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.no_image" })
              next
            end
            r = solicitar_geoart3d_servidor({
              "img"     => @img_b64,
              "formato" => @img_fmt,
              "faces"   => (data["faces"] || 500).to_i
            })
            unless r[:ok]
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.server", error: r[:error] })
              next
            end
            @mesh3d = r[:result]
            SignEng.resolver(dlg, data["id"], {
              ok: true, nv: @mesh3d["nv"], nf: @mesh3d["nf"],
              verts: @mesh3d["verts"], faces: @mesh3d["faces"]
            })
          rescue => e
            SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.exception", error: e.message })
          end
        end

        # Gera o SÓLIDO 3D no SketchUp a partir da malha decimada
        dlg.add_action_callback("geoart_3d_gerar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            v = Core::Auth.assert_valid!
            unless v[:ok]
              SignEng.resolver(dlg, data["id"], v.merge(blocked: true))
              next
            end
            unless @mesh3d && @mesh3d["faces"] && !@mesh3d["faces"].empty?
              SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.no_result3d" })
              next
            end
            n = gerar_solido3d((data["larg_mm"] || 600).to_f)
            SignEng.resolver(dlg, data["id"], { ok: true, n: n })
          rescue => e
            Sketchup.active_model.abort_operation rescue nil
            SignEng.resolver(dlg, data["id"], { ok: false, code: "geoart.exception", error: e.message })
          end
        end
      end

      # ── DESENHO do mosaico (dados do servidor; aqui é só extrusão/cores) ──
      def self.gerar_mosaico(larg_mm, esp_mm, folga_mm)
        model = Sketchup.active_model
        w   = @result["w"].to_f
        h   = @result["h"].to_f
        sc  = (larg_mm / 25.4) / w     # px → polegadas (larg final = larg_mm)
        esp = esp_mm / 25.4
        fol = folga_mm / 25.4

        model.start_operation("Desenho Geométrico SignEng", true)
        grp = model.active_entities.add_group
        grp.name = "GeoArt #{larg_mm.round}mm"
        grp.layer = model.layers.add("GEO - Mosaico")
        ge = grp.entities
        mats = {}
        feitos = 0

        (@result["tris"] || []).each do |t|
          pts = t["p"].map { |x, y| [x.to_f * sc, (h - y.to_f) * sc] }   # flip Y (imagem cresce pra baixo)
          cx = pts.sum { |p| p[0] } / 3.0
          cz = pts.sum { |p| p[1] } / 3.0
          # junta: encolhe cada vértice em direção ao centróide por folga/2
          face_pts = pts.map do |px, pz|
            dx = px - cx
            dz = pz - cz
            d  = Math.sqrt(dx * dx + dz * dz)
            f  = d > 1e-9 ? [1.0 - (fol / 2.0) / d, 0.15].max : 1.0
            Geom::Point3d.new(cx + dx * f, 0, cz + dz * f)
          end
          begin
            face = ge.add_face(face_pts)
            next unless face
            cor = t["c"] || [180, 180, 180]
            mk = cor.join('_')
            mat = mats[mk] ||= begin
              m = model.materials["GeoArt_#{mk}"] || model.materials.add("GeoArt_#{mk}")
              m.color = Sketchup::Color.new(cor[0].to_i, cor[1].to_i, cor[2].to_i)
              m
            end
            face.material = mat
            face.back_material = mat
            face.reverse! if face.normal.y > 0    # frente do quadro voltada pro -Y (pra quem olha)
            face.pushpull(esp)
            feitos += 1
          rescue => e
            puts "[GeoArt] triângulo falhou (segue): #{e.message}"
          end
        end

        model.commit_operation
        sel = model.selection
        sel.clear
        sel.add(grp)
        model.active_view.zoom(sel.to_a)
        feitos
      end

      # ── SÓLIDO 3D: monta a malha decimada (glTF Y-up → SketchUp Z-up) ─────
      def self.gerar_solido3d(larg_mm)
        model = Sketchup.active_model
        verts = @mesh3d["verts"]
        faces = @mesh3d["faces"]

        # bbox no espaço do SketchUp: (x, -z, y)
        pts = verts.map { |x, y, z| [x.to_f, -z.to_f, y.to_f] }
        min = [0, 1, 2].map { |k| pts.map { |p| p[k] }.min }
        max = [0, 1, 2].map { |k| pts.map { |p| p[k] }.max }
        dx  = max[0] - min[0]
        dim = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].max
        sc  = (larg_mm / 25.4) / (dx > 1e-9 ? dx : (dim > 1e-9 ? dim : 1.0))

        model.start_operation("Desenho Geométrico 3D SignEng", true)
        pm  = Geom::PolygonMesh.new(pts.length, faces.length)
        idx = pts.map do |x, y, z|
          pm.add_point(Geom::Point3d.new((x - min[0]) * sc, (y - min[1]) * sc, (z - min[2]) * sc))
        end
        feitos = 0
        faces.each do |a, b, c|
          begin
            pm.add_polygon(idx[a.to_i], idx[b.to_i], idx[c.to_i])
            feitos += 1
          rescue => e
            puts "[GeoArt3D] face falhou (segue): #{e.message}"
          end
        end
        grp = model.active_entities.add_group
        grp.name  = "GeoArt 3D #{larg_mm.round}mm"
        grp.layer = model.layers.add("GEO - Solido 3D")
        grp.entities.add_faces_from_mesh(pm, 0)   # 0 = arestas duras (visual low-poly)
        model.commit_operation

        sel = model.selection
        sel.clear
        sel.add(grp)
        model.active_view.zoom(sel.to_a)
        feitos
      end

      # Chama a function geoArt3D (IA leva minutos → timeout longo)
      def self.solicitar_geoart3d_servidor(payload)
        ns = Core::Auth::DEFAULT_NS
        access_token = Sketchup.read_default(ns, "sb_access_token", "").to_s
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if access_token.empty?

        r = Core::SupabaseClient.call_function("geoArt3D", payload, access_token, 560)
        if !r[:ok] && r[:status].to_i == 401
          refresh = Sketchup.read_default(ns, "sb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::SupabaseClient.refresh_session(refresh)
            if ref[:ok]
              access_token = ref[:access_token]
              Core::Auth.save_tokens(ref)
              r = Core::SupabaseClient.call_function("geoArt3D", payload, access_token, 560)
            end
          end
        end

        unless r[:ok]
          msg = case r[:status].to_i
                when 403 then "Acesso negado: #{r[:error]}"
                when 401 then "Sessão expirada — faça login novamente no SignEng."
                else r[:code].to_s == "function.not_found" ? r[:error] : "Sem conexão com o servidor SignEng (#{r[:error]}). Verifique sua internet e tente novamente."
                end
          return { ok: false, error: msg }
        end

        { ok: true, result: r[:result] || {} }
      end

      # Chama a function geoArtCompute (token + retry 1x, msgs padrão)
      def self.solicitar_geoart_servidor(payload)
        ns = Core::Auth::DEFAULT_NS
        access_token = Sketchup.read_default(ns, "sb_access_token", "").to_s
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if access_token.empty?

        r = Core::SupabaseClient.call_function("geoArtCompute", payload, access_token)
        if !r[:ok] && r[:status].to_i == 401
          refresh = Sketchup.read_default(ns, "sb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::SupabaseClient.refresh_session(refresh)
            if ref[:ok]
              access_token = ref[:access_token]
              Core::Auth.save_tokens(ref)
              r = Core::SupabaseClient.call_function("geoArtCompute", payload, access_token)
            end
          end
        end

        unless r[:ok]
          msg = case r[:status].to_i
                when 403 then "Acesso negado: #{r[:error]}"
                when 401 then "Sessão expirada — faça login novamente no SignEng."
                else r[:code].to_s == "function.not_found" ? r[:error] : "Sem conexão com o servidor SignEng (#{r[:error]}). Verifique sua internet e tente novamente."
                end
          return { ok: false, error: msg }
        end

        { ok: true, result: r[:result] || {} }
      end

    end # GeoArt
  end
end
