# encoding: UTF-8
# ============================================================================
# SignEng — Módulo TEXTURA SINCRONIZADA
# ============================================================================
# Aplica uma única textura "atravessando" várias faces de forma contínua,
# como se as faces fossem janelas mostrando uma única imagem por trás.
#
# Diferença pro módulo legacy (acm_facade_generator):
#   - Retorna hashes via Bridge promise (não usa execute_script)
#   - Segue o padrão do AutoACM (begin/rescue + códigos de erro)
#   - State class-level com attr_accessor pra sobreviver entre callbacks
#
# Fluxo:
#   1. Usuário seleciona faces no SketchUp
#   2. capturar_faces_data → coleta, projeta no plano dominante, retorna 2D
#   3. carregar_imagem_data → Ruby abre UI.openpanel, lê arquivo, converte
#      pra base64 e retorna como data-URL pro canvas do JS
#   4. aplicar_textura(params) → mapeia UV de cada face usando coords
#      mundiais (garantia de sincronia entre todas as faces)
# ============================================================================

module SignEng
  module Generator
    module TexturaSync

      # Estado entre callbacks (persiste enquanto o usuário estiver no módulo)
      @captured   = nil   # { plane:, faces: [{face:, transform:}], bbox: [...] }
      @image_path = nil

      class << self
        attr_accessor :captured, :image_path
      end

      # ======================================================================
      # CAPTURAR FACES — versão Bridge (retorna hash)
      #
      # Retorno:
      #   { ok: true, plane: "xy"|"yz"|"xz", bbox: [xmin,ymin,xmax,ymax],
      #     faces: [{id, outer: [[x,y],...], inners: [[[x,y],...]]}], n: N }
      #   { ok: false, code: "texturasync.no_selection" | "texturasync.no_faces" }
      # ======================================================================
      def self.capturar_faces_data
        model = Sketchup.active_model
        sel = model.selection

        return { ok: false, code: "texturasync.no_selection" } if sel.empty?

        # Coleta faces recursivamente acumulando transformação
        coletadas = []
        sel.each { |ent| coletar_faces(ent, Geom::Transformation.new, coletadas) }

        return { ok: false, code: "texturasync.no_faces" } if coletadas.empty?

        # Plano dominante: a HEURÍSTICA (normais ponderadas por área) roda na
        # function texturaSyncCompute (anti-pirataria) — aqui só coletamos os
        # dados e usamos o plano que volta.
        normals = coletadas.map do |item|
          n = item[:face].normal.transform(item[:transform])
          { "n" => [n.x, n.y, n.z], "area" => item[:face].area.to_f }
        end
        r = solicitar_texsync_servidor({ "op" => "plane", "normals" => normals })
        return { ok: false, code: "texturasync.server", error: r[:error] } unless r[:ok]
        plane = r[:result]["plane"].to_sym

        # Projeta tudo pra 2D e calcula bbox global
        faces_data = []
        xmin = ymin =  1.0e30
        xmax = ymax = -1.0e30

        coletadas.each_with_index do |item, idx|
          f  = item[:face]
          tr = item[:transform]

          outer = f.outer_loop.vertices.map do |v|
            wp = v.position.transform(tr)
            px, py = proj2d(wp, plane)
            xmin = px if px < xmin
            xmax = px if px > xmax
            ymin = py if py < ymin
            ymax = py if py > ymax
            [px, py]
          end

          inners = []
          if f.respond_to?(:loops)
            f.loops.each do |lp|
              next if lp.outer?
              inners << lp.vertices.map do |v|
                wp = v.position.transform(tr)
                px, py = proj2d(wp, plane)
                [px, py]
              end
            end
          end

          faces_data << { id: idx, outer: outer, inners: inners }
        end

        # Salva state pra o aplicar usar depois
        @captured = {
          plane: plane,
          faces: coletadas,
          bbox:  [xmin, ymin, xmax, ymax]
        }

        # Converte pra mm (escala usada pelo canvas JS)
        faces_mm = faces_data.map do |fc|
          {
            id:     fc[:id],
            outer:  fc[:outer].map  { |p| [(p[0]/1.mm).round(2), (p[1]/1.mm).round(2)] },
            inners: fc[:inners].map { |lp| lp.map { |p| [(p[0]/1.mm).round(2), (p[1]/1.mm).round(2)] } }
          }
        end
        bbox_mm = [xmin, ymin, xmax, ymax].map { |v| (v/1.mm).round(2) }

        {
          ok:    true,
          plane: plane.to_s,
          bbox:  bbox_mm,
          faces: faces_mm,
          n:     coletadas.length
        }
      rescue => e
        puts "[TexturaSync] capturar_faces_data exception: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        { ok: false, code: "texturasync.exception", error: e.message }
      end

      # ======================================================================
      # CARREGAR IMAGEM — abre UI.openpanel do SketchUp, retorna data-URL
      #
      # Retorno:
      #   { ok: true, filename: "xxx.jpg", data_url: "data:image/jpeg;base64,...",
      #     size: bytes, width_hint: nil, height_hint: nil }
      #   { ok: false, code: "texturasync.cancelled" | "texturasync.invalid_file" }
      # ======================================================================
      def self.carregar_imagem_data
        path = UI.openpanel(
          "Selecione a textura (PNG/JPG/BMP)",
          "",
          "Imagens|*.png;*.jpg;*.jpeg;*.bmp||"
        )
        return { ok: false, code: "texturasync.cancelled" } unless path
        return { ok: false, code: "texturasync.invalid_file" } unless File.exist?(path)

        ext = File.extname(path).downcase.delete('.')
        return { ok: false, code: "texturasync.invalid_ext" } unless %w[png jpg jpeg bmp].include?(ext)
        ext = 'jpeg' if ext == 'jpg'

        require 'base64'
        bytes = File.binread(path)
        b64   = Base64.strict_encode64(bytes)
        data_url = "data:image/#{ext};base64,#{b64}"

        # Guarda o path pro aplicar usar (SketchUp materials.add + texture =)
        @image_path = path

        {
          ok:       true,
          filename: File.basename(path),
          data_url: data_url,
          size:     bytes.bytesize,
          path:     path
        }
      rescue => e
        puts "[TexturaSync] carregar_imagem exception: #{e.message}"
        { ok: false, code: "texturasync.exception", error: e.message }
      end

      # ======================================================================
      # APLICAR TEXTURA — mapeia UV usando coords mundiais (sincronia total)
      #
      # Params (recebidos do JS em mm/graus):
      #   tx_x, tx_y — centro do retângulo de textura (mm)
      #   tx_w, tx_h — dimensões do retângulo (mm)
      #   tx_rot     — rotação em graus (horário)
      #
      # Retorno:
      #   { ok: true, n_faces_aplicadas: N, material_name: "..." }
      #   { ok: false, code: "texturasync.no_capture" | "texturasync.no_image" | ... }
      # ======================================================================
      def self.aplicar_textura(params)
        return { ok: false, code: "texturasync.no_capture" } unless @captured
        return { ok: false, code: "texturasync.no_image" } unless @image_path && File.exist?(@image_path)

        cx_mm = (params[:tx_x] || params["tx_x"] || 0.0).to_f
        cy_mm = (params[:tx_y] || params["tx_y"] || 0.0).to_f
        w_mm  = (params[:tx_w] || params["tx_w"] || 1000.0).to_f
        h_mm  = (params[:tx_h] || params["tx_h"] || 1000.0).to_f
        rot_d = (params[:tx_rot] || params["tx_rot"] || 0.0).to_f

        return { ok: false, code: "texturasync.invalid_size" } if w_mm <= 0 || h_mm <= 0

        tw   = w_mm.mm
        th   = h_mm.mm
        plane = @captured[:plane]

        # O MAPEAMENTO UV SINCRONIZADO (translação pro centro, rotação inversa,
        # normalização [0..1]) roda na function texturaSyncCompute — o plugin
        # projeta os vértices (mm), envia, e usa os UVs que voltam.
        faces_req = []
        locais = []   # [idx] → { face:, local_pts: [Point3d...] }
        @captured[:faces].each_with_index do |item, idx|
          f  = item[:face]
          tr = item[:transform]
          next unless f.valid?
          verts = f.outer_loop.vertices
          n = [verts.length, 4].min
          lpts = []
          ppts = []
          verts.first(n).each do |v|
            lpts << v.position
            px, py = proj2d(v.position.transform(tr), plane)
            ppts << [(px / 1.mm).round(4), (py / 1.mm).round(4)]
          end
          faces_req << { "id" => idx, "pts" => ppts }
          locais << { face: f, local_pts: lpts, id: idx }
        end

        r = solicitar_texsync_servidor({
          "op" => "uv", "faces" => faces_req,
          "tx" => { "cx" => cx_mm, "cy" => cy_mm, "w" => w_mm, "h" => h_mm, "rot" => rot_d }
        })
        return { ok: false, code: "texturasync.server", error: r[:error] } unless r[:ok]
        uv_por_id = {}
        (r[:result]["uvs"] || []).each { |u| uv_por_id[u["id"]] = u["uv"] }

        model = Sketchup.active_model
        model.start_operation("Aplicar Textura Sincronizada", true)
        begin
          mat_name = "TexSync_#{File.basename(@image_path, '.*')}_#{Time.now.to_i}"
          mat = model.materials.add(mat_name)
          mat.texture = @image_path
          mat.texture.size = [tw, th] if mat.texture
          mat.alpha = 1.0

          aplicadas = 0
          locais.each do |lc|
            f   = lc[:face]
            uvs = uv_por_id[lc[:id]]
            next unless f.valid? && uvs && uvs.length == lc[:local_pts].length

            pts = []
            lc[:local_pts].each_with_index do |local_pt, i|
              pts << local_pt << Geom::Point3d.new(uvs[i][0], uvs[i][1], 0)
            end

            begin
              f.position_material(mat, pts, true)
              aplicadas += 1
            rescue => e
              puts "[TexturaSync] falha position_material: #{e.message}"
              # Fallback: aplica sem mapeamento UV
              f.material = mat
            end
          end

          model.commit_operation
          { ok: true, n_faces_aplicadas: aplicadas, material_name: mat_name }
        rescue => e
          model.abort_operation
          puts "[TexturaSync] aplicar exception: #{e.message}"
          { ok: false, code: "texturasync.apply_error", error: e.message }
        end
      end

      # ======================================================================
      # RESET — limpa o state (chamado quando o módulo fecha)
      # ======================================================================
      def self.reset_state
        @captured   = nil
        @image_path = nil
        { ok: true }
      end

      # ======================================================================
      # SOLICITAR_TEXSYNC_SERVIDOR — chama a function texturaSyncCompute
      # (valida licença + módulo textura_sync). Token + retry 1x, msgs padrão.
      # Devolve { ok: true, result: {...} } ou { ok: false, error: msg }.
      # ======================================================================
      def self.solicitar_texsync_servidor(payload)
        ns = Core::Auth::DEFAULT_NS
        access_token = Sketchup.read_default(ns, "sb_access_token", "").to_s
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if access_token.empty?

        r = Core::SupabaseClient.call_function("texturaSyncCompute", payload, access_token)
        if !r[:ok] && r[:status].to_i == 401
          refresh = Sketchup.read_default(ns, "sb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::SupabaseClient.refresh_session(refresh)
            if ref[:ok]
              access_token = ref[:access_token]
              Core::Auth.save_tokens(ref)
              r = Core::SupabaseClient.call_function("texturaSyncCompute", payload, access_token)
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

      # ======================================================================
      # HELPERS INTERNOS
      # ======================================================================

      # Coleta faces recursivamente acumulando transformação
      def self.coletar_faces(ent, tr, out)
        if ent.is_a?(Sketchup::Face)
          out << { face: ent, transform: tr }
        elsif ent.is_a?(Sketchup::Group)
          new_tr = tr * ent.transformation
          ent.entities.each { |c| coletar_faces(c, new_tr, out) }
        elsif ent.is_a?(Sketchup::ComponentInstance)
          new_tr = tr * ent.transformation
          ent.definition.entities.each { |c| coletar_faces(c, new_tr, out) }
        end
        # ignora arestas avulsas e outros entities
      end

      # Projeta um Point3d pro 2D do plano dominante
      def self.proj2d(pt, plane)
        case plane
        when :xy then [pt.x, pt.y]
        when :yz then [pt.y, pt.z]
        else          [pt.x, pt.z]   # :xz
        end
      end

    end
  end
end
