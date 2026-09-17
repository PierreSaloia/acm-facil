# encoding: UTF-8
# ═══════════════════════════════════════════════════════════════════════════
# SignEng — Letra 3D (ferramenta de toolbar)
# ═══════════════════════════════════════════════════════════════════════════
# Letras caixa pra IMPRESSÃO 3D a partir de um SVG importado. Pra cada letra
# (subpath fechado, com furos) gera 4 camadas paramétricas, deitadas (Z =
# profundidade, como se imprime):
#   - Suporte EXTERNO (impresso): parede do contorno, profundidade total
#   - Suporte INTERNO (impresso): anel mais baixo que trava o fundo
#   - FUNDO em ACM/PVC: chapa traseira, elevada do chão
#   - ACRÍLICO frontal: faceando a boca da casca
# Offsets derivados (modelo de referência do Marcelo):
#   acrílico = parede_ext · interno = parede_ext+folga_int · fundo = +parede_int
# Reusa o motor do Logo 3D: parse de SVG (furos even-odd) + offset de loops.
# Nasce como COMPONENTE com params em dict ('acmfacil_letra3d') — Carregar
# selecionado → Regenerar no lugar. Cada peça etiquetada (LT3D - ...).
# ═══════════════════════════════════════════════════════════════════════════

module SignEng
  module Generator
    module Letra3d

      DICT = 'acmfacil_letra3d'

      @dialog   = nil
      @svg_path = nil
      @log      = []

      # ── Log de diagnóstico (grava em Documents\acmfacil_letra3d_debug.log
      # a cada Gerar — pra depurar sem depender do Ruby Console) ────────────
      LOG_PATH = File.join(ENV['USERPROFILE'].to_s, 'Documents', 'acmfacil_letra3d_debug.log')

      def self.dlog(msg)
        @log << msg
        puts "[Letra3d] #{msg}"
      end

      def self.dlog_flush
        File.write(LOG_PATH, @log.join("\n") + "\n")
      rescue => e
        puts "[Letra3d] dlog_flush falhou: #{e.message}"
      end

      def self.ativar
        abrir_dialogo
      end

      def self.abrir_dialogo
        if @dialog && @dialog.visible?
          @dialog.bring_to_front
          return
        end
        @dialog = UI::HtmlDialog.new(
          dialog_title:    "SignEng — Letra 3D",
          preferences_key: "com.acmfacil.letra3d",
          width:           430,
          height:          720,
          min_width:       390,
          min_height:      560,
          resizable:       true,
          style:           UI::HtmlDialog::STYLE_DIALOG
        )
        @dialog.set_file(File.join(SignEng::UI_DIR, 'tools', 'letra3d', 'index.html'))
        registrar_callbacks(@dialog)
        @dialog.set_on_closed { @dialog = nil }
        @dialog.show
      end

      def self.registrar_callbacks(dlg)
        dlg.add_action_callback("letra3d_ctx") do |_ctx, json|
          data  = SignEng.parse_payload(json)
          lang  = Sketchup.read_default(SignEng::DEFAULT_NS, "lang", "pt").to_s
          lang  = "pt" unless %w[pt es en].include?(lang)
          theme = Sketchup.read_default(SignEng::DEFAULT_NS, "theme", "light").to_s
          theme = "light" unless %w[light dark].include?(theme)
          cores_cat = {}
          ordem_cat = []
          CORES_ACM.each do |nome, info|
            cat = info[:cat].to_s
            ordem_cat << cat unless ordem_cat.include?(cat)
            (cores_cat[cat] ||= []) << { nome: nome, rgb: info[:rgb] }
          end
          SignEng.resolver(dlg, data["id"], {
            ok: true, lang: lang, theme: theme, version: Core::VERSION,
            cores: cores_cat, ordem_cat: ordem_cat
          })
        end

        # Importa o SVG (reusa o file dialog + parser do Logo 3D)
        dlg.add_action_callback("letra3d_importar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            r = Generator::Logo3D.carregar_arquivo_data
            if r[:ok] && r[:is_dxf]
              SignEng.resolver(dlg, data["id"], { ok: false, code: "letra3d.somente_svg" })
            elsif r[:ok]
              @svg_path = r[:path]
              SignEng.resolver(dlg, data["id"], {
                ok: true, filename: r[:filename], n_paths: r[:n_paths],
                dims_mm: r[:dims_mm], paths_2d: r[:paths_2d]
              })
            else
              SignEng.resolver(dlg, data["id"], r)
            end
          rescue => e
            SignEng.resolver(dlg, data["id"], { ok: false, code: "letra3d.importar_error", error: e.message })
          end
        end

        # Carrega params de uma Letra 3D selecionada (pra edição)
        dlg.add_action_callback("letra3d_carregar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            sel = Sketchup.active_model.selection.to_a.find do |e|
              (e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)) &&
                e.get_attribute(DICT, 'params')
            end
            if sel.nil?
              SignEng.resolver(dlg, data["id"], { ok: false, code: "letra3d.nada_selecionado" })
            else
              params = JSON.parse(sel.get_attribute(DICT, 'params').to_s) rescue {}
              svg = sel.get_attribute(DICT, 'svg_path').to_s
              @svg_path = svg if !svg.empty? && File.exist?(svg)
              svg_ok = (@svg_path && File.exist?(@svg_path)) ? true : false
              paths = svg_ok ? (Generator::Logo3D.parse_svg(@svg_path) rescue nil) : nil
              SignEng.resolver(dlg, data["id"], {
                ok: true, entity_id: sel.entityID, params: params,
                filename: (@svg_path ? File.basename(@svg_path) : nil),
                svg_ok: svg_ok, paths_2d: paths
              })
            end
          rescue => e
            SignEng.resolver(dlg, data["id"], { ok: false, code: "letra3d.carregar_exception", error: e.message })
          end
        end

        dlg.add_action_callback("letra3d_gerar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            v = Core::Auth.assert_valid!
            unless v[:ok]
              SignEng.resolver(dlg, data["id"], v.merge(blocked: true))
              next
            end
            eid = data["entity_id"].to_i
            result = gerar(extrair(data["params"] || {}), eid > 0 ? eid : nil)
            SignEng.resolver(dlg, data["id"], result)
          rescue => e
            Sketchup.active_model.abort_operation rescue nil
            SignEng.resolver(dlg, data["id"], {
              ok: false, code: "letra3d.gerar_exception",
              error: e.message, trace: e.backtrace.first(5)
            })
          end
        end
      end

      # ── Defaults (§17 — sincronizar com _defaultParams do JS) ─────────────
      def self.extrair(p)
        g = ->(k, d) { v = p[k.to_s]; v.nil? ? d : v }
        # Perfil de corte cotado pelo Marcelo (desenho de referência):
        #   PAREDE SUPERIOR 40 alto, afina pra boca 2×3 (degrau do acrílico)
        #   BASE INFERIOR ENCAIXE em L: aba 10×2 no chão + parede 2 subindo
        #   até 15, com folga 1 da parede superior
        #   BASE ACM/PVC sobre a aba, folga 1 · ACRÍLICO 2 no degrau da boca
        {
          altura:     g.(:altura, 350).to_f,       # altura do lettering (escala uniforme)
          prof:       g.(:prof, 40).to_f,          # (A) altura da parede superior
          parede_ext: g.(:parede_ext, 3).to_f,     # espessura principal da parede
          boca_esp:   g.(:boca_esp, 2).to_f,       # (B) espessura da boca (topo fino)
          boca_alt:   g.(:boca_alt, 3).to_f,       # (C) altura da boca
          alt_int:    g.(:alt_int, 15).to_f,       # (A) altura da base inferior (L)
          folga_int:  g.(:folga_int, 1).to_f,      # folga parede superior × base inferior
          parede_int: g.(:parede_int, 2).to_f,     # (C) espessura da parede do L
          aba_comp:   g.(:aba_comp, 10).to_f,      # (D) comprimento da aba do L
          aba_esp:    g.(:aba_esp, 2).to_f,        # (B) espessura da aba (eleva o fundo)
          fundo_esp:  g.(:fundo_esp, 2).to_f,      # espessura da base ACM/PVC
          folga_fundo: g.(:folga_fundo, 1).to_f,   # folga base × parede do L
          acr_esp:    g.(:acr_esp, 2).to_f,        # (D) espessura do acrílico da face
          folga_acr:  g.(:folga_acr, 0).to_f,      # folga acrílico × boca
          acr_tipo:   g.(:acr_tipo, 'leitoso').to_s,
          cor_nome:   g.(:cor_nome, 'Verde Brilho (VX451)').to_s,
          cor_rgb:    g.(:cor_rgb, [0, 153, 76])
        }
      end

      def self.mm2in(mm)
        mm.to_f / 25.4
      end

      # ── Geração / regeneração ─────────────────────────────────────────────
      def self.gerar(p, entity_id = nil)
        unless @svg_path && File.exist?(@svg_path)
          return { ok: false, code: "letra3d.sem_svg" }
        end

        @log = []
        dlog "=== Letra3D gerar · v#{Core::VERSION} · #{Time.now}"
        dlog "svg: #{@svg_path}"
        dlog "params: #{p.inspect}"

        model = Sketchup.active_model
        inst  = nil
        if entity_id
          ent = model.find_entity_by_id(entity_id) rescue nil
          inst = ent if ent && ent.valid? && ent.is_a?(Sketchup::ComponentInstance)
        end

        model.start_operation("Gerar Letra 3D SignEng", true)
        novo = inst.nil?

        # 1. Constrói as faces do SVG num grupo temporário (furos resolvidos)
        tmp, _te, faces = Generator::Logo3D.build_svg_geometry(model, @svg_path, true)
        if tmp.nil? || faces.nil? || faces.empty?
          tmp.erase! if tmp && tmp.valid?
          model.abort_operation
          return { ok: false, code: "letra3d.svg_sem_faces" }
        end

        # 2. Extrai os loops (pontos) de cada letra ANTES de apagar o grupo
        letras = []
        faces.each do |f|
          next unless f.valid?
          letras << {
            outer: f.outer_loop.vertices.map { |v| v.position },
            holes: f.loops.reject(&:outer?).map { |lp| lp.vertices.map { |v| v.position } }
          }
        end
        bb  = tmp.bounds
        esc = bb.height > 0 ? mm2in(p[:altura]) / bb.height : 1.0
        ox  = bb.min.x
        oy  = bb.min.y
        tmp.erase!

        if letras.empty?
          model.abort_operation
          return { ok: false, code: "letra3d.svg_sem_faces" }
        end

        if novo
          defn = model.definitions.add("SignEng Letra3D")
        else
          defn = inst.definition
          defn.entities.clear!
        end

        n_ok = construir(defn.entities, letras, p, esc, ox, oy)

        inst = model.active_entities.add_instance(defn, Geom::Transformation.new) if novo
        inst.name = "Letra3D #{File.basename(@svg_path, '.*')}"
        inst.set_attribute(DICT, 'params', JSON.generate(p))
        inst.set_attribute(DICT, 'svg_path', @svg_path.to_s)
        model.commit_operation

        sel = model.selection
        sel.clear
        sel.add(inst)
        model.active_view.zoom(sel.to_a) if novo

        dlog "FIM: #{letras.length} letra(s), pecas_ok=#{n_ok}"
        dlog_flush
        { ok: true, entity_id: inst.entityID, novo: novo, letras: letras.length, pecas_ok: n_ok }
      rescue => e
        model.abort_operation rescue nil
        dlog "EXCEPTION gerar: #{e.message} · #{e.backtrace.first(3).join(' | ')}"
        dlog_flush
        { ok: false, code: "letra3d.construir_error", error: e.message, trace: e.backtrace.first(5) }
      end

      # ── Construção das 4 peças por letra (perfil de corte do Marcelo) ─────
      def self.construir(ents, letras, p, esc, ox, oy)
        pe    = mm2in(p[:parede_ext])
        be    = mm2in(p[:boca_esp])
        ba    = mm2in(p[:boca_alt])
        d2    = pe + mm2in(p[:folga_int])                # face externa do L
        d3    = d2 + mm2in(p[:parede_int])               # face interna do L
        prof  = mm2in(p[:prof])
        alt_i = mm2in(p[:alt_int])
        abc   = mm2in(p[:aba_comp])
        abe   = mm2in(p[:aba_esp])
        f_esp = mm2in(p[:fundo_esp])
        a_esp = mm2in(p[:acr_esp])
        fg_a  = mm2in(p[:folga_acr])
        fg_f  = mm2in(p[:folga_fundo])

        mat_letra = acm_material(p[:cor_nome], p[:cor_rgb])
        mat_fundo = material_rgb("SignEng Fundo", [120, 120, 120])
        mat_acr   = p[:acr_tipo] == 'cristal' ?
                    material_rgb("Acrílico cristal", [225, 232, 238], 0.35) :
                    material_rgb("Acrílico leitoso", [246, 246, 244], 0.75)

        n_ok = 0
        letras.each_with_index do |lt, i|
          g_letra = ents.add_group
          g_letra.name = "letra_#{i + 1}"
          ge = g_letra.entities

          outer = ccw(transf(lt[:outer], esc, ox, oy))
          holes = lt[:holes].map { |h| cw(transf(h, esc, ox, oy)) }
          dlog "letra #{i + 1}: outer=#{outer.length} pts, holes=#{holes.map(&:length).inspect}"

          # PAREDE SUPERIOR: corpo na espessura principal até a base da boca,
          # e a BOCA fina (2×3) no topo — o degrau resultante segura o acrílico
          r = add_anel_letra(ge, outer, holes, 0.0, pe, 0.0, prof - ba,
                             mat_letra, "parede_superior", "LT3D - Parede superior")
          n_ok += 1 if r
          dlog "  parede_superior: #{r ? 'OK' : 'FALHOU'}"
          r = add_anel_letra(ge, outer, holes, 0.0, be, prof - ba, ba,
                             mat_letra, "boca_acrilico", "LT3D - Parede superior")
          dlog "  boca_acrilico: #{r ? 'OK' : 'FALHOU'}"

          # ACRÍLICO DA FACE: assenta no degrau da boca (rebaixado boca_alt-acr_esp)
          r = add_placa_letra(ge, outer, holes, be + fg_a, prof - ba, a_esp,
                              mat_acr, "acrilico_face", "LT3D - Acrílico da face")
          n_ok += 1 if r
          dlog "  acrilico_face: #{r ? 'OK' : 'FALHOU'}"

          # BASE INFERIOR ENCAIXE (perfil L): aba deitada no chão + parede
          # subindo EM CIMA da aba, com folga da parede superior
          r = add_anel_letra(ge, outer, holes, d2, d2 + abc, 0.0, abe,
                             mat_letra, "aba_encaixe", "LT3D - Base inferior (encaixe)")
          n_ok += 1 if r
          dlog "  aba_encaixe: #{r ? 'OK' : 'FALHOU'}"
          r = add_anel_letra(ge, outer, holes, d2, d3, abe, alt_i - abe,
                             mat_letra, "parede_encaixe", "LT3D - Base inferior (encaixe)")
          dlog "  parede_encaixe: #{r ? 'OK' : 'FALHOU'}"

          # BASE ACM/PVC: assenta sobre a aba, com folga da parede do L
          r = add_placa_letra(ge, outer, holes, d3 + fg_f, abe, f_esp,
                              mat_fundo, "base_acm_pvc", "LT3D - Base ACM/PVC")
          n_ok += 1 if r
          dlog "  base_acm_pvc: #{r ? 'OK' : 'FALHOU'}"
        end
        n_ok
      end

      # Chapa da letra: contorno erodido por `off`, com os furos crescidos
      def self.add_placa_letra(ents, outer, holes, off, z0, esp, mat, nome, tag)
        o = desloca(outer, off, z0)
        dlog "    placa '#{nome}': o=#{o.length} pts (off #{(off * 25.4).round(1)}mm)"
        return false if o.length < 3
        grp = ents.add_group
        ge  = grp.entities
        f = ge.add_face(o)
        holes.each do |h|
          hh = desloca(h, off, z0)
          next if hh.length < 3
          begin
            fi = ge.add_face(hh)
            fi.erase!
          rescue => e
            dlog "    placa '#{nome}': furo falhou: #{e.message}"
          end
        end
        f = ge.grep(Sketchup::Face).max_by { |ff| ff.valid? ? ff.loops.length : 0 }
        unless f && f.valid?
          dlog "    placa '#{nome}': DESCARTADA (sem face válida)"
          grp.erase! if grp.valid?
          return false
        end
        f.reverse! if f.normal.z < 0
        f.pushpull(esp)
        suavizar(grp)
        grp.material = mat
        grp.name = nome
        etiquetar(grp, tag)
        true
      rescue => e
        puts "[Letra3d] placa '#{nome}' falhou: #{e.message}"
        false
      end

      # Anel da letra: banda entre as erosões off_a e off_b (contorno e furos)
      def self.add_anel_letra(ents, outer, holes, off_a, off_b, z0, esp, mat, nome, tag)
        # banda principal (contorno externo)
        oa = desloca(outer, off_a, z0)
        ob = desloca(outer, off_b, z0)
        dlog "    anel '#{nome}': oa=#{oa.length} pts (off #{(off_a * 25.4).round(1)}mm) · ob=#{ob.length} pts (off #{(off_b * 25.4).round(1)}mm)"

        # Traço mais estreito que 2×off_b: a erosão engole o miolo e o loop
        # interno colapsa. A banda vira PLACA CHEIA (o encaixe preenche tudo)
        # em vez de sumir silenciosamente (era o "faltou a base inferior").
        if oa.length >= 3 && ob.length < 3
          dlog "    anel '#{nome}': ob colapsou → fallback PLACA CHEIA"
          return add_placa_letra(ents, outer, holes, off_a, z0, esp, mat, nome, tag)
        end

        grp = ents.add_group
        ge  = grp.entities
        algum = false
        algum |= banda(ge, oa, ob, esp)

        # banda ao redor de cada furo (o furo cresce com a erosão)
        holes.each do |h|
          ha = desloca(h, off_a, z0)
          hb = desloca(h, off_b, z0)
          algum |= banda(ge, hb, ha, esp)
        end

        unless algum
          grp.erase! if grp.valid?
          return false
        end
        suavizar(grp)
        grp.material = mat
        grp.name = nome
        etiquetar(grp, tag)
        true
      rescue => e
        puts "[Letra3d] anel '#{nome}' falhou: #{e.message}"
        false
      end

      # Face entre loop externo e furo, extrudada.
      # IMPORTANTE: só olha as faces NOVAS (o grupo acumula sólidos de bandas
      # anteriores — o grep global pegava face errada). Se o furo falhar, a
      # banda é DESCARTADA (nunca gerar peça maciça silenciosamente).
      def self.banda(ge, ext_pts, int_pts, esp)
        return false if ext_pts.length < 3 || int_pts.length < 3
        antes = ge.grep(Sketchup::Face).to_a
        ge.add_face(ext_pts)
        begin
          ge.add_face(int_pts)
        rescue => e
          dlog "    banda: miolo falhou: #{e.message}"
        end
        # O ANEL é a face com 2+ loops. NÃO apagar pelo retorno do add_face:
        # quando o furo divide a face, a API às vezes devolve o ANEL em vez
        # do miolo — o fi.erase! antigo matava o anel e a banda inteira era
        # descartada (era ISSO que engolia a Base inferior/fêmea).
        novas = ge.grep(Sketchup::Face).to_a - antes
        anel  = novas.find { |ff| ff.valid? && ff.loops.length > 1 }
        unless anel
          dlog "    banda: DESCARTADA (sem face-anel; novas=#{novas.length})"
          novas.each { |ff| ff.erase! if ff.valid? }
          return false
        end
        (novas - [anel]).each { |ff| ff.erase! if ff.valid? }
        unless anel.valid?
          dlog "    banda: anel invalidado ao apagar o miolo"
          return false
        end
        anel.reverse! if anel.normal.z < 0
        anel.pushpull(esp)
        true
      rescue => e
        dlog "    banda: EXCEPTION #{e.message}"
        false
      end

      # ── Helpers de contorno ───────────────────────────────────────────────
      def self.transf(pts, esc, ox, oy)
        pts.map { |p| Geom::Point3d.new((p.x - ox) * esc, (p.y - oy) * esc, 0) }
      end

      def self.area_sinal(pts)
        a = 0.0
        n = pts.length
        n.times do |i|
          p1 = pts[i]
          p2 = pts[(i + 1) % n]
          a += p1.x * p2.y - p2.x * p1.y
        end
        a / 2.0
      end

      # contorno externo anti-horário (offset positivo = erode o material)
      def self.ccw(pts)
        area_sinal(pts) >= 0 ? pts : pts.reverse
      end

      # furo horário (offset positivo = furo cresce = erode o material)
      def self.cw(pts)
        area_sinal(pts) < 0 ? pts : pts.reverse
      end

      # Offset com MITER EXATO nos cantos convergentes (o bico fica pontudo —
      # é o offset verdadeiro; o chanfro de antes cortava o canto e criava o
      # notch/as "pontas") e junta em ARCO nos divergentes (côncavos), com
      # dedup na margem de fusão de vértices do SketchUp (~0.025mm).
      # VALIDADO em harness Node contra o C.svg real (236 pts, 0 auto-int,
      # bandas aninhadas em todas as distâncias 2..14mm).
      MERGE_EPS = 0.05 / 25.4   # in — 2× a tolerância de fusão do SketchUp

      def self.desloca(pts_in, dist, z0)
        if dist.abs < 1e-9
          # contorno cru: dedup na margem de fusão do SketchUp (o C real tinha
          # um segmento de 0.00012mm no bico — vértices fundidos criam fresta)
          raw = []
          pts_in.each do |p|
            q = Geom::Point3d.new(p.x, p.y, z0)
            raw << q if raw.empty? || raw.last.distance(q) > MERGE_EPS
          end
          raw.pop if raw.length > 1 && raw.first.distance(raw.last) < MERGE_EPS
          return raw
        end
        s_orig = area_sinal(pts_in)
        pts = simplifica(pts_in)
        n = pts.length
        return [] if n < 3

        out = []
        n.times do |i|
          pv = pts[(i - 1) % n]
          pc = pts[i]
          pn = pts[(i + 1) % n]
          e1x = pc.x - pv.x; e1y = pc.y - pv.y
          e2x = pn.x - pc.x; e2y = pn.y - pc.y
          l1 = Math.hypot(e1x, e1y)
          l2 = Math.hypot(e2x, e2y)
          next if l1 < 1e-9 || l2 < 1e-9
          n1x = -e1y / l1; n1y = e1x / l1
          n2x = -e2y / l2; n2y = e2x / l2

          a2 = [pc.x + n1x * dist, pc.y + n1y * dist]  # fim da aresta 1 deslocada
          b1 = [pc.x + n2x * dist, pc.y + n2y * dist]  # início da aresta 2 deslocada
          cross = e1x * e2y - e1y * e2x

          if cross * dist > 0
            # convergente: interseção exata das arestas deslocadas (canto vivo)
            t = ((b1[0] - a2[0]) * e2y - (b1[1] - a2[1]) * e2x) / cross
            out << Geom::Point3d.new(a2[0] + t * e1x, a2[1] + t * e1y, z0)
          elsif Math.hypot(a2[0] - b1[0], a2[1] - b1[1]) < MERGE_EPS
            out << Geom::Point3d.new(a2[0], a2[1], z0)  # quase reto
          else
            # divergente: arco de a2 → b1 ao redor do vértice (raio |dist|)
            r  = dist.abs
            a0 = Math.atan2(a2[1] - pc.y, a2[0] - pc.x)
            a1 = Math.atan2(b1[1] - pc.y, b1[0] - pc.x)
            if dist > 0
              a1 -= 2 * Math::PI while a1 > a0
            else
              a1 += 2 * Math::PI while a1 < a0
            end
            total = a1 - a0
            nseg = [(total.abs / (10 * Math::PI / 180)).ceil, 1].max
            (0..nseg).each do |k|
              ang = a0 + total * (k.to_f / nseg)
              out << Geom::Point3d.new(pc.x + Math.cos(ang) * r,
                                       pc.y + Math.sin(ang) * r, z0)
            end
          end
        end

        # remove pontos mais próximos que a tolerância de fusão do SketchUp
        limpo = []
        out.each { |p| limpo << p if limpo.empty? || limpo.last.distance(p) > MERGE_EPS }
        limpo.pop if limpo.length > 1 && limpo.first.distance(limpo.last) < MERGE_EPS

        # remove LAÇOS auto-intersectados (cantos da boca de letras como C/G
        # criavam loops que quebravam o add_face → peça saía maciça)
        limpo = remove_lacos(limpo)
        if limpo.length < 3
          dlog "      desloca(#{(dist * 25.4).round(1)}mm): vazio pós-laços"
          return []
        end

        # guardas contra colapso: sinal vs loop ORIGINAL + área mínima plausível
        s_out = area_sinal(limpo)
        if s_out.abs < 1e-9 || (s_orig > 0) != (s_out > 0)
          dlog "      desloca(#{(dist * 25.4).round(1)}mm): sinal invertido/nulo (colapso)"
          return []
        end
        if s_out.abs < 0.02 * s_orig.abs
          dlog "      desloca(#{(dist * 25.4).round(1)}mm): área < 2% (colapso)"
          return []
        end
        limpo
      end

      # Interseção própria entre segmentos ab × cd (2D, ignora extremos)
      def self.seg_int(a, b, c, d)
        rx = b.x - a.x; ry = b.y - a.y
        sx = d.x - c.x; sy = d.y - c.y
        den = rx * sy - ry * sx
        return nil if den.abs < 1e-12
        t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den
        u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den
        eps = 1e-7
        return nil unless t > eps && t < 1 - eps && u > eps && u < 1 - eps
        Geom::Point3d.new(a.x + t * rx, a.y + t * ry, a.z)
      end

      # Corta os laços menores de um loop auto-intersectado, mantendo o maior
      def self.remove_lacos(pts)
        return pts if pts.length < 5
        pts = pts.dup
        guard = 0
        i = 0
        while i < pts.length && guard < 20000
          guard += 1
          n = pts.length
          break if n < 5
          a = pts[i]
          b = pts[(i + 1) % n]
          achou = false
          j = i + 2
          while j < n
            unless i == 0 && j == n - 1   # segmentos adjacentes no fechamento
              ip = seg_int(a, b, pts[j], pts[(j + 1) % n])
              if ip
                if (j - i) <= n / 2
                  pts = pts[0..i] + [ip] + pts[(j + 1)..-1]
                else
                  pts = [ip] + pts[(i + 1)..j]
                end
                achou = true
                break
              end
            end
            j += 1
          end
          if achou
            i = 0
          else
            i += 1
          end
        end
        pts
      end

      # Simplificação DOUGLAS-PEUCKER (preserva a curvatura). O filtro antigo
      # de colinearidade LOCAL colapsava curvas densas do Corel pra 4 pontos —
      # era daí que saía o "retângulo" no lugar da letra.
      def self.dp_marca(pts, i0, i1, tol, keep)
        pilha = [[i0, i1]]
        until pilha.empty?
          a0, a1 = pilha.pop
          next if a1 <= a0 + 1
          pa = pts[a0]
          pb = pts[a1]
          abx = pb.x - pa.x
          aby = pb.y - pa.y
          lab = Math.hypot(abx, aby)
          lab = 1e-12 if lab < 1e-12
          dmax = -1.0
          imax = -1
          ((a0 + 1)...a1).each do |i|
            d = ((pts[i].x - pa.x) * aby - (pts[i].y - pa.y) * abx).abs / lab
            if d > dmax
              dmax = d
              imax = i
            end
          end
          if dmax > tol
            keep[imax] = true
            pilha << [a0, imax] << [imax, a1]
          end
        end
      end

      def self.simplifica(pts)
        # dedup de pontos colados
        out = []
        pts.each { |p| out << p if out.empty? || out.last.distance(p) > 1e-6 }
        out.pop if out.length > 2 && out.first.distance(out.last) <= 1e-6
        n = out.length
        return out if n < 8

        tol = mm2in(0.15)  # 0.6 deixava a curva "quadriculada" pra impressão
        # loop fechado: âncoras no ponto 0 e no mais distante dele
        imax = 0
        dmax = -1.0
        (1...n).each do |i|
          d = out[0].distance(out[i])
          if d > dmax
            dmax = d
            imax = i
          end
        end
        keep = Array.new(n, false)
        keep[0] = true
        keep[imax] = true
        dp_marca(out, 0, imax, tol, keep)
        fech = out + [out[0]]
        keep2 = Array.new(n + 1, false)
        dp_marca(fech, imax, n, tol, keep2)
        (imax...n).each { |i| keep[i] = true if keep2[i] }
        res = []
        out.each_with_index { |p, i| res << p if keep[i] }
        res.length >= 3 ? res : out
      end

      # ── Materiais / acabamento (padrão do Luminoso) ───────────────────────
      def self.acm_material(cor_nome, rgb)
        model = Sketchup.active_model
        nome  = "ACM_#{cor_nome}"
        m = model.materials[nome]
        return m if m
        Generator.load_acm_material(model, nome, cor_nome.to_s, rgb)
      rescue => e
        puts "[Letra3d] acm_material falhou (#{e.message}) — fallback RGB"
        material_rgb(nome, rgb)
      end

      def self.material_rgb(nome, rgb, alpha = 1.0)
        mats = Sketchup.active_model.materials
        m = mats[nome] || mats.add(nome)
        m.color = Sketchup::Color.new(rgb[0].to_i, rgb[1].to_i, rgb[2].to_i)
        m.alpha = alpha
        m
      end

      def self.suavizar(grp)
        grp.entities.grep(Sketchup::Edge).each do |e|
          next unless e.faces.length == 2
          ang = e.faces[0].normal.angle_between(e.faces[1].normal)
          if ang < 0.35
            e.soft   = true
            e.smooth = true
          end
        end
      rescue => err
        puts "[Letra3d] suavizar falhou: #{err.message}"
      end

      def self.etiquetar(grp, nome)
        return unless grp && grp.valid?
        grp.layer = Sketchup.active_model.layers.add(nome)
      rescue => e
        puts "[Letra3d] etiquetar '#{nome}' falhou: #{e.message}"
      end

    end # Letra3d
  end
end
