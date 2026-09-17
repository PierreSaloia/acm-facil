# encoding: UTF-8
# ═══════════════════════════════════════════════════════════════════════════
# SignEng — Móvel Paramétrico (ferramenta de toolbar)
# ═══════════════════════════════════════════════════════════════════════════
# Fatia um SÓLIDO modelado pelo usuário (grupo/componente fechado) em fatias
# paralelas de chapa (MDF/compensado) — o estilo "móvel paramétrico" de CNC:
# ondas, faces, esculturas em camadas.
#
# Fluxo: usuário seleciona o bloco → configura chapa/vão/eixo/fixação →
# Gerar. Cada fatia nasce por interseção booleana (slab × cópia do sólido),
# com furo/rasgo da fixação escolhida (barra roscada, tubo, cavilha ou ripa)
# no lado configurado. Tudo etiquetado (MP - ...) e componentizado.
#
# O resultado nasce como COMPONENTE com params + persistent_id do bloco de
# origem gravados em attribute dictionary ('acmfacil_movel_parametrico') —
# dá pra selecionar um já gerado, carregar no painel, editar e REGENERAR no
# lugar (re-fatia o bloco original, que fica oculto no modelo).
# ═══════════════════════════════════════════════════════════════════════════

module SignEng
  module Generator
    module MovelParametrico

      DICT = 'acmfacil_movel_parametrico'

      @dialog = nil

      # ── Entrada do botão da toolbar ───────────────────────────────────────
      def self.ativar
        abrir_dialogo
      end

      def self.abrir_dialogo
        if @dialog && @dialog.visible?
          @dialog.bring_to_front
          return
        end
        @dialog = UI::HtmlDialog.new(
          dialog_title:    "SignEng — Móvel Paramétrico",
          preferences_key: "com.acmfacil.movel_parametrico",
          width:           440,
          height:          760,
          min_width:       400,
          min_height:      560,
          resizable:       true,
          style:           UI::HtmlDialog::STYLE_DIALOG
        )
        @dialog.set_file(File.join(SignEng::UI_DIR, 'tools', 'movel_parametrico', 'index.html'))
        registrar_callbacks(@dialog)
        @dialog.set_on_closed { @dialog = nil }
        @dialog.show
      end

      # ── Callbacks (padrão Bridge, diálogo próprio) ────────────────────────
      def self.registrar_callbacks(dlg)
        dlg.add_action_callback("movel_parametrico_ctx") do |_ctx, json|
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

        # Carrega params de um móvel paramétrico selecionado (pra edição)
        dlg.add_action_callback("movel_parametrico_carregar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            sel = Sketchup.active_model.selection.to_a.find do |e|
              (e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)) &&
                e.get_attribute(DICT, 'params')
            end
            if sel.nil?
              SignEng.resolver(dlg, data["id"], { ok: false, code: "mp.nada_selecionado" })
            else
              params = JSON.parse(sel.get_attribute(DICT, 'params').to_s) rescue {}
              SignEng.resolver(dlg, data["id"], { ok: true, entity_id: sel.entityID, params: params })
            end
          rescue => e
            SignEng.resolver(dlg, data["id"], { ok: false, code: "mp.carregar_exception", error: e.message })
          end
        end

        dlg.add_action_callback("movel_parametrico_gerar") do |_ctx, json|
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
              ok: false, code: "mp.gerar_exception",
              error: e.message, trace: e.backtrace.first(5)
            })
          end
        end
      end

      # ── Params: defaults (§17 — sincronizar com _defaultParams do JS) ─────
      def self.extrair(p)
        g = ->(k, d) { v = p[k.to_s]; v.nil? ? d : v }
        {
          chapa:      g.(:chapa, 15).to_f,          # espessura da fatia (MDF 15)
          gap:        g.(:gap, 30).to_f,            # vão entre fatias
          eixo:       g.(:eixo, 'x').to_s,          # x|y|z (direção do fatiamento)
          fix_tipo:   g.(:fix_tipo, 'barra').to_s,  # barra|tubo|cavilha|ripa|nenhuma
          fix_qtd:    g.(:fix_qtd, 2).to_i,         # quantos fixadores
          fix_diam:   g.(:fix_diam, 10).to_f,       # Ø barra/tubo/cavilha (mm)
          fix_folga:  g.(:fix_folga, 0.5).to_f,     # folga do furo/rasgo
          fix_duplo:  g.(:fix_duplo, 'vertical').to_s, # vertical|horizontal (separação do par)
          ripa_larg:  g.(:ripa_larg, 40).to_f,      # ripa: profundidade do rasgo
          ripa_esp:   g.(:ripa_esp, 6).to_f,        # ripa: espessura
          fix_lado:   g.(:fix_lado, 'tras').to_s,   # frente|tras|cima|baixo|centro
          fix_margem: g.(:fix_margem, 50).to_f,     # distância da borda escolhida
          cor_nome:   g.(:cor_nome, 'Branco Brilho (VX103)').to_s,
          cor_rgb:    g.(:cor_rgb, [235, 235, 235])
        }
      end

      def self.mm2in(mm)
        mm.to_f / 25.4
      end

      # ── Geração / regeneração ─────────────────────────────────────────────
      def self.gerar(p, entity_id = nil)
        model = Sketchup.active_model
        inst  = nil
        srcs  = []

        if entity_id
          ent = model.find_entity_by_id(entity_id) rescue nil
          inst = ent if ent && ent.valid? && ent.is_a?(Sketchup::ComponentInstance)
        end

        candidatos = []
        if inst
          # regeneração: re-fatia os blocos de origem gravados no dict
          # (find_entity_by_persistent_id retorna Array no SU moderno)
          pids = inst.get_attribute(DICT, 'src_pid').to_s.split(',').map(&:to_i)
          pids.each do |pid|
            found = model.find_entity_by_persistent_id(pid) rescue nil
            e = found.is_a?(Array) ? found.compact.first : found
            candidatos << e if e && e.valid?
          end
          return { ok: false, code: "mp.src_sumiu" } if candidatos.empty?
        else
          # novo: TODOS os grupos/componentes selecionados (uma logo inteira
          # pode ter várias peças separadas — fatiamos o conjunto alinhado).
          candidatos = model.selection.to_a.select do |e|
            (e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)) &&
              e.get_attribute(DICT, 'params').nil?
          end
          return { ok: false, code: "mp.nada_selecionado" } if candidatos.empty?
        end

        model.start_operation("Gerar Móvel Paramétrico SignEng", true)
        novo = inst.nil?

        # Prepara as peças: REPARO AUTOMÁTICO do que não for sólido (arestas
        # soltas, faces faltando, furos planos) e, se a peça for um CONTAINER
        # (grupo com as partes da logo dentro), usa os FILHOS sólidos via
        # cópias temporárias na raiz (transform composto → fatias no lugar).
        ignorados = 0
        reparados = 0
        temps     = []
        candidatos.each do |c|
          solido = c.respond_to?(:manifold?) && c.manifold?
          unless solido
            solido = reparar_solido(c)
            reparados += 1 if solido
          end
          if solido
            srcs << c
            next
          end
          filhos = (c.definition.entities.to_a rescue []).select do |e|
            e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
          end
          achou = false
          filhos.each do |f|
            fs = f.respond_to?(:manifold?) && f.manifold?
            unless fs
              fs = reparar_solido(f)
              reparados += 1 if fs
            end
            next unless fs
            cp = model.active_entities.add_instance(f.definition, c.transformation * f.transformation)
            temps << cp
            srcs  << cp
            achou = true
          end
          ignorados += 1 unless achou
        end

        if srcs.empty?
          model.abort_operation
          return { ok: false, code: "mp.nao_solido" }
        end

        if novo
          defn = model.definitions.add("SignEng Móvel Paramétrico")
        else
          defn = inst.definition
          defn.entities.clear!
        end

        n_fatias, n_fix, soltas, excesso = construir(defn.entities, srcs, p)
        if excesso
          model.abort_operation
          return { ok: false, code: "mp.muitas_fatias", precisa: excesso, max: 600 }
        end
        if n_fatias == 0
          model.abort_operation
          return { ok: false, code: "mp.sem_fatias" }
        end

        if novo
          inst = model.active_entities.add_instance(defn, Geom::Transformation.new)
        else
          # geometria nasce em coordenadas do modelo — instância fica na origem
          inst.transformation = Geom::Transformation.new
        end
        inst.name = "Móvel Paramétrico #{n_fatias} fatias"
        inst.set_attribute(DICT, 'params', JSON.generate(p))
        # guarda os pids dos CANDIDATOS originais (os temps são recriados
        # deterministicamente na regeneração a partir deles)
        inst.set_attribute(DICT, 'src_pid', candidatos.map { |c| c.persistent_id.to_s }.join(','))
        temps.each { |t| t.erase! if t.valid? }
        candidatos.each { |c| c.hidden = true if c.valid? }
        model.commit_operation

        sel = model.selection
        sel.clear
        sel.add(inst)
        model.active_view.zoom(sel.to_a) if novo

        { ok: true, entity_id: inst.entityID, novo: novo, fatias: n_fatias,
          fixadores: n_fix, soltas: soltas.to_i, pecas: srcs.length,
          ignorados: ignorados, reparados: reparados }
      rescue => e
        model.abort_operation rescue nil
        { ok: false, code: "mp.construir_error", error: e.message, trace: e.backtrace.first(5) }
      end

      # ── Construção: fatias por booleano slab × cópia de cada sólido ──────
      # srcs pode ter VÁRIAS peças (logo com letras separadas): os planos de
      # corte são calculados pela caixa COMBINADA, então as fatias de todas
      # as peças nascem alinhadas, como um conjunto único.
      def self.construir(ents, srcs, p)
        bb = Geom::BoundingBox.new
        srcs.each { |s| bb.add(s.bounds) }

        ax    = { 'x' => 0, 'y' => 1, 'z' => 2 }[p[:eixo]] || 0
        chapa = mm2in(p[:chapa])
        passo = chapa + mm2in(p[:gap])
        span  = bb.max[ax] - bb.min[ax]
        return [0, 0] if span <= chapa || chapa <= 0

        n = ((span - chapa) / passo).floor + 1
        n = 1 if n < 1
        # trava de segurança: NÃO truncar (comeria as pontas do conjunto em
        # silêncio) — aborta e avisa na UI pra ajustar vão/chapa
        return [0, 0, 0, n] if n > 600
        start = (bb.min[ax] + bb.max[ax]) / 2.0 - ((n - 1) * passo) / 2.0

        mat = acm_material(p[:cor_nome], p[:cor_rgb])

        fatias = []
        n.times do |i|
          ci = start + i * passo
          srcs.each do |src|
            sb = src.bounds
            # pula peças que este plano de corte nem toca
            next if ci + chapa / 2.0 < sb.min[ax] || ci - chapa / 2.0 > sb.max[ax]
            g, polys = fatia_secao(ents, src, ax, ci, chapa, mat)
            if g
              g.name = format("fatia_%02d", i + 1)
              etiquetar(g, "MP - Fatias")
              fatias << { grp: g, ci: ci, polys: polys }
            end
          end
        end

        n_fix, soltas = fixacao(ents, fatias, bb, ax, p, chapa)
        [fatias.length, n_fix, soltas]
      end

      # ── Fatia por SEÇÃO + EXTRUSÃO (chapa plana, como se fabrica em CNC) ──
      # Corta as curvas de interseção do sólido com o plano CENTRAL da fatia
      # (intersect_with — muito mais rápido que booleano de sólidos), monta as
      # faces, resolve furos por PARIDADE (profundidade de aninhamento ímpar =
      # material) e extruda a chapa. O contorno da fatia é a seção exata.
      def self.fatia_secao(ents, src, ax, ci, chapa, mat)
        grp = ents.add_group
        ge  = grp.entities

        # plano de corte temporário (retângulo maior que a peça)
        sb = src.bounds
        mg = mm2in(20)
        lo = [sb.min.x - mg, sb.min.y - mg, sb.min.z - mg]
        hi = [sb.max.x + mg, sb.max.y + mg, sb.max.z + mg]
        cross = [0, 1, 2] - [ax]
        c1, c2 = cross
        pts = [[lo, lo], [hi, lo], [hi, hi], [lo, hi]].map do |a, b|
          q = [0.0, 0.0, 0.0]
          q[ax] = ci
          q[c1] = a[c1]
          q[c2] = b[c2]
          Geom::Point3d.new(*q)
        end
        tmp = ents.add_group
        tmp.entities.add_face(pts)
        # desenha SÓ as arestas da interseção plano×sólido dentro de ge
        tmp.entities.intersect_with(true, tmp.transformation, ge, grp.transformation, true, [src])
        tmp.erase!

        arestas = ge.grep(Sketchup::Edge)
        if arestas.empty?
          grp.erase! if grp.valid?
          return nil
        end
        arestas.each { |e| e.find_faces rescue nil }

        # paridade: ponto interno da face; profundidade = nº de contornos
        # externos que o contêm (inclui o próprio). Ímpar = material.
        faces = ge.grep(Sketchup::Face)
        if faces.empty?
          grp.erase! if grp.valid?
          return nil
        end
        loops = faces.map { |f| f.outer_loop.vertices.map { |v| v.position } }
        infos = faces.each_with_index.map do |f, idx|
          m  = f.mesh
          tri = m.polygon_points_at(1)
          cx = (tri[0].x + tri[1].x + tri[2].x) / 3.0
          cy = (tri[0].y + tri[1].y + tri[2].y) / 3.0
          cz = (tri[0].z + tri[1].z + tri[2].z) / 3.0
          c  = Geom::Point3d.new(cx, cy, cz)
          depth = loops.count { |lp| pip(c, lp, c1, c2) }
          [f, depth]
        end
        material_faces = []
        infos.each do |f, depth|
          if depth.odd?
            material_faces << f
          else
            f.erase! if f.valid?
          end
        end
        # arestas órfãs (tangências, sobras)
        ge.grep(Sketchup::Edge).each { |e| e.erase! if e.valid? && e.faces.empty? }
        material_faces.select!(&:valid?)
        if material_faces.empty?
          grp.erase! if grp.valid?
          return nil
        end

        # guarda o contorno 2D da seção (pro posicionamento dos fixadores:
        # a barra só pode passar onde EXISTE material da fatia)
        polys = material_faces.map do |f|
          outer = f.outer_loop.vertices.map { |v| a = v.position.to_a; [a[c1], a[c2]] }
          holes = f.loops.reject(&:outer?).map { |lp| lp.vertices.map { |v| a = v.position.to_a; [a[c1], a[c2]] } }
          [outer, holes]
        end

        # centraliza a chapa no plano da seção e extruda
        vec = [0.0, 0.0, 0.0]
        vec[ax] = -chapa / 2.0
        ge.transform_entities(Geom::Transformation.translation(Geom::Vector3d.new(*vec)), ge.to_a)
        material_faces.each do |f|
          next unless f.valid?
          f.reverse! if f.normal.to_a[ax] < 0
          f.pushpull(chapa)
        end
        suavizar(grp)
        grp.material = mat
        [grp, polys]
      rescue => e
        puts "[MovelParametrico] fatia_secao falhou: #{e.message}"
        grp.erase! if grp && grp.valid? rescue nil
        nil
      end

      # Ponto dentro de polígono (2D, nos eixos c1/c2 do plano da seção)
      def self.pip(pt, poly, c1, c2)
        u = pt.to_a[c1]
        v = pt.to_a[c2]
        dentro = false
        n = poly.length
        j = n - 1
        n.times do |i|
          ui = poly[i].to_a[c1]
          vi = poly[i].to_a[c2]
          uj = poly[j].to_a[c1]
          vj = poly[j].to_a[c2]
          if (vi > v) != (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui
            dentro = !dentro
          end
          j = i
        end
        dentro
      end

      # ── Fixação: barra roscada / tubo / cavilha (cilindros) ou ripa ──────
      # POSICIONAMENTO INTELIGENTE (barra/tubo/cavilha): a barra só prende a
      # fatia se atravessar o MATERIAL dela. Testa uma grade de posições
      # contra o contorno 2D de cada fatia e escolhe (greedy set cover) os
      # pontos que cobrem todas — adicionando barras além da quantidade
      # pedida se for preciso pra nenhuma fatia ficar solta. A barra tem o
      # comprimento exato do trecho que prende. Retorna [n_fix, soltas].
      def self.fixacao(ents, fatias, bb, ax, p, chapa)
        tipo = p[:fix_tipo]
        return [0, 0] if tipo == 'nenhuma' || fatias.empty? || p[:fix_qtd] <= 0

        cross = [0, 1, 2] - [ax]
        c1, c2 = cross
        lado_ax =
          case p[:fix_lado]
          when 'frente', 'tras' then cross.include?(1) ? 1 : 0
          when 'cima', 'baixo'  then cross.include?(2) ? 2 : cross.last
          else                       cross.include?(1) ? 1 : cross.first
          end
        lado_ax = cross.first unless cross.include?(lado_ax)
        dist_ax = (cross - [lado_ax]).first

        mgm  = mm2in(p[:fix_margem])
        lmin = bb.min[lado_ax]
        lmax = bb.max[lado_ax]
        pref =
          case p[:fix_lado]
          when 'frente', 'baixo' then lmin + mgm   # frente = -Y (convenção do plugin)
          when 'tras', 'cima'    then lmax - mgm
          else                        (lmin + lmax) / 2.0
          end

        mat_metal   = material_rgb("SignEng Metal", [120, 120, 125])
        mat_madeira = material_rgb("SignEng Madeira", [176, 138, 90])

        if tipo == 'ripa'
          qtd  = p[:fix_qtd]
          dmin = bb.min[dist_ax] + mgm
          dmax = bb.max[dist_ax] - mgm
          dmin = dmax = (dmin + dmax) / 2.0 if dmin > dmax
          posicoes = qtd == 1 ? [(dmin + dmax) / 2.0] :
                     (0...qtd).map { |i| dmin + (dmax - dmin) * i / (qtd - 1) }
          n = fixacao_ripa(ents, fatias, bb, ax, lado_ax, dist_ax, posicoes, p, mat_madeira)
          return [n, 0]
        end

        # ── POSICIONAMENTO INTELIGENTE (anti-pirataria, v1.9.22): a grade de
        # candidatos + set cover greedy (2 rodadas por metade, viés pro lado
        # preferido, reforço espalhado, comprimento exato das barras) roda na
        # function movelParametricoCompute — o plugin manda os contornos 2D
        # das fatias (mm) e desenha as barras/furos que voltam. ──
        to_mm = 25.4
        fatias_req = fatias.map do |f|
          {
            "ci" => f[:ci].to_f * to_mm,
            "polys" => f[:polys].map { |outer, holes|
              [outer.map { |pt| [pt[0].to_f * to_mm, pt[1].to_f * to_mm] },
               holes.map { |hh| hh.map { |pt| [pt[0].to_f * to_mm, pt[1].to_f * to_mm] } }]
            }
          }
        end
        rr = solicitar_movel_servidor({
          "op" => "fixacao", "ax" => ax,
          "fix_lado" => p[:fix_lado].to_s, "fix_qtd" => p[:fix_qtd].to_i,
          "fix_duplo" => p[:fix_duplo].to_s, "fix_margem" => p[:fix_margem].to_f,
          "tipo" => tipo.to_s, "chapa" => p[:chapa].to_f,
          "bb_min" => [bb.min.x.to_f * to_mm, bb.min.y.to_f * to_mm, bb.min.z.to_f * to_mm],
          "bb_max" => [bb.max.x.to_f * to_mm, bb.max.y.to_f * to_mm, bb.max.z.to_f * to_mm],
          "fatias" => fatias_req
        })
        raise rr[:error].to_s unless rr[:ok]
        res = rr[:result]
        soltas = res["soltas"].to_i
        barras = res["barras"] || []

        d    = mm2in(p[:fix_diam])
        df   = d + 2 * mm2in(p[:fix_folga])
        mat  = tipo == 'cavilha' ? mat_madeira : mat_metal
        etiq = { 'barra' => "MP - Fixação (barra roscada)",
                 'tubo' => "MP - Fixação (tubo)",
                 'cavilha' => "MP - Fixação (cavilha)" }[tipo] || "MP - Fixação"

        barras.each do |bar|
          u  = bar["u"].to_f / to_mm
          v  = bar["v"].to_f / to_mm
          a0 = bar["a0"].to_f / to_mm
          a1 = bar["a1"].to_f / to_mm
          (bar["hits"] || []).each do |j|
            ft = fatias[j.to_i]
            next unless ft
            f = ft[:grp]
            next unless f && f.valid?
            # furo por círculo+pushpull direto na chapa — booleano subtract
            # aqui era o gargalo (milhares de fatias × barras = travamento)
            furar_fatia(f, ax, ft[:ci], chapa, lado_ax, u, dist_ax, v, df)
          end
          g = add_cilindro(ents, ax, a0, a1, lado_ax, u, dist_ax, v, d, mat)
          g.name = "fixador"
          etiquetar(g, etiq)
        end
        [barras.length, soltas]
      end

      # Chama a function movelParametricoCompute (token + retry 1x, msgs padrão).
      def self.solicitar_movel_servidor(payload)
        ns = Core::Auth::DEFAULT_NS
        id_token = Sketchup.read_default(ns, "fb_id_token", "").to_s
        if Core::Auth::OFFLINE_MODE
          return { ok: true, result: {} }
        end
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if id_token.empty?

        r = Core::FirebaseClient.call_function("movelParametricoCompute", payload, id_token)
        if !r[:ok] && r[:code].to_s == "UNAUTHENTICATED"
          refresh = Sketchup.read_default(ns, "fb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::FirebaseClient.refresh_id_token(refresh)
            if ref[:ok]
              id_token = ref[:id_token]
              Sketchup.write_default(ns, "fb_id_token", id_token)
              r = Core::FirebaseClient.call_function("movelParametricoCompute", payload, id_token)
            end
          end
        end

        unless r[:ok]
          msg = case r[:code].to_s
                when "PERMISSION_DENIED" then "Acesso negado: #{r[:error]}"
                when "UNAUTHENTICATED"   then "Sessão expirada — faça login novamente no SignEng."
                else "Sem conexão com o servidor SignEng (#{r[:error]}). Verifique sua internet e tente novamente."
                end
          return { ok: false, error: msg }
        end

        { ok: true, result: r[:result] || {} }
      end

      # Furo passante rápido: desenha o círculo na face frontal da fatia e
      # empurra (pushpull) a espessura toda — sem booleano. A fatia é um slab
      # de ci-chapa/2 a ci+chapa/2 no eixo `ax`, em coordenadas do modelo.
      def self.furar_fatia(grp, ax, ci, chapa, c1_ax, u, c2_ax, v, diam)
        ge = grp.entities
        centro = [0.0, 0.0, 0.0]
        centro[ax]    = ci + chapa / 2.0
        centro[c1_ax] = u
        centro[c2_ax] = v
        normal = [0.0, 0.0, 0.0]
        normal[ax] = 1.0
        circ = ge.add_circle(Geom::Point3d.new(*centro), Geom::Vector3d.new(*normal), diam / 2.0, 16)
        disc = circ.flat_map { |e| e.valid? ? e.faces : [] }.uniq.find do |fc|
          fc.outer_loop.edges.all? { |ed| circ.include?(ed) }
        end
        if disc
          disc.pushpull(disc.normal.to_a[ax] > 0 ? -chapa : chapa)
        else
          # círculo caiu fora/na borda do material — limpa os restos e segue
          circ.each { |e| e.erase! if e.valid? && e.faces.empty? }
        end
      rescue => e
        puts "[MovelParametrico] furo falhou (segue sem furo): #{e.message}"
      end

      # Rasgo passante rápido (ripa): desenha o retângulo do encaixe na face
      # frontal da fatia e empurra a espessura — mesma técnica do furar_fatia.
      # O pedaço do retângulo que cai FORA do material (o rasgo é aberto pra
      # borda) vira face solta e é apagado; dentro do material vira o rasgo.
      # Se o retângulo NÃO se fundir na face da fatia (add_face nem sempre
      # intersecta a borda — deixava uma "massa" no lugar do recorte), cai
      # pro corte BOOLEANO só nesta fatia.
      def self.rasgar_fatia(ents, ft, ax, chapa, lado_ax, dist_ax, lo_l, hi_l, lo_d, hi_d)
        grp   = ft[:grp]
        ci    = ft[:ci]
        polys = ft[:polys]
        ge = grp.entities
        face_ax = ci + chapa / 2.0
        corners = [[lo_l, lo_d], [hi_l, lo_d], [hi_l, hi_d], [lo_l, hi_d]].map do |l, dd|
          q = [0.0, 0.0, 0.0]
          q[ax]      = face_ax
          q[lado_ax] = l
          q[dist_ax] = dd
          Geom::Point3d.new(*q)
        end
        ge.add_face(corners)
        cross = [0, 1, 2] - [ax]
        c1, c2 = cross
        eps = mm2in(0.2)
        fallback = false
        ge.grep(Sketchup::Face).each do |f|
          next unless f.valid?
          next unless f.normal.to_a[ax].abs > 0.99
          next unless (f.bounds.center.to_a[ax] - face_ax).abs < eps
          tri = f.mesh.polygon_points_at(1)
          c = [0, 1, 2].map { |k| (tri[0].to_a[k] + tri[1].to_a[k] + tri[2].to_a[k]) / 3.0 }
          next unless c[lado_ax] > lo_l - eps && c[lado_ax] < hi_l + eps &&
                      c[dist_ax] > lo_d - eps && c[dist_ax] < hi_d + eps
          if !contem_material?(polys, c[c1], c[c2])
            f.erase!
          elsif f.edges.any? { |e| e.faces.length > 1 }
            f.pushpull(f.normal.to_a[ax] > 0 ? -chapa : chapa)
          else
            # face flutuante: retângulo não fundiu na chapa — limpa e usa booleano
            f.erase!
            fallback = true
          end
        end
        ge.grep(Sketchup::Edge).each { |e| e.erase! if e.valid? && e.faces.empty? }
        return unless fallback
        fb = grp.bounds
        lo = [0.0, 0.0, 0.0]
        hi = [0.0, 0.0, 0.0]
        lo[ax] = fb.min[ax] - mm2in(1)
        hi[ax] = fb.max[ax] + mm2in(1)
        lo[lado_ax] = lo_l
        hi[lado_ax] = hi_l
        lo[dist_ax] = lo_d
        hi[dist_ax] = hi_d
        cutter = add_caixa(ents, lo, hi, nil)
        begin
          res = cutter.subtract(grp)
          if res && res.valid?
            ft[:grp] = res
          else
            cutter.erase! if cutter && cutter.valid?
          end
        rescue => e
          puts "[MovelParametrico] rasgo booleano falhou (segue sem rasgo): #{e.message}"
          cutter.erase! if cutter && cutter.valid? rescue nil
        end
      rescue => e
        puts "[MovelParametrico] rasgo falhou (segue sem rasgo): #{e.message}"
      end

      def self.grade_linear(a, b, n)
        return [(a + b) / 2.0] if n <= 1 || b <= a
        (0...n).map { |i| a + (b - a) * i / (n - 1.0) }
      end

      # Ponto (2D) dentro do material da seção (dentro de algum contorno
      # externo e fora dos furos dele)
      def self.contem_material?(polys, u, v)
        polys.any? { |outer, holes| pip2(u, v, outer) && holes.none? { |h| pip2(u, v, h) } }
      end

      def self.pip2(u, v, poly)
        dentro = false
        j = poly.length - 1
        poly.length.times do |i|
          ui, vi = poly[i]
          uj, vj = poly[j]
          if (vi > v) != (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui
            dentro = !dentro
          end
          j = i
        end
        dentro
      end

      # Ripa/sarrafo: barra retangular encaixada em rasgo aberto pro lado
      # escolhido (rasgo = ripa_larg de profundidade a partir da face do lado)
      def self.fixacao_ripa(ents, fatias, bb, ax, lado_ax, dist_ax, posicoes, p, mat)
        rl = mm2in(p[:ripa_larg])
        re = mm2in(p[:ripa_esp])
        fg = mm2in(p[:fix_folga])
        abre_no_min = %w[frente baixo].include?(p[:fix_lado])

        # 'centro' não faz sentido pra ripa (rasgo precisa abrir numa face):
        # trata como 'tras' (abre no lado +)
        l_face = abre_no_min ? bb.min[lado_ax] : bb.max[lado_ax]
        l0 = abre_no_min ? l_face : l_face - rl
        l1 = abre_no_min ? l_face + rl : l_face

        chapa_in = mm2in(p[:chapa])
        posicoes.each do |pd|
          # rasgo em cada fatia (estende 1mm além da face pra abrir o encaixe)
          # — por retângulo+pushpull direto na chapa, sem booleano (o subtract
          # aqui era o mesmo gargalo dos furos: fatias × ripas = travamento)
          fatias.each do |ft|
            f = ft[:grp]
            next unless f && f.valid?
            lo_l = abre_no_min ? l0 - mm2in(1) : l0 - fg
            hi_l = abre_no_min ? l1 + fg       : l1 + mm2in(1)
            rasgar_fatia(ents, ft, ax, chapa_in, lado_ax, dist_ax,
                         lo_l, hi_l, pd - re / 2.0 - fg, pd + re / 2.0 + fg)
          end
          # a ripa em si, atravessando o vão todo
          lo = [0.0, 0.0, 0.0]
          hi = [0.0, 0.0, 0.0]
          lo[ax] = bb.min[ax]
          hi[ax] = bb.max[ax]
          lo[lado_ax] = l0
          hi[lado_ax] = l1
          lo[dist_ax] = pd - re / 2.0
          hi[dist_ax] = pd + re / 2.0
          g = add_caixa(ents, lo, hi, mat)
          g.name = "ripa"
          etiquetar(g, "MP - Fixação (ripa)")
        end
        posicoes.length
      end

      # ── Reparo automático de sólido (estilo Solid Inspector, simplificado) ─
      # Passes: apaga arestas soltas → recria faces que faltam (find_faces) →
      # fecha furos com contorno PLANO. Repete até 3 vezes ou virar sólido.
      def self.reparar_solido(ent)
        return false unless ent.respond_to?(:manifold?)
        d = ent.definition rescue nil
        return false unless d
        es = d.entities
        3.times do
          return true if ent.manifold?
          # arestas soltas (sem nenhuma face)
          es.grep(Sketchup::Edge).each { |e| e.erase! if e.valid? && e.faces.empty? }
          # tenta recriar faces a partir das arestas de borda
          es.grep(Sketchup::Edge).each do |e|
            next unless e.valid? && e.faces.length == 1
            e.find_faces rescue nil
          end
          # fecha furos cujo contorno de borda forma um loop plano
          bordas = es.grep(Sketchup::Edge).select { |e| e.valid? && e.faces.length == 1 }
          fechar_loops(es, bordas) if bordas.any?
        end
        ent.manifold?
      rescue => e
        puts "[MovelParametrico] reparar_solido falhou: #{e.message}"
        false
      end

      # Encadeia arestas de borda em loops fechados e tenta criar a face
      def self.fechar_loops(es, bordas)
        borda_set = {}
        bordas.each { |e| borda_set[e] = true }
        visit = {}
        bordas.each do |e0|
          next if visit[e0] || !e0.valid?
          cadeia = [e0]
          visit[e0] = true
          v_ini = e0.start
          v = e0.end
          guard = 0
          while v != v_ini && guard < 1000
            guard += 1
            prox = v.edges.find { |e| borda_set[e] && !visit[e] && e.valid? }
            break unless prox
            visit[prox] = true
            cadeia << prox
            v = (prox.start == v) ? prox.end : prox.start
          end
          if v == v_ini && cadeia.length >= 3
            begin
              es.add_face(cadeia)
            rescue
              # contorno não-plano — deixa pro usuário
            end
          end
        end
      end

      # ── Primitivas ────────────────────────────────────────────────────────

      # Caixa alinhada aos eixos a partir de cantos lo/hi ([x,y,z])
      def self.add_caixa(ents, lo, hi, mat)
        grp = ents.add_group
        ge  = grp.entities
        f   = ge.add_face([
          Geom::Point3d.new(lo[0], lo[1], lo[2]), Geom::Point3d.new(hi[0], lo[1], lo[2]),
          Geom::Point3d.new(hi[0], hi[1], lo[2]), Geom::Point3d.new(lo[0], hi[1], lo[2])
        ])
        f.reverse! if f.normal.z < 0
        f.pushpull(hi[2] - lo[2])
        grp.material = mat if mat
        grp
      end

      # Cilindro ao longo do eixo `ax`, de a0 a a1, centrado nas coordenadas
      # transversais (c1_ax → c1, c2_ax → c2)
      def self.add_cilindro(ents, ax, a0, a1, c1_ax, c1, c2_ax, c2, diam, mat)
        grp = ents.add_group
        ge  = grp.entities
        centro = [0.0, 0.0, 0.0]
        centro[ax]    = a0
        centro[c1_ax] = c1
        centro[c2_ax] = c2
        normal = [0.0, 0.0, 0.0]
        normal[ax] = 1.0
        circ = ge.add_circle(Geom::Point3d.new(*centro), Geom::Vector3d.new(*normal), diam / 2.0, 24)
        f = ge.add_face(circ)
        f.reverse! if f.normal.to_a[ax] < 0
        f.pushpull(a1 - a0)
        suavizar(grp)
        grp.material = mat if mat
        grp
      end

      # Suaviza as facetas da curvatura (cilindros e superfícies do sólido)
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
        puts "[MovelParametrico] suavizar falhou: #{err.message}"
      end

      # Etiqueta (tag/layer) por tipo de peça — cria se não existir
      def self.etiquetar(grp, nome)
        return unless grp && grp.valid?
        grp.layer = Sketchup.active_model.layers.add(nome)
      rescue => e
        puts "[MovelParametrico] etiquetar '#{nome}' falhou: #{e.message}"
      end

      # Material ACM idêntico ao do Auto-ACM (nome "ACM_<cor>", .skm real via
      # Generator.load_acm_material; NÃO sobrescrever a cor se veio do .skm)
      def self.acm_material(cor_nome, rgb)
        model = Sketchup.active_model
        nome  = "ACM_#{cor_nome}"
        m = model.materials[nome]
        return m if m
        Generator.load_acm_material(model, nome, cor_nome.to_s, rgb)
      rescue => e
        puts "[MovelParametrico] acm_material falhou (#{e.message}) — fallback RGB"
        material_rgb(nome, rgb)
      end

      def self.material_rgb(nome, rgb, alpha = 1.0)
        mats = Sketchup.active_model.materials
        m = mats[nome] || mats.add(nome)
        m.color = Sketchup::Color.new(rgb[0].to_i, rgb[1].to_i, rgb[2].to_i)
        m.alpha = alpha
        m
      end

    end # MovelParametrico
  end
end
