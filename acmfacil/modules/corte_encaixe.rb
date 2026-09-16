# ═══════════════════════════════════════════════════════════════════════════
# ACMFacil — Corte & Encaixe
# ═══════════════════════════════════════════════════════════════════════════
# Captura um objeto montado (caixa/móvel de chapas), planifica as peças em 2D,
# gera ENCAIXES finger-joint nas bordas onde as peças se encontram e exporta
# SVG pronto pra corte a laser ou CNC router (com compensação de kerf/fresa e
# alívio dogbone nos cantos internos, calculados no JS).
#
# Ruby cuida de: (1) detectar os painéis chatos da seleção (igual Planifica);
# (2) destacar peça no SketchUp; (3) salvar o SVG que o JS montou.
# Toda a geometria dos dentes/kerf/dogbone é calculada no panel.js.
# ═══════════════════════════════════════════════════════════════════════════

module ACMFacil
  module Generator
    module CorteEncaixe

      # Espessura máxima (mm) pra um sólido ser considerado "chapa/painel".
      ESP_MAX_MM      = 60.0
      # Razão máxima espessura/lado pra ser "chato" (descarta tubo/metalon).
      RATIO_FLAT      = 0.40
      # Lado menor mínimo (mm) pra valer como painel (descarta perfis finos).
      LADO_MIN_MM     = 20.0

      # ──────────────────────────────────────────────────────────────────────
      # CAPTURAR — varre a seleção e devolve a lista de painéis (chapas).
      # Cada painel: { id, nome, esp, larg, comp, area, corners, outline,
      # holes, o, u, v, pid } em mm.
      # ──────────────────────────────────────────────────────────────────────
      def self.capturar
        model = Sketchup.active_model
        sel   = model.selection
        return { ok: false, code: "corte_encaixe.nada_selecionado" } if sel.nil? || sel.empty?

        paineis = []
        solidos = []
        sel.each { |e| coletar_paineis(e, Geom::Transformation.new, paineis, solidos) }

        # MODO SÓLIDO: com MENOS de 2 chapas finas, o objeto é um volume único
        # (caixa, tronco, forma livre) — extrai CADA FACE real do sólido, com a
        # adjacência e o ângulo diedro por aresta. O modo "chapas" só vale
        # quando o móvel tem 2+ peças montadas (aí há juntas entre elas).
        if paineis.size < 2 && !solidos.empty?
          best = solidos.max_by { |s| s[:vol] }
          fpan = extrair_faces_solido(best[:faces], best[:world_t])
          if fpan.size >= 2
            return { ok: true, modo: "solido", paineis: fpan, total: fpan.size }
          end
        end
        return { ok: false, code: "corte_encaixe.nenhum_painel" } if paineis.empty?

        # Ordena por área desc e numera
        paineis.sort_by! { |p| -p[:area] }
        paineis.each_with_index { |p, i| p[:id] = "p#{i + 1}" }

        # Bbox global do objeto (mm) — pra o JS centralizar vistas
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
          ok: true, modo: "paineis", paineis: paineis, espessuras: por_esp.keys.sort, total: paineis.size,
          bbox: { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] }
        }
      end

      # Recursão: nós com sub-grupos são containers (recursa, acumulando o
      # transform); folhas (só faces/arestas) são medidas e classificadas como
      # painel se forem chatas. Guarda os 8 cantos NO MUNDO (mm).
      def self.coletar_paineis(ent, trans, out, solidos = nil)
        return unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
        world_t = trans * ent.transformation
        subs = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities

        child_groups = subs.grep(Sketchup::Group) + subs.grep(Sketchup::ComponentInstance)
        unless child_groups.empty?
          child_groups.each { |c| coletar_paineis(c, world_t, out, solidos) }
          return
        end

        # FOLHA — mede bbox LOCAL (independe da rotação no mundo)
        bb = Geom::BoundingBox.new
        subs.grep(Sketchup::Face).each { |f| bb.add(f.bounds) if f.bounds.valid? }
        return unless bb.valid?

        # ESCALA da instância: o bbox é local, então aplica o fator de escala
        # de cada eixo do transform acumulado (grupo escalado/duplicado com
        # escala diferente sai com a medida REAL do mundo).
        sx = world_t.xaxis.length; sy = world_t.yaxis.length; sz = world_t.zaxis.length
        dims = [bb.width * sx, bb.height * sy, bb.depth * sz].map { |d| (d / 1.mm) }.sort
        t, w, l = dims          # t = menor (espessura), w/l = lados da chapa
        return if w < LADO_MIN_MM
        # TODA folha também entra como candidata a SÓLIDO — se no fim a
        # captura achar menos de 2 chapas finas, o maior volume vira o modo
        # sólido (uma peça única, mesmo achatada, é uma caixa a gerar).
        if solidos
          dx = (bb.width * sx / 1.mm); dy = (bb.height * sy / 1.mm); dz = (bb.depth * sz / 1.mm)
          solidos << { faces: subs.grep(Sketchup::Face), world_t: world_t, vol: dx * dy * dz }
        end
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
        # detectar as bordas em contato (juntas) no JS.
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
      # Normal unitária de um polígono 3D (Newell) — funciona com o transform
      # já aplicado, inclusive escala não-uniforme (face.normal local não vale).
      def self.newell(pts)
        nx = ny = nz = 0.0
        pts.each_with_index do |p, i|
          q = pts[(i + 1) % pts.size]
          nx += (p.y - q.y) * (p.z + q.z)
          ny += (p.z - q.z) * (p.x + q.x)
          nz += (p.x - q.x) * (p.y + q.y)
        end
        v = Geom::Vector3d.new(nx, ny, nz)
        return nil if v.length < 1e-9
        v.normalize
      end

      # Tudo medido no MUNDO: os vértices são transformados por world_t ANTES
      # de projetar — escala/rotação do grupo (e de cada cópia) saem corretas.
      def self.extrair_contorno(faces, world_t = Geom::Transformation.new)
        return nil if faces.nil? || faces.empty?
        face = faces.max_by { |f| f.area rescue 0 }
        return nil unless face && face.respond_to?(:outer_loop)
        loop_v = face.outer_loop.vertices.map { |vx| world_t * vx.position }
        return nil if loop_v.size < 3

        n = newell(loop_v)
        return nil unless n
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
        inner = face.loops.reject(&:outer?).map { |lp| lp.vertices.map { |vx| proj.call(world_t * vx.position) } }

        allpts = outer + inner.flatten(1)
        minu = allpts.map { |p| p[0] }.min
        minv = allpts.map { |p| p[1] }.min
        sh = lambda { |arr| arr.map { |p| [(p[0] - minu).round(2), (p[1] - minv).round(2)] } }
        outer = sh.call(outer)
        inner = inner.map { |h| sh.call(h) }

        # Frame da face no MUNDO (origin já está no mundo)
        face_o_world = origin + Geom::Vector3d.linear_combination(minu.mm, uvec, minv.mm, vvec)

        { outline: outer, holes: inner,
          larg: outer.map { |p| p[0] }.max.round(1),
          comp: outer.map { |p| p[1] }.max.round(1),
          o: [(face_o_world.x / 1.mm).round(2), (face_o_world.y / 1.mm).round(2), (face_o_world.z / 1.mm).round(2)],
          u: [uvec.x.round(6), uvec.y.round(6), uvec.z.round(6)],
          v: [vvec.x.round(6), vvec.y.round(6), vvec.z.round(6)] }
      rescue => e
        puts "[CorteEncaixe] extrair_contorno falhou: #{e.message}"
        nil
      end

      # ──────────────────────────────────────────────────────────────────────
      # MODO SÓLIDO — extrai TODAS as faces do sólido como "chapas".
      # Pra cada face: contorno 2D no plano dela (uv, mm), frame no mundo
      # (o,u,v) e, POR SEGMENTO do contorno, a face vizinha que compartilha a
      # aresta + o ângulo DIEDRO interno entre as duas (90° = caixa reta;
      # ≠90° = face inclinada, tipo tronco de pirâmide).
      # ──────────────────────────────────────────────────────────────────────
      def self.extrair_faces_solido(faces, world_t)
        return [] if faces.nil? || faces.empty?
        idx = {}
        faces.each_with_index { |f, i| idx[f] = i }

        # Normais NO MUNDO (Newell sobre os vértices transformados) — vale com
        # escala não-uniforme, onde a normal local não pode ser só rotacionada.
        normals = faces.map do |f|
          begin
            pts = f.outer_loop.vertices.map { |vx| world_t * vx.position }
            newell(pts)
          rescue
            nil
          end
        end

        out = []
        faces.each_with_index do |face, i|
          begin
            lp = face.outer_loop
            loop_v = lp.vertices.map { |vx| world_t * vx.position }
            next if loop_v.size < 3
            n = normals[i]
            next unless n

            # u = direção da aresta mais longa (alinha o retângulo da peça)
            bestl = 0.0; uvec = nil
            loop_v.each_with_index do |p, k|
              q = loop_v[(k + 1) % loop_v.size]
              v = q - p
              ln = v.length
              if ln > bestl && ln > 1e-6
                bestl = ln; uvec = v.clone; uvec.normalize!
              end
            end
            next unless uvec
            vvec = n.cross(uvec)
            next if vvec.length < 1e-6
            vvec.normalize!
            origin = loop_v[0]

            proj = lambda do |pos|
              d = pos - origin
              [d.dot(uvec) / 1.mm, d.dot(vvec) / 1.mm]
            end

            outer = loop_v.map { |p| proj.call(p) }
            inner = face.loops.reject(&:outer?).map { |l2| l2.vertices.map { |vx| proj.call(world_t * vx.position) } }

            allpts = outer + inner.flatten(1)
            minu = allpts.map { |p| p[0] }.min
            minv = allpts.map { |p| p[1] }.min
            sh = lambda { |arr| arr.map { |p| [(p[0] - minu).round(2), (p[1] - minv).round(2)] } }
            outer = sh.call(outer)
            inner = inner.map { |h| sh.call(h) }

            # adjacência POR SEGMENTO: edgeuses[k] liga outline[k] → outline[k+1]
            adj = lp.edgeuses.map do |eu|
              e = eu.edge rescue nil
              nxt = nil
              if e
                other = (e.faces.to_a - [face]).find { |of| idx.key?(of) }
                on = other ? normals[idx[other]] : nil
                if other && on
                  c = n.dot(on)
                  c = -1.0 if c < -1.0
                  c = 1.0 if c > 1.0
                  # diedro interno = 180° − ângulo entre as normais externas
                  died = 180.0 - (Math.acos(c) * 180.0 / Math::PI)
                  nxt = { p: idx[other], ang: died.round(1) }
                end
              end
              nxt
            end

            # frame da face no MUNDO (origin já está no mundo)
            face_o_world = origin + Geom::Vector3d.linear_combination(minu.mm, uvec, minv.mm, vvec)

            larg = outer.map { |p| p[0] }.max.round(1)
            comp = outer.map { |p| p[1] }.max.round(1)

            fpid = (face.respond_to?(:persistent_id) ? face.persistent_id : nil) rescue nil
            out << {
              id: "p#{i + 1}", nome: "Face #{i + 1}",
              esp: nil, larg: larg, comp: comp, area: (larg * comp).round(0),
              outline: outer, holes: inner, adj: adj, pid: fpid,
              o: [(face_o_world.x / 1.mm).round(2), (face_o_world.y / 1.mm).round(2), (face_o_world.z / 1.mm).round(2)],
              u: [uvec.x.round(6), uvec.y.round(6), uvec.z.round(6)],
              v: [vvec.x.round(6), vvec.y.round(6), vvec.z.round(6)],
              corners: nil
            }
          rescue => e
            puts "[CorteEncaixe] face #{i} falhou: #{e.message}"
            next
          end
        end
        out
      end

      # ──────────────────────────────────────────────────────────────────────
      # COMPUTE_LAYOUT — chama a function corteEncaixeCompute (Fase 3 anti-
      # pirataria). O algoritmo (juntas, dentes, kerf, nesting) roda no servidor,
      # que valida licença + módulo. Payload = { solid, paineis, included, params }.
      # Refresh de token com retry 1x. Devolve { ok, joints, oversized, layout }.
      # ──────────────────────────────────────────────────────────────────────
      def self.compute_layout(data)
        ns = Core::Auth::DEFAULT_NS
        id_token = Sketchup.read_default(ns, "fb_id_token", "").to_s
        if Core::Auth::OFFLINE_MODE
          return { ok: true, joints: [], oversized: [], layout: data["layout"] || [] }
        end
        return { ok: false, error: "Sessão expirada — faça login novamente no ACMFacil." } if id_token.empty?

        payload = {
          "solid"    => data["solid"] == true,
          "paineis"  => data["paineis"] || [],
          "included" => data["included"] || {},
          "params"   => data["params"] || {}
        }

        r = Core::FirebaseClient.call_function("corteEncaixeCompute", payload, id_token)
        if !r[:ok] && r[:code].to_s == "UNAUTHENTICATED"
          refresh = Sketchup.read_default(ns, "fb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::FirebaseClient.refresh_id_token(refresh)
            if ref[:ok]
              id_token = ref[:id_token]
              Sketchup.write_default(ns, "fb_id_token", id_token)
              r = Core::FirebaseClient.call_function("corteEncaixeCompute", payload, id_token)
            end
          end
        end

        unless r[:ok]
          msg = case r[:code].to_s
                when "PERMISSION_DENIED" then "Acesso negado: #{r[:error]}"
                when "UNAUTHENTICATED"   then "Sessão expirada — faça login novamente no ACMFacil."
                else "Sem conexão com o servidor ACMFacil (#{r[:error]}). Verifique sua internet e tente novamente."
                end
          return { ok: false, error: msg }
        end

        res = r[:result] || {}
        { ok: true, joints: res["joints"] || [], oversized: res["oversized"] || [], layout: res["layout"] }
      end

      # ──────────────────────────────────────────────────────────────────────
      # DESTACAR — seleciona a peça no SketchUp pelo persistent_id e dá zoom.
      # ──────────────────────────────────────────────────────────────────────
      def self.destacar(pid)
        return { ok: false, code: "corte_encaixe.pid_nil" } if pid.nil?
        model = Sketchup.active_model
        ent = nil
        begin
          ent = model.find_entity_by_persistent_id(pid.to_i) if model.respond_to?(:find_entity_by_persistent_id)
        rescue
          ent = nil
        end
        ent ||= achar_por_pid(model.entities, pid.to_i)
        return { ok: false, code: "corte_encaixe.pid_nao_encontrado" } unless ent && ent.valid?

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
      # MARCAÇÃO COLORIDA — pinta cada peça capturada no SketchUp (overlay
      # temporário, um grupo travado, igual à fita de borda do Planifica).
      # pecas = [ { "rgb" => [r,g,b], "poly" => [[x,y,z] mm mundo, ...] } ]
      # ──────────────────────────────────────────────────────────────────────
      PECAS_GROUP = "ACMFacil — Corte & Encaixe (cores)".freeze

      def self.marcar_pecas(pecas)
        model = Sketchup.active_model
        model.start_operation("ACMFacil — cores das peças", true)
        apagar_grupos_pecas(model)
        if pecas.nil? || pecas.empty?
          model.commit_operation
          return { ok: true, n: 0 }
        end
        grp = model.entities.add_group
        grp.name = PECAS_GROUP
        n = 0
        pecas.each do |pe|
          poly = pe["poly"] || pe[:poly] || []
          rgb  = pe["rgb"]  || pe[:rgb]  || [37, 99, 235]
          next unless poly.is_a?(Array) && poly.size >= 3
          begin
            pts = poly.map { |p| Geom::Point3d.new(p[0].to_f.mm, p[1].to_f.mm, p[2].to_f.mm) }
            f = grp.entities.add_face(pts)
            next unless f
            m = peca_material(model, rgb)
            f.material = m
            f.back_material = m
            n += 1
          rescue
            next
          end
        end
        grp.locked = true rescue nil
        model.commit_operation
        { ok: true, n: n }
      end

      def self.limpar_pecas
        model = Sketchup.active_model
        model.start_operation("ACMFacil — limpar cores", true)
        k = apagar_grupos_pecas(model)
        model.commit_operation
        { ok: true, n: k }
      end

      def self.apagar_grupos_pecas(model)
        grps = model.entities.grep(Sketchup::Group).select { |g| g.valid? && g.name == PECAS_GROUP }
        grps.each { |g| g.locked = false rescue nil; g.erase! if g.valid? }
        grps.size
      end

      def self.peca_material(model, rgb)
        r = rgb[0].to_i; g = rgb[1].to_i; b = rgb[2].to_i
        nome = "ACMFacil_CEJ_#{r}_#{g}_#{b}"
        m = model.materials[nome] || model.materials.add(nome)
        m.color = Sketchup::Color.new(r, g, b)
        m.alpha = 0.85
        m
      end

      # ──────────────────────────────────────────────────────────────────────
      # EXPORTAR ARQUIVO DE CORTE — recebe o conteúdo já montado pelo JS
      # (base64) e salva. payload = { "name", "content", "ext" ("svg"|"dxf") }
      # ──────────────────────────────────────────────────────────────────────
      def self.exportar_svg(payload)
        ext = payload["ext"].to_s.downcase
        ext = "svg" unless %w[svg dxf].include?(ext)
        name    = payload["name"].to_s.gsub(/[^a-zA-Z0-9_\-]/, '_')
        name    = "corte_encaixe" if name.empty?
        content = Base64.decode64(payload["content"].to_s)
        return { ok: false, code: "corte_encaixe.svg_vazio" } if content.empty?

        path = UI.savepanel("Exportar #{ext.upcase} de corte", Dir.home, "#{name}.#{ext}")
        return { ok: false, code: "corte_encaixe.export_cancelado" } if path.nil?
        path += ".#{ext}" unless path.downcase.end_with?(".#{ext}")

        begin
          # Modo binário — os bytes do base64 já são UTF-8 válidos.
          File.open(path, 'wb') { |f| f.write(content) }
        rescue => e
          return { ok: false, code: "corte_encaixe.export_erro", error: e.message }
        end

        { ok: true, path: File.basename(path) }
      end

    end
  end
end
