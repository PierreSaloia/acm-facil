# ═══════════════════════════════════════════════════════════════════════════
# ACMFacil — Planifica
# ═══════════════════════════════════════════════════════════════════════════
# Planificação + plano de corte (nesting) de móveis em MDF.
# Fluxo: seleciona o móvel no SketchUp → detecta as chapas (L×A×espessura) →
# o JS faz o nesting e mostra preview 2D → exporta EPS.
#
# Ruby cuida de: (1) detectar os painéis chatos da seleção; (2) escrever o EPS
# a partir do layout já calculado pelo JS.
# ═══════════════════════════════════════════════════════════════════════════

module ACMFacil
  module Generator
    module Planifica

      # Espessura máxima (mm) pra um sólido ser considerado "chapa/painel".
      ESP_MAX_MM      = 60.0
      # Razão máxima espessura/lado pra ser "chato" (descarta tubo/metalon).
      RATIO_FLAT      = 0.40
      # Lado menor mínimo (mm) pra valer como painel (descarta perfis finos).
      LADO_MIN_MM     = 50.0

      # ──────────────────────────────────────────────────────────────────────
      # CAPTURAR — varre a seleção e devolve a lista de painéis de MDF.
      # Cada painel: { id, nome, esp, larg, comp, area } em mm.
      # ──────────────────────────────────────────────────────────────────────
      def self.capturar
        model = Sketchup.active_model
        sel   = model.selection
        return { ok: false, code: "planifica.nada_selecionado" } if sel.nil? || sel.empty?

        paineis = []
        sel.each { |e| coletar_paineis(e, Geom::Transformation.new, paineis) }
        return { ok: false, code: "planifica.nenhum_painel" } if paineis.empty?

        # Ordena por área desc e numera
        paineis.sort_by! { |p| -p[:area] }
        paineis.each_with_index { |p, i| p[:id] = "p#{i + 1}" }

        # Bbox global do móvel (mm) — pra o JS centralizar a vista isométrica
        mnx = mny = mnz =  1.0e12
        mxx = mxy = mxz = -1.0e12
        paineis.each do |p|
          p[:corners].each do |c|
            mnx = c[0] if c[0] < mnx; mxx = c[0] if c[0] > mxx
            mny = c[1] if c[1] < mny; mxy = c[1] if c[1] > mxy
            mnz = c[2] if c[2] < mnz; mxz = c[2] if c[2] > mxz
          end
        end

        # Resumo por espessura
        por_esp = Hash.new(0)
        paineis.each { |p| por_esp[p[:esp]] += 1 }

        {
          ok: true, paineis: paineis, espessuras: por_esp.keys.sort, total: paineis.size,
          bbox: { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] }
        }
      end

      # Recursão: nós com sub-grupos são containers (recursa, acumulando o
      # transform); folhas (só faces/arestas) são medidas e classificadas como
      # painel se forem chatas. Guarda os 8 cantos NO MUNDO (mm) pra vista 3D.
      def self.coletar_paineis(ent, trans, out)
        return unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
        world_t = trans * ent.transformation
        subs = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities

        child_groups = subs.grep(Sketchup::Group) + subs.grep(Sketchup::ComponentInstance)
        unless child_groups.empty?
          child_groups.each { |c| coletar_paineis(c, world_t, out) }
          return
        end

        # FOLHA — mede bbox LOCAL (independe da rotação no mundo)
        bb = Geom::BoundingBox.new
        subs.grep(Sketchup::Face).each { |f| bb.add(f.bounds) if f.bounds.valid? }
        return unless bb.valid?

        dims = [bb.width, bb.height, bb.depth].map { |d| (d / 1.mm) }.sort
        t, w, l = dims          # t = menor (espessura), w/l = lados da chapa
        return if w < LADO_MIN_MM
        return unless t < ESP_MAX_MM && t <= RATIO_FLAT * w && t <= RATIO_FLAT * l

        nome = (ent.respond_to?(:name) && !ent.name.to_s.empty?) ? ent.name.to_s :
               (ent.is_a?(Sketchup::ComponentInstance) ? ent.definition.name.to_s : "Peça")
        nome = "Peça" if nome.empty?

        # 8 cantos do bbox local → mundo (mm)
        corners = (0..7).map do |i|
          p = world_t * bb.corner(i)
          [(p.x / 1.mm).round(1), (p.y / 1.mm).round(1), (p.z / 1.mm).round(1)]
        end

        pid = (ent.respond_to?(:persistent_id) ? ent.persistent_id : nil) rescue nil

        # Contorno REAL da peça (recortes + furos) a partir da maior face.
        # world_t mapeia o frame local da face (o,u,v) pro mundo — usado pra
        # desenhar/marcar a fita de borda em 3D.
        cont = extrair_contorno(subs.grep(Sketchup::Face), world_t)
        larg = cont ? cont[:larg] : w.round(1)
        comp = cont ? cont[:comp] : l.round(1)
        outline = cont ? cont[:outline] : [[0, 0], [w.round(1), 0], [w.round(1), l.round(1)], [0, l.round(1)]]
        holes   = cont ? cont[:holes] : []

        out << {
          nome: nome,
          esp:  t.round(1),
          larg: larg,
          comp: comp,
          area: (larg * comp).round(0),
          corners: corners,
          outline: outline,
          holes:   holes,
          o: cont ? cont[:o] : nil,   # origem mundo (mm) do local (0,0) da face
          u: cont ? cont[:u] : nil,   # vetor unitário mundo do eixo u (larg)
          v: cont ? cont[:v] : nil,   # vetor unitário mundo do eixo v (comp)
          pid: pid
        }
      end

      # Extrai o contorno 2D real (outer loop com recortes + inner loops = furos)
      # da maior face de um conjunto. Projeta no plano da face → coords (u,v) mm
      # normalizadas (min em 0,0). Devolve { outline:[[u,v]...], holes:[[...]],
      # larg, comp } ou nil se não der.
      def self.extrair_contorno(faces, world_t = Geom::Transformation.new)
        return nil if faces.nil? || faces.empty?
        face = faces.max_by { |f| f.area rescue 0 }
        return nil unless face && face.respond_to?(:outer_loop)
        loop_v = face.outer_loop.vertices.map(&:position)
        return nil if loop_v.size < 3

        n = face.normal
        # u = direção da aresta mais longa do outer loop (alinha c/ o lado maior)
        best = 0.0; uvec = nil
        loop_v.each_with_index do |p, i|
          q = loop_v[(i + 1) % loop_v.size]
          v = q - p
          ln = v.length
          if ln > best && ln > 1e-6
            best = ln; uvec = v.clone; uvec.normalize!
          end
        end
        return nil unless uvec
        vvec = n.cross(uvec)
        return nil if vvec.length < 1e-6
        vvec.normalize!
        origin = loop_v[0]

        proj = lambda do |pos|
          d = pos - origin
          [d.dot(uvec) / 1.mm, d.dot(vvec) / 1.mm]
        end

        outer = loop_v.map { |p| proj.call(p) }
        inner = face.loops.reject(&:outer?).map { |lp| lp.vertices.map { |vx| proj.call(vx.position) } }

        allpts = outer + inner.flatten(1)
        minu = allpts.map { |p| p[0] }.min
        minv = allpts.map { |p| p[1] }.min
        sh = lambda { |arr| arr.map { |p| [(p[0] - minu).round(2), (p[1] - minv).round(2)] } }
        outer = sh.call(outer)
        inner = inner.map { |h| sh.call(h) }

        # Frame da face no MUNDO: ponto do local (0,0) + eixos u/v unitários.
        # Permite mapear qualquer (u,v) local → ponto 3D mundo (mm) no JS.
        face_o_local = origin + Geom::Vector3d.linear_combination(minu.mm, uvec, minv.mm, vvec)
        face_o_world = world_t * face_o_local
        u_world = world_t * uvec
        v_world = world_t * vvec
        u_world.normalize! if u_world.length > 0
        v_world.normalize! if v_world.length > 0

        { outline: outer, holes: inner,
          larg: outer.map { |p| p[0] }.max.round(1),
          comp: outer.map { |p| p[1] }.max.round(1),
          o: [(face_o_world.x / 1.mm).round(2), (face_o_world.y / 1.mm).round(2), (face_o_world.z / 1.mm).round(2)],
          u: [u_world.x.round(6), u_world.y.round(6), u_world.z.round(6)],
          v: [v_world.x.round(6), v_world.y.round(6), v_world.z.round(6)] }
      rescue => e
        puts "[Planifica] extrair_contorno falhou: #{e.message}"
        nil
      end

      # ──────────────────────────────────────────────────────────────────────
      # DESTACAR — seleciona a peça no SketchUp pelo persistent_id e dá zoom.
      # Permite o usuário localizar fisicamente a peça no modelo.
      # ──────────────────────────────────────────────────────────────────────
      def self.destacar(pid)
        return { ok: false, code: "planifica.pid_nil" } if pid.nil?
        model = Sketchup.active_model
        ent = nil
        begin
          ent = model.find_entity_by_persistent_id(pid.to_i) if model.respond_to?(:find_entity_by_persistent_id)
        rescue
          ent = nil
        end
        # Fallback: varre recursivamente procurando o persistent_id
        ent ||= achar_por_pid(model.entities, pid.to_i)
        return { ok: false, code: "planifica.pid_nao_encontrado" } unless ent && ent.valid?

        sel = model.selection
        sel.clear
        sel.add(ent)
        begin
          model.active_view.zoom(sel)
        rescue
        end
        { ok: true }
      end

      def self.achar_por_pid(entities, pid)
        entities.each do |e|
          return e if e.respond_to?(:persistent_id) && e.persistent_id == pid
          if e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
            subs = e.is_a?(Sketchup::Group) ? e.entities : e.definition.entities
            found = achar_por_pid(subs, pid)
            return found if found
          end
        end
        nil
      end

      # ──────────────────────────────────────────────────────────────────────
      # EXPORTAR EPS — recebe o layout já calculado pelo JS e escreve o arquivo.
      # layout = {
      #   chapa: { larg, comp },              # mm
      #   chapas: [ { idx, parts: [ {x, y, w, h, nome, rot} ] } ]   # x,y,w,h em mm
      # }
      # Cada chapa vira uma "página" empilhada verticalmente no mesmo EPS.
      # ──────────────────────────────────────────────────────────────────────
      def self.exportar_eps(layout)
        chapa  = layout["chapa"]  || layout[:chapa]  || {}
        chapas = layout["chapas"] || layout[:chapas] || []
        return { ok: false, code: "planifica.layout_vazio" } if chapas.empty?

        cw = (chapa["larg"] || chapa[:larg] || 2750).to_f
        ch = (chapa["comp"] || chapa[:comp] || 1850).to_f

        sugerido = "plano_corte.eps"
        path = UI.savepanel("Exportar plano de corte (EPS)", "", sugerido)
        return { ok: false, code: "planifica.export_cancelado" } if path.nil?
        path += ".eps" unless path.downcase.end_with?(".eps")

        gap_mm = 80.0                       # espaço vertical entre chapas no EPS
        n      = chapas.size
        total_w_mm = cw
        total_h_mm = n * ch + (n - 1) * gap_mm

        begin
          File.open(path, "w") { |f| f.write(montar_eps(chapas, cw, ch, total_w_mm, total_h_mm, gap_mm)) }
        rescue => e
          return { ok: false, code: "planifica.export_erro", error: e.message }
        end

        { ok: true, path: path, n_chapas: n }
      end

      # Monta a string PostScript/EPS. Desenha em mm (1mm = 2.834645669 pt).
      def self.montar_eps(chapas, cw, ch, total_w_mm, total_h_mm, gap_mm)
        mm = 2.834645669
        bb_w = (total_w_mm * mm).ceil
        bb_h = (total_h_mm * mm).ceil

        s = +""
        s << "%!PS-Adobe-3.0 EPSF-3.0\n"
        s << "%%Creator: ACMFacil Planifica\n"
        s << "%%BoundingBox: 0 0 #{bb_w} #{bb_h}\n"
        s << "%%HiResBoundingBox: 0 0 #{(total_w_mm * mm).round(3)} #{(total_h_mm * mm).round(3)}\n"
        s << "%%EndComments\n"
        s << "/mm { #{mm} mul } def\n"
        s << "0.2 mm setlinewidth\n"

        # Origem PostScript = canto inferior esquerdo. Empilha chapas de cima
        # pra baixo: a chapa idx 0 fica no topo.
        chapas.each_with_index do |sheet, i|
          parts = sheet["parts"] || sheet[:parts] || []
          # y da base desta chapa (em mm), de cima pra baixo
          base_y = total_h_mm - (i + 1) * ch - i * gap_mm

          # contorno da chapa
          s << "0 setgray\n0.4 mm setlinewidth\n"
          s << "newpath #{fmt(0)} mm #{fmt(base_y)} mm moveto "
          s << "#{fmt(cw)} mm #{fmt(base_y)} mm lineto "
          s << "#{fmt(cw)} mm #{fmt(base_y + ch)} mm lineto "
          s << "#{fmt(0)} mm #{fmt(base_y + ch)} mm lineto closepath stroke\n"

          # peças — contorno REAL + furos (coords da peça em mm, y já no sistema
          # da chapa). base_y desloca a chapa pra sua "página".
          s << "0.2 mm setlinewidth\n"
          # EPS = só linhas de corte (contorno real + furos). Sem rótulos/marcas
          # de texto — máquina de corte lê só a geometria.
          parts.each do |p|
            poly  = p["poly"]  || p[:poly]  || []
            holes = p["holes"] || p[:holes] || []
            next if poly.size < 3
            s << path_eps(poly, base_y)
            holes.each { |h| s << path_eps(h, base_y) if h.is_a?(Array) && h.size >= 3 }
          end
        end

        s << "showpage\n"
        s << "%%EOF\n"
        s
      end

      def self.fmt(v)
        format("%.2f", v.to_f)
      end

      # Emite um caminho fechado (lista de [x,y] mm) deslocado em base_y (mm).
      def self.path_eps(pts, base_y)
        first = pts[0]
        s = +"newpath #{fmt(first[0])} mm #{fmt(base_y + first[1])} mm moveto "
        pts[1..-1].each { |p| s << "#{fmt(p[0])} mm #{fmt(base_y + p[1])} mm lineto " }
        s << "closepath stroke\n"
        s
      end

      # ──────────────────────────────────────────────────────────────────────
      # FITA DE BORDA — marcação visual no SketchUp.
      # Recebe os "ribbons" (quads de 4 pontos [x,y,z] em mm, mundo) das bordas
      # que TÊM fita e desenha cada um como uma faixa vermelha num grupo
      # temporário (travado, descartável). Atualiza ao vivo conforme o usuário
      # corta/adiciona fita no preview 2D.
      # ──────────────────────────────────────────────────────────────────────
      FITA_GROUP = "ACMFacil — Fita de borda".freeze

      def self.marcar_fitas(quads)
        model = Sketchup.active_model
        model.start_operation("ACMFacil — Fita de borda", true)
        apagar_grupos_fita(model)
        if quads.nil? || quads.empty?
          model.commit_operation
          return { ok: true, n: 0 }
        end
        grp = model.entities.add_group
        grp.name = FITA_GROUP
        mat = fita_material(model)
        n = 0
        quads.each do |q|
          next unless q.is_a?(Array) && q.size >= 3
          begin
            pts = q.map { |p| Geom::Point3d.new(p[0].to_f.mm, p[1].to_f.mm, p[2].to_f.mm) }
            f = grp.entities.add_face(pts)
            next unless f
            f.material = mat
            f.back_material = mat
            n += 1
          rescue
            next
          end
        end
        grp.locked = true rescue nil
        model.commit_operation
        { ok: true, n: n }
      end

      def self.limpar_fitas
        model = Sketchup.active_model
        model.start_operation("ACMFacil — limpar fita", true)
        k = apagar_grupos_fita(model)
        model.commit_operation
        { ok: true, n: k }
      end

      def self.apagar_grupos_fita(model)
        grps = model.entities.grep(Sketchup::Group).select { |g| g.valid? && g.name == FITA_GROUP }
        grps.each { |g| g.locked = false rescue nil; g.erase! if g.valid? }
        grps.size
      end

      def self.fita_material(model)
        m = model.materials["ACMFacil_Fita"] || model.materials.add("ACMFacil_Fita")
        m.color = Sketchup::Color.new(220, 38, 38)
        m.alpha = 1.0
        m
      end

      # ──────────────────────────────────────────────────────────────────────
      # BLOCO DE MÓVEIS — Móveis Industriais (MDF + metalon).
      # O CÉREBRO é o servidor (movelIndustrialCompute): calcula quadros por
      # vão, gaveteiro com corrediças dos 2 lados, pesos e sugestão econômica.
      # Aqui só desenhamos as caixas que voltam e selecionamos o grupo pra o
      # fluxo de planificação capturar em seguida.
      # ──────────────────────────────────────────────────────────────────────
      MOVEL_CORES = {
        "metalon"   => ["ACMFacil_Metalon",   [55, 58, 64]],
        "pezinho"   => ["ACMFacil_Pezinho",   [25, 25, 27]],
        "corredica" => ["ACMFacil_Corredica", [150, 153, 158]],
        "puxador"   => ["ACMFacil_Puxador",   [38, 38, 38]]
      }.freeze
      # Etiquetas (tags) separadas por tipo de peça
      MOVEL_TAGS = {
        "mdf"       => "MOV - MDF",
        "fundo"     => "MOV - MDF",
        "metalon"   => "MOV - Estrutura Metalica",
        "pezinho"   => "MOV - Estrutura Metalica",
        "corredica" => "MOV - Ferragens",
        "puxador"   => "MOV - Ferragens"
      }.freeze

      def self.gerar_movel(params)
        r = solicitar_movel_servidor(params)
        return r unless r[:ok]
        dados = r[:result] || {}
        pecas = dados["pecas"] || []
        return { ok: false, code: "planifica.movel_vazio" } if pecas.empty?

        # Cor do MDF escolhida na paleta (default: Carvalho); cor_tex = textura
        # real (JPG CC0 do ambientCG em resources/mdf_textures) pro Enscape
        cor_rgb  = (params["cor_rgb"] || [193, 154, 107]).map(&:to_i)
        cor_nome = (params["cor_nome"] || "Carvalho").to_s.gsub(/[^0-9A-Za-z_]/, "_")
        cor_tex  = params["cor_tex"].to_s.gsub(/[^0-9a-z\-\.]/, "")

        model = Sketchup.active_model
        model.start_operation("ACMFacil — Móvel Industrial", true)
        # REGENERAR: apaga o móvel gerado anterior (ajustou → gera de novo)
        if @mv_grp_id
          antigo = model.find_entity_by_id(@mv_grp_id) rescue nil
          antigo.erase! if antigo && antigo.valid?
          @mv_grp_id = nil
          @mv_subs = nil
        end
        grp = model.active_entities.add_group
        grp.name  = "Bancada Industrial #{(dados.dig("params", "larg") || 0).round}mm"
        grp.layer = model.layers.add("MOV - Industrial")
        mats = {}
        gav_grupos = {}
        n = 0

        pecas.each do |p|
          tipo = p["tipo"].to_s
          # gavetas viram SUBGRUPOS próprios (pra abrir/explodir como unidade)
          parent = if p["sub"]
                     gav_grupos[p["sub"]] ||= begin
                       gg = grp.entities.add_group
                       gg.name  = p["sub"].to_s
                       # ETIQUETA DUPLA por hierarquia: o grupo da gaveta tem a
                       # tag "MOV - Gavetas"; as peças dentro mantêm a própria
                       # (MDF, Ferragens...) — ocultar qualquer uma esconde
                       gg.layer = model.layers.add("MOV - Gavetas")
                       gg
                     end
                   else
                     grp
                   end
          sub = parent.entities.add_group
          sub.name  = p["nome"].to_s
          # tag específica da peça (vinda do servidor) > tag genérica por tipo
          sub.layer = model.layers.add(p["tag"] ? "MOV - #{p["tag"]}" : (MOVEL_TAGS[tipo] || "MOV - MDF"))

          if p["poly"].is_a?(Array)
            # peça com RECORTE: contorno 2D num plano + extrusão da espessura
            plane = p["plane"].to_s
            w     = p["w"].to_f.mm
            espp  = p["esp"].to_f.mm
            pts = p["poly"].map do |u, v|
              uu = u.to_f.mm; vv = v.to_f.mm
              case plane
              when "yz" then Geom::Point3d.new(w, uu, vv)
              when "xz" then Geom::Point3d.new(uu, w, vv)
              else           Geom::Point3d.new(uu, vv, w)   # xy
              end
            end
            face = sub.entities.add_face(pts)
            nrm  = face.normal
            comp = plane == "yz" ? nrm.x : (plane == "xz" ? nrm.y : nrm.z)
            face.pushpull(comp > 0 ? espp : -espp)
          else
            d = p["d"]; pos = p["p"]
            next unless d.is_a?(Array) && pos.is_a?(Array)
            x, y, z    = pos.map { |v| v.to_f.mm }
            dx, dy, dz = d.map { |v| v.to_f.mm }
            face = sub.entities.add_face(
              [x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z]
            )
            # pushpull segue a normal — corrige o sinal pra extrusão ir SEMPRE
            # pra cima (peça ocupa z..z+dz, nunca desloca pra baixo)
            face.pushpull(face.normal.z > 0 ? dz : -dz)
          end

          nome_mat, rgb = MOVEL_CORES[tipo]
          nome_mat ||= "ACMFacil_MDF_#{cor_nome}"
          rgb      ||= cor_rgb
          mat = mats[nome_mat] ||= begin
            m = model.materials[nome_mat] || model.materials.add(nome_mat)
            m.color = Sketchup::Color.new(*rgb)
            # MDF com TEXTURA real (madeirados) — o Enscape renderiza o veio
            if MOVEL_CORES[tipo].nil? && !cor_tex.empty?
              tex_path = File.join(ACMFacil::PLUGIN_DIR, "resources", "mdf_textures", cor_tex)
              if File.exist?(tex_path)
                m.texture = tex_path
                begin
                  m.texture.size = 1200.mm   # escala realista do veio
                rescue
                end
              end
            end
            m
          end
          sub.material = mat
          n += 1
        rescue => e
          puts "[Planifica] peça '#{p["nome"]}' falhou (segue): #{e.message}"
        end
        # COTAS: dimensões lineares num grupo próprio, tag "MOV - Cotas"
        # (o usuário mostra/oculta pelo botão do painel ou pelas tags)
        cotas = dados["cotas"] || []
        unless cotas.empty?
          cg = grp.entities.add_group
          cg.name  = "Cotas"
          cg.layer = model.layers.add("MOV - Cotas")
          cotas.each do |c|
            begin
              p1  = Geom::Point3d.new(*c["p1"].map { |v| v.to_f.mm })
              p2  = Geom::Point3d.new(*c["p2"].map { |v| v.to_f.mm })
              off = Geom::Vector3d.new(*c["off"].map { |v| v.to_f.mm })
              cg.entities.add_dimension_linear(p1, p2, off)
            rescue => e
              puts "[Planifica] cota falhou (segue): #{e.message}"
            end
          end
        end
        model.commit_operation

        # Estado pra ABRIR GAVETAS / EXPLODIR: guarda os filhos de 1º nível
        # (SEM o grupo de cotas), o centro de cada um e o centro do móvel
        filhos = grp.entities.grep(Sketchup::Group).reject { |f| f.name == "Cotas" }
        bbt = Geom::BoundingBox.new
        filhos.each { |f| bbt.add(f.bounds) }
        ctr = bbt.center
        @mv_grp_id  = grp.entityID
        @mv_center  = [ctr.x, ctr.y, ctr.z]
        @mv_explode = 0.0
        @mv_gav     = 0                     # quantas gavetas estão abertas
        gav_ordem   = gav_grupos.keys.sort  # "Gaveta 1", "Gaveta 2", ...
        @mv_subs = filhos.map do |f|
          c = f.bounds.center
          nome_gav = gav_grupos.key(f)
          [f.entityID, [c.x, c.y, c.z], nome_gav ? gav_ordem.index(nome_gav) : nil]
        end

        # Seleciona o grupo — o JS chama a captura/planificação na sequência
        sel = model.selection
        sel.clear
        sel.add(grp)
        model.active_view.zoom(sel.to_a)

        {
          ok: true, n: n,
          quadros_n: dados["quadros_n"], pesos: dados["pesos"],
          sugestao: dados["sugestao"], avisos: dados["avisos"] || []
        }
      end

      # Seleciona o último móvel gerado (pro botão "Planificar" capturar certo
      # mesmo que o usuário tenha clicado fora e perdido a seleção)
      def self.movel_selecionar
        return { ok: false, code: "planifica.movel_nao_gerado" } if @mv_grp_id.nil?
        model = Sketchup.active_model
        grp = model.find_entity_by_id(@mv_grp_id) rescue nil
        return { ok: false, code: "planifica.movel_nao_gerado" } unless grp && grp.valid?
        sel = model.selection
        sel.clear
        sel.add(grp)
        { ok: true }
      end

      # ── ABRIR GAVETAS / EXPLODIR (transforma os filhos do último móvel) ───
      # explode: 0..1 (afasta cada peça do centro — fator 2.2 = bem separado)
      # gavetas: INTEIRO — quantas gavetas abertas, em ordem (0 = todas fechadas)
      def self.movel_transformar(explode, gavetas, cotas = nil)
        model = Sketchup.active_model
        # mostrar/ocultar a tag das COTAS (independe de ter móvel vivo)
        unless cotas.nil?
          camada = model.layers["MOV - Cotas"]
          camada.visible = (cotas == true) if camada
          return { ok: true, cotas: (cotas == true) } if explode.nil? && gavetas.nil?
        end
        return { ok: false, code: "planifica.movel_nao_gerado" } if @mv_subs.nil? || @mv_subs.empty?
        @mv_explode = [[explode.to_f, 0.0].max, 1.0].min unless explode.nil?
        @mv_gav     = gavetas.to_i unless gavetas.nil?

        abre = 250.mm
        # operação transparente: o arrasto do slider não enche o undo
        model.start_operation("ACMFacil — móvel interação", true, false, true)
        vivos = 0
        @mv_subs.each do |eid, c, gav_idx|
          ent = model.find_entity_by_id(eid) rescue nil
          next unless ent && ent.valid?
          vivos += 1
          dx = (c[0] - @mv_center[0]) * @mv_explode * 2.2
          dy = (c[1] - @mv_center[1]) * @mv_explode * 2.2
          dz = (c[2] - @mv_center[2]) * @mv_explode * 2.2
          dy += abre if gav_idx && gav_idx < @mv_gav
          ent.transformation = Geom::Transformation.translation(Geom::Vector3d.new(dx, dy, dz))
        end
        model.commit_operation
        return { ok: false, code: "planifica.movel_nao_gerado" } if vivos.zero?
        { ok: true, explode: @mv_explode, gavetas: @mv_gav }
      end

      # Chama a function movelIndustrialCompute (token + retry 1x, msgs padrão)
      def self.solicitar_movel_servidor(payload)
        ns = Core::Auth::DEFAULT_NS
        id_token = Sketchup.read_default(ns, "fb_id_token", "").to_s
        if Core::Auth::OFFLINE_MODE
          return { ok: true, result: {} }
        end
        return { ok: false, error: "Sessão expirada — faça login novamente no ACMFacil." } if id_token.empty?

        r = Core::FirebaseClient.call_function("movelIndustrialCompute", payload, id_token)
        if !r[:ok] && r[:code].to_s == "UNAUTHENTICATED"
          refresh = Sketchup.read_default(ns, "fb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::FirebaseClient.refresh_id_token(refresh)
            if ref[:ok]
              id_token = ref[:id_token]
              Sketchup.write_default(ns, "fb_id_token", id_token)
              r = Core::FirebaseClient.call_function("movelIndustrialCompute", payload, id_token)
            end
          end
        end

        unless r[:ok]
          msg = case r[:code].to_s
                when "PERMISSION_DENIED" then "Acesso negado: #{r[:error]}"
                when "UNAUTHENTICATED"   then "Sessão expirada — faça login novamente no ACMFacil."
                when "INVALID_ARGUMENT"  then r[:error].to_s
                else "Sem conexão com o servidor ACMFacil (#{r[:error]}). Verifique sua internet e tente novamente."
                end
          return { ok: false, error: msg }
        end

        { ok: true, result: r[:result] || {} }
      end

    end
  end
end
