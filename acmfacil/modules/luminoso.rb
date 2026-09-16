# encoding: UTF-8
# ═══════════════════════════════════════════════════════════════════════════
# ACMFacil — Luminoso (ferramenta de toolbar)
# ═══════════════════════════════════════════════════════════════════════════
# Gera luminoso em ACM: redondo / quadrado / retangular (canto arredondado),
# dupla-face ou face única, com corpo (arco), tampas (borda externa + testa),
# acrílico (leitoso ou cristal), braço de suporte em metalon com chapa de
# parede, chapa interna, parafusos e folgas configuráveis.
#
# O luminoso nasce como COMPONENTE com os params gravados em attribute
# dictionary ('acmfacil_luminoso') — dá pra selecionar um já gerado, carregar
# os valores no painel, editar e REGENERAR NO LUGAR (preserva a posição).
#
# Orientação de construção: frente = -Y (convenção de fachada do plugin),
# largura em X, altura em Z, centrado na origem; a instância é posicionada
# com a base no z=0.
# ═══════════════════════════════════════════════════════════════════════════

module ACMFacil
  module Generator
    module Luminoso

      DICT = 'acmfacil_luminoso'
      TAU  = Math::PI * 2

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
          dialog_title:    "ACMFacil — Luminoso",
          preferences_key: "com.acmfacil.luminoso",
          width:           440,
          height:          760,
          min_width:       400,
          min_height:      560,
          resizable:       true,
          style:           UI::HtmlDialog::STYLE_DIALOG
        )
        @dialog.set_file(File.join(ACMFacil::UI_DIR, 'tools', 'luminoso', 'index.html'))
        registrar_callbacks(@dialog)
        @dialog.set_on_closed { @dialog = nil }
        @dialog.show
      end

      # ── Callbacks (padrão Bridge, diálogo próprio) ────────────────────────
      def self.registrar_callbacks(dlg)
        dlg.add_action_callback("luminoso_ctx") do |_ctx, json|
          data  = ACMFacil.parse_payload(json)
          lang  = Sketchup.read_default(ACMFacil::DEFAULT_NS, "lang", "pt").to_s
          lang  = "pt" unless %w[pt es en].include?(lang)
          theme = Sketchup.read_default(ACMFacil::DEFAULT_NS, "theme", "light").to_s
          theme = "light" unless %w[light dark].include?(theme)

          cores_cat = {}
          ordem_cat = []
          CORES_ACM.each do |nome, info|
            cat = info[:cat].to_s
            ordem_cat << cat unless ordem_cat.include?(cat)
            cores_cat[cat] ||= []
            cores_cat[cat] << { nome: nome, rgb: info[:rgb] }
          end

          ACMFacil.resolver(dlg, data["id"], {
            ok: true, lang: lang, theme: theme, version: Core::VERSION,
            cores: cores_cat, ordem_cat: ordem_cat
          })
        end

        # Carrega params de um luminoso selecionado (pra edição)
        dlg.add_action_callback("luminoso_carregar") do |_ctx, json|
          data = ACMFacil.parse_payload(json)
          begin
            sel = Sketchup.active_model.selection.to_a.find do |e|
              (e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)) &&
                e.get_attribute(DICT, 'params')
            end
            if sel.nil?
              ACMFacil.resolver(dlg, data["id"], { ok: false, code: "luminoso.nada_selecionado" })
            else
              params = JSON.parse(sel.get_attribute(DICT, 'params').to_s) rescue {}
              ACMFacil.resolver(dlg, data["id"], { ok: true, entity_id: sel.entityID, params: params })
            end
          rescue => e
            ACMFacil.resolver(dlg, data["id"], { ok: false, code: "luminoso.carregar_exception", error: e.message })
          end
        end

        # Cadastro da empresa (logo, razão social...) pro plano de corte —
        # mesmo arquivo do shell principal (empresa.json)
        dlg.add_action_callback("luminoso_empresa") do |_ctx, json|
          data = ACMFacil.parse_payload(json)
          begin
            path = ACMFacil.empresa_file_path
            empresa = File.exist?(path) ? JSON.parse(File.read(path, mode: 'rb:UTF-8')) : {}
            ACMFacil.resolver(dlg, data["id"], { ok: true, empresa: empresa })
          rescue => e
            ACMFacil.resolver(dlg, data["id"], { ok: true, empresa: {} })
          end
        end

        # Salva o Plano de Corte (HTML pronto pra imprimir em PDF) e abre
        # no navegador — mesmo padrão do autoacm_salvar_plano
        dlg.add_action_callback("luminoso_salvar_plano") do |_ctx, json|
          data = ACMFacil.parse_payload(json)
          begin
            name = data["name"].to_s.gsub(/[^a-zA-Z0-9_\-]/, '_')
            name = "Plano_Luminoso" if name.empty?
            content = Base64.decode64(data["content"].to_s)
            path = UI.savepanel("Salvar Plano de Corte", Dir.home, "#{name}.html")
            if path.nil?
              ACMFacil.resolver(dlg, data["id"], { ok: false, code: "user_cancelled" })
            else
              path += ".html" unless path.downcase.end_with?(".html", ".htm")
              File.open(path, 'wb') { |f| f.write(content) }
              puts "[Luminoso] Plano salvo: #{path} (#{content.bytesize} bytes)"
              begin
                UI.openURL("file:///" + path.gsub('\\', '/'))
              rescue => open_err
                puts "[Luminoso] Aviso: nao foi possivel abrir o plano: #{open_err.message}"
              end
              ACMFacil.resolver(dlg, data["id"], { ok: true, path: File.basename(path) })
            end
          rescue => e
            ACMFacil.resolver(dlg, data["id"], { ok: false, code: "luminoso.plano_error", error: e.message })
          end
        end

        # Vistas do luminoso gerado (frente/fundo/lateral/topo/iso) em PNG
        # base64 pro plano de corte
        dlg.add_action_callback("luminoso_snapshots") do |_ctx, json|
          data = ACMFacil.parse_payload(json)
          begin
            eid = data["entity_id"].to_i
            ent = Sketchup.active_model.find_entity_by_id(eid) rescue nil
            if ent && ent.valid?
              ACMFacil.resolver(dlg, data["id"], snapshots(ent))
            else
              ACMFacil.resolver(dlg, data["id"], { ok: false, code: "luminoso.sem_entidade" })
            end
          rescue => e
            ACMFacil.resolver(dlg, data["id"], { ok: false, code: "luminoso.snap_error", error: e.message })
          end
        end

        # Salva arquivo de corte (SVG ou DXF, gerado no JS, base64) via savepanel
        dlg.add_action_callback("luminoso_salvar_svg") do |_ctx, json|
          data = ACMFacil.parse_payload(json)
          begin
            name = data["name"].to_s.gsub(/[^a-zA-Z0-9_\-]/, '_')
            name = "luminoso_corte" if name.empty?
            ext = data["ext"].to_s.downcase
            ext = "svg" unless %w[svg dxf].include?(ext)
            content = Base64.decode64(data["content"].to_s)
            path = UI.savepanel("Salvar Arquivo de Corte", Dir.home, "#{name}.#{ext}")
            if path.nil?
              ACMFacil.resolver(dlg, data["id"], { ok: false, code: "user_cancelled" })
            else
              path += ".#{ext}" unless path.downcase.end_with?(".#{ext}")
              File.open(path, 'wb') { |f| f.write(content) }
              puts "[Luminoso] Corte salvo: #{path} (#{content.bytesize} bytes)"
              ACMFacil.resolver(dlg, data["id"], { ok: true, path: File.basename(path) })
            end
          rescue => e
            ACMFacil.resolver(dlg, data["id"], { ok: false, code: "luminoso.svg_error", error: e.message })
          end
        end

        dlg.add_action_callback("luminoso_gerar") do |_ctx, json|
          data = ACMFacil.parse_payload(json)
          begin
            v = Core::Auth.assert_valid!
            unless v[:ok]
              ACMFacil.resolver(dlg, data["id"], v.merge(blocked: true))
              next
            end
            params = data["params"] || {}
            eid    = data["entity_id"].to_i
            result = gerar(extrair(params), eid > 0 ? eid : nil)
            ACMFacil.resolver(dlg, data["id"], result)
          rescue => e
            Sketchup.active_model.abort_operation rescue nil
            ACMFacil.resolver(dlg, data["id"], {
              ok: false, code: "luminoso.gerar_exception",
              error: e.message, trace: e.backtrace.first(5)
            })
          end
        end
      end

      # ── Params: defaults (§17 — sincronizar com _defaultParams do JS) ─────
      def self.extrair(p)
        g = ->(k, d) { v = p[k.to_s]; v.nil? ? d : v }
        {
          formato:     g.(:formato, 'redondo').to_s,          # redondo|quadrado|retangular
          larg:        g.(:larg, 500).to_f,                   # Ø ou largura (mm)
          alt:         g.(:alt, 500).to_f,                    # altura (retangular)
          raio:        g.(:raio, 0).to_f,                     # raio de canto (quadrado/ret)
          acm:         g.(:acm, 3).to_f,                      # espessura ACM 2/3/4/5
          arco_larg:   g.(:arco_larg, 100).to_f,              # profundidade do corpo
          emendas:     g.(:emendas, 1).to_i,                  # emendas do arco
          borda_face:  g.(:borda_face, 7).to_f,               # moldura visível na frente
          borda_ext:   g.(:borda_ext, 25).to_f,               # o quanto a tampa veste o arco
          folga_tampa: g.(:folga_tampa, 1).to_f,              # folga tampa × arco
          dupla:       g.(:dupla, true) ? true : false,
          acr_esp:     g.(:acr_esp, 2).to_f,
          acr_tipo:    g.(:acr_tipo, 'leitoso').to_s,         # leitoso|cristal
          cor_arco_nome:  g.(:cor_arco_nome, 'Preto Brilho (VX151)').to_s,
          cor_arco_rgb:   g.(:cor_arco_rgb, [25, 25, 25]),
          cor_borda_nome: g.(:cor_borda_nome, 'Vermelho Brilho (VX502)').to_s,
          cor_borda_rgb:  g.(:cor_borda_rgb, [220, 8, 8]),
          suporte:     g.(:suporte, true) ? true : false,  # false = só chapas de ACM (sem braço/metalon/chapa interna)
          # Fundo do modelo FACE ÚNICA (v1.9.26): 'tampa' = fundo cego atual;
          # 'embutido' = chapa por dentro, rente à traseira, com folga por lado
          fundo_tipo:  g.(:fundo_tipo, 'tampa').to_s,
          fundo_folga: g.(:fundo_folga, 2).to_f,   # da PAREDE INTERNA (ref: 504→500)
          fundo_esp:   g.(:fundo_esp, 10).to_f,
          # Bilongos (rasgos de pendurar) no fundo embutido
          bilongo_on:   g.(:bilongo_on, false) ? true : false,
          bilongo_tipo: g.(:bilongo_tipo, 'normal').to_s,   # normal|cruz
          bilongo_furo: g.(:bilongo_furo, 16).to_f,          # Ø do furo
          bilongo_comp: g.(:bilongo_comp, 38).to_f,          # comprimento TOTAL do rasgo
          bilongo_larg: g.(:bilongo_larg, 8).to_f,           # largura da cava
          bilongo_pos:  g.(:bilongo_pos, 'superior').to_s,   # superior|inferior|central
          cruz_w:       g.(:cruz_w, 46).to_f,
          cruz_h:       g.(:cruz_h, 44).to_f,
          bilongo_qtd:  g.(:bilongo_qtd, 2).to_i,
          bilongo_dist: g.(:bilongo_dist, 250).to_f,         # entre centros
          bilongo_alt:  g.(:bilongo_alt, 100).to_f,          # centro do furo acima do centro do fundo
          braco:       g.(:braco, true) ? true : false,
          braco_lado:  g.(:braco_lado, 'direita').to_s,       # direita|esquerda
          braco_duplo: g.(:braco_duplo, false) ? true : false, # 2 braços paralelos
          braco_dist:  g.(:braco_dist, 300).to_f,             # distância centro a centro
          chapa_modo:  g.(:chapa_modo, 'unica').to_s,         # unica|duas (parede+interna)
          braco_ext:   g.(:braco_ext, 60).to_f,               # comprimento fora do luminoso
          metalon:     g.(:metalon, 25).to_f,                 # perfil quadrado (mm)
          folga_furo:  g.(:folga_furo, 2).to_f,               # folga do furo do braço
          cint_larg:   g.(:cint_larg, 50).to_f,               # chapa interna (altura Z)
          cint_esp:    g.(:cint_esp, 50).to_f,                # chapa interna (profundidade Y)
          cint_comp:   g.(:cint_comp, 0).to_f,                # 0 = auto (vão interno)
          cext_larg:   g.(:cext_larg, 175).to_f,              # chapa parede (horizontal Y)
          cext_alt:    g.(:cext_alt, 75).to_f,                # chapa parede (vertical Z)
          cext_esp:    g.(:cext_esp, 2).to_f,
          pb_qtd:      g.(:pb_qtd, 8).to_i,                   # parafusos por tampa
          pce_qtd:     g.(:pce_qtd, 4).to_i,                  # parafusos chapa parede
          pci_qtd:     g.(:pci_qtd, 2).to_i,                  # parafusos chapa interna (por lado)
          # Ø da cabeça: separado borda × chapas (compat: paraf_d antigo vale pros dois)
          paraf_d_borda: (g.(:paraf_d_borda, nil) || g.(:paraf_d, 10)).to_f,
          paraf_d_chapa: (g.(:paraf_d_chapa, nil) || g.(:paraf_d, 10)).to_f,
          # Distância dos parafusos até as bordas das chapas (alinhamento)
          paraf_dist_lat: g.(:paraf_dist_lat, 12).to_f,     # das bordas laterais
          paraf_dist_tb:  g.(:paraf_dist_tb, 12).to_f,      # das bordas topo/baixo
          paraf_orient:   g.(:paraf_orient, 'horizontal').to_s # distribuição da grade
        }
      end

      # ── Geração / regeneração ─────────────────────────────────────────────
      def self.gerar(p, entity_id = nil)
        model = Sketchup.active_model
        inst  = nil
        if entity_id
          ent = model.find_entity_by_id(entity_id) rescue nil
          inst = ent if ent && ent.valid? && ent.is_a?(Sketchup::ComponentInstance)
        end

        model.start_operation("Gerar Luminoso ACMFacil", true)
        novo = inst.nil?

        if novo
          defn = model.definitions.add("ACMFacil Luminoso")
        else
          defn = inst.definition
          defn.entities.clear!
        end

        construir(defn.entities, p)

        if novo
          alt_total = mm2in(p[:formato] == 'retangular' ? p[:alt] : p[:larg]) +
                      2 * mm2in(p[:folga_tampa] + p[:acm])
          tr   = Geom::Transformation.translation([0, 0, alt_total / 2.0])
          inst = model.active_entities.add_instance(defn, tr)
        end

        inst.name = "Luminoso #{p[:larg].round}x#{(p[:formato] == 'retangular' ? p[:alt] : p[:larg]).round}"
        inst.set_attribute(DICT, 'params', JSON.generate(p))
        model.commit_operation

        sel = model.selection
        sel.clear
        sel.add(inst)
        model.active_view.zoom(sel.to_a) if novo

        { ok: true, entity_id: inst.entityID, novo: novo }
      rescue => e
        model.abort_operation rescue nil
        { ok: false, code: "luminoso.construir_error", error: e.message, trace: e.backtrace.first(5) }
      end

      def self.mm2in(mm)
        mm.to_f / 25.4
      end

      # ── Construção (tudo em polegadas, centrado na origem) ───────────────
      def self.construir(ents, p)
        w    = mm2in(p[:larg])
        h    = p[:formato] == 'retangular' ? mm2in(p[:alt]) : w
        r    = p[:formato] == 'redondo' ? 0 : mm2in(p[:raio])
        acm  = mm2in(p[:acm])
        arco = mm2in(p[:arco_larg])
        fol  = mm2in(p[:folga_tampa])
        bf   = mm2in(p[:borda_face])
        be   = mm2in(p[:borda_ext])
        acr  = mm2in(p[:acr_esp])

        # tampa: dimensões externas (veste o arco com folga)
        tw = w + 2 * (fol + acm)
        th = h + 2 * (fol + acm)
        tr_c = r > 0 ? r + fol + acm : 0

        # Mesmo padrão do Auto-ACM: carrega o .skm real da VISUALMAXX quando
        # existe (material com textura, pronto pra render); fallback RGB.
        mat_arco  = acm_material(p[:cor_arco_nome],  p[:cor_arco_rgb])
        mat_borda = acm_material(p[:cor_borda_nome], p[:cor_borda_rgb])
        mat_metal = material_rgb("ACMFacil Metal", [90, 90, 90])
        mat_acr   = p[:acr_tipo] == 'cristal' ?
                    material_rgb("Acrílico cristal", [225, 232, 238], 0.35) :
                    material_rgb("Acrílico leitoso", [246, 246, 244], 0.75)

        # ── CORPO (arco) ──
        corpo = add_anel(ents, p[:formato], w, h, r, acm, -arco / 2.0, arco, mat_arco)
        corpo.name = "corpo"
        etiquetar(corpo, "LUM - Corpo (arco)")

        # ── BRAÇO + FURO + CHAPAS + CHAPA INTERNA ── (só com o suporte ligado)
        # Lados superior/inferior usam o TRUQUE DO FRAME GIRADO: o corpo é
        # girado ∓90° no eixo Y, o suporte é construído com o código de
        # sempre (como 'direita', com largura↔altura trocadas), e no fim o
        # corpo + as peças novas voltam girados pro lado certo. As funções
        # originais ficam intactas.
        if p[:suporte]
          lado = p[:braco_lado].to_s
          vert = (lado == 'superior' || lado == 'inferior')
          if vert
            ang     = lado == 'superior' ? -Math::PI / 2 : Math::PI / 2
            rot     = Geom::Transformation.rotation(ORIGIN, Y_AXIS, ang)
            rot_inv = Geom::Transformation.rotation(ORIGIN, Y_AXIS, -ang)
            # Rastreia por entityID (não por referência): os booleanos do furo
            # DELETAM/substituem grupos e comparar referência deletada estoura
            # "reference to deleted Entities".
            antes_ids = {}
            ents.to_a.each { |e| antes_ids[e.entityID] = true }
            corpo.transform!(rot_inv)
            p2 = p.merge(braco_lado: 'direita')
            corpo = braco_e_suporte(ents, p2, h, w, th, arco, acm, mat_metal, corpo) if p[:braco]
            chapa_interna(ents, p2, h, acm, mat_metal)
            corpo_id = (corpo && corpo.valid?) ? corpo.entityID : nil
            corpo.transform!(rot) if corpo_id
            ents.to_a.each do |g|
              next unless g.valid?
              next if antes_ids[g.entityID]
              next if corpo_id && g.entityID == corpo_id
              g.transform!(rot)
            end
          else
            corpo = braco_e_suporte(ents, p, w, h, tw, arco, acm, mat_metal, corpo) if p[:braco]
            chapa_interna(ents, p, w, acm, mat_metal)
          end
        end

        # Re-suaviza e re-etiqueta o corpo (o booleano do furo recria a geometria)
        if corpo && corpo.valid?
          suavizar(corpo)
          etiquetar(corpo, "LUM - Corpo (arco)")
        end

        # ── EMENDAS do arco (linhas de junta DURAS na superfície suavizada) ──
        if p[:emendas] > 0 && corpo && corpo.valid?
          p[:emendas].times do |i|
            frac = i.to_f / p[:emendas]
            px, pz, = ponto_perimetro(p[:formato], w, h, r, frac)
            a = Geom::Point3d.new(px, -arco / 2.0, pz)
            b = Geom::Point3d.new(px,  arco / 2.0, pz)
            begin
              novas = corpo.entities.add_edges(a, b)
              (novas || []).each do |ed|
                next unless ed.is_a?(Sketchup::Edge)
                ed.soft   = false
                ed.smooth = false
              end
            rescue => e
              puts "[Luminoso] emenda #{i} falhou: #{e.message}"
            end
          end
        end

        # ── TAMPA FRONTAL (sempre tem acrílico) ──
        tampa(ents, p, w, h, r, tw, th, tr_c, arco, acm, bf, be, acr, -1, true,  mat_borda, mat_acr)

        # ── TAMPA TRASEIRA: dupla-face = igual; face única = fundo cego OU
        # fundo EMBUTIDO (chapa por dentro com folga + bilongos de pendurar) ──
        if p[:dupla] || p[:fundo_tipo] != 'embutido'
          tampa(ents, p, w, h, r, tw, th, tr_c, arco, acm, bf, be, acr, +1, p[:dupla], mat_borda, mat_acr)
        else
          fundo_embutido(ents, p, w, h, r, arco, mat_borda)
        end

        # (chapa interna agora é gerada junto do bloco de suporte acima,
        #  pra girar junto quando o lado é superior/inferior)
      end

      # Uma tampa completa (lado s: -1 frente, +1 trás).
      # com_acr=true → testa com abertura + acrílico; false → fundo cego.
      def self.tampa(ents, p, w, h, r, tw, th, tr_c, arco, acm, bf, be, acr, s, com_acr, mat_borda, mat_acr)
        if com_acr
          y_face = s * (arco / 2.0 + acm + acr)   # superfície externa da tampa
          y_test = [y_face, y_face - s * acm].minmax
          y_acr  = [y_face - s * acm, y_face - s * (acm + acr)].minmax
          y_bext = [y_face - s * acm, y_face - s * (acm + be)].minmax

          # testa (anel com abertura)
          ab_w = tw - 2 * bf
          ab_h = th - 2 * bf
          ab_r = tr_c > bf ? tr_c - bf : 0
          g = add_anel_ab(ents, p[:formato], tw, th, tr_c, ab_w, ab_h, ab_r, y_test[0], y_test[1] - y_test[0], mat_borda)
          g.name = s < 0 ? "testa_frontal" : "testa_traseira"
          etiquetar(g, s < 0 ? "LUM - Testa frente" : "LUM - Testa trás")

          # acrílico (placa cheia, mesmas dims do corpo)
          g = add_placa(ents, p[:formato], w, h, r, y_acr[0], y_acr[1] - y_acr[0], mat_acr)
          g.name = s < 0 ? "acrilico_frontal" : "acrilico_traseiro"
          etiquetar(g, s < 0 ? "LUM - Acrílico frente" : "LUM - Acrílico trás")
        else
          # fundo cego: placa cheia em ACM no plano da face
          y_face = s * (arco / 2.0 + acm)
          y_fund = [y_face, y_face - s * acm].minmax
          y_bext = [y_face - s * acm, y_face - s * (acm + be)].minmax

          g = add_placa(ents, p[:formato], tw, th, tr_c, y_fund[0], y_fund[1] - y_fund[0], mat_borda)
          g.name = "fundo_cego"
          etiquetar(g, "LUM - Fundo cego")
        end

        # borda externa (anel que veste o arco)
        g = add_anel(ents, p[:formato], tw, th, tr_c, acm, y_bext[0], y_bext[1] - y_bext[0], mat_borda)
        g.name = s < 0 ? "borda_frontal" : "borda_traseira"
        etiquetar(g, s < 0 ? "LUM - Borda frente" : "LUM - Borda trás")

        # parafusos da borda (radiais, no meio da borda externa)
        if p[:pb_qtd] > 0
          yc = (y_bext[0] + y_bext[1]) / 2.0
          p[:pb_qtd].times do |i|
            frac = (i + 0.5) / p[:pb_qtd]
            px, pz, nx, nz = ponto_perimetro(p[:formato], tw, th, tr_c, frac)
            add_parafuso(ents, Geom::Point3d.new(px, yc, pz),
                         Geom::Vector3d.new(nx, 0, nz), mm2in(p[:paraf_d_borda]))
          end
        end
      end

      # ── FUNDO EMBUTIDO (face única): chapa por dentro do corpo, rente à
      # traseira, com folga por lado. Bilongos (rasgos de pendurar) opcionais
      # atravessando a chapa: normal (furo + cava) ou em cruz. ──
      def self.fundo_embutido(ents, p, w, h, r, arco, mat_borda)
        fg  = mm2in(p[:fundo_folga])
        esp = mm2in(p[:fundo_esp])
        acm = mm2in(p[:acm])
        # Folga medida da PAREDE INTERNA do arco (desconta o ACM): no modelo
        # de referência, corpo 510 c/ ACM 3 → interna 504 → fundo 500 = folga 2.
        ins = acm + fg
        fw = w - 2 * ins
        fh = h - 2 * ins
        fr = r > ins ? r - ins : 0
        return if fw <= 0 || fh <= 0 || esp <= 0
        y0 = arco / 2.0 - esp   # rente à borda traseira do corpo, crescendo pra dentro

        grp = add_placa(ents, p[:formato], fw, fh, fr, y0, esp, mat_borda)
        grp.name = "fundo_embutido"
        etiquetar(grp, "LUM - Fundo")

        return grp unless p[:bilongo_on]

        ge = grp.entities
        yface = y0 + esp
        qtd  = [[p[:bilongo_qtd].to_i, 1].max, 4].min
        dist = mm2in(p[:bilongo_dist])
        alt  = mm2in(p[:bilongo_alt])
        xs = qtd == 1 ? [0.0] : (0...qtd).map { |i| -dist * (qtd - 1) / 2.0 + i * dist }
        xs.each do |bx|
          begin
            pts2 =
              if p[:bilongo_tipo] == 'cruz'
                cruz_pts(mm2in(p[:cruz_w]), mm2in(p[:cruz_h]), mm2in(p[:bilongo_larg]))
              else
                bilongo_pts(mm2in(p[:bilongo_furo]), mm2in(p[:bilongo_comp]),
                            mm2in(p[:bilongo_larg]), p[:bilongo_pos])
              end
            face_pts = pts2.map { |px2, pz2| Geom::Point3d.new(bx + px2, yface, alt + pz2) }
            f2 = ge.add_face(face_pts)
            next unless f2
            f2.reverse! if f2.normal.y < 0
            f2.pushpull(-esp)
          rescue => e
            puts "[Luminoso] bilongo falhou (segue sem este rasgo): #{e.message}"
          end
        end
        grp
      end

      # Contorno do bilongo NORMAL (furo Ø + cava de largura larg), centrado
      # no FURO em (0,0), plano XZ. pos: 'superior' = furo no topo (cava
      # desce) · 'inferior' = furo embaixo (cava sobe) · 'central' = cava dos
      # dois lados. comp = comprimento TOTAL do rasgo (como no modelo do
      # Marcelo: 16×32/38/54).
      def self.bilongo_pts(furo_d, comp, larg, pos)
        rf = furo_d / 2.0
        rc = [larg / 2.0, rf - mm2in(0.5)].min
        rc = mm2in(1) if rc < mm2in(1)
        yt = Math.sqrt([rf * rf - rc * rc, 0].max)
        alpha = Math.atan2(yt, rc)
        pts = []
        arc = lambda do |ccx, ccz, rr, a0, a1, n|
          (0..n).each { |k| a = a0 + (a1 - a0) * k / n; pts << [ccx + rr * Math.cos(a), ccz + rr * Math.sin(a)] }
        end

        if pos == 'central'
          dcap = [comp / 2.0 - rc, yt + rc].max
          pts << [rc, yt]
          pts << [rc, dcap]
          arc.call(0, dcap, rc, 0.0, Math::PI, 12)                       # tampa de cima
          pts << [-rc, yt]
          arc.call(0, 0, rf, Math::PI - alpha, Math::PI + alpha, 10)     # bojo esquerdo do furo
          pts << [-rc, -dcap]
          arc.call(0, -dcap, rc, Math::PI, Math::PI * 2, 12)             # tampa de baixo
          pts << [rc, -yt]
          arc.call(0, 0, rf, -alpha, alpha, 10)                          # bojo direito do furo
        else
          # base: furo embaixo, cava SOBE (inferior); superior = espelho em Z
          dcap = [comp - rf - rc, yt + rc].max
          pts << [rc, yt]
          pts << [rc, dcap]
          arc.call(0, dcap, rc, 0.0, Math::PI, 12)                       # tampa da cava
          pts << [-rc, yt]
          arc.call(0, 0, rf, Math::PI - alpha, Math::PI * 2 + alpha, 20) # arco grande do furo
          pts = pts.map { |x, z| [x, -z] } if pos == 'superior'
        end

        # remove pontos consecutivos duplicados (tolerância curta)
        limpo = []
        pts.each do |pt|
          last = limpo.last
          limpo << pt if last.nil? || (pt[0] - last[0]).abs > 1e-6 || (pt[1] - last[1]).abs > 1e-6
        end
        limpo.pop if limpo.length > 2 &&
                     (limpo.first[0] - limpo.last[0]).abs < 1e-6 &&
                     (limpo.first[1] - limpo.last[1]).abs < 1e-6
        limpo
      end

      # Contorno do bilongo EM CRUZ (sinal de +): largura total w, altura
      # total h, braços com a largura da cava. Centrado em (0,0).
      def self.cruz_pts(w, h, larg)
        hw = w / 2.0
        hh = h / 2.0
        s  = [larg / 2.0, hw - mm2in(0.5), hh - mm2in(0.5)].min
        s  = mm2in(1) if s < mm2in(1)
        [
          [s, s], [s, hh], [-s, hh], [-s, s],
          [-hw, s], [-hw, -s], [-s, -s], [-s, -hh],
          [s, -hh], [s, -s], [hw, -s], [hw, s]
        ]
      end

      # X da parede interna do arco na altura z (no redondo acompanha a curva)
      def self.parede_x(p, w, acm, z)
        ri = w / 2.0 - acm
        if p[:formato] == 'redondo'
          v = ri * ri - z * z
          v > 0 ? Math.sqrt(v) : ri * 0.3
        else
          ri
        end
      end

      # Braço(s) em metalon + furo(s) no corpo + chapa(s) de parede.
      # Braço duplo: 2 braços separados por braco_dist (centro a centro),
      # chapa de parede única (cobrindo os dois) ou duas, conforme chapa_modo.
      def self.braco_e_suporte(ents, p, w, h, tw, arco, acm, mat_metal, corpo)
        m     = mm2in(p[:metalon])
        ff    = mm2in(p[:folga_furo])
        side  = p[:braco_lado] == 'esquerda' ? -1 : 1
        ce    = mm2in(p[:cint_esp])
        x_out = side * (tw / 2.0 + mm2in(p[:braco_ext]))   # ambos terminam no mesmo plano

        zs = p[:braco_duplo] ? [mm2in(p[:braco_dist]) / 2.0, -mm2in(p[:braco_dist]) / 2.0] : [0.0]

        zs.each do |zc|
          # furo no corpo na altura zc (booleano; se falhar, segue interpenetrado)
          cutter = nil
          begin
            folg = m + 2 * ff
            cx0 = side * (parede_x(p, w, acm, zc) - ce - mm2in(5))
            cx1 = side * (tw / 2.0 + mm2in(5))
            cutter = add_caixa(ents, [cx0, cx1].min, [cx0, cx1].max,
                               -folg / 2.0, folg / 2.0, zc - folg / 2.0, zc + folg / 2.0, nil)
            res = cutter.subtract(corpo)
            corpo = res if res && res.valid?
          rescue => e
            puts "[Luminoso] furo do braço falhou (segue sem furo): #{e.message}"
            cutter.erase! if cutter && cutter.valid? rescue nil
          end

          # braço: da chapa interna oposta (na altura dele) até fora do luminoso
          x_in = -side * (parede_x(p, w, acm, zc) - ce)
          g = add_caixa(ents, [x_in, x_out].min, [x_in, x_out].max,
                        -m / 2.0, m / 2.0, zc - m / 2.0, zc + m / 2.0, mat_metal)
          g.name = "braco"
          etiquetar(g, "LUM - Braço")
        end

        # chapa(s) de parede (plano YZ na ponta dos braços)
        ce2 = mm2in(p[:cext_esp])
        cl  = mm2in(p[:cext_larg])
        ca  = mm2in(p[:cext_alt])
        placas =
          if p[:braco_duplo] && p[:chapa_modo] == 'duas'
            zs.map { |zc| [zc, ca] }
          elsif p[:braco_duplo]
            [[0.0, mm2in(p[:braco_dist]) + ca]]  # única: cobre os dois braços
          else
            [[0.0, ca]]
          end
        placas.each do |zc, alt_pl|
          x0 = x_out
          x1 = x_out + side * ce2
          g = add_caixa(ents, [x0, x1].min, [x0, x1].max,
                        -cl / 2.0, cl / 2.0, zc - alt_pl / 2.0, zc + alt_pl / 2.0, mat_metal)
          g.name = "chapa_parede"
          etiquetar(g, "LUM - Chapa parede")

          # parafusos em GRADE alinhada, inset pelas distâncias de borda
          if p[:pce_qtd] > 0
            pw = cl - 2 * mm2in(p[:paraf_dist_lat])
            ph = alt_pl - 2 * mm2in(p[:paraf_dist_tb])
            if pw > 0 && ph > 0
              grade_parafusos(pw, ph, p[:pce_qtd], p[:paraf_orient]).each do |u, v|
                add_parafuso(ents, Geom::Point3d.new(x0, u, zc + v),
                             Geom::Vector3d.new(-side, 0, 0), mm2in(p[:paraf_d_chapa]))
              end
            end
          end
        end

        corpo
      end

      # Chapa interna: REFORÇO LOCAL na parede do arco, no ponto de saída do
      # braço, ACOMPANHANDO A CURVATURA do ACM (curva no redondo, reta nos
      # formatos retos). O braço atravessa a chapa (furo booleano). Parafusos
      # distribuídos no contorno da chapa, aplicados pela face externa do arco.
      #   cint_comp = extensão ao longo do perímetro (0 = auto 150mm)
      #   cint_larg = extensão na profundidade (Y) · cint_esp = espessura
      def self.chapa_interna(ents, p, w, acm, mat_metal)
        unless p[:braco]
          placa_interna(ents, p, w, acm, mat_metal, 1, [], 0.0, nil)
          return
        end
        sd = p[:braco_lado] == 'esquerda' ? -1 : 1
        if p[:braco_duplo]
          d2 = mm2in(p[:braco_dist]) / 2.0
          if p[:chapa_modo] == 'duas'
            # uma chapa local por braço (saída com furo + encontro sem)
            [d2, -d2].each do |zc|
              placa_interna(ents, p, w, acm, mat_metal, sd, [zc], zc, nil)
              placa_interna(ents, p, w, acm, mat_metal, -sd, [], zc, nil)
            end
          else
            # chapa ÚNICA cobrindo os dois braços (2 furos na da saída)
            base = p[:cint_comp] > 0 ? mm2in(p[:cint_comp]) : mm2in(150)
            comp_ef = [base, 2 * d2 + mm2in(150)].max
            placa_interna(ents, p, w, acm, mat_metal, sd, [d2, -d2], 0.0, comp_ef)
            placa_interna(ents, p, w, acm, mat_metal, -sd, [], 0.0, comp_ef)
          end
        else
          # chapa da SAÍDA (com furo) + chapa do ENCONTRO (sem furo)
          placa_interna(ents, p, w, acm, mat_metal, sd, [0.0], 0.0, nil)
          placa_interna(ents, p, w, acm, mat_metal, -sd, [], 0.0, nil)
        end
      end

      # zc = centro da chapa na altura Z · furos = alturas Z dos braços que a
      # atravessam · comp_override = comprimento forçado (chapa única do duplo)
      def self.placa_interna(ents, p, w, acm, mat_metal, side, furos, zc, comp_override)
        cl   = mm2in(p[:cint_larg])
        ce   = mm2in(p[:cint_esp])
        m    = mm2in(p[:metalon])
        comp = comp_override || (p[:cint_comp] > 0 ? mm2in(p[:cint_comp]) : mm2in(150))
        return if cl <= 0 || ce <= 0 || comp <= 0

        grp = ents.add_group
        ge  = grp.entities

        if p[:formato] == 'redondo'
          ri    = w / 2.0 - acm            # raio interno do arco
          r0    = ri - ce
          t     = ri.abs > 1e-9 ? zc / ri : 0.0
          t     = [[t, -0.95].max, 0.95].min
          aoff  = Math.asin(t)
          ang_c = side > 0 ? aoff : Math::PI - aoff
          half  = [comp / 2.0 / ri, Math::PI * 0.45].min
          n     = 24
          pts   = []
          (0..n).each do |k|
            a = ang_c - half + 2 * half * k / n
            pts << Geom::Point3d.new(ri * Math.cos(a), -cl / 2.0, ri * Math.sin(a))
          end
          (0..n).each do |k|
            a = ang_c + half - 2 * half * k / n
            pts << Geom::Point3d.new(r0 * Math.cos(a), -cl / 2.0, r0 * Math.sin(a))
          end
          f = ge.add_face(pts)
        else
          hw = w / 2.0
          x1 = side * (hw - acm)
          x0 = side * (hw - acm - ce)
          f = ge.add_face([
            Geom::Point3d.new(x0, -cl / 2.0, zc - comp / 2.0),
            Geom::Point3d.new(x1, -cl / 2.0, zc - comp / 2.0),
            Geom::Point3d.new(x1, -cl / 2.0, zc + comp / 2.0),
            Geom::Point3d.new(x0, -cl / 2.0, zc + comp / 2.0)
          ])
        end
        f.reverse! if f.normal.y < 0
        f.pushpull(cl)
        suavizar(grp)
        grp.material = mat_metal
        grp.name = "chapa_interna"
        etiquetar(grp, "LUM - Chapa interna")

        # furo(s) do(s) braço(s) atravessando a chapa (só na chapa da saída)
        furos.each do |fz|
          cutter = nil
          begin
            folg = m + 2 * mm2in(p[:folga_furo])
            cx0 = side * (parede_x(p, w, acm, fz) - ce - mm2in(3))
            cx1 = side * (w / 2.0 + mm2in(3))
            cutter = add_caixa(ents, [cx0, cx1].min, [cx0, cx1].max,
                               -folg / 2.0, folg / 2.0, fz - folg / 2.0, fz + folg / 2.0, nil)
            res = cutter.subtract(grp)
            grp = res if res && res.valid?
            if grp && grp.valid?
              suavizar(grp)
              grp.material = mat_metal
              etiquetar(grp, "LUM - Chapa interna")
            end
          rescue => e
            puts "[Luminoso] furo da chapa interna falhou (segue sem furo): #{e.message}"
            cutter.erase! if cutter && cutter.valid? rescue nil
          end
        end

        # parafusos no contorno da chapa (pela face externa do arco),
        # inset pelas distâncias de borda: topo/baixo = ao longo do perímetro,
        # laterais = na profundidade (Y)
        if p[:pci_qtd] > 0
          pu   = comp - 2 * mm2in(p[:paraf_dist_tb])   # extensão útil no perímetro
          pv   = cl - 2 * mm2in(p[:paraf_dist_lat])    # extensão útil na profundidade (Y)
          if pu > 0 && pv > 0
            rext = w / 2.0
            # ângulo base da chapa na superfície EXTERNA (centro em zc)
            te = rext.abs > 1e-9 ? zc / rext : 0.0
            te = [[te, -0.95].max, 0.95].min
            aoffe = Math.asin(te)
            ang_e = side > 0 ? aoffe : Math::PI - aoffe
            grade_parafusos(pu, pv, p[:pci_qtd], p[:paraf_orient]).each do |u, v|
              if p[:formato] == 'redondo'
                a = ang_e + u / rext
                pos = Geom::Point3d.new(rext * Math.cos(a), v, rext * Math.sin(a))
                nrm = Geom::Vector3d.new(Math.cos(a), 0, Math.sin(a))
              else
                pos = Geom::Point3d.new(side * rext, v, zc + u)
                nrm = Geom::Vector3d.new(side, 0, 0)
              end
              add_parafuso(ents, pos, nrm, mm2in(p[:paraf_d_chapa]))
            end
          end
        end
      end

      # ── Primitivas geométricas ────────────────────────────────────────────

      # Contorno fechado no plano XZ (y fixo), centrado na origem.
      # Contorno paramétrico (anti-pirataria, v1.9.18): a FORMA (círculo 180
      # seg, cantos arredondados com clamp de raio) é calculada na function
      # luminosoCompute — o plugin envia formato/w/h/r (mm), recebe os pontos
      # [[x,z]] e injeta o y. Cache por argumentos: uma geração chama isto
      # dezenas de vezes com poucos valores distintos.
      def self.contorno(formato, w, h, r, y)
        key = [formato.to_s, (w * 25.4).round(3), (h * 25.4).round(3), (r * 25.4).round(3)]
        @contorno_cache ||= {}
        raw = @contorno_cache[key]
        unless raw
          rr = solicitar_luminoso_servidor({
            "op" => "contorno", "formato" => formato.to_s,
            "w" => w * 25.4, "h" => h * 25.4, "r" => r * 25.4
          })
          raise rr[:error].to_s unless rr[:ok]
          raw = rr[:result]["pts"] || []
          @contorno_cache.clear if @contorno_cache.size > 64
          @contorno_cache[key] = raw
        end
        raw.map { |px, pz| Geom::Point3d.new(mm2in(px), y, mm2in(pz)) }
      end

      # Anel (parede): contorno externo − contorno interno (offset esp), extrudado prof
      def self.add_anel(ents, formato, w, h, r, esp, y0, prof, mat)
        win = w - 2 * esp
        hin = h - 2 * esp
        rin = r > esp ? r - esp : 0
        add_anel_ab(ents, formato, w, h, r, win, hin, rin, y0, prof, mat)
      end

      # Anel com abertura arbitrária (usado na testa)
      def self.add_anel_ab(ents, formato, w, h, r, wi, hi, ri, y0, prof, mat)
        grp = ents.add_group
        ge  = grp.entities
        f   = ge.add_face(contorno(formato, w, h, r, y0))
        fi  = ge.add_face(contorno(formato, wi, hi, ri, y0))
        fi.erase!
        f = ge.grep(Sketchup::Face).max_by { |ff| ff.loops.length }
        f.reverse! if f.normal.y < 0
        f.pushpull(prof)
        suavizar(grp)
        grp.material = mat if mat
        grp
      end

      # Placa cheia extrudada
      def self.add_placa(ents, formato, w, h, r, y0, prof, mat)
        grp = ents.add_group
        ge  = grp.entities
        f   = ge.add_face(contorno(formato, w, h, r, y0))
        f.reverse! if f.normal.y < 0
        f.pushpull(prof)
        suavizar(grp)
        grp.material = mat if mat
        grp
      end

      # Suaviza as arestas das facetas de curvatura (faces quase coplanares):
      # a superfície curva renderiza contínua, como a chapa de ACM real.
      # Cantos vivos (90°) e bordas de topo continuam duros.
      def self.suavizar(grp)
        grp.entities.grep(Sketchup::Edge).each do |e|
          next unless e.faces.length == 2
          ang = e.faces[0].normal.angle_between(e.faces[1].normal)
          if ang < 0.35 # ~20° — facetas da curva (72 seg ≈ 5°)
            e.soft   = true
            e.smooth = true
          end
        end
      rescue => err
        puts "[Luminoso] suavizar falhou: #{err.message}"
      end

      # Caixa alinhada aos eixos
      def self.add_caixa(ents, x0, x1, y0, y1, z0, z1, mat)
        grp = ents.add_group
        ge  = grp.entities
        f   = ge.add_face([
          Geom::Point3d.new(x0, y0, z0), Geom::Point3d.new(x1, y0, z0),
          Geom::Point3d.new(x1, y1, z0), Geom::Point3d.new(x0, y1, z0)
        ])
        f.reverse! if f.normal.z < 0
        f.pushpull(z1 - z0)
        grp.material = mat if mat
        grp
      end

      # Cabeça de parafuso: cilindro baixo saindo da superfície na direção n
      def self.add_parafuso(ents, centro, n, diam)
        grp = ents.add_group
        ge  = grp.entities
        circ = ge.add_circle(centro, n, diam / 2.0, 12)
        f = ge.add_face(circ)
        return grp unless f
        f.reverse! if f.normal.dot(n) < 0
        f.pushpull(mm2in(2.5))
        suavizar(grp)
        grp.material = material_rgb("ACMFacil Inox", [200, 200, 205])
        grp.name = "parafuso"
        etiquetar(grp, "LUM - Parafusos")
        grp
      rescue => e
        puts "[Luminoso] parafuso falhou: #{e.message}"
        grp
      end

      # Ponto + normal externa numa fração [0..1] do perímetro (plano XZ)
      def self.ponto_perimetro(formato, w, h, r, frac)
        pts = contorno(formato, w, h, r, 0)
        n = pts.length
        lens  = []
        total = 0.0
        n.times do |i|
          l = pts[i].distance(pts[(i + 1) % n])
          lens << l
          total += l
        end
        alvo = (frac % 1.0) * total
        acc  = 0.0
        n.times do |i|
          seg = lens[i]
          if acc + seg >= alvo || i == n - 1
            t = seg > 0 ? (alvo - acc) / seg : 0
            a = pts[i]
            b = pts[(i + 1) % n]
            px = a.x + (b.x - a.x) * t
            pz = a.z + (b.z - a.z) * t
            dx = b.x - a.x
            dz = b.z - a.z
            nx =  dz
            nz = -dx
            if nx * px + nz * pz < 0
              nx = -nx
              nz = -nz
            end
            ln = Math.sqrt(nx * nx + nz * nz)
            ln = 1.0 if ln == 0
            return [px, pz, nx / ln, nz / ln]
          end
          acc += seg
        end
        [pts[0].x, pts[0].z, 1.0, 0.0]
      end

      # Posições em GRADE pra parafusos de chapa — cantos primeiro, espaçamento
      # igual entre furos; qtd ímpar deixa o último centralizado.
      #   horizontal → 2 linhas, preenche colunas (6 = 3×2, 8 = 4×2...)
      #   vertical   → 2 colunas, preenche linhas (6 = 2×3, 8 = 2×4...)
      # Retorna pares [u, v] centrados em (0,0), u ∈ ±pu/2, v ∈ ±pv/2.
      # (anti-pirataria, v1.9.18): a distribuição roda na function
      # luminosoCompute (op 'grade') — entradas/saídas em unidades internas,
      # conversão mm na fronteira. Cache por argumentos.
      def self.grade_parafusos(pu, pv, qtd, orient = 'horizontal')
        return [] if qtd.to_i <= 0
        key = [(pu * 25.4).round(3), (pv * 25.4).round(3), qtd.to_i, orient.to_s]
        @grade_cache ||= {}
        raw = @grade_cache[key]
        unless raw
          rr = solicitar_luminoso_servidor({
            "op" => "grade", "pu" => pu * 25.4, "pv" => pv * 25.4,
            "qtd" => qtd.to_i, "orient" => orient.to_s
          })
          raise rr[:error].to_s unless rr[:ok]
          raw = rr[:result]["pts"] || []
          @grade_cache.clear if @grade_cache.size > 64
          @grade_cache[key] = raw
        end
        raw.map { |u, v| [mm2in(u), mm2in(v)] }
      end

      # Chama a function luminosoCompute (token + retry 1x, msgs padrão).
      def self.solicitar_luminoso_servidor(payload)
        ns = Core::Auth::DEFAULT_NS
        id_token = Sketchup.read_default(ns, "fb_id_token", "").to_s
        if Core::Auth::OFFLINE_MODE
          return { ok: true, result: { "pts" => [] } }
        end
        return { ok: false, error: "Sessão expirada — faça login novamente no ACMFacil." } if id_token.empty?

        r = Core::FirebaseClient.call_function("luminosoCompute", payload, id_token)
        if !r[:ok] && r[:code].to_s == "UNAUTHENTICATED"
          refresh = Sketchup.read_default(ns, "fb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::FirebaseClient.refresh_id_token(refresh)
            if ref[:ok]
              id_token = ref[:id_token]
              Sketchup.write_default(ns, "fb_id_token", id_token)
              r = Core::FirebaseClient.call_function("luminosoCompute", payload, id_token)
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

        { ok: true, result: r[:result] || {} }
      end

      # Etiqueta (tag/layer) por tipo de peça — cria se não existir
      def self.etiquetar(grp, nome)
        return unless grp && grp.valid?
        grp.layer = Sketchup.active_model.layers.add(nome)
      rescue => e
        puts "[Luminoso] etiquetar '#{nome}' falhou: #{e.message}"
      end

      # Captura as 5 vistas do componente (câmera é restaurada no final)
      def self.snapshots(ent)
        model = Sketchup.active_model
        view  = model.active_view
        cam   = view.camera
        old   = [cam.eye, cam.target, cam.up, cam.perspective?]

        bb = ent.bounds
        c  = bb.center
        d  = bb.diagonal * 1.7

        vistas = {
          frente:  [Geom::Vector3d.new(0, -1, 0),               Geom::Vector3d.new(0, 0, 1), false],
          fundo:   [Geom::Vector3d.new(0, 1, 0),                Geom::Vector3d.new(0, 0, 1), false],
          lateral: [Geom::Vector3d.new(1, 0, 0),                Geom::Vector3d.new(0, 0, 1), false],
          topo:    [Geom::Vector3d.new(0, 0, 1),                Geom::Vector3d.new(0, 1, 0), false],
          iso:     [Geom::Vector3d.new(1, -1, 0.8).normalize,   Geom::Vector3d.new(0, 0, 1), true]
        }

        out = {}
        tmpdir = ENV['TEMP'] || Dir.home
        vistas.each do |nome, (dir, up, persp)|
          begin
            cam.perspective = persp
            cam.set(c.offset(dir, d), c, up)
            view.zoom(ent)
            view.refresh rescue nil
            # JPG comprimido: 5 PNGs grandes estouravam o execute_script do
            # Bridge (resolver silenciosamente falhava) — JPG fica ~10x menor
            path = File.join(tmpdir, "acmfacil_lum_#{nome}.jpg")
            view.write_image(path, 640, 480, true, 0.6)
            if File.exist?(path)
              out[nome] = "data:image/jpeg;base64,#{Base64.strict_encode64(File.binread(path))}"
              File.delete(path) rescue nil
            end
          rescue => e
            puts "[Luminoso] snapshot #{nome} falhou: #{e.message}"
          end
        end

        cam.perspective = old[3]
        cam.set(old[0], old[1], old[2])
        view.refresh rescue nil

        { ok: true, vistas: out }
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
        puts "[Luminoso] acm_material falhou (#{e.message}) — fallback RGB"
        material_rgb(nome, rgb)
      end

      def self.material_rgb(nome, rgb, alpha = 1.0)
        mats = Sketchup.active_model.materials
        m = mats[nome] || mats.add(nome)
        m.color = Sketchup::Color.new(rgb[0].to_i, rgb[1].to_i, rgb[2].to_i)
        m.alpha = alpha
        m
      end

    end # Luminoso
  end
end
