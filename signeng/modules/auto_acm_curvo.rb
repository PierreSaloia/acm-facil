# encoding: UTF-8
# ============================================================================
# SignEng — Modulo AUTO-ACM CURVO (v2)
# Para colunas/elementos com:
#   - 1 topo + 1 base
#   - 1 lateral esquerda reta + 1 lateral direita reta (trapezios simples)
#   - N facetas trapezoidais frontais (curva facetada)
#   - M facetas trapezoidais traseiras (1 plana ou curva)
# Detecta dinamicamente o numero de facetas, gera montantes inclinados,
# aneis horizontais segmentados, travessas H, emendas, juntas, fita.
# ============================================================================

module SignEng
  module Generator
    module AutoACMCurvo

      # ──────────────────────────────────────────────────────────────────────
      # CORES DE CAPTURA — IDENTICAS ao auto_acm normal (mantem padrao visual).
      # 6 cores fixas, uma por papel. As N facetas frontais recebem TODAS a
      # mesma cor (Magenta), e as M facetas traseiras todas Verde, etc.
      # ──────────────────────────────────────────────────────────────────────
      FACE_COLORS = {
        "dir"      => ["AA_Vermelho", [220,  40,  40]],   # +X
        "esq"      => ["AA_Ciano",    [ 40, 200, 220]],   # -X
        "traseira" => ["AA_Verde",    [ 40, 200,  60]],   # +Y
        "frontal"  => ["AA_Magenta",  [220,  40, 200]],   # -Y
        "topo"     => ["AA_Azul",     [ 40,  80, 220]],   # +Z
        "base"     => ["AA_Amarelo",  [240, 220,  40]]    # -Z
      }

      # Tolerancia para comparar pontos (em polegadas internas do SU)
      EPS = 0.01

      # ======================================================================
      # BUFFER DE PECAS (Fase 1 da migracao servidor) — separa CALCULO de
      # DESENHO. Quando @ce_buf esta ativo (durante `gerar`), toda emissao de
      # geometria vai pra uma LISTA em vez de desenhar na hora; o desenho
      # acontece de uma vez em desenhar_pecas_curvo, ANTES do quantitativo
      # (que le a geometria real). Fora do gerar (@ce_buf nil), desenha direto
      # — o fluxo do editor (adicionar_peca/restaurar_snapshot) fica intacto.
      #
      # Dois primitivos, espelhando o Generator:
      #   solid6 → { kind: :solid6, ents, pb, pt, mat, nome }
      #   rings  → { kind: :rings, ents, rings, mat, nome, soft }  (calandrado)
      # ======================================================================
      def self.emit_solid6(ents, pb, pt, mat_name, nome)
        if @ce_buf
          @ce_buf << { kind: :solid6, ents: ents, pb: pb, pt: pt, mat: mat_name, nome: nome }
          nil
        else
          Generator.solid6(ents, pb, pt, mat_name, nome)
        end
      end

      def self.emit_rings(ents, rings, mat_name, nome, soft)
        if @ce_buf
          @ce_buf << { kind: :rings, ents: ents, rings: rings, mat: mat_name, nome: nome, soft: soft }
          nil
        else
          desenhar_rings(ents, rings, mat_name, nome, soft)
        end
      end

      # Desenha uma tira calandrada (quads entre rings consecutivos + 2 tampas
      # + smoothing das arestas curtas). Extraido dos 4 metodos calandrados,
      # que tinham este mesmo rabo identico.
      def self.desenhar_rings(ents, rings, mat_name, nome, soft)
        mat = mat_name ? Sketchup.active_model.materials[mat_name] : nil
        g = ents.add_group; g.name = nome; ge = g.entities
        (rings.size - 1).times do |i|
          r0 = rings[i]; r1 = rings[i + 1]
          Generator.add_quad_safe(ge, r0[0], r0[1], r1[1], r1[0])
          Generator.add_quad_safe(ge, r0[1], r0[2], r1[2], r1[1])
          Generator.add_quad_safe(ge, r0[2], r0[3], r1[3], r1[2])
          Generator.add_quad_safe(ge, r0[3], r0[0], r1[0], r1[3])
        end
        Generator.add_quad_safe(ge, rings.first[0], rings.first[1], rings.first[2], rings.first[3])
        Generator.add_quad_safe(ge, rings.last[3],  rings.last[2],  rings.last[1],  rings.last[0])
        ge.grep(Sketchup::Edge).each do |e|
          if e.length < soft
            e.soft = true; e.smooth = true
          end
        end
        ge.grep(Sketchup::Face).each { |f| f.material = mat; f.back_material = mat } if mat
        g
      end

      # DUMP DEV (Fase 2) — serializa entrada + saída do cálculo em mm/JSON pro
      # harness comparativo (scripts/harness_auto_acm_curvo.js).

      # Unica ponte calculo → SketchUp: desenha a lista de pecas acumulada.
      def self.desenhar_pecas_curvo(pecas)
        pecas.each do |pc|
          if pc[:kind] == :rings
            desenhar_rings(pc[:ents], pc[:rings], pc[:mat], pc[:nome], pc[:soft])
          else
            Generator.solid6(pc[:ents], pc[:pb], pc[:pt], pc[:mat], pc[:nome])
          end
        end
      end

      # ======================================================================
      # SOLICITAR_PECAS_SERVIDOR_CURVO — chama a function autoAcmCurvoCompute
      # (Fase 3). Serializa a geometria capturada (mm) + params, valida licença
      # no servidor, devolve a lista de peças. Refresh de token com retry 1x.
      # ======================================================================
      def self.solicitar_pecas_servidor_curvo(params, info, trajs, slices)
        ns = Core::Auth::DEFAULT_NS
        access_token = Sketchup.read_default(ns, "sb_access_token", "").to_s
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if access_token.empty?

        mmv = lambda { |v| (v / 1.mm).round(4) }
        pt  = lambda { |q| [mmv.call(q.x), mmv.call(q.y), mmv.call(q.z)] }
        pts = lambda { |arr| arr.map { |q| pt.call(q) } }
        facets_json = info[:facets].map do |fc|
          poly = poly_for_facet(fc) rescue nil
          { "role" => fc[:role], "idx_in_role" => fc[:idx_in_role],
            "base_left" => pt.call(fc[:base_left]), "base_right" => pt.call(fc[:base_right]),
            "topo_left" => pt.call(fc[:topo_left]), "topo_right" => pt.call(fc[:topo_right]),
            "normal" => fc[:normal] ? [fc[:normal].x.round(6), fc[:normal].y.round(6), fc[:normal].z.round(6)] : nil,
            "poly" => (poly && poly.size >= 3) ? pts.call(poly) : [] }
        end
        payload = {
          params: params,
          base_corners: pts.call(info[:base_corners]),
          topo_corners: pts.call(info[:topo_corners]),
          facets: facets_json,
          h: mmv.call(info[:h]),
          cx_xy: mmv.call(info[:cx_xy]), cy_xy: mmv.call(info[:cy_xy]),
          trajs: trajs.map { |t| pts.call(t) },
          slices: slices.map { |z, cs| { "z" => mmv.call(z), "corners" => pts.call(cs) } }
        }

        r = Core::SupabaseClient.call_function("autoAcmCurvoCompute", payload, access_token)
        if !r[:ok] && r[:status].to_i == 401
          refresh = Sketchup.read_default(ns, "sb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::SupabaseClient.refresh_session(refresh)
            if ref[:ok]
              access_token = ref[:access_token]
              Core::Auth.save_tokens(ref)
              r = Core::SupabaseClient.call_function("autoAcmCurvoCompute", payload, access_token)
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

        result = r[:result] || {}
        pecas  = result["pecas"]
        return { ok: false, error: "Resposta inválida do servidor SignEng." } unless pecas.is_a?(Array)
        { ok: true, pecas: pecas }
      end

      # Converte as peças do servidor (mm, chaves string) pro formato interno
      # do @ce_buf (Geom::Point3d em polegadas + grupo destino), pra
      # desenhar_pecas_curvo desenhar.
      def self.converter_pecas_servidor_curvo(pecas, ge, gf, gj)
        grupos = { "est" => ge, "fita" => gf, "juntas" => gj }
        p3 = lambda { |a| Geom::Point3d.new(a[0].to_f.mm, a[1].to_f.mm, a[2].to_f.mm) }
        out = []
        pecas.each do |pc|
          grp = grupos[pc["g"]]
          next unless grp
          ents = grp.entities
          if pc["kind"] == "rings"
            rings = (pc["rings"] || []).map { |r| r.map { |a| p3.call(a) } }
            out << { kind: :rings, ents: ents, rings: rings, mat: pc["mat"], nome: pc["nome"], soft: (pc["soft"] || 1).to_f.mm }
          else
            out << { kind: :solid6, ents: ents,
                     pb: (pc["pb"] || []).map { |a| p3.call(a) },
                     pt: (pc["pt"] || []).map { |a| p3.call(a) },
                     mat: pc["mat"], nome: pc["nome"] }
          end
        end
        out
      end

      # ======================================================================
      # CAPTURAR FACES — pinta as faces de cada grupo selecionado e devolve
      # metadados (cantos, dimensoes, lista de cores aplicadas).
      # ======================================================================
      def self.capturar_faces_data
        model = Sketchup.active_model
        sel   = model.selection
        grupos = sel.select { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
        return { ok: false, code: "autoacmcurvo.no_selection" } if grupos.empty?

        model.start_operation("AutoACM Curvo Capturar", true)
        modulos_data = []

        begin
          # materiais para os 6 papeis (mesmas 6 cores do auto_acm normal)
          mats = {}
          FACE_COLORS.each do |role, (nome, rgb)|
            m = model.materials[nome] || model.materials.add(nome)
            m.color = Sketchup::Color.new(*rgb)
            mats[role] = m
          end

          grupos.each_with_index do |grp, idx|
            ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
            faces = ents.grep(Sketchup::Face)
            next if faces.empty?

            # bbox local pra calcular o centro XY do modulo (referencia pra
            # classificar facetas laterais por direção do centroide)
            local_bb = Geom::BoundingBox.new
            ents.each { |e| local_bb.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
            next unless local_bb.valid?
            cx = (local_bb.min.x + local_bb.max.x) / 2.0
            cy = (local_bb.min.y + local_bb.max.y) / 2.0

            # PINTA TODAS as faces direto pela direcao dominante / centroide
            # (mesma robustez do auto_acm normal — independente de matching face→cantos).
            count = 0
            faces.each do |f|
              next unless f.valid?
              role = role_para_face(f, cx, cy)
              next unless role && mats[role]
              f.material = mats[role]
              f.back_material = mats[role]
              count += 1
            end

            # Info estrutural (cantos, facetas) pra UI mostrar — não impede
            # captura se falhar.
            info = analisar_modulo(grp) rescue nil

            # Cantos do envelope (base + topo) em coords relativas ao bbox local,
            # em mm — pra o preview 3D do JS renderizar a forma afunilada.
            ox_in = local_bb.min.x; oy_in = local_bb.min.y; oz_in = local_bb.min.z
            to_mm = ->(p) {
              [ ((p.x - ox_in) / 1.mm).round(1),
                ((p.y - oy_in) / 1.mm).round(1),
                ((p.z - oz_in) / 1.mm).round(1) ]
            }
            # Cacheia o offset do bbox local (em polegadas) pra adicionar_peca
            # converter os cantos das peças desenhadas pro mesmo espaço mm-local
            # do envelope/pecas_3d (preview = SketchUp, sem re-derivação).
            begin
              grp.set_attribute("signeng_curvo", "local_min",
                                [ox_in.to_f, oy_in.to_f, oz_in.to_f])
            rescue => _e
            end
            base_pts = []
            topo_pts = []
            roles_envelope = []
            polygons    = []
            if info
              base_pts = info[:base_corners].map(&to_mm)
              topo_pts = info[:topo_corners].map(&to_mm)
              # Role de cada faceta entre cantos consecutivos (i → i+1)
              # Conta dentro de cada role pra dar idx_in_role
              counts = Hash.new(0)
              roles_envelope = info[:facets].map do |fc|
                role = fc[:role]
                idx  = counts[role]
                counts[role] += 1
                { role: role, idx: idx, label: "#{role.capitalize} #{idx + 1}" }
              end
              # Polígono completo de cada facet (todos os vértices da face lateral
              # em ordem CCW) — captura steps/shoulders/multi-segmentos que o
              # quad-de-4-cantos perderia. Ordem alinhada com info[:facets].
              # Se a face_chain tem >1 face (frontal multi-segmento), usa o
              # merged_polygon costurado pelas arestas externas.
              polygons = info[:facets].map do |fc|
                begin
                  if fc[:merged_polygon] && fc[:merged_polygon].size >= 3
                    fc[:merged_polygon].map(&to_mm)
                  elsif fc[:face] && fc[:face].respond_to?(:outer_loop)
                    fc[:face].outer_loop.vertices.map(&:position).map(&to_mm)
                  else
                    nil
                  end
                rescue
                  nil
                end
              end
            end

            nome_grp = (grp.respond_to?(:name) && !grp.name.to_s.strip.empty?) ? grp.name : "Curvo #{idx + 1}"

            modulos_data << {
              entity_id:    grp.entityID,
              idx:          idx,
              nome:         nome_grp,
              w:            ((local_bb.max.x - local_bb.min.x) / 1.mm).round(0),
              h:            ((local_bb.max.z - local_bb.min.z) / 1.mm).round(0),
              d:            ((local_bb.max.y - local_bb.min.y) / 1.mm).round(0),
              w_topo:       info ? mm(info[:bb_topo][:w]) : 0,
              d_topo:       info ? mm(info[:bb_topo][:d]) : 0,
              n_faces:      count,
              n_facets:     info ? info[:facets].size : 0,
              n_frontal:    info ? (info[:facets_by_role]["frontal"]  || []).size : 0,
              n_traseira:   info ? (info[:facets_by_role]["traseira"] || []).size : 0,
              n_corners:    info ? info[:base_corners].size : 0,
              # envelope pra previews 2D/3D (mm, relativo ao bbox local)
              envelope: {
                base:     base_pts,
                topo:     topo_pts,
                roles:    roles_envelope,
                polygons: polygons   # array de [[x,y,z], ...] por facet (mesma ordem que roles)
              }
            }
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          return { ok: false, code: "autoacmcurvo.capture_error", error: e.message, trace: e.backtrace.first(5) }
        end

        return { ok: false, code: "autoacmcurvo.no_valid_modules" } if modulos_data.empty?

        # face_colors no mesmo formato do auto_acm normal: lista de {role, nome, rgb}
        face_colors = FACE_COLORS.map do |role, (nome, rgb)|
          { role: role, nome: nome, rgb: rgb, label: role.capitalize }
        end

        { ok: true, modulos: modulos_data, face_colors: face_colors }
      end

      # ======================================================================
      # SELECIONAR MODULO POR ID — ativa o grupo no SketchUp (e zoom opcional)
      # Usado pelo dblclick na aba pra navegar pro modulo no viewport.
      # ======================================================================
      def self.selecionar_modulo_por_id(eid, zoom = false)
        model = Sketchup.active_model
        ent = find_entity_by_id(model, eid.to_i)
        return { ok: false, code: "autoacmcurvo.entity_not_found" } unless ent && ent.valid?
        sel = model.selection
        sel.clear
        sel.add(ent)
        model.active_view.zoom([ent]) if zoom
        { ok: true }
      rescue => e
        { ok: false, code: "autoacmcurvo.exception", error: e.message }
      end

      # ======================================================================
      # GERAR — cria estrutura para UM modulo (metalon, fita, emendas, juntas)
      # ======================================================================
      def self.gerar(params, _dialog = nil, grp_override = nil)
        model = Sketchup.active_model
        grp   = grp_override || model.selection.first
        unless grp && (grp.is_a?(Sketchup::Group) || grp.is_a?(Sketchup::ComponentInstance))
          return { ok: false, code: "autoacmcurvo.no_group" }
        end

        p = extrair(params)
        info = analisar_modulo(grp)
        return { ok: false, code: "autoacmcurvo.detect_failed" } unless info

        model.start_operation("AutoACM Curvo Gerar", true)
        begin
          Generator.criar_mats(model, { cor: p[:cor_acm], cor_junta: p[:cor_junta], cor_junta_rgb: p[:cor_junta_rgb], cor_fita: p[:cor_fita] })

          ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
          limpar_geracao_antiga(ents)
          pintar_acm_faces(model, info, p, grp)

          ge = ents.add_group; ge.name = "EST_Metalon"
          gf = nil; gj = nil
          gf = ents.add_group.tap { |g| g.name = "FITA_DF" } if p[:inc_fita]
          gj = ents.add_group.tap { |g| g.name = "JUNTAS"  } if p[:jt] >= 0  # sempre criamos pra desenhar a linha visual

          # ── CAPTURA pro servidor: trajetorias + slices dependem das faces
          # reais, entao ficam no cliente e sao enviadas como entrada. ──
          trajs  = corner_trajectories(info)
          slices = slice_structure(info)

          # ── CÁLCULO NO SERVIDOR (Fase 3 anti-pirataria) ──
          # A lista de peças (montantes, anéis, faceta, topo, fita) é calculada
          # pela function autoAcmCurvoCompute, que valida licença + módulo. O
          # cliente só captura a geometria, envia, e desenha o que volta.
          srv = solicitar_pecas_servidor_curvo(params, info, trajs, slices)
          raise srv[:error] unless srv[:ok]
          pecas_srv = converter_pecas_servidor_curvo(srv[:pecas], ge, gf, gj)
          desenhar_pecas_curvo(pecas_srv)

          # ── ETIQUETAS (LAYERS) — separar componentes por camada ──
          ly = model.layers
          lay_main = ly["ACM_AutoACMCurvo"] || ly.add("ACM_AutoACMCurvo")
          lay_acm  = ly["ACM_Chapas"]       || ly.add("ACM_Chapas")
          lay_est  = ly["ACM_Estrutura"]    || ly.add("ACM_Estrutura")
          lay_fita = ly["ACM_FitaDF"]       || ly.add("ACM_FitaDF")
          lay_junt = ly["ACM_Juntas"]       || ly.add("ACM_Juntas")
          grp.layer = lay_main
          ge.layer = lay_est
          gf.layer = lay_fita if gf
          gj.layer = lay_junt if gj
          # ACM faces (originais) -> layer ACM_Chapas
          ents_grp = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
          ents_grp.grep(Sketchup::Face).each { |f| f.layer = lay_acm if f.valid? }
          ents_grp.grep(Sketchup::Edge).each { |e| e.layer = lay_acm if e.valid? }

          quant = quantitativo(grp, info, p)
          model.commit_operation
          { ok: true, quant: quant }
        rescue => e
          @ce_buf = nil   # limpa o buffer pra nao vazar pro editor
          model.abort_operation
          puts "[AutoACMCurvo] gerar ERROR: #{e.message}"
          puts e.backtrace.first(10).join("\n")
          { ok: false, code: "autoacmcurvo.gerar_error", error: e.message, trace: e.backtrace.first(8) }
        end
      end

      # ======================================================================
      # find_entity_by_id
      # ======================================================================
      def self.find_entity_by_id(model, eid)
        return nil unless eid
        eid = eid.to_i
        model.entities.each do |e|
          return e if e.respond_to?(:entityID) && e.entityID == eid
        end
        nil
      end

      # ======================================================================
      # ANALISAR_MODULO — detecta topo, base e N+M+2 facetas laterais
      # ----------------------------------------------------------------------
      # Retorna:
      #   :face_topo, :face_base
      #   :base_corners, :topo_corners (Geom::Point3d arrays, ordem ciclica anti-horaria
      #                                  vista de cima, alinhados topo[i] ↔ base[i])
      #   :facets        — array ordenado ciclicamente, igual ao loop dos cantos
      #                     [{ face, role, idx_in_role, base_left, base_right,
      #                        topo_left, topo_right, normal, faces:[face_array] }, ...]
      #   :facets_by_role — { "frontal" => [faceta...], "traseira" => [...], ... }
      #   :h            — altura do modulo
      #   :bb_base, :bb_topo — { w, d, cx, cy } pra UI
      # ======================================================================
      def self.analisar_modulo(grp)
        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
        faces = ents.grep(Sketchup::Face)
        return nil if faces.size < 4

        face_topo = faces.max_by { |f| f.normal.z }
        face_base = faces.min_by { |f| f.normal.z }
        return nil if face_topo == face_base
        return nil if face_topo.normal.z <  0.5
        return nil if face_base.normal.z > -0.5

        # cantos da base e do topo a partir do outer_loop, normalizados em CCW
        base_corners = ordenar_loop_ccw(face_base.outer_loop.vertices.map(&:position))
        topo_corners = ordenar_loop_ccw(face_topo.outer_loop.vertices.map(&:position))
        return nil if base_corners.size < 3 || topo_corners.size < 3
        return nil if base_corners.size != topo_corners.size

        # alinha topo[0] mais perto (em XY) de base[0]
        topo_corners = alinhar_loop(topo_corners, base_corners)

        # bbox base/topo pra UI
        bb_base = bb_xy(base_corners)
        bb_topo = bb_xy(topo_corners)
        h = ((topo_corners.first.z + topo_corners.last.z) / 2.0) -
            ((base_corners.first.z + base_corners.last.z) / 2.0)

        # ── enumera as facetas laterais por par de cantos consecutivos ──
        laterais = faces - [face_topo, face_base]
        facets = []
        n = base_corners.size
        n.times do |i|
          ja = base_corners[i];     jb = base_corners[(i + 1) % n]
          ka = topo_corners[i];     kb = topo_corners[(i + 1) % n]

          # 1) Tenta achar UMA face que cobre base+topo edge (caso simples).
          face_with_base = laterais.find { |f|
            vs = f.outer_loop.vertices.map(&:position)
            tem_pt(vs, ja) && tem_pt(vs, jb)
          }
          face_with_topo = laterais.find { |f|
            vs = f.outer_loop.vertices.map(&:position)
            tem_pt(vs, ka) && tem_pt(vs, kb)
          }

          face = nil
          face_chain = []
          merged_polygon = nil

          if face_with_base && face_with_base == face_with_topo
            # Caso simples: uma face só (com talvez >4 vértices se tem step interno)
            face = face_with_base
            face_chain = [face]
          elsif face_with_base && face_with_topo
            # 2) Frente multi-segmento: cadeia BFS entre face_with_base e face_with_topo
            #    via arestas compartilhadas, restringindo a candidatos laterais.
            chain = bfs_face_chain(face_with_base, face_with_topo, laterais)
            if chain && chain.size > 0
              face_chain = chain
              face = chain.first  # representa o "primeiro" da cadeia (base)
              merged_polygon = merge_face_chain_boundary(chain)
            end
          end

          facets << {
            base_left:  ja, base_right: jb,
            topo_left:  ka, topo_right: kb,
            face:       face,
            normal:     face ? face.normal : nil,
            faces:      face_chain,
            merged_polygon: merged_polygon  # polygon mesclado (opcional, p/ multi-faces)
          }
        end

        # ── classifica facetas por role baseado em vetor centroide-radial ──
        cx = (bb_base[:cx] + bb_topo[:cx]) / 2.0
        cy = (bb_base[:cy] + bb_topo[:cy]) / 2.0
        facets.each do |fc|
          # centroide da faceta em XY (media dos 4 cantos)
          fcx = (fc[:base_left].x + fc[:base_right].x + fc[:topo_left].x + fc[:topo_right].x) / 4.0
          fcy = (fc[:base_left].y + fc[:base_right].y + fc[:topo_left].y + fc[:topo_right].y) / 4.0
          dx = fcx - cx; dy = fcy - cy
          fc[:role] = if dx.abs >= dy.abs
                        dx > 0 ? "dir" : "esq"
                      else
                        dy > 0 ? "traseira" : "frontal"
                      end
        end

        # ── agrupa por role mantendo a ordem ciclica original ──
        facets_by_role = {}
        facets.each do |fc|
          (facets_by_role[fc[:role]] ||= []) << fc
        end
        # ordena dentro de cada role pelo angulo polar (estavel entre execucoes)
        facets_by_role.each do |role, list|
          list.sort_by! { |fc|
            fcx = (fc[:base_left].x + fc[:base_right].x + fc[:topo_left].x + fc[:topo_right].x) / 4.0
            fcy = (fc[:base_left].y + fc[:base_right].y + fc[:topo_left].y + fc[:topo_right].y) / 4.0
            Math.atan2(fcy - cy, fcx - cx)
          }
          list.each_with_index { |fc, i| fc[:idx_in_role] = i }
        end

        # CACHE: salva corners + facets meta no grp via attributes.
        # Permite que adicionar_peca funcione mesmo depois de gerar() ter
        # erased faces ACM desabilitadas (que faria uma 2ª chamada a
        # analisar_modulo retornar nil por faces.size < 4).
        begin
          grp.set_attribute("signeng_curvo", "base_corners",
                            base_corners.map { |p| [p.x.to_f, p.y.to_f, p.z.to_f] })
          grp.set_attribute("signeng_curvo", "topo_corners",
                            topo_corners.map { |p| [p.x.to_f, p.y.to_f, p.z.to_f] })
          grp.set_attribute("signeng_curvo", "facets_meta",
                            facets.map { |fc| { "role" => fc[:role].to_s, "idx_in_role" => fc[:idx_in_role].to_i } })
          # Polígono real de cada faceta (merged_polygon multi-segmento ou
          # outer_loop) — permite reconstruir as trajetórias dos cantos no
          # adicionar_peca pra a travessa acompanhar a curva (igual ao gerar).
          grp.set_attribute("signeng_curvo", "facets_poly",
                            facets.map { |fc|
                              poly = poly_for_facet(fc)
                              (poly && poly.size >= 3) ? poly.map { |p| [p.x.to_f, p.y.to_f, p.z.to_f] } : []
                            })
          grp.set_attribute("signeng_curvo", "bb_topo",
                            [bb_topo[:cx].to_f, bb_topo[:cy].to_f, bb_topo[:w].to_f, bb_topo[:d].to_f])
          grp.set_attribute("signeng_curvo", "bb_base",
                            [bb_base[:cx].to_f, bb_base[:cy].to_f, bb_base[:w].to_f, bb_base[:d].to_f])
        rescue => _e
        end

        {
          face_topo:      face_topo,
          face_base:      face_base,
          base_corners:   base_corners,
          topo_corners:   topo_corners,
          facets:         facets,           # ordem ciclica (espelhada nos cantos)
          facets_by_role: facets_by_role,
          h:              h,
          bb_base:        bb_base,
          bb_topo:        bb_topo,
          cx_xy:          cx,
          cy_xy:          cy
        }
      end

      # Reconstrói info MÍNIMO a partir dos attributes salvos pelo último
      # analisar_modulo bem-sucedido. Usado por adicionar_peca quando o grupo
      # já foi modificado por gerar() (faces ACM desabilitadas erased), o que
      # faria analisar_modulo retornar nil.
      def self.restaurar_info_de_attributes(grp)
        base_raw = grp.get_attribute("signeng_curvo", "base_corners", nil)
        topo_raw = grp.get_attribute("signeng_curvo", "topo_corners", nil)
        meta_raw = grp.get_attribute("signeng_curvo", "facets_meta", nil)
        return nil unless base_raw && topo_raw && meta_raw
        return nil if base_raw.size != topo_raw.size
        return nil if base_raw.size < 3

        base_corners = base_raw.map { |a| Geom::Point3d.new(a[0].to_f, a[1].to_f, a[2].to_f) }
        topo_corners = topo_raw.map { |a| Geom::Point3d.new(a[0].to_f, a[1].to_f, a[2].to_f) }
        poly_raw = grp.get_attribute("signeng_curvo", "facets_poly", nil)

        n = base_corners.size
        facets = []
        n.times do |i|
          j = (i + 1) % n
          meta = meta_raw[i] || {}
          role = (meta["role"] || meta[:role] || "frontal").to_s
          idx_in_role = (meta["idx_in_role"] || meta[:idx_in_role] || i).to_i
          # Reconstrói o polígono real da faceta (pra trajetória seguir a curva).
          merged = nil
          if poly_raw.is_a?(Array) && poly_raw[i].is_a?(Array) && poly_raw[i].size >= 3
            merged = poly_raw[i].map { |a| Geom::Point3d.new(a[0].to_f, a[1].to_f, a[2].to_f) }
          end
          facets << {
            base_left:  base_corners[i],
            base_right: base_corners[j],
            topo_left:  topo_corners[i],
            topo_right: topo_corners[j],
            face:       nil,   # sem face — normal será computado de corners
            merged_polygon: merged,
            role:       role,
            idx_in_role: idx_in_role
          }
        end

        { base_corners: base_corners, topo_corners: topo_corners, facets: facets,
          face_topo: nil, face_base: nil, facets_by_role: nil,
          bb_base: { cx: 0, cy: 0, w: 0, d: 0 }, bb_topo: { cx: 0, cy: 0, w: 0, d: 0 },
          h: ((topo_corners.first.z + topo_corners.last.z) / 2.0) -
             ((base_corners.first.z + base_corners.last.z) / 2.0) }
      end

      # ----------------------------------------------------------------------
      # SLICE — quebra a estrutura em fatias horizontais nos "knees" (transições
      # entre trecho reto e angulado). Cada fatia tem um Z e os 4 cantos da
      # estrutura naquele Z, computados pela trajetória de cada canto (que é
      # multi-segmento se a coluna tem step/shoulder).
      # Retorna [[z_0, [pt0,pt1,pt2,pt3]], [z_1, [...]], ...]
      # ----------------------------------------------------------------------
      def self.slice_structure(info)
        trajectories = corner_trajectories(info)

        # 2) Coleta TODOS os Z únicos (com tolerância pra evitar duplicatas
        #    por float precision)
        zs = []
        trajectories.flatten.map(&:z).each do |z|
          next if zs.any? { |zk| (zk - z).abs < 0.5.mm }
          zs << z
        end
        zs.sort!

        # 3) Pra cada Z, computa os 4 cantos interpolando cada trajetória
        slices = zs.map do |z|
          corners = trajectories.map { |traj| interp_traj_at_z(traj, z) }
          [z, corners]
        end
        slices
      end

      # Trajetória de cada canto: polilinha de pontos (em ordem ascendente Z).
      # Pra estrutura multi-segmento, cada trajetória pode ter knees intermediários
      # (ex: canto frontal-esquerdo passa por base, knee@200, shoulder@4400, topo).
      def self.corner_trajectories(info)
        base = info[:base_corners]
        topo = info[:topo_corners]
        facets = info[:facets]
        n = base.size
        trajectories = []
        n.times do |i|
          poly_a = poly_for_facet(facets[(i - 1) % n])
          poly_b = poly_for_facet(facets[i])
          shared = []
          poly_a.each do |pa|
            next unless poly_b.any? { |pb| points_close?(pa, pb) }
            next if shared.any? { |s| points_close?(s, pa) }
            shared << pa
          end
          shared << base[i] unless shared.any? { |s| points_close?(s, base[i]) }
          shared << topo[i] unless shared.any? { |s| points_close?(s, topo[i]) }
          trajectories << shared.sort_by(&:z)
        end
        trajectories
      end

      # Retorna os pontos do polígono da facet (merged se houver, senão outer_loop)
      def self.poly_for_facet(fc)
        return fc[:merged_polygon] if fc[:merged_polygon] && fc[:merged_polygon].size >= 3
        f = fc[:face]
        return [] unless f && f.respond_to?(:outer_loop)
        f.outer_loop.vertices.map(&:position) rescue []
      end

      def self.points_close?(p1, p2, tol = 0.5.mm)
        return false unless p1 && p2
        (p1.x - p2.x).abs < tol && (p1.y - p2.y).abs < tol && (p1.z - p2.z).abs < tol
      end

      # Encurta os endpoints de uma "tira horizontal" (anel, travessa, emenda,
      # fita) para que ela NÃO invada os montantes nos 2 cantos. Corta `mh` no
      # endpoint esquerdo (lado do canto inicial — montante extende mh tangen-
      # cialmente) e `mw` no endpoint direito (lado do canto final — montante
      # extende mw radialmente, que = -tangencial em XY).
      # Retorna [left_trimmed, right_trimmed]; se a peça é curta demais pra
      # acomodar o trim, devolve os pontos originais.
      def self.trim_strip_endpoints(left, right, trim_left, trim_right)
        dx = right.x - left.x
        dy = right.y - left.y
        d_len = Math.sqrt(dx*dx + dy*dy)
        return [left, right] if d_len < (trim_left + trim_right + 1.mm)
        ux = dx / d_len; uy = dy / d_len
        l2 = Geom::Point3d.new(left.x + ux * trim_left, left.y + uy * trim_left, left.z)
        r2 = Geom::Point3d.new(right.x - ux * trim_right, right.y - uy * trim_right, right.z)
        [l2, r2]
      end

      # Interpola uma trajetória polilínea no valor Z dado.
      def self.interp_traj_at_z(traj, z)
        return traj.first if traj.empty?
        return traj.first if z <= traj.first.z
        return traj.last  if z >= traj.last.z
        (0...traj.size - 1).each do |i|
          z0 = traj[i].z; z1 = traj[i + 1].z
          next if z < z0 - 0.001 || z > z1 + 0.001
          if (z1 - z0).abs < 1e-6
            return traj[i]
          end
          t = (z - z0) / (z1 - z0)
          return Geom::Point3d.new(
            traj[i].x + (traj[i + 1].x - traj[i].x) * t,
            traj[i].y + (traj[i + 1].y - traj[i].y) * t,
            z
          )
        end
        traj.last
      end

      # ----------------------------------------------------------------------
      # FACE CHAIN — quando a "frontal" (ou outra lateral) está dividida em
      # múltiplas faces no SketchUp (ex: front-slanted + top-front no caso
      # de "PORTICO COM AVANÇO" com base_sup), precisamos costurar elas em
      # um único polígono. Faz BFS no grafo de faces via arestas compartilhadas.
      # ----------------------------------------------------------------------

      def self.bfs_face_chain(start_face, end_face, candidates)
        return [start_face] if start_face == end_face
        # Normal de referência (do start_face): só aceita faces co-direcionais
        # — evita BFS atravessar pelas laterais (Dir/Esq) entre faces da frente.
        ref_n = start_face.normal rescue nil
        end_n = end_face.normal rescue nil
        # Normal "média" do par start+end pra usar como filtro
        avg_x = (ref_n ? ref_n.x : 0) + (end_n ? end_n.x : 0)
        avg_y = (ref_n ? ref_n.y : 0) + (end_n ? end_n.y : 0)
        avg_z = (ref_n ? ref_n.z : 0) + (end_n ? end_n.z : 0)
        avg_len = Math.sqrt(avg_x**2 + avg_y**2 + avg_z**2)
        if avg_len > 1e-6
          avg_x /= avg_len; avg_y /= avg_len; avg_z /= avg_len
        end

        visited = { start_face => nil }
        queue = [start_face]
        until queue.empty?
          current = queue.shift
          if current == end_face
            chain = []
            cur = current
            while cur
              chain.unshift(cur)
              cur = visited[cur]
            end
            return chain
          end
          # Arestas da face atual → faces vizinhas (não topo/base)
          edges = current.edges rescue []
          edges.each do |e|
            (e.faces rescue []).each do |adj|
              next if adj == current
              next unless candidates.include?(adj)
              next if visited.key?(adj)
              # FILTRO POR DIREÇÃO DA NORMAL: só aceita faces no mesmo "lado"
              # do start (dot product > 0.3 com a normal média start+end).
              # Isso impede BFS de atravessar pela lateral pra chegar do front
              # ao topo, por exemplo.
              an = adj.normal rescue nil
              if an && avg_len > 1e-6
                dot = an.x * avg_x + an.y * avg_y + an.z * avg_z
                next if dot < 0.3
              end
              visited[adj] = current
              queue << adj
            end
          end
        end
        nil
      end

      # Funde os polígonos de várias faces conectadas em uma única lista de
      # vértices (CCW vista de fora). Estratégia: arestas que aparecem 1x são
      # bordas externas; arestas que aparecem 2x são internas (compartilhadas,
      # removidas). Caminha nas externas pra formar o polígono. Garante CCW
      # comparando a normal calculada do polígono com a normal média das faces
      # — se inverter, reverte (pra back-face culling do 3D funcionar).
      def self.merge_face_chain_boundary(faces)
        return nil if faces.nil? || faces.empty?
        return faces.first.outer_loop.vertices.map(&:position) if faces.size == 1

        edge_count = Hash.new(0)
        faces.each do |f|
          (f.edges rescue []).each { |e| edge_count[e] += 1 }
        end
        boundary_edges = edge_count.select { |_, c| c == 1 }.keys
        return nil if boundary_edges.size < 3

        # Caminha pelas arestas externas pra formar o polígono
        polygon = []
        used = {}
        first_edge = boundary_edges.first
        polygon << first_edge.start.position
        used[first_edge] = true
        cur_v = first_edge.end.position
        max_iter = boundary_edges.size + 5
        max_iter.times do
          polygon << cur_v
          break if cur_v == polygon.first && polygon.size > 2
          next_edge = boundary_edges.find { |e|
            !used[e] && (e.start.position == cur_v || e.end.position == cur_v)
          }
          break unless next_edge
          used[next_edge] = true
          cur_v = (next_edge.start.position == cur_v) ? next_edge.end.position : next_edge.start.position
        end
        polygon.pop if polygon.size > 2 && polygon.last == polygon.first
        return nil if polygon.size < 3

        # ── Garante CCW vista de fora ──
        # Normal média das faces (espera apontar pra fora — outer normals)
        avg_n = Geom::Vector3d.new(0, 0, 0)
        faces.each do |f|
          n = f.normal rescue nil
          avg_n.x += n.x if n; avg_n.y += n.y if n; avg_n.z += n.z if n
        end
        # Normal do polígono (cross product das 2 primeiras arestas)
        if polygon.size >= 3
          v0 = polygon[0]; v1 = polygon[1]; v2 = polygon[2]
          e0x = v1.x - v0.x; e0y = v1.y - v0.y; e0z = v1.z - v0.z
          e1x = v2.x - v0.x; e1y = v2.y - v0.y; e1z = v2.z - v0.z
          pnx = e0y * e1z - e0z * e1y
          pny = e0z * e1x - e0x * e1z
          pnz = e0x * e1y - e0y * e1x
          dot = avg_n.x * pnx + avg_n.y * pny + avg_n.z * pnz
          # Se a normal do polígono aponta no sentido OPOSTO ao avg_n, está CW.
          polygon.reverse! if dot < 0
        end

        polygon
      end

      # ----------------------------------------------------------------------
      # HELPERS DE LOOP
      # ----------------------------------------------------------------------

      # Ordena um loop de vertices em CCW (anti-horario visto de cima).
      def self.ordenar_loop_ccw(pts)
        return pts if pts.size < 3
        # area com sinal pelo metodo do shoelace
        a = 0.0
        n = pts.size
        n.times do |i|
          j = (i + 1) % n
          a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
        end
        # se area < 0, esta em CW → reverte
        a < 0 ? pts.reverse : pts
      end

      # Rotaciona o loop A pra que A[i] corresponda a B[i] em CCW.
      # Usa ANGULO POLAR (em torno do centroide de cada loop) em vez de
      # distancia euclidiana — robusto pra poligonos de tamanhos/posicoes
      # bem diferentes (ex: base 200x200 vs topo 200x700 envolvendo a base).
      def self.alinhar_loop(a, b)
        return a if a.size < 2 || b.size < 2
        ax = a.map(&:x).sum / a.size.to_f
        ay = a.map(&:y).sum / a.size.to_f
        bx = b.map(&:x).sum / b.size.to_f
        by = b.map(&:y).sum / b.size.to_f
        ang_b0 = Math.atan2(b[0].y - by, b[0].x - bx)
        best_idx = (0...a.size).min_by do |i|
          ang_a = Math.atan2(a[i].y - ay, a[i].x - ax)
          diff = (ang_a - ang_b0).abs
          diff = (2 * Math::PI - diff) if diff > Math::PI
          diff
        end
        a.rotate(best_idx)
      end

      def self.bb_xy(pts)
        xs = pts.map(&:x); ys = pts.map(&:y)
        { w: xs.max - xs.min, d: ys.max - ys.min,
          cx: (xs.max + xs.min) / 2.0, cy: (ys.max + ys.min) / 2.0 }
      end

      def self.tem_pt(arr, p)
        arr.any? { |q| (q.x - p.x).abs < EPS && (q.y - p.y).abs < EPS && (q.z - p.z).abs < EPS }
      end

      def self.interp(pa, pb, t)
        Geom::Point3d.new(
          pa.x + (pb.x - pa.x) * t,
          pa.y + (pb.y - pa.y) * t,
          pa.z + (pb.z - pa.z) * t
        )
      end

      def self.dist_xy(a, b)
        Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2)
      end

      # ----------------------------------------------------------------------
      # ROLE_PARA_FACE — classifica uma face em topo/base/frontal/traseira/esq/dir
      # baseado na normal Z e no vetor centroide_face → centro_modulo (XY).
      # Funciona pra QUALQUER face lateral (mesmo levemente inclinada),
      # pois usa o centroide em vez da normal pura — robusto pra trapezoides.
      # ----------------------------------------------------------------------
      def self.role_para_face(face, cx_modulo, cy_modulo)
        return nil unless face && face.valid?
        n = face.normal
        return "topo" if n.z >  0.7
        return "base" if n.z < -0.7
        # face lateral: usa direcao do centroide pra distinguir
        c = centroide_xy(face)
        dx = c[0] - cx_modulo
        dy = c[1] - cy_modulo
        if dx.abs >= dy.abs
          dx > 0 ? "dir" : "esq"
        else
          dy > 0 ? "traseira" : "frontal"
        end
      end

      def self.centroide_xy(face)
        vs = face.outer_loop.vertices.map(&:position)
        n  = vs.size.to_f
        [vs.map(&:x).sum / n, vs.map(&:y).sum / n]
      end

      # ----------------------------------------------------------------------
      # PINTAR_ACM_FACES — pinta TODAS as faces do grupo (não só as detectadas
      # como "facetas" pelo analisar_modulo). Usa a mesma logica de role
      # da captura, garantindo que nenhuma face fica branca.
      # ----------------------------------------------------------------------
      def self.pintar_acm_faces(model, info, p, grp = nil)
        nome_acm = "ACM_#{p[:cor_acm]}"
        acm_mat = model.materials[nome_acm]
        unless acm_mat
          acm_mat = model.materials.add(nome_acm)
          info_cor = (CORES_ACM[p[:cor_acm]] rescue nil)
          rgb = info_cor ? info_cor[:rgb] : [187, 187, 187]
          acm_mat.color = Sketchup::Color.new(*rgb)
        end

        # se vier o grupo, percorre todas as faces dele direto.
        # Senao, usa info[:face_topo|face_base|facets] como fallback.
        if grp
          ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
          local_bb = Geom::BoundingBox.new
          ents.each { |e| local_bb.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
          return unless local_bb.valid?
          cx = (local_bb.min.x + local_bb.max.x) / 2.0
          cy = (local_bb.min.y + local_bb.max.y) / 2.0
          ents.grep(Sketchup::Face).to_a.each do |f|
            next unless f.valid?
            role = role_para_face(f, cx, cy)
            next unless role
            sym = role.to_sym
            enab = p[:roles_enab].key?(sym) ? p[:roles_enab][sym] : true
            if enab
              f.material = acm_mat; f.back_material = acm_mat
            else
              f.erase!
            end
          end
        else
          # fallback (compat): pinta só as faces detectadas pelo analisar_modulo
          [[info[:face_topo], :topo], [info[:face_base], :base]].each do |face, sym|
            next unless face && face.valid?
            if p[:roles_enab][sym]
              face.material = acm_mat; face.back_material = acm_mat
            else
              face.erase!
            end
          end
          info[:facets].each do |fc|
            sym = fc[:role].to_sym
            enab = p[:roles_enab].key?(sym) ? p[:roles_enab][sym] : true
            fc[:faces].each do |f|
              next unless f && f.valid?
              if enab
                f.material = acm_mat; f.back_material = acm_mat
              else
                f.erase!
              end
            end
          end
        end
      end

      def self.limpar_geracao_antiga(ents)
        names = %w[EST_Metalon FITA_DF JUNTAS SPOTS]
        ents.to_a.each do |e|
          e.erase! if e.is_a?(Sketchup::Group) && names.include?(e.name)
        end
      end

      # ======================================================================
      # FILOSOFIA NOVA (v1.0.46) — eixos LOCAIS FIXOS por canto/face
      # ----------------------------------------------------------------------
      # Calculados UMA vez no nível BASE e usados em toda a estrutura. Não
      # rotacionam com Z. Inspirado no legacy `colunas.rb#gerar_estrutura_av`,
      # que usa coordenadas globais fixas (X profundidade, Y largura, Z
      # altura) e só varia X(z) ao longo da altura — perfis nunca rotacionam.
      #
      # No auto_acm_curvo a estrutura é poligonal genérica, então fixamos
      # eixos POR CANTO (ux,uy radial + tx,ty tangencial) calculados a partir
      # do polígono BASE. Resultado: faces base/topo de cada peça sempre
      # planares (todos os pontos no mesmo Z), paredes laterais sempre
      # planares (mesmos eixos nos 2 extremos) — sem torção visual, sem
      # `Points are not planar`.
      # ======================================================================

      # Eixos fixos por CANTO (usado pelos montantes).
      # Constrói os eixos a partir das INWARD NORMALS das duas faces adjacentes
      # ao canto:
      #   e1 = inward normal da face anterior (face_(i-1) → entra no canto)
      #   e2 = inward normal da face atual    (face_i     → sai do canto)
      # Para cantos a 90° (coluna quadrada), e1 e e2 são perpendiculares por
      # construção → seção retangular limpa (mh×mw). Idêntico ao raciocínio
      # do legacy `colunas.rb#gerar_estrutura_av`, que usa eixos X/Y globais
      # ortogonais. NÃO usar canto→centroide como radial — isso aponta na
      # diagonal em coluna quadrada e produz seção enviesada.

      # Eixos fixos por FACE (usado pelos anéis e travessas/emendas).
      # tx,ty = tangencial canto[i]→canto[i+1] (no nível base)
      # rx,ry = perpendicular tangencial, apontando pro centroide (inward)

      # Constrói a seção retangular do montante em UM ponto da trajetória,
      # usando eixos FIXOS do canto (e1 = inward normal face anterior,
      # e2 = inward normal face atual). Para canto a 90°, seção é
      # retangular limpa mh×mw. Origem A = canto + e1*off + e2*off (ponto
      # mais próximo do canto, recuado `off` de cada face). Os 4 cantos da
      # seção em CCW: A, A+e1*mh, A+e1*mh+e2*mw, A+e2*mw.

      # Tangente da trajetória no ponto j (forward/backward nos extremos,
      # central nos pontos internos). Retorna [tx, ty, tz] normalizado.

      # Versão "inclinada" de section_at: constrói a cross-section no plano
      # PERPENDICULAR ao tangente local (em vez de horizontal). Os eixos e1/e2
      # horizontais são projetados nesse plano. Quando o tangente é puramente
      # vertical (+Z) a função reduz para section_at original.

      # ======================================================================
      # MONTANTES — 1 perfil mw×mh por canto, percorrendo a TRAJETÓRIA INTEIRA
      # ----------------------------------------------------------------------
      # Para cada canto i: itera pelos segmentos da trajetória (base→knee1→
      # ...→topo), gerando um solid6 por segmento, TODOS usando os mesmos
      # eixos fixos (axes[i]). Sem torção, sem média, sem ajuste de
      # planaridade — geometria robusta por construção.
      # ======================================================================

      # ======================================================================
      # DETECT_CURVE_IN_POLYLINE — detecta se uma polilinha 3D forma curva
      # suave (vs. reta ou ângulos abruptos).
      # ----------------------------------------------------------------------
      # Usa ângulo 3D unsigned entre segmentos consecutivos. Polilinha é
      # considerada curva se a maioria dos bends (>=60%) está em (0.5°,
      # threshold_deg) e bend total >= min_total_deg.
      # ======================================================================

      # ======================================================================
      # GERAR_MONTANTE_CALANDRADO — montante único ao longo de uma trajetória
      # curva (em vez de N solid6 separados por segmento).
      # ----------------------------------------------------------------------
      # Topologia: rings (cross-section retangular `section_at`) em cada ponto
      # da trajetória + 4 quads conectando rings consecutivos + tampas.
      # Arestas longitudinais suavizadas → visual calandrado vertical.
      # ======================================================================
      # Fita do montante calandrada — 1 peça única ao longo da trajetória,
      # alinhada com UMA face adjacente (tang_xy + inward_xy).

      # axes_per_point: array (1 axes por ponto) ou hash (fixo).
      # Cross-section em cada ponto é construída no plano PERPENDICULAR ao
      # TANGENTE local da trajetória — não no plano horizontal — fazendo o
      # perfil rotacionar acompanhando a inclinação da curva, mantendo a
      # face plana sempre voltada pra ACM.

      # ======================================================================
      # DETECT_CURVE_RUNS — identifica trechos de cantos consecutivos que
      # formam curva suave (cada bend < threshold_deg, mesmo sinal, bend total
      # acumulado >= min_total_bend_deg).
      # ----------------------------------------------------------------------
      # Cada run = { start_outer, end_outer, mid_corners, sign, total_bend,
      #              seg_idxs }
      #   start_outer : índice do canto ANTES da curva (junção com reto)
      #   end_outer   : índice do canto DEPOIS (junção com próximo reto)
      #   mid_corners : índices dos cantos intermediários (montantes que somem)
      #   seg_idxs    : índices dos segmentos do anel cobertos pela curva
      #                  (segmento i = corners[i] → corners[i+1])
      # ----------------------------------------------------------------------
      # Saída: { runs: [...], skip_corners: [...], skip_segments: [...] }
      # ======================================================================

      # ======================================================================
      # GERAR_ANEL_CALANDRADO — gera UMA peça de anel curvo via "rings"
      # (cross-sections em cada canto do path + faces quad entre cross-sections
      # + soft/smooth nas arestas longitudinais → visual calandrado).
      # ----------------------------------------------------------------------
      # path_corners : pontos 3D ao longo da curva (do start_outer ao end_outer)
      # path_face_axes : array de face_axes[i] correspondentes a cada SEGMENTO
      #                  da curva (size = path_corners.size - 1)
      # ======================================================================

      # Versão fita do anel calandrado (mw=fl, mh=fe, deslocado radialmente
      # de off_acm em vez de off_corner).

      # Anel num único nível Z (usado pra estruturas multi-segmento, onde cada
      # "knee" Z recebe seu próprio anel).
      #   sign_z    = +1 → perfil cresce pra cima (anel base/intermediário)
      #   sign_z    = -1 → perfil cresce pra baixo (anel topo)
      #   face_axes = (opcional) eixos fixos por face. Se fornecido, usa esses
      #               eixos em vez de recalcular tangente/radial localmente —
      #               garante alinhamento com os montantes (que também usam
      #               eixos fixos).


      def self.centro_xy(base, topo)
        all = base + topo
        cx = all.map(&:x).sum / all.size.to_f
        cy = all.map(&:y).sum / all.size.to_f
        [cx, cy]
      end

      # ======================================================================
      # FITA DOS ANÉIS — gera fita dupla-face em cada segmento de anel,
      # centrada verticalmente no metalon (mh) e em frente dele (off_acm).
      # Mesmo trim do anel para alinhar perfeitamente.
      # ======================================================================

      # ======================================================================
      # ESTRUTURA INTERNA DE UMA FACETA — travessas H, emendas V, fita, junta
      # ----------------------------------------------------------------------
      # Sistema de coordenadas local da faceta:
      #   v (vertical)   : 0 na base do trapezio, h_face no topo
      #   u (tangencial) : 0 na aresta esquerda (canto base_left), variavel
      #   pn (radial in) : 0 no plano externo da face (onde fica a chapa ACM)
      #
      # Chapa: chapa_larg (1220 ou 1500) é a dimensao perpendicular ao "comprimento"
      # da chapa (5000mm). Orient horizontal: largura da chapa = 1220 na altura
      # (corte horizontal a cada 1220). Orient vertical: 1220 na horizontal.
      # Para v1, emendas V (horizontais) são posicionadas a cada chapa_larg na
      # altura do trapezio, ja que a maioria das colunas afuniladas usa chapa horizontal.
      # ======================================================================

      # ----------------------------------------------------------------------
      # EMENDA VERTICAL — perfil vertical (ew tangencial × eh radial) na
      # posição u=frac*w_face da faceta. Da base ao topo do trapézio.
      # ----------------------------------------------------------------------
      # Ponto da linha de centro da emenda no z dado: interp(left(z),right(z),frac).
      def self.emenda_center_at(traj_left, traj_right, frac, z)
        lp = interp_traj_at_z(traj_left,  z)
        rp = interp_traj_at_z(traj_right, z)
        Geom::Point3d.new(lp.x + (rp.x - lp.x) * frac,
                          lp.y + (rp.y - lp.y) * frac, z)
      end

      # Sub-trajetória na fração `frac` (0..1) ao longo da largura: linha vertical
      # que SEGUE a curva, amostrada nos z's das duas trajetórias de canto. Usada
      # pelo anti-transpasse pra cortar tiras horizontais nas emendas verticais.
      def self.frac_subtraj(traj_left, traj_right, frac)
        zs = (traj_left.map(&:z) + traj_right.map(&:z)).uniq.sort
        zs.map { |z| emenda_center_at(traj_left, traj_right, frac, z) }
      end

      # Faixas-Z RETAS da linha de centro entre z0 e z1. Em trechos curvos
      # (calandrado: vértices com bend perceptível) a faixa é interrompida →
      # o perfil vertical é RETO em cada trecho reto e PARA na curva, recomeçando
      # no próximo trecho reto. Devolve [[za,zb], ...] (vazio se tudo curva).
      def self.vertical_straight_runs(traj_left, traj_right, frac, z0, z1)
        zlo = [z0, z1].min; zhi = [z0, z1].max
        tL = (traj_left  || []).size
        tR = (traj_right || []).size
        unless traj_left && traj_right && tL >= 2 && tR >= 2
          puts "[Curvo EV-runs] trajL=#{tL} trajR=#{tR} -> SEM TRAJ (reto full). Recapture o modulo se devia ter curva."
          return [[zlo, zhi]]
        end
        zs = [zlo, zhi]
        (traj_left + traj_right).each { |q| zs << q.z if q.z > zlo + 0.01 && q.z < zhi - 0.01 }
        zs = zs.uniq.sort
        centers = zs.map { |z| emenda_center_at(traj_left, traj_right, frac, z) }
        n = centers.size
        if n < 2
          puts "[Curvo EV-runs] trajL=#{tL} trajR=#{tR} zs=#{n} -> reto full"
          return [[zlo, zhi]]
        end

        # Um SEGMENTO é "de curva" se inclina demais da VERTICAL (tilt > ~6°).
        # Trecho reto = segmento ~vertical. (Antes eu media o ângulo ENTRE
        # segmentos — errado: num arco suave a direção muda pouco entre passos,
        # então a curva inteira passava como "reta".)
        runs = []; cur = nil
        tilts = []
        (0...n - 1).each do |i|
          a = centers[i]; b = centers[i + 1]
          dh = Math.sqrt((b.x - a.x)**2 + (b.y - a.y)**2)
          dz = (b.z - a.z).abs
          dz = 1e-6 if dz < 1e-6
          tilt = Math.atan2(dh, dz) * 180.0 / Math::PI
          tilts << tilt.round(1)
          if tilt > 6.0          # segmento inclinado = curva → não desenha
            cur = nil
          elsif cur.nil?
            cur = [a.z, b.z]; runs << cur
          else
            cur[1] = b.z
          end
        end

        # O perfil reto só existe nas PONTAS (toca topo ou base) e PARA na curva.
        # Trechos retos no MEIO (ex: inflexão de uma curva em S, que fica
        # momentaneamente vertical) NÃO valem — fazem parte da curva.
        tol = 1.0.mm
        kept = runs.select { |r| r[0] <= zlo + tol || r[1] >= zhi - tol }
        puts "[Curvo EV-runs] trajL=#{tL} trajR=#{tR} segs=#{n - 1} tilts=#{tilts.inspect} " \
             "runs=#{runs.map { |r| [(r[0]/1.mm).round, (r[1]/1.mm).round] }.inspect} " \
             "kept=#{kept.map { |r| [(r[0]/1.mm).round, (r[1]/1.mm).round] }.inspect}"
        kept
      end

      def self.desenhar_emenda_vertical(ents, bL, bR, tL, tR, frac,
                                         rad_x, rad_y, tan_x, tan_y,
                                         off_radial, prof_w, prof_h,
                                         mat_name, nome,
                                         traj_left = nil, traj_right = nil)
        half = prof_w / 2.0

        # 4 cantos do perfil (tan × radial) centrados num ponto da linha de centro.
        section = lambda do |cpt|
          sx = cpt.x + rad_x * off_radial - tan_x * half
          sy = cpt.y + rad_y * off_radial - tan_y * half
          [
            Geom::Point3d.new(sx,                                    sy,                                    cpt.z),
            Geom::Point3d.new(sx + tan_x * prof_w,                   sy + tan_y * prof_w,                   cpt.z),
            Geom::Point3d.new(sx + tan_x * prof_w + rad_x * prof_h,  sy + tan_y * prof_w + rad_y * prof_h,  cpt.z),
            Geom::Point3d.new(sx + rad_x * prof_h,                   sy + rad_y * prof_h,                   cpt.z)
          ]
        end

        base_pt = interp(bL, bR, frac)
        topo_pt = interp(tL, tR, frac)

        # ── RETO por TRECHO: um perfil reto em cada trecho reto; PARA na curva ──
        if traj_left && traj_right && traj_left.size >= 2 && traj_right.size >= 2
          runs = vertical_straight_runs(traj_left, traj_right, frac, base_pt.z, topo_pt.z)
          ret = nil
          runs.each_with_index do |(za, zb), i|
            next if (zb - za).abs < 1.0
            pb = section.call(emenda_center_at(traj_left, traj_right, frac, za))
            pt = section.call(emenda_center_at(traj_left, traj_right, frac, zb))
            emit_solid6(ents, pb, pt, mat_name, (runs.size > 1 ? "#{nome}.#{i}" : nome))
            ret ||= (pb + pt)   # 1º trecho como fallback de preview
          end
          return ret || []
        end

        # ── RETO simples (sem trajetória) ──
        pb = section.call(base_pt)
        pt = section.call(topo_pt)
        emit_solid6(ents, pb, pt, mat_name, nome)
        (pb + pt)   # 8 cantos desenhados (model-local) pra preview
      end

      # Fita vertical (fl tangencial × fe radial) na posição u=frac*w_face,
      # deslocada de tan_offset tangencial em relação à junta.
      def self.desenhar_fita_vertical(ents, bL, bR, tL, tR, frac,
                                       rad_x, rad_y, tan_x, tan_y,
                                       off_radial, fe, fl_eff, tan_offset, nome,
                                       traj_left = nil, traj_right = nil)
        # 4 cantos da fita centrados num ponto da linha de centro.
        section = lambda do |cpt|
          sx = cpt.x + rad_x * off_radial + tan_x * tan_offset
          sy = cpt.y + rad_y * off_radial + tan_y * tan_offset
          [
            Geom::Point3d.new(sx,                              sy,                              cpt.z),
            Geom::Point3d.new(sx + tan_x * fl_eff,             sy + tan_y * fl_eff,             cpt.z),
            Geom::Point3d.new(sx + tan_x * fl_eff + rad_x * fe, sy + tan_y * fl_eff + rad_y * fe, cpt.z),
            Geom::Point3d.new(sx + rad_x * fe,                 sy + rad_y * fe,                 cpt.z)
          ]
        end

        base_pt = interp(bL, bR, frac)
        topo_pt = interp(tL, tR, frac)

        # ── RETO por TRECHO (acompanha o perfil: para na curva, recomeça reto) ──
        if traj_left && traj_right && traj_left.size >= 2 && traj_right.size >= 2
          runs = vertical_straight_runs(traj_left, traj_right, frac, base_pt.z, topo_pt.z)
          runs.each_with_index do |(za, zb), i|
            next if (zb - za).abs < 1.0
            pb = section.call(emenda_center_at(traj_left, traj_right, frac, za))
            pt = section.call(emenda_center_at(traj_left, traj_right, frac, zb))
            emit_solid6(ents, pb, pt, "Fita_DF", (runs.size > 1 ? "#{nome}.#{i}" : nome))
          end
          return
        end

        # ── RETO simples ──
        pb = section.call(base_pt)
        pt = section.call(topo_pt)
        emit_solid6(ents, pb, pt, "Fita_DF", nome)
      end

      # Junta visual vertical: faixa fina junta_w tangencial × 0.5mm radial
      # ligeiramente FORA do plano externo.
      def self.desenhar_junta_vertical(ents, bL, bR, tL, tR, frac,
                                        rad_x, rad_y, tan_x, tan_y, junta_w,
                                        cor_junta, nome)
        base_pt = interp(bL, bR, frac)
        topo_pt = interp(tL, tR, frac)
        out_off = -0.3.mm
        depth   = 0.5.mm
        half    = junta_w / 2.0
        bx = base_pt.x + rad_x * out_off - tan_x * half
        by = base_pt.y + rad_y * out_off - tan_y * half
        tx = topo_pt.x + rad_x * out_off - tan_x * half
        ty = topo_pt.y + rad_y * out_off - tan_y * half
        pb = [
          Geom::Point3d.new(bx,                          by,                          base_pt.z),
          Geom::Point3d.new(bx + tan_x * junta_w,        by + tan_y * junta_w,        base_pt.z),
          Geom::Point3d.new(bx + tan_x * junta_w + rad_x * depth,
                            by + tan_y * junta_w + rad_y * depth, base_pt.z),
          Geom::Point3d.new(bx + rad_x * depth,          by + rad_y * depth,          base_pt.z)
        ]
        pt = [
          Geom::Point3d.new(tx,                          ty,                          topo_pt.z),
          Geom::Point3d.new(tx + tan_x * junta_w,        ty + tan_y * junta_w,        topo_pt.z),
          Geom::Point3d.new(tx + tan_x * junta_w + rad_x * depth,
                            ty + tan_y * junta_w + rad_y * depth, topo_pt.z),
          Geom::Point3d.new(tx + rad_x * depth,          ty + rad_y * depth,          topo_pt.z)
        ]
        mat_j = "Junta_#{cor_junta}"
        emit_solid6(ents, pb, pt, mat_j, nome)
      end

      # ======================================================================
      # ESTRUTURA DO TOPO — travessas, emendas, fita dupla, junta visual no
      # ACM superior (horizontal). Tratamento análogo às facetas laterais,
      # mas no plano XY ao invés de plano vertical inclinado.
      # ----------------------------------------------------------------------
      # Coords locais do topo:
      #   u (X) — eixo X global, 0..w_topo
      #   v (Y) — eixo Y global, 0..d_topo
      #   inward = -Z (pra baixo, atrás do ACM)
      # Plano do ACM: z = z_topo. Estrutura fica logo abaixo (z < z_topo).
      # ======================================================================

      # ════════════════════════════════════════════════════════════════════
      # ADICIONAR PEÇA INCREMENTAL — mirror funcional do
      # AutoACM.aplicar_edicoes_data do normal. Recebe 1 piece + params raw,
      # encontra o grupo curvo já existente, abre EST_Metalon/FITA_DF
      # e desenha SÓ essa peça nas facetas matching. NÃO regenera.
      # ════════════════════════════════════════════════════════════════════
      def self.adicionar_peca(entity_id, piece, params_raw)
        model = Sketchup.active_model
        grp   = find_entity_by_id(model, entity_id.to_i)
        return { ok: false, code: "autoacmcurvo.entity_not_found" } unless grp
        return { ok: false, code: "autoacmcurvo.piece_invalid" } unless piece.is_a?(Hash)

        p = extrair(params_raw || {})
        # Prioriza o cache de attributes (salvo pelo último analisar_modulo da
        # captura) sobre uma análise fresca: o envelope.roles do JS foi
        # construído na captura, então as roles do cache são as únicas que
        # batem com o que o usuário vê no dropdown. Análise fresca depois de
        # gerar() pode classificar diferente porque pintar_acm_faces erased
        # faces e o gerar adicionou edges que mudam outer_loop de base/topo.
        info = restaurar_info_de_attributes(grp) || analisar_modulo(grp)
        return { ok: false, code: "autoacmcurvo.detect_failed", error: "Não consegui ler a estrutura do módulo. Tente Capturar Faces de novo." } unless info

        face_target = (piece[:face] || piece["face"]).to_s
        return { ok: false, code: "autoacmcurvo.face_unknown", error: "face='#{face_target}' n/d" } unless %w[frontal traseira esq dir topo base].include?(face_target)

        model.start_operation("Adicionar Ferragem Curvo", true)
        begin
          ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities

          # Reusa sub-grupos existentes; cria se não existir.
          ge = ents.grep(Sketchup::Group).find { |g| g.name == "EST_Metalon" }
          ge ||= ents.add_group.tap { |g| g.name = "EST_Metalon" }
          gf = nil
          fita_flag = (piece[:fita].nil? && piece["fita"].nil?) ? true : !!(piece[:fita] || piece["fita"])
          if p[:inc_fita] && fita_flag
            gf = ents.grep(Sketchup::Group).find { |g| g.name == "FITA_DF" }
            gf ||= ents.add_group.tap { |g| g.name = "FITA_DF" }
          end

          # Garante materiais (caso a estrutura nunca tenha sido gerada).
          Generator.criar_mats(model, { cor: p[:cor_acm], cor_junta: p[:cor_junta], cor_junta_rgb: p[:cor_junta_rgb], cor_fita: p[:cor_fita] })

          n_drawn = 0
          n_facets_tried = 0
          skip_reasons = []
          drawn_pieces = []   # {verts:[Point3d×8], tipo} de cada sólido desenhado
          if face_target == "topo" || face_target == "base"
            n_facets_tried = 1
            r = adicionar_peca_em_cap(ge.entities, gf && gf.entities, info, piece, p, face_target)
            n_drawn += r[:drawn] || 0
            skip_reasons << r[:skip] if r[:skip]
            drawn_pieces << r if r && r[:verts]
          else
            # INDEX-BASED: o JS manda o índice EXATO da faceta clicada
            # (facetIdx). info[:facets][idx] do cache de attributes está na
            # MESMA ordem do envelope que o JS viu na captura, então o índice
            # casa 1:1. Sem re-classificação por role = sem divergência.
            facets   = info[:facets] || []
            fidx_raw = piece["facetIdx"] || piece[:facetIdx]
            faceta   = nil
            fi       = nil
            if !fidx_raw.nil? && fidx_raw.to_s != ""
              fi = fidx_raw.to_i
              faceta = facets[fi] if fi >= 0 && fi < facets.size
            end
            # Fallback legado (peças antigas sem facetIdx): 1ª faceta do role.
            if faceta.nil?
              fi = facets.index { |fc| fc[:role].to_s == face_target }
              faceta = facets[fi] if fi
            end

            if faceta
              # Centro XY da estrutura pra garantir radial pra dentro.
              all_c = (info[:base_corners] || []) + (info[:topo_corners] || [])
              ccx = all_c.empty? ? nil : (all_c.map(&:x).inject(0.0, :+) / all_c.size)
              ccy = all_c.empty? ? nil : (all_c.map(&:y).inject(0.0, :+) / all_c.size)
              # Trajetórias dos 2 cantos da faceta — pra a travessa acompanhar
              # a curva (multi-segmento), igual à estrutura gerada. Sem isso a
              # peça usa um chord reto que sai da curva.
              traj_left = nil; traj_right = nil
              begin
                trajs = corner_trajectories(info)
                if trajs && fi && trajs.size > 0
                  nt = trajs.size
                  traj_left  = trajs[fi % nt]
                  traj_right = trajs[(fi + 1) % nt]
                end
              rescue => _e
                traj_left = nil; traj_right = nil
              end
              n_facets_tried = 1
              r = adicionar_peca_em_facet(ge.entities, gf && gf.entities, faceta, piece, p,
                                          ccx, ccy, traj_left, traj_right)
              n_drawn += r[:drawn] || 0
              skip_reasons << r[:skip] if r[:skip]
              drawn_pieces << r if r && r[:verts]
            end
          end

          # Aplica layers (caso o grupo seja novo)
          ly = model.layers
          lay_est  = ly["ACM_Estrutura"] || ly.add("ACM_Estrutura")
          lay_fita = ly["ACM_FitaDF"]    || ly.add("ACM_FitaDF")
          ge.layer = lay_est
          gf.layer = lay_fita if gf

          if n_drawn == 0
            model.abort_operation
            n_facets = (info[:facets] || []).size
            fidx_dbg = (piece["facetIdx"] || piece[:facetIdx]).inspect
            puts "[AutoACMCurvo] adicionar_peca: NADA desenhado. face='#{face_target}' facetIdx=#{fidx_dbg} n_facets=#{n_facets} tried=#{n_facets_tried} skips=#{skip_reasons.inspect}"
            msg = if n_facets_tried == 0
              "Não localizei a faceta clicada (índice #{fidx_dbg} de #{n_facets}). Recapture o módulo (Capturar Faces) e tente de novo."
            else
              "A peça não coube na faceta. Motivos: #{skip_reasons.join('; ')}"
            end
            return { ok: false, code: "autoacmcurvo.nothing_drawn", error: msg, roles_disponiveis: roles_avail }
          end

          model.commit_operation

          # Converte os cantos desenhados (model-local, polegadas) pro mesmo
          # espaço mm-local de pecas_3d, pra o JS renderizar a peça pela MESMA
          # via da estrutura (m.quant.pecas_3d) — preview = SketchUp, sem
          # re-derivar geometria (espelha a arquitetura do Auto-ACM normal).
          # IMPORTANTE: usa o offset do bbox ATUAL do grupo — idêntico ao que
          # o quantitativo/coletar_pecas_3d usa — pra alinhar 1:1.
          pecas_added = []
          bb_now = Geom::BoundingBox.new
          ents.each { |e| bb_now.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
          if bb_now.valid?
            ox = bb_now.min.x; oy = bb_now.min.y; oz = bb_now.min.z
            box_faces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,4,7,3],[1,2,6,5]]
            drawn_pieces.each_with_index do |dp, i|
              vs = dp[:verts]
              next unless vs.is_a?(Array) && vs.size == 8
              vmm = vs.map { |q|
                [ ((q.x - ox) / 1.mm).round(1),
                  ((q.y - oy) / 1.mm).round(1),
                  ((q.z - oz) / 1.mm).round(1) ]
              }
              pecas_added << {
                "verts" => vmm, "faces" => box_faces,
                "tipo"  => (dp[:tipo] || "metalon"), "nome" => "CP#{i}"
              }
            end
          end

          # Re-coleta a estrutura inteira (igual cut/move) — captura geometria
          # multi-segmento (ex: emenda vertical calandrada) fielmente. O JS
          # prefere pecas_3d (substitui) e cai em pecas_added só se faltar.
          pecas_3d = nil
          origin   = nil
          begin
            if bb_now.valid?
              pecas_3d = coletar_pecas_3d(ents, ox, oy, oz)
              origin   = [ox.to_f, oy.to_f, oz.to_f]
            end
          rescue => ex
            puts "[AutoACMCurvo] adicionar_peca: falha ao recoletar pecas_3d: #{ex.message}"
          end

          puts "[AutoACMCurvo] adicionar_peca OK: face='#{face_target}' n_drawn=#{n_drawn} pecas_added=#{pecas_added.size}"
          { ok: true, n_drawn: n_drawn, pecas_added: pecas_added, pecas_3d: pecas_3d, origin: origin }
        rescue => e
          model.abort_operation
          puts "[AutoACMCurvo] adicionar_peca ERROR: #{e.message}"
          puts e.backtrace.first(10).join("\n")
          { ok: false, code: "autoacmcurvo.adicionar_peca_error", error: e.message, trace: e.backtrace.first(8) }
        end
      end

      # Aplica UMA peça em UMA faceta lateral. Retorna {drawn: 0|1, skip: motivo}.
      # cx/cy: centro XY da estrutura — usado pra garantir que o radial aponta
      # pra DENTRO (o cross-product do cache pode dar sinal invertido em facetas
      # com winding diferente, fazendo a peça sair pra fora da faceta).
      def self.adicionar_peca_em_facet(ge_ents, gf_ents, faceta, piece, p, cx = nil, cy = nil,
                                       traj_left = nil, traj_right = nil)
        bL = faceta[:base_left]; bR = faceta[:base_right]
        tL = faceta[:topo_left]; tR = faceta[:topo_right]
        face = faceta[:face]
        return { drawn: 0, skip: "corners nil" } unless bL && bR && tL && tR

        mw = p[:mw]; mh = p[:mh]
        acm = p[:acm]; fl = p[:fl]; fe = p[:fe]

        h_face = ((tL.z + tR.z) / 2.0) - ((bL.z + bR.z) / 2.0)
        return { drawn: 0, skip: "h_face<100mm (h=#{(h_face/1.mm).round(1)})" } if h_face < 100.mm
        z_base = (bL.z + bR.z) / 2.0

        # Normal radial pra dentro: se temos face object, usa face.normal;
        # senão (modo restaurado de attributes), computa via cross product
        # dos edges base e up. Convenção CCW olhando de fora → e1×e2 aponta
        # PRA FORA, então negamos pra obter inward.
        if face && face.respond_to?(:normal)
          n = face.normal
          rad_x = -n.x; rad_y = -n.y
        else
          e1x = bR.x - bL.x; e1y = bR.y - bL.y; e1z = bR.z - bL.z
          e2x = tL.x - bL.x; e2y = tL.y - bL.y; e2z = tL.z - bL.z
          nx = e1y * e2z - e1z * e2y
          ny = e1z * e2x - e1x * e2z
          # nz não usamos (queremos só XY pra radial)
          # n aponta pra fora; rad pra dentro = -n
          rad_x = -nx; rad_y = -ny
        end
        rad_len = Math.sqrt(rad_x*rad_x + rad_y*rad_y)
        return { drawn: 0, skip: "rad_len<1e-4" } if rad_len < 1e-4
        rad_x /= rad_len; rad_y /= rad_len

        # Garante radial PRA DENTRO: se o sinal do cross-product (cache) ficou
        # invertido nesta faceta, o radial apontaria pra fora e a peça sairia
        # da superfície. Vira pro lado do centro da estrutura.
        if cx && cy
          fcx = (bL.x + bR.x + tL.x + tR.x) / 4.0
          fcy = (bL.y + bR.y + tL.y + tR.y) / 4.0
          if rad_x * (cx - fcx) + rad_y * (cy - fcy) < 0
            rad_x = -rad_x; rad_y = -rad_y
          end
        end

        off_acm     = acm
        off_metalon = acm + fe
        off_corner  = acm + fe
        trim_l = off_corner + mh
        trim_r = off_corner + mw

        tan_dx_b = (bR.x - bL.x); tan_dy_b = (bR.y - bL.y)
        tan_len_b = Math.sqrt(tan_dx_b**2 + tan_dy_b**2)
        tan_x_cp = (tan_len_b > 1e-4) ? tan_dx_b / tan_len_b : 0.0
        tan_y_cp = (tan_len_b > 1e-4) ? tan_dy_b / tan_len_b : 0.0

        cat      = (piece[:cat]    || piece["cat"]    || "met").to_s
        orient   = (piece[:orient] || piece["orient"] || "v").to_s
        profW    = (piece[:profW]  || piece["profW"]  || 20).to_f.mm
        profH    = (piece[:profH]  || piece["profH"]  || 20).to_f.mm
        inc_fita = (piece[:fita].nil? && piece["fita"].nil?) ? true : !!(piece[:fita] || piece["fita"])
        pos_u    = (piece[:posU]   || piece["posU"]   || 0.5).to_f
        pos_v    = (piece[:posV]   || piece["posV"]   || 0.5).to_f

        mat_cp  = (cat == "em") ? "Emenda" : "Metalon"
        ts      = (Time.now.to_f * 1000).to_i
        nome_cp = "CP.#{faceta[:role]}.#{faceta[:idx_in_role]}.#{ts}"

        metalon_verts = nil
        if orient == "h"
          zl_cp = pos_v * h_face
          metalon_verts = desenhar_travessa_horizontal(ge_ents, bL, bR, tL, tR, h_face, zl_cp, z_base,
                                       rad_x, rad_y, off_metalon, profH, profW,
                                       mat_cp, nome_cp,
                                       traj_left, traj_right, trim_l, trim_r)
          if gf_ents && inc_fita
            desenhar_fita_horizontal(gf_ents, bL, bR, tL, tR, h_face, zl_cp, z_base,
                                     rad_x, rad_y, off_acm, fl, fe,
                                     "F.#{nome_cp}",
                                     traj_left, traj_right, profW, trim_l, trim_r)
          end
        else
          metalon_verts = desenhar_emenda_vertical(ge_ents, bL, bR, tL, tR, pos_u,
                                   rad_x, rad_y, tan_x_cp, tan_y_cp,
                                   off_metalon, profW, profH,
                                   mat_cp, nome_cp,
                                   traj_left, traj_right)
          if gf_ents && inc_fita && tan_len_b > 1e-4
            desenhar_fita_vertical(gf_ents, bL, bR, tL, tR, pos_u,
                                   rad_x, rad_y, tan_x_cp, tan_y_cp,
                                   off_acm, fe, fl, -profW / 2.0,
                                   "F.#{nome_cp}",
                                   traj_left, traj_right)
          end
        end
        puts "[AutoACMCurvo] adicionar_peca_em_facet OK: role=#{faceta[:role]} orient=#{orient} h_face=#{(h_face/1.mm).round(1)}mm rad=(#{rad_x.round(3)},#{rad_y.round(3)})"
        { drawn: 1, verts: metalon_verts, tipo: (cat == "em" ? "emenda" : "metalon") }
      end

      # Aplica UMA peça num cap (topo ou base) — desenha caixa axis-aligned
      # no plano horizontal do cap. Simplificado: sem fita, sem curvatura.
      def self.adicionar_peca_em_cap(ge_ents, gf_ents, info, piece, p, which)
        ring = (which == "topo") ? info[:topo_corners] : info[:base_corners]
        return { drawn: 0, skip: "ring nil/<3" } unless ring.is_a?(Array) && ring.size >= 3
        xs = ring.map(&:x); ys = ring.map(&:y)
        x_min = xs.min; x_max = xs.max
        y_min = ys.min; y_max = ys.max
        w_cap = x_max - x_min
        d_cap = y_max - y_min
        z_cap = ring.map(&:z).inject(0.0, :+) / ring.size.to_f
        return { drawn: 0, skip: "cap_too_small (#{(w_cap/1.mm).round(0)}x#{(d_cap/1.mm).round(0)})" } if w_cap < 50.mm || d_cap < 50.mm

        mh = p[:mh]
        off_corner = p[:acm] + p[:fe]
        trim = off_corner + mh
        ix0 = x_min + trim; ix1 = x_max - trim
        iy0 = y_min + trim; iy1 = y_max - trim
        return { drawn: 0, skip: "trim invalid" } if ix0 >= ix1 || iy0 >= iy1

        cat    = (piece[:cat]    || piece["cat"]    || "met").to_s
        orient = (piece[:orient] || piece["orient"] || "v").to_s
        profW  = (piece[:profW]  || piece["profW"]  || 20).to_f.mm
        profH  = (piece[:profH]  || piece["profH"]  || 20).to_f.mm
        posU   = (piece[:posU]   || piece["posU"]   || 0.5).to_f
        posV   = (piece[:posV]   || piece["posV"]   || 0.5).to_f

        mat  = (cat == "em") ? "Emenda" : "Metalon"
        ts   = (Time.now.to_f * 1000).to_i
        nome = "CP.#{which}.#{ts}"

        # No topo: caixa cresce PRA BAIXO de z_cap (face superior). Na base:
        # cresce PRA CIMA de z_cap (face inferior do ACM).
        if which == "topo"
          z_top    = z_cap - p[:acm] - p[:fe]
          z_bottom = z_top  - profH
        else
          z_bottom = z_cap
          z_top    = z_cap + profH
        end
        half = profW / 2.0

        if orient == "h"
          y_pos = y_min + posV * d_cap
          x0 = ix0; x1 = ix1
          y0 = y_pos - half; y1 = y_pos + half
        else
          x_pos = x_min + posU * w_cap
          y0 = iy0; y1 = iy1
          x0 = x_pos - half; x1 = x_pos + half
        end
        pb = [
          Geom::Point3d.new(x0, y0, z_bottom),
          Geom::Point3d.new(x1, y0, z_bottom),
          Geom::Point3d.new(x1, y1, z_bottom),
          Geom::Point3d.new(x0, y1, z_bottom)
        ]
        pt = pb.map { |q| Geom::Point3d.new(q.x, q.y, z_top) }
        emit_solid6(ge_ents, pb, pt, mat, nome)

        # ── FITA DF no cap (laje fl×fe na interface ACM↔metalon) ──
        inc_fita = (piece[:fita].nil? && piece["fita"].nil?) ? true : !!(piece[:fita] || piece["fita"])
        if gf_ents && inc_fita
          fl = p[:fl]; fe = p[:fe]
          half_f = fl / 2.0
          # Z da fita: encostada no ACM, na espessura fe, do lado do metalon.
          if which == "topo"
            zf_top    = z_cap - p[:acm]
            zf_bottom = zf_top - fe
          else
            zf_bottom = z_cap
            zf_top    = z_cap + fe
          end
          # Footprint: mesmo comprimento da peça, largura fl centrada no eixo.
          if orient == "h"
            fy_pos = y_min + posV * d_cap
            fx0 = ix0; fx1 = ix1
            fy0 = fy_pos - half_f; fy1 = fy_pos + half_f
          else
            fx_pos = x_min + posU * w_cap
            fy0 = iy0; fy1 = iy1
            fx0 = fx_pos - half_f; fx1 = fx_pos + half_f
          end
          fpb = [
            Geom::Point3d.new(fx0, fy0, zf_bottom),
            Geom::Point3d.new(fx1, fy0, zf_bottom),
            Geom::Point3d.new(fx1, fy1, zf_bottom),
            Geom::Point3d.new(fx0, fy1, zf_bottom)
          ]
          fpt = fpb.map { |q| Geom::Point3d.new(q.x, q.y, zf_top) }
          emit_solid6(gf_ents, fpb, fpt, "Fita_DF", "F.#{nome}")
        end

        puts "[AutoACMCurvo] adicionar_peca_em_cap OK: which=#{which} orient=#{orient} pos=(#{posU.round(2)},#{posV.round(2)}) fita=#{inc_fita}"
        { drawn: 1, verts: (pb + pt), tipo: (cat == "em" ? "emenda" : "metalon") }
      end

      # ════════════════════════════════════════════════════════════════════
      # Ferragens custom na BASE do envelope curvo (face=='base').
      # Análogo simplificado de gerar_estrutura_topo, sem ACM/junta/fita
      # (base normalmente não tem ACM), só metalon/emenda como caixa.
      # ════════════════════════════════════════════════════════════════════
      def self.gerar_pecas_base(ge_ents, info, p)
        return unless info && info.is_a?(Hash)
        base_pts = info[:base_corners]
        return unless base_pts.is_a?(Array) && base_pts.size >= 3
        cps_b = p[:custom_pieces] || p["custom_pieces"]
        return unless cps_b.is_a?(Array)
        any_base = cps_b.any? { |pc| pc.is_a?(Hash) && (pc[:face] || pc["face"]).to_s == "base" }
        return unless any_base

        xs = base_pts.map(&:x); ys = base_pts.map(&:y)
        x_min = xs.min; x_max = xs.max
        y_min = ys.min; y_max = ys.max
        w_base = x_max - x_min
        d_base = y_max - y_min
        z_base = base_pts.map(&:z).inject(0.0, :+) / base_pts.size.to_f
        return if w_base < 50.mm || d_base < 50.mm

        mh = p[:mh]
        off_corner = p[:acm] + p[:fe]
        trim = off_corner + mh
        ix0 = x_min + trim; ix1 = x_max - trim
        iy0 = y_min + trim; iy1 = y_max - trim
        return if ix0 >= ix1 || iy0 >= iy1

        cps_b.each_with_index do |piece, ci|
          next unless piece.is_a?(Hash)
          face_b = (piece[:face] || piece["face"]).to_s
          next unless face_b == "base"

          cat_b    = (piece[:cat]    || piece["cat"]    || "met").to_s
          orient_b = (piece[:orient] || piece["orient"] || "v").to_s
          profW_b  = (piece[:profW]  || piece["profW"]  || 20).to_f.mm
          profH_b  = (piece[:profH]  || piece["profH"]  || 20).to_f.mm
          posU_b   = (piece[:posU]   || piece["posU"]   || 0.5).to_f
          posV_b   = (piece[:posV]   || piece["posV"]   || 0.5).to_f

          mat_b  = (cat_b == "em") ? "Emenda" : "Metalon"
          nome_b = "CP.base.#{ci}"

          # Caixa cresce PRA CIMA a partir de z_base (perfil deitado na base).
          z_bottom = z_base
          z_top    = z_base + profH_b
          half     = profW_b / 2.0

          if orient_b == "h"
            y_pos = y_min + posV_b * d_base
            x0 = ix0; x1 = ix1
            y0 = y_pos - half; y1 = y_pos + half
          else
            x_pos = x_min + posU_b * w_base
            y0 = iy0; y1 = iy1
            x0 = x_pos - half; x1 = x_pos + half
          end
          pb = [
            Geom::Point3d.new(x0, y0, z_bottom),
            Geom::Point3d.new(x1, y0, z_bottom),
            Geom::Point3d.new(x1, y1, z_bottom),
            Geom::Point3d.new(x0, y1, z_bottom)
          ]
          pt = pb.map { |q| Geom::Point3d.new(q.x, q.y, z_top) }
          emit_solid6(ge_ents, pb, pt, mat_b, nome_b)
        end
      end

      # Fita de um segmento da trajetória do canto, alinhada com UMA face
      # adjacente. tang_xy = direção ao longo da face (no plano XY); inward_xy
      # = direção radial pra dentro da estrutura (perp à face). Posiciona a
      # fita EXATAMENTE na face externa do metalon que toca a ACM dessa face.

      # (LEGADO) Fita única de um segmento, com direção média ao centroide.
      # Mantido pra compat. Usado só se chamado explicitamente.
      def self.gerar_fita_montantes_segmento(ents, p_a, p_b, cx, cy, fl, fe, acm, nome)
        # Direção radial pra dentro (média dos 2 endpoints)
        rxa = cx - p_a.x; rya = cy - p_a.y
        rxb = cx - p_b.x; ryb = cy - p_b.y
        rx = (rxa + rxb) / 2.0; ry = (rya + ryb) / 2.0
        r_len = Math.sqrt(rx*rx + ry*ry); r_len = 1.0 if r_len < 1e-6
        ux = rx / r_len; uy = ry / r_len
        # Tangencial: perpendicular ao radial, no plano XY
        tx = -uy; ty = ux

        start_a = [p_a.x + ux * acm, p_a.y + uy * acm, p_a.z]
        start_b = [p_b.x + ux * acm, p_b.y + uy * acm, p_b.z]
        pb = [
          Geom::Point3d.new(start_a[0],                     start_a[1],                     start_a[2]),
          Geom::Point3d.new(start_a[0] + tx * fl,           start_a[1] + ty * fl,           start_a[2]),
          Geom::Point3d.new(start_a[0] + tx * fl + ux * fe, start_a[1] + ty * fl + uy * fe, start_a[2]),
          Geom::Point3d.new(start_a[0] + ux * fe,           start_a[1] + uy * fe,           start_a[2])
        ]
        pt = [
          Geom::Point3d.new(start_b[0],                     start_b[1],                     start_b[2]),
          Geom::Point3d.new(start_b[0] + tx * fl,           start_b[1] + ty * fl,           start_b[2]),
          Geom::Point3d.new(start_b[0] + tx * fl + ux * fe, start_b[1] + ty * fl + uy * fe, start_b[2]),
          Geom::Point3d.new(start_b[0] + ux * fe,           start_b[1] + uy * fe,           start_b[2])
        ]
        emit_solid6(ents, pb, pt, "Fita_DF", nome)
      end

      # Cria uma travessa horizontal na faceta. zl = altura local (0..h_face).
      # Profile: largura mw (radial pra dentro) x altura mh (vertical, +Z)
      # Se traj_left/traj_right forem fornecidas, usa interpolação na trajetória
      # real (multi-segmento) em vez de interp linear bL→tL.
      def self.desenhar_travessa_horizontal(ents, bL, bR, tL, tR, h_face, zl, z_base,
                                            rad_x, rad_y, off_radial, prof_w, prof_h,
                                            mat_name, nome,
                                            traj_left = nil, traj_right = nil,
                                            trim_left = 0, trim_right = 0)
        t       = zl / h_face
        t_top   = (zl + prof_h) / h_face
        z_abs   = z_base + zl
        z_top   = z_abs + prof_h
        if traj_left && traj_right
          left      = interp_traj_at_z(traj_left,  z_abs)
          right     = interp_traj_at_z(traj_right, z_abs)
          left_top  = interp_traj_at_z(traj_left,  z_top)
          right_top = interp_traj_at_z(traj_right, z_top)
        else
          left      = interp(bL, tL, t)
          right     = interp(bR, tR, t)
          left_top  = interp(bL, tL, t_top)
          right_top = interp(bR, tR, t_top)
        end
        # TRIM: encurta endpoints pra não invadir montantes nos cantos
        if trim_left > 0 || trim_right > 0
          left,     right     = trim_strip_endpoints(left,     right,     trim_left, trim_right)
          left_top, right_top = trim_strip_endpoints(left_top, right_top, trim_left, trim_right)
        end
        # empurra ambos pra dentro pelo off_radial (radial constante — bottom e top)
        lx  = left.x      + rad_x * off_radial; ly  = left.y      + rad_y * off_radial
        rx  = right.x     + rad_x * off_radial; ry  = right.y     + rad_y * off_radial
        ltx = left_top.x  + rad_x * off_radial; lty = left_top.y  + rad_y * off_radial
        rtx = right_top.x + rad_x * off_radial; rty = right_top.y + rad_y * off_radial
        # 4 pontos da face inferior (z = z_abs)
        pb = [
          Geom::Point3d.new(lx, ly, z_abs),
          Geom::Point3d.new(rx, ry, z_abs),
          Geom::Point3d.new(rx + rad_x * prof_w, ry + rad_y * prof_w, z_abs),
          Geom::Point3d.new(lx + rad_x * prof_w, ly + rad_y * prof_w, z_abs)
        ]
        # 4 pontos da face superior (z = z_top), x/y deslocados pra acompanhar
        # a inclinação dos montantes nos corners → endpoints viram paralelogramo
        # paralelo à tangente da trajetória.
        pt = [
          Geom::Point3d.new(ltx, lty, z_top),
          Geom::Point3d.new(rtx, rty, z_top),
          Geom::Point3d.new(rtx + rad_x * prof_w, rty + rad_y * prof_w, z_top),
          Geom::Point3d.new(ltx + rad_x * prof_w, lty + rad_y * prof_w, z_top)
        ]
        emit_solid6(ents, pb, pt, mat_name, nome)
        (pb + pt)   # 8 cantos desenhados (model-local) pra preview
      end

      # Faixa fina de fita (altura fl, espessura fe) sobre uma travessa/emenda.
      # metalon_h: altura do perfil do metalon (mh ou eh). Se fornecido, a fita
      #   é centrada NO PERFIL do metalon (de z_abs+(mh-fl)/2 a z_abs+(mh+fl)/2),
      #   garantindo que ela toque a FACE EXTERNA do metalon (em contato com ACM).
      def self.desenhar_fita_horizontal(ents, bL, bR, tL, tR, h_face, zl, z_base,
                                        rad_x, rad_y, off_radial, fl, fe, nome,
                                        traj_left = nil, traj_right = nil,
                                        metalon_h = nil,
                                        trim_left = 0, trim_right = 0,
                                        z0_abs = nil, z1_abs = nil)
        t     = zl / h_face
        z_abs = z_base + zl
        # Posição vertical: z0_abs/z1_abs explícitos têm prioridade (usado
        # pela fita dupla na emenda). Senão, metalon_h centra a fita no
        # perfil do metalon. Senão, centra em z_abs.
        if z0_abs && z1_abs
          z0 = z0_abs; z1 = z1_abs
        elsif metalon_h
          z0 = z_abs + (metalon_h - fl) / 2.0
          z1 = z0 + fl
        else
          z0 = z_abs - fl / 2.0
          z1 = z_abs + fl / 2.0
        end
        # Endpoints acompanham a inclinação dos montantes: amostra a trajetória
        # em z0 (base da fita) e z1 (topo da fita) → faces laterais paralelas
        # ao montante.
        t0 = (z0 - z_base) / h_face
        t1 = (z1 - z_base) / h_face
        if traj_left && traj_right
          left      = interp_traj_at_z(traj_left,  z0)
          right     = interp_traj_at_z(traj_right, z0)
          left_top  = interp_traj_at_z(traj_left,  z1)
          right_top = interp_traj_at_z(traj_right, z1)
        else
          left      = interp(bL, tL, t0)
          right     = interp(bR, tR, t0)
          left_top  = interp(bL, tL, t1)
          right_top = interp(bR, tR, t1)
        end
        if trim_left > 0 || trim_right > 0
          left,     right     = trim_strip_endpoints(left,     right,     trim_left, trim_right)
          left_top, right_top = trim_strip_endpoints(left_top, right_top, trim_left, trim_right)
        end
        lx  = left.x      + rad_x * off_radial; ly  = left.y      + rad_y * off_radial
        rx  = right.x     + rad_x * off_radial; ry  = right.y     + rad_y * off_radial
        ltx = left_top.x  + rad_x * off_radial; lty = left_top.y  + rad_y * off_radial
        rtx = right_top.x + rad_x * off_radial; rty = right_top.y + rad_y * off_radial
        pb = [
          Geom::Point3d.new(lx, ly, z0),
          Geom::Point3d.new(rx, ry, z0),
          Geom::Point3d.new(rx + rad_x * fe, ry + rad_y * fe, z0),
          Geom::Point3d.new(lx + rad_x * fe, ly + rad_y * fe, z0)
        ]
        pt = [
          Geom::Point3d.new(ltx, lty, z1),
          Geom::Point3d.new(rtx, rty, z1),
          Geom::Point3d.new(rtx + rad_x * fe, rty + rad_y * fe, z1),
          Geom::Point3d.new(ltx + rad_x * fe, lty + rad_y * fe, z1)
        ]
        emit_solid6(ents, pb, pt, "Fita_DF", nome)
      end

      # Faixa visual de junta no plano EXTERNO (sai 0.3mm pra fora pra ficar visivel)
      def self.desenhar_junta_horizontal(ents, bL, bR, tL, tR, h_face, zl, z_base,
                                         rad_x, rad_y, junta_w, cor_junta, nome,
                                         traj_left = nil, traj_right = nil)
        z_abs = z_base + zl
        z0 = z_abs - junta_w / 2.0
        z1 = z_abs + junta_w / 2.0
        # Endpoints acompanham a tangente do montante (z0 e z1) — evita
        # paralelepípedo vertical encostando em montante inclinado nos corners.
        t0 = (z0 - z_base) / h_face
        t1 = (z1 - z_base) / h_face
        if traj_left && traj_right
          left      = interp_traj_at_z(traj_left,  z0)
          right     = interp_traj_at_z(traj_right, z0)
          left_top  = interp_traj_at_z(traj_left,  z1)
          right_top = interp_traj_at_z(traj_right, z1)
        else
          left      = interp(bL, tL, t0)
          right     = interp(bR, tR, t0)
          left_top  = interp(bL, tL, t1)
          right_top = interp(bR, tR, t1)
        end
        # junta: ligeiramente FORA do plano (rad negativo) pra ficar visivel sobre a face ACM
        out_off = -0.3.mm
        lx  = left.x      + rad_x * out_off; ly  = left.y      + rad_y * out_off
        rx  = right.x     + rad_x * out_off; ry  = right.y     + rad_y * out_off
        ltx = left_top.x  + rad_x * out_off; lty = left_top.y  + rad_y * out_off
        rtx = right_top.x + rad_x * out_off; rty = right_top.y + rad_y * out_off
        # espessura do volume da junta visual: 0.5mm pra dentro
        depth = 0.5.mm
        pb = [
          Geom::Point3d.new(lx, ly, z0),
          Geom::Point3d.new(rx, ry, z0),
          Geom::Point3d.new(rx + rad_x * depth, ry + rad_y * depth, z0),
          Geom::Point3d.new(lx + rad_x * depth, ly + rad_y * depth, z0)
        ]
        pt = [
          Geom::Point3d.new(ltx, lty, z1),
          Geom::Point3d.new(rtx, rty, z1),
          Geom::Point3d.new(rtx + rad_x * depth, rty + rad_y * depth, z1),
          Geom::Point3d.new(ltx + rad_x * depth, lty + rad_y * depth, z1)
        ]
        mat_j = "Junta_#{cor_junta}"
        emit_solid6(ents, pb, pt, mat_j, nome)
      end

      # ======================================================================
      # FITA NOS MONTANTES — 1 por canto, acompanhando a inclinacao base→topo
      # ======================================================================

      # ======================================================================
      # QUANTITATIVO — area ACM por face, metros de metalon, emendas, fita,
      # lista de pecas com bbox local (semelhante ao auto_acm normal).
      # ======================================================================
      def self.quantitativo(grp, info, p)
        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
        bb_local = Geom::BoundingBox.new
        ents.each { |e| bb_local.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
        ox = bb_local.min.x; oy = bb_local.min.y; oz = bb_local.min.z
        w_mm = ((bb_local.max.x - bb_local.min.x) / 1.mm).round(0)
        h_mm = ((bb_local.max.z - bb_local.min.z) / 1.mm).round(0)
        d_mm = ((bb_local.max.y - bb_local.min.y) / 1.mm).round(0)

        result = {
          modulo: {
            altura_mm: h_mm,
            w_base_mm: ((info[:bb_base][:w]) / 1.mm).round(0),
            d_base_mm: ((info[:bb_base][:d]) / 1.mm).round(0),
            w_topo_mm: ((info[:bb_topo][:w]) / 1.mm).round(0),
            d_topo_mm: ((info[:bb_topo][:d]) / 1.mm).round(0),
            n_corners: info[:base_corners].size,
            n_facetas: info[:facets].size
          },
          chapa: {
            larg_mm: ((p[:chapa_larg]) / 1.mm).round(0),
            comp_mm: ((p[:chapa_comp] || 5000.mm) / 1.mm).round(0),
            orient:  p[:chapa_orient]
          },
          acm: {
            cor:        p[:cor_acm],
            esp_mm:     ((p[:acm]) / 1.mm).round(1),
            total_m2:   0.0,
            faces:      [],
            chapas_est: 0
          },
          metalon: {
            secao_mm:      "#{(p[:mw] / 1.mm).round(0)}x#{(p[:mh] / 1.mm).round(0)}",
            montantes_qtd: info[:base_corners].size,
            montantes_m:   0.0,
            aneis_m:       0.0,
            travessas_m:   0.0,
            total_m:       0.0,
            barras_6m:     0,
            pecas:         []
          },
          emenda: {
            secao_mm:  "#{(p[:ew] / 1.mm).round(0)}x#{(p[:eh] / 1.mm).round(0)}",
            qtd:       0,
            m:         0.0,
            barras_6m: 0,
            pecas:     []
          },
          junta: {
            tipo:    (p[:jt] > 0) ? "dilatacao" : "seca",
            mm:      (p[:jt] / 1.mm).round(1),
            cor:     p[:cor_junta]
          },
          fita: p[:inc_fita] ? {
            largura_mm:   (p[:fl] / 1.mm).round(0),
            espessura_mm: (p[:fe] / 1.mm).round(1),
            m:            0.0,
            pecas:        []
          } : nil,
          roles: p[:roles_enab].each_with_object({}) { |(k, v), h| h[k.to_s] = v ? true : false }
        }

        # ── ACM area por face habilitada ──
        # topo
        sym_t = :topo
        if p[:roles_enab][sym_t] && info[:face_topo] && info[:face_topo].valid?
          a = (info[:face_topo].area.abs / (1.mm * 1.mm)) / 1e6
          result[:acm][:faces] << { role: "topo", idx: 0, label: "Topo", area_m2: a.round(3) }
          result[:acm][:total_m2] += a
        end
        if p[:roles_enab][:base] && info[:face_base] && info[:face_base].valid?
          a = (info[:face_base].area.abs / (1.mm * 1.mm)) / 1e6
          result[:acm][:faces] << { role: "base", idx: 0, label: "Base", area_m2: a.round(3) }
          result[:acm][:total_m2] += a
        end
        info[:facets].each do |fc|
          sym = fc[:role].to_sym
          next unless p[:roles_enab][sym]
          fc[:faces].each do |f|
            next unless f && f.valid?
            a = (f.area.abs / (1.mm * 1.mm)) / 1e6
            result[:acm][:faces] << {
              role: fc[:role], idx: fc[:idx_in_role],
              label: "#{fc[:role].capitalize} #{fc[:idx_in_role] + 1}",
              area_m2: a.round(3)
            }
            result[:acm][:total_m2] += a
          end
        end
        result[:acm][:total_m2] = result[:acm][:total_m2].round(3)

        chapa_area = (p[:chapa_larg] * (p[:chapa_comp] || 5000.mm)) / (1.mm * 1.mm) / 1e6
        result[:acm][:chapas_est] = chapa_area > 0 ? (result[:acm][:total_m2] / chapa_area).ceil : 0

        # ── Percorre subgrupos pra contar metalon, emenda, fita ──
        percorrer_quant(ents, result, ox, oy, oz)

        # ── Coleta vertices REAIS de cada peca (pro preview 3D fiel) ──
        result[:pecas_3d] = coletar_pecas_3d(ents, ox, oy, oz)

        # ── Origem (bbox local, em polegadas/model-units) — usada pelo desfazer
        #    pra reconstruir a estrutura a partir de um snapshot de pecas_3d. ──
        result[:origin] = [ox.to_f, oy.to_f, oz.to_f]

        # ── Envelope (cantos do modulo + roles, em mm relativos ao bbox local) ──
        counts = Hash.new(0)
        roles_env = info[:facets].map do |fc|
          role = fc[:role]
          idx  = counts[role]
          counts[role] += 1
          { role: role, idx: idx, label: "#{role.capitalize} #{idx + 1}" }
        end
        result[:envelope] = {
          base: info[:base_corners].map { |p|
            [((p.x - ox) / 1.mm).round(2),
             ((p.y - oy) / 1.mm).round(2),
             ((p.z - oz) / 1.mm).round(2)]
          },
          topo: info[:topo_corners].map { |p|
            [((p.x - ox) / 1.mm).round(2),
             ((p.y - oy) / 1.mm).round(2),
             ((p.z - oz) / 1.mm).round(2)]
          },
          roles: roles_env
        }

        # arredondar e estimar barras
        m = result[:metalon]
        m[:montantes_m] = m[:montantes_m].round(2)
        m[:aneis_m]     = m[:aneis_m].round(2)
        m[:travessas_m] = m[:travessas_m].round(2)
        m[:total_m]     = (m[:montantes_m] + m[:aneis_m] + m[:travessas_m]).round(2)
        m[:barras_6m]   = (m[:total_m] / 6.0).ceil
        result[:emenda][:m] = result[:emenda][:m].round(2)
        result[:emenda][:barras_6m] = (result[:emenda][:m] / 6.0).ceil
        if result[:fita]
          result[:fita][:m] = result[:fita][:m].round(2)
        end

        result
      end

      # ======================================================================
      # COLETAR PECAS 3D — extrai vertices REAIS (em vez de bbox) de cada
      # peca-grupo (Montante.*, Anel.*, M.TH.*, EM.*, F.M.*, F.TH.*).
      # Cada peca vira { tipo, nome, verts: [[x,y,z],...], faces: [[i0,i1,...],...] }
      # com coords em mm relativas ao bbox local do grupo principal.
      # Pra prismas solid6, sao 8 vertices e 6 faces.
      # ======================================================================
      # Travessia compartilhada das peca-grupos (metalon/emenda/fita) na MESMA
      # ordem deterministica. Tanto coletar_pecas_3d (preview) quanto
      # mapear_pecas_curvo (edicao) usam isto, garantindo que o id de cada peca
      # (met_N/em_N/fita_N) bata 1:1 entre o preview e o modelo no SketchUp.
      # Yields: (entity, sub_entities, tipo "metalon|emenda|fita").
      def self.traverse_pecas_curvo(entities, &blk)
        entities.each do |e|
          next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
          sub = e.is_a?(Sketchup::Group) ? e.entities : e.definition.entities

          mat_name = nil
          sub.grep(Sketchup::Face).each do |f|
            if f.material
              mat_name = f.material.name
              break
            end
          end

          tipo = case mat_name
                 when "Metalon" then "metalon"
                 when "Emenda"  then "emenda"
                 when "Fita_DF" then "fita"
                 else nil
                 end

          if tipo
            blk.call(e, sub, tipo)
          else
            # Container (EST_Metalon, FITA_DF, JUNTAS) — recursa
            traverse_pecas_curvo(sub, &blk)
          end
        end
      end

      # Prefixo do id por tipo (igual ao mapear_pecas do auto_acm normal).
      def self.peca_prefixo(tipo)
        case tipo
        when "metalon" then "met"
        when "emenda"  then "em"
        when "fita"    then "fita"
        else "x"
        end
      end

      def self.coletar_pecas_3d(entities, ox_in, oy_in, oz_in, out = [])
        counters = Hash.new(0)
        traverse_pecas_curvo(entities) do |e, sub, tipo|
          # Mapeia vertices com chave string (tolerancia 0.01mm)
          vert_map = {}
          verts = []
          faces = []
          sub.grep(Sketchup::Face).each do |f|
            face_idx = f.outer_loop.vertices.map do |v|
              p = v.position
              x = ((p.x - ox_in) / 1.mm).round(2)
              y = ((p.y - oy_in) / 1.mm).round(2)
              z = ((p.z - oz_in) / 1.mm).round(2)
              key = "#{x},#{y},#{z}"
              unless vert_map.key?(key)
                vert_map[key] = verts.size
                verts << [x, y, z]
              end
              vert_map[key]
            end
            faces << face_idx if face_idx.size >= 3
          end
          prefix = peca_prefixo(tipo)
          id = "#{prefix}_#{counters[prefix]}"
          counters[prefix] += 1
          nome = e.respond_to?(:name) ? e.name.to_s : ""
          out << { id: id, tipo: tipo, nome: nome, verts: verts, faces: faces }
        end
        out
      end

      # ======================================================================
      # MAPEAR PECAS CURVO — id (met_N/em_N/fita_N) -> sub-grupo no modelo.
      # Mesma travessia/ordem de coletar_pecas_3d, pra o id casar com o preview.
      # ======================================================================
      def self.mapear_pecas_curvo(grp)
        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
        counters = Hash.new(0)
        result = {}
        traverse_pecas_curvo(ents) do |e, _sub, tipo|
          prefix = peca_prefixo(tipo)
          result["#{prefix}_#{counters[prefix]}"] = e
          counters[prefix] += 1
        end
        result
      end

      # ======================================================================
      # APLICAR EDICOES — espelho do aplicar_edicoes_data do auto_acm normal.
      # Move (transform!) e deleta (erase!) sub-grupos da estrutura curva DIRETO
      # no modelo, sem regenerar. del_ids: ['met_0', ...]. ofs_list:
      # [{id, dx, dy, dz} em mm, coords locais do grupo]. Devolve pecas_3d
      # recoletado (re-numerado) pro preview re-sincronizar.
      # ======================================================================
      def self.aplicar_edicoes(entity_id, del_ids, ofs_list)
        model = Sketchup.active_model
        grp = find_entity_by_id(model, entity_id.to_i)
        return { ok: false, code: "autoacmcurvo.entity_not_found" } unless grp

        model.start_operation("AutoACM Curvo Editar", true)
        n_del = 0
        n_ofs = 0
        begin
          mapa = mapear_pecas_curvo(grp)

          # 1) MOVER (antes de deletar — ids continuam estaveis)
          (ofs_list || []).each do |o|
            id = (o["id"] || o[:id]).to_s
            dx = (o["dx"] || o[:dx] || 0).to_f
            dy = (o["dy"] || o[:dy] || 0).to_f
            dz = (o["dz"] || o[:dz] || 0).to_f
            ent = mapa[id]
            next if ent.nil? || !ent.valid?
            next if dx.abs < 0.1 && dy.abs < 0.1 && dz.abs < 0.1
            ent.transform!(Geom::Transformation.translation([dx.mm, dy.mm, dz.mm]))
            n_ofs += 1
          end

          # 2) DELETAR
          (del_ids || []).each do |id|
            ent = mapa[id.to_s]
            next if ent.nil? || !ent.valid?
            ent.erase!
            n_del += 1
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          return { ok: false, code: "autoacmcurvo.editar_erro", error: e.message }
        end

        # Recoleta pecas_3d com o MESMO offset usado no gerar (bbox local).
        pecas = nil
        origin = nil
        begin
          ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
          bb = Geom::BoundingBox.new
          ents.each { |e| bb.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
          ox = bb.min.x; oy = bb.min.y; oz = bb.min.z
          pecas = coletar_pecas_3d(ents, ox, oy, oz)
          origin = [ox.to_f, oy.to_f, oz.to_f]
        rescue => ex
          puts "[AutoACMCurvo] Erro ao recoletar pecas apos editar: #{ex.message}"
        end

        { ok: true, n_del: n_del, n_ofs: n_ofs, pecas_3d: pecas, origin: origin }
      end

      # ======================================================================
      # RESTAURAR SNAPSHOT — reconstrói EST_Metalon/FITA_DF a partir de uma
      # lista de pecas (verts/faces/tipo/nome) + origin (model-units). Usado
      # pelo DESFAZER (Ctrl+Z). NÃO chama analisar_modulo (que falha após
      # edições nas faces ACM) — apenas recria os sólidos de metalon/emenda/fita.
      # Não toca nas faces ACM nem nas juntas.
      # ======================================================================
      def self.restaurar_snapshot(entity_id, pecas, origin)
        model = Sketchup.active_model
        grp = find_entity_by_id(model, entity_id.to_i)
        return { ok: false, code: "autoacmcurvo.entity_not_found" } unless grp
        return { ok: false, code: "autoacmcurvo.snapshot_invalido" } unless pecas.is_a?(Array)

        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities

        # Origem (polegadas/model-units). Fallback: bbox atual.
        if origin.is_a?(Array) && origin.size == 3
          ox = origin[0].to_f; oy = origin[1].to_f; oz = origin[2].to_f
        else
          bb = Geom::BoundingBox.new
          ents.each { |e| bb.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
          ox = bb.min.x; oy = bb.min.y; oz = bb.min.z
        end

        model.start_operation("AutoACM Curvo Desfazer", true)
        begin
          # Garante materiais (default se faltarem)
          { "Metalon" => [155,160,165], "Emenda" => [140,145,150],
            "Fita_DF" => [0,210,210] }.each do |n, rgb|
            model.materials.add(n).color = Sketchup::Color.new(*rgb) unless model.materials[n]
          end

          # Apaga só EST_Metalon + FITA_DF (preserva JUNTAS/SPOTS e faces ACM)
          ents.to_a.each do |e|
            e.erase! if e.is_a?(Sketchup::Group) && %w[EST_Metalon FITA_DF].include?(e.name)
          end

          ge = ents.add_group; ge.name = "EST_Metalon"
          gf = nil

          pecas.each do |pc|
            tipo  = (pc["tipo"] || pc[:tipo]).to_s
            verts = pc["verts"] || pc[:verts] || []
            faces = pc["faces"] || pc[:faces] || []
            nome  = (pc["nome"] || pc[:nome] || "").to_s
            next if verts.empty? || faces.empty?

            mat_name = case tipo
                       when "emenda" then "Emenda"
                       when "fita"   then "Fita_DF"
                       else "Metalon"
                       end
            container = if tipo == "fita"
                          gf ||= ents.add_group.tap { |g| g.name = "FITA_DF" }
                          gf
                        else
                          ge
                        end

            sg = container.entities.add_group
            sg.name = nome unless nome.empty?
            pts = verts.map { |v| Geom::Point3d.new(ox + v[0].to_f.mm, oy + v[1].to_f.mm, oz + v[2].to_f.mm) }
            mat = model.materials[mat_name]
            faces.each do |fidx|
              next if !fidx.is_a?(Array) || fidx.size < 3
              face_pts = fidx.map { |i| pts[i.to_i] }.compact
              next if face_pts.size < 3
              begin
                f = sg.entities.add_face(face_pts)
                if f
                  f.material = mat
                  f.back_material = mat
                end
              rescue
                next
              end
            end
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          return { ok: false, code: "autoacmcurvo.restaurar_erro", error: e.message }
        end

        # Re-coleta com o MESMO origin (frame estável) → pecas re-numeradas.
        pecas_out = pecas
        begin
          pecas_out = coletar_pecas_3d(ents, ox, oy, oz)
        rescue => ex
          puts "[AutoACMCurvo] Erro ao recoletar apos restaurar: #{ex.message}"
        end
        { ok: true, pecas_3d: pecas_out, origin: [ox.to_f, oy.to_f, oz.to_f] }
      end

      # Percorre sub-grupos coletando comprimento/largura/altura de cada peca
      # baseado no material do grupo e no nome (Montante.X / Anel.B/T / M.TH... / EM... / F.M / F.TH).
      def self.percorrer_quant(entities, result, ox, oy, oz)
        entities.each do |ent|
          next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          sub = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities
          mat_name = nil
          sub.grep(Sketchup::Face).each { |f| if f.material then mat_name = f.material.name; break end }

          if mat_name && ent.bounds.valid?
            bb = ent.bounds
            w_mm = ((bb.max.x - bb.min.x) / 1.mm).round(1)
            d_mm = ((bb.max.y - bb.min.y) / 1.mm).round(1)
            h_mm = ((bb.max.z - bb.min.z) / 1.mm).round(1)
            comp = [w_mm, d_mm, h_mm].max
            x_mm = ((bb.min.x - ox) / 1.mm).round(1)
            y_mm = ((bb.min.y - oy) / 1.mm).round(1)
            z_mm = ((bb.min.z - oz) / 1.mm).round(1)
            nome = ent.respond_to?(:name) ? ent.name.to_s : ""
            peca = { nome: nome, comp: comp, x: x_mm, y: y_mm, z: z_mm,
                     w: w_mm, d: d_mm, h: h_mm }

            case mat_name
            when "Metalon"
              result[:metalon][:pecas] << peca
              if nome.start_with?("Montante")
                result[:metalon][:montantes_m] += comp / 1000.0
              elsif nome.start_with?("Anel")
                result[:metalon][:aneis_m] += comp / 1000.0
              else
                result[:metalon][:travessas_m] += comp / 1000.0
              end
            when "Emenda"
              result[:emenda][:pecas] << peca
              result[:emenda][:m] += comp / 1000.0
              result[:emenda][:qtd] += 1
            when "Fita_DF"
              if result[:fita]
                result[:fita][:pecas] << peca
                result[:fita][:m] += comp / 1000.0
              end
            end
          end
          percorrer_quant(sub, result, ox, oy, oz)
        end
      end

      def self.mm(v)
        (v / 1.mm).round(0)
      end

      # ======================================================================
      # EXTRAIR — converte o payload do JS em hash interno (com mm convertido)
      # ======================================================================
      def self.extrair(params)
        h = params || {}
        get = lambda do |k_sym, k_str, default|
          if h.key?(k_sym) then h[k_sym]
          elsif h.key?(k_str) then h[k_str]
          else default end
        end

        cor_acm   = get.call(:cor_acm,   "cor_acm",   "Branco Brilho (VX103)").to_s
        cor_junta = get.call(:cor_junta, "cor_junta", "Preto").to_s
        cor_junta_rgb = get.call(:cor_junta_rgb, "cor_junta_rgb", nil)
        cor_fita  = get.call(:cor_fita,  "cor_fita",  "Cyan").to_s
        # Padrões iniciais SINCRONIZADOS com auto_acm normal (CLAUDE.md §17)
        mw_mm = get.call(:mw, "mw", 20).to_f
        mh_mm = get.call(:mh, "mh", 20).to_f
        ew_mm = get.call(:ew, "ew", 30).to_f
        eh_mm = get.call(:eh, "eh", 20).to_f
        acm_mm = get.call(:acm, "acm", 3).to_f
        fl_mm = get.call(:fl, "fl", 12).to_f
        fe_mm = get.call(:fe, "fe", 0.9).to_f

        inc_fita_raw = get.call(:inc_fita, "inc_fita", true)
        inc_fita = inc_fita_raw == false ? false : true

        jt_str = get.call(:junta_tipo, "junta_tipo", "seca").to_s
        jt_mm  = get.call(:junta_mm, "junta_mm", 8).to_f
        jt = (jt_str == "seca") ? 0 : jt_mm.mm

        align = get.call(:emenda_align, "emenda_align", "esquerda").to_s
        chapa_larg_mm = get.call(:chapa_larg, "chapa_larg", 1220).to_f
        chapa_comp_mm = get.call(:chapa_comp, "chapa_comp", 5000).to_f
        chapa_orient  = get.call(:chapa_orient, "chapa_orient", "horizontal").to_s

        roles_raw = get.call(:roles_enab, "roles_enab", {})
        roles_raw = {} unless roles_raw.is_a?(Hash)
        roles_enab = {}
        %w[topo base frontal traseira esq dir].each do |k|
          v = if roles_raw.key?(k)         then roles_raw[k]
              elsif roles_raw.key?(k.to_sym) then roles_raw[k.to_sym]
              else nil end
          roles_enab[k.to_sym] = v.nil? ? (k != "base") : !!v
        end

        {
          cor_acm:      cor_acm,
          cor_junta:    cor_junta,
          cor_junta_rgb: cor_junta_rgb,
          cor_fita:     cor_fita,
          mw:           mw_mm.mm, mh: mh_mm.mm,
          ew:           ew_mm.mm, eh: eh_mm.mm,
          acm:          acm_mm.mm,
          fl:           fl_mm.mm, fe: fe_mm.mm,
          inc_fita:     inc_fita,
          jt:           jt,
          emenda_align: align,
          chapa_larg:   chapa_larg_mm.mm,
          chapa_comp:   chapa_comp_mm.mm,
          chapa_orient: chapa_orient,
          roles_enab:   roles_enab,
          # JS salva como `customPieces` (camelCase); Gerar envia params raw.
          # Aceita variantes pra robustez (sym, str, camelCase).
          custom_pieces: (get.call(:custom_pieces, "custom_pieces",
                          get.call(:customPieces, "customPieces", [])) || [])
        }
      end

    end
  end
end
