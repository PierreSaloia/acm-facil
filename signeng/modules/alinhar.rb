# ═══════════════════════════════════════════════════════════════════════════
# SignEng — Alinhar (ferramenta de toolbar)
# ═══════════════════════════════════════════════════════════════════════════
# Alinha o objeto 2 (móvel) ao objeto 1 (fixo) no REFERENCIAL do objeto 1:
# frame derivado da maior face dele (ya = face/fundo, za = cima, xa = esq/dir),
# extensões por projeção dos vértices reais — funciona com objetos girados
# (rotação na transformação OU assada na geometria, ex. Solid Tools).
#   - Bordas: esquerda/direita (xa), superior/inferior (za), centro (3 eixos)
#   - Faceamento (ya): face = mín (frente), fundo = máx (trás),
#     combinações sempre na ordem objeto1 × objeto2.
# A ferramenta tem diálogo próprio (compacto) — não passa pelo shell do plugin.
# ═══════════════════════════════════════════════════════════════════════════

module SignEng
  module Generator
    module Alinhar

      @dialog = nil
      @fixo   = nil
      @movel  = nil

      class << self
        attr_reader :fixo, :movel
      end

      # Entrada única do botão da toolbar: abre o diálogo e ativa a ferramenta
      def self.ativar
        abrir_dialogo
        ativar_ferramenta
      end

      def self.ativar_ferramenta
        model = Sketchup.active_model
        model.select_tool(AlinharTool.new(model))
      end

      def self.abrir_dialogo
        if @dialog && @dialog.visible?
          @dialog.bring_to_front
          return
        end

        @dialog = UI::HtmlDialog.new(
          dialog_title:    "SignEng — Alinhar",
          preferences_key: "com.signeng.alinhar",
          width:           380,
          height:          680,
          min_width:       340,
          min_height:      560,
          resizable:       true,
          style:           UI::HtmlDialog::STYLE_DIALOG
        )
        @dialog.set_file(File.join(SignEng::UI_DIR, 'tools', 'alinhar', 'index.html'))
        registrar_callbacks(@dialog)
        @dialog.set_on_closed do
          @dialog = nil
          reset_picks
          begin
            Sketchup.active_model.select_tool(nil)
          rescue => e
            puts "[Alinhar] select_tool(nil) no fechar falhou: #{e.message}"
          end
        end
        @dialog.show
      end

      # ── Callbacks do diálogo próprio (padrão Bridge) ──────────────────────
      def self.registrar_callbacks(dlg)
        dlg.add_action_callback("alinhar_ctx") do |_ctx, json|
          data  = SignEng.parse_payload(json)
          lang  = Sketchup.read_default(SignEng::DEFAULT_NS, "lang", "pt").to_s
          lang  = "pt" unless %w[pt es en].include?(lang)
          theme = Sketchup.read_default(SignEng::DEFAULT_NS, "theme", "light").to_s
          theme = "light" unless %w[light dark].include?(theme)
          SignEng.resolver(dlg, data["id"], { ok: true, lang: lang, theme: theme, version: Core::VERSION })
        end

        dlg.add_action_callback("alinhar_aplicar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          begin
            result = aplicar(data["align"].to_s, data["face"].to_s)
            SignEng.resolver(dlg, data["id"], result)
          rescue => e
            Sketchup.active_model.abort_operation rescue nil
            SignEng.resolver(dlg, data["id"], { ok: false, code: "alinhar.exception", error: e.message })
          end
        end

        dlg.add_action_callback("alinhar_reiniciar") do |_ctx, json|
          data = SignEng.parse_payload(json)
          reset_picks
          ativar_ferramenta
          SignEng.resolver(dlg, data["id"], { ok: true })
        end
      end

      # ── Picks (chamados pela AlinharTool) ─────────────────────────────────
      def self.set_fixo(ent)
        @fixo = ent
        notificar_pick(1, nome_de(ent))
      end

      def self.set_movel(ent)
        @movel = ent
        notificar_pick(2, nome_de(ent))
      end

      def self.reset_picks
        @fixo  = nil
        @movel = nil
        begin
          Sketchup.active_model.selection.clear
        rescue => e
          puts "[Alinhar] selection.clear falhou: #{e.message}"
        end
      end

      def self.nome_de(ent)
        nome = ent.name.to_s
        if nome.empty? && ent.is_a?(Sketchup::ComponentInstance)
          nome = ent.definition.name.to_s rescue ""
        end
        tipo = ent.is_a?(Sketchup::Group) ? "Grupo" : "Componente"
        nome.empty? ? "#{tipo} ##{ent.entityID}" : nome
      end

      def self.notificar_pick(n, nome)
        return unless @dialog && @dialog.visible?
        begin
          @dialog.execute_script("if(typeof AlinharUI!=='undefined')AlinharUI.onPick(#{n}, #{nome.to_json});")
        rescue => e
          puts "[Alinhar] notificar_pick falhou: #{e.message}"
        end
      end

      # ── Aplicar alinhamento ───────────────────────────────────────────────
      # A referência é a ORIENTAÇÃO DO OBJETO 1 (fixo), não os eixos do mundo:
      # se o objeto estiver girado, esq/dir, sup/inf e face/fundo giram junto.
      def self.aplicar(align, face)
        # Gate de licença silencioso (mesmo padrão dos módulos)
        v = Core::Auth.assert_valid!
        return v.merge(blocked: true) unless v[:ok]

        unless @fixo && @fixo.valid? && @movel && @movel.valid?
          return { ok: false, code: "alinhar.faltam_objetos" }
        end

        # Frame ortonormal derivado da GEOMETRIA do objeto 1 (maior face =
        # plano da frente). Funciona mesmo quando a rotação está "assada" na
        # geometria (ex.: grupos criados por Solid Tools, transformação identidade).
        # xa = esq/dir · ya = face/fundo · za = sup/inf (no referencial dele).
        xa, ya, za = frame_do_objeto(@fixo)

        e1 = extents_no_frame(@fixo,  xa, ya, za)
        e2 = extents_no_frame(@movel, xa, ya, za)

        # du = ao longo de xa (esq/dir), dv = ya (face/fundo), dw = za (sup/inf)
        du = 0.0; dv = 0.0; dw = 0.0

        case align
        when "esquerda" then du = e1[:min][0] - e2[:min][0]
        when "direita"  then du = e1[:max][0] - e2[:max][0]
        when "superior" then dw = e1[:max][2] - e2[:max][2]
        when "inferior" then dw = e1[:min][2] - e2[:min][2]
        when "centro"
          du = e1[:ctr][0] - e2[:ctr][0]
          dw = e1[:ctr][2] - e2[:ctr][2]
          # Centro = centro com centro nos 3 eixos. O dv é sobrescrito abaixo
          # se o usuário escolheu um faceamento (faceamento manda na profundidade).
          dv = e1[:ctr][1] - e2[:ctr][1]
        end

        # face = frente (mín ao longo de ya), fundo = trás (máx ao longo de ya).
        # Ordem: lado do objeto 1 × lado do objeto 2.
        case face
        when "face_face"   then dv = e1[:min][1] - e2[:min][1]
        when "face_fundo"  then dv = e1[:min][1] - e2[:max][1]
        when "fundo_face"  then dv = e1[:max][1] - e2[:min][1]
        when "fundo_fundo" then dv = e1[:max][1] - e2[:max][1]
        end

        if du.abs < 1e-9 && dv.abs < 1e-9 && dw.abs < 1e-9
          return { ok: true, moved: false }
        end

        # Converte o delta do frame do objeto 1 de volta pro mundo
        vec = Geom::Vector3d.new(
          xa.x * du + ya.x * dv + za.x * dw,
          xa.y * du + ya.y * dv + za.y * dw,
          xa.z * du + ya.z * dv + za.z * dw
        )

        model = Sketchup.active_model
        model.start_operation("Alinhar SignEng", true)
        @movel.transform!(Geom::Transformation.translation(vec))
        model.commit_operation

        { ok: true, moved: true }
      end

      # Frame ortonormal do objeto (anti-pirataria, v1.9.15): a HEURÍSTICA de
      # orientação (sinal pela câmera, fallbacks determinísticos, painel
      # deitado) roda na function alinharCompute — o plugin só coleta a normal
      # da maior face + direção da câmera e monta os vetores que voltam.
      # Cache por (objeto, normal, câmera) pra cliques repetidos não pagarem rede.
      def self.frame_do_objeto(ent)
        melhor = { area: -1.0, normal: nil }
        begin
          coletar_maior_face(ent, nil, melhor, 0)
        rescue => e
          puts "[Alinhar] coletar_maior_face falhou: #{e.message}"
        end

        n = melhor[:normal]
        cam = nil
        begin
          cam = Sketchup.active_model.active_view.camera.direction
        rescue => e
          puts "[Alinhar] camera.direction falhou: #{e.message}"
        end

        key = [
          ent.entityID,
          n   ? [n.x.round(4), n.y.round(4), n.z.round(4)] : nil,
          cam ? [cam.x.round(3), cam.y.round(3), cam.z.round(3)] : nil
        ]
        @frame_cache ||= {}
        return @frame_cache[key] if @frame_cache[key]

        r = solicitar_frame_servidor(n, cam)
        raise r[:error].to_s unless r[:ok]
        frame = [
          Geom::Vector3d.new(r[:xa][0], r[:xa][1], r[:xa][2]),
          Geom::Vector3d.new(r[:ya][0], r[:ya][1], r[:ya][2]),
          Geom::Vector3d.new(r[:za][0], r[:za][1], r[:za][2])
        ]
        @frame_cache.clear if @frame_cache.size > 32
        @frame_cache[key] = frame
        frame
      end

      # Chama a function alinharCompute (token + retry 1x, msgs padrão).
      def self.solicitar_frame_servidor(normal, cam)
        ns = Core::Auth::DEFAULT_NS
        access_token = Sketchup.read_default(ns, "sb_access_token", "").to_s
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if access_token.empty?

        payload = {
          "normal" => normal ? [normal.x, normal.y, normal.z] : nil,
          "camdir" => cam ? [cam.x, cam.y, cam.z] : nil
        }

        r = Core::SupabaseClient.call_function("alinharCompute", payload, access_token)
        if !r[:ok] && r[:status].to_i == 401
          refresh = Sketchup.read_default(ns, "sb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::SupabaseClient.refresh_session(refresh)
            if ref[:ok]
              access_token = ref[:access_token]
              Core::Auth.save_tokens(ref)
              r = Core::SupabaseClient.call_function("alinharCompute", payload, access_token)
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

        res = r[:result] || {}
        { ok: true, xa: res["xa"], ya: res["ya"], za: res["za"] }
      end

      # Percorre a geometria (recursivo, com transform acumulado) e guarda a
      # normal MUNDIAL da maior face encontrada.
      def self.coletar_maior_face(ent, tr, melhor, nivel)
        return if nivel > 8
        tr ||= Geom::Transformation.new

        if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          sub_tr = tr * ent.transformation
          ent.definition.entities.each { |e| coletar_maior_face(e, sub_tr, melhor, nivel + 1) }
        elsif ent.is_a?(Sketchup::Face)
          area = ent.area(tr) rescue ent.area
          if area > melhor[:area]
            n = ent.normal.transform(tr)
            if n.length > 0
              melhor[:area]   = area
              melhor[:normal] = n.normalize
            end
          end
        end
      end

      # Extensão REAL do objeto nos eixos do frame: projeta os VÉRTICES da
      # geometria (recursivo, transform acumulado) em xa/ya/za. Justa em
      # qualquer caso — rotação na transformação OU assada na geometria.
      # Retorna { min: [u,v,w], max: [u,v,w], ctr: [u,v,w] }.
      def self.extents_no_frame(ent, xa, ya, za)
        axes = [xa, ya, za]
        acc  = {
          min: [Float::INFINITY,  Float::INFINITY,  Float::INFINITY],
          max: [-Float::INFINITY, -Float::INFINITY, -Float::INFINITY],
          n:   0
        }
        begin
          projetar_vertices(ent, nil, axes, acc, 0)
        rescue => e
          puts "[Alinhar] projetar_vertices falhou: #{e.message}"
        end

        if acc[:n] == 0
          # Fallback: sem vértices acessíveis → cantos da bounding box mundial
          bb = ent.bounds
          (0..7).each { |i| projetar_ponto(bb.corner(i), axes, acc) }
        end

        ctr = acc[:min].each_index.map { |i| (acc[:min][i] + acc[:max][i]) / 2.0 }
        { min: acc[:min], max: acc[:max], ctr: ctr }
      end

      def self.projetar_vertices(ent, tr, axes, acc, nivel)
        return if nivel > 8
        tr ||= Geom::Transformation.new

        if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          sub_tr = tr * ent.transformation
          ent.definition.entities.each { |e| projetar_vertices(e, sub_tr, axes, acc, nivel + 1) }
        elsif ent.is_a?(Sketchup::Edge)
          ent.vertices.each { |v| projetar_ponto(v.position.transform(tr), axes, acc) }
        end
      end

      def self.projetar_ponto(p, axes, acc)
        axes.each_with_index do |ax, i|
          d = p.x * ax.x + p.y * ax.y + p.z * ax.z
          acc[:min][i] = d if d < acc[:min][i]
          acc[:max][i] = d if d > acc[:max][i]
        end
        acc[:n] += 1
      end

    end # Alinhar

    # ========================================================================
    # ALINHAR TOOL — pick do objeto fixo (1) e do móvel (2)
    # ========================================================================
    class AlinharTool

      COR_FIXO  = Sketchup::Color.new(37, 99, 235)   # azul (accent-blue-600)
      COR_MOVEL = Sketchup::Color.new(212, 175, 55)  # gold

      def initialize(model)
        @model = model
      end

      def activate
        atualizar_status
        @model.active_view.invalidate
      end

      def deactivate(view)
        view.invalidate
      end

      def onCancel(_reason, view)
        Alinhar.reset_picks
        atualizar_status
        view.invalidate
      end

      def onLButtonDown(_flags, x, y, view)
        ph = view.pick_helper
        ph.do_pick(x, y)
        ent = ph.best_picked
        unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          Sketchup.status_text = "[Alinhar] Clique num GRUPO ou COMPONENTE."
          return
        end

        if Alinhar.fixo.nil? || !Alinhar.fixo.valid?
          Alinhar.set_fixo(ent)
        elsif ent == Alinhar.fixo
          Sketchup.status_text = "[Alinhar] Objeto 2 precisa ser diferente do objeto 1."
          return
        else
          Alinhar.set_movel(ent)
        end
        atualizar_status
        view.invalidate
      end

      def draw(view)
        desenhar_bbox(view, Alinhar.fixo,  COR_FIXO)  if Alinhar.fixo  && Alinhar.fixo.valid?
        desenhar_bbox(view, Alinhar.movel, COR_MOVEL) if Alinhar.movel && Alinhar.movel.valid?
      end

      def getExtents
        bb = Geom::BoundingBox.new
        bb.add(Alinhar.fixo.bounds)  if Alinhar.fixo  && Alinhar.fixo.valid?
        bb.add(Alinhar.movel.bounds) if Alinhar.movel && Alinhar.movel.valid?
        bb
      end

      private

      def atualizar_status
        if Alinhar.fixo.nil?
          Sketchup.status_text = "[Alinhar] Clique o objeto 1 (FIXO). Esc = recomeçar."
        elsif Alinhar.movel.nil?
          Sketchup.status_text = "[Alinhar] Clique o objeto 2 (MÓVEL). Esc = recomeçar."
        else
          Sketchup.status_text = "[Alinhar] Escolha as opções no painel e clique Aplicar."
        end
      end

      def desenhar_bbox(view, ent, cor)
        bb = ent.bounds
        c  = (0..7).map { |i| bb.corner(i) }
        edges = [[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]]
        view.drawing_color = cor
        view.line_width    = 3
        edges.each { |a, b| view.draw_lines(c[a], c[b]) }
      end

    end # AlinharTool
  end
end
