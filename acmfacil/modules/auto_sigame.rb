# encoding: UTF-8
# ============================================================================
# SignEng — Modulo AUTO SIGAM-ME (Auto-ACM + Follow-Me)
#
# Gera uma FAIXA CONTÍNUA de ACM que segue uma polilinha desenhada na fachada.
# O usuario define altura + profundidade + as configs do ACM no painel, clica
# "Desenhar caminho" e marca os pontos. Ao finalizar (Enter), a faixa inteira é
# gerada como uma fita contínua:
#
#  - Pele (ACM): tiras contínuas entre a polilinha de TRÁS (na parede) e a de
#    FRENTE (deslocada por prof, com MITER EXATO em cada vértice). Resolve dobra
#    pra dentro/fora, aguda/obtusa, e degraus — sem bloco, sem buraco, sem
#    transpasse.
#  - Estrutura (Metalon): travessas de topo/base (frente e trás) ao longo do
#    caminho + montantes nos vértices, emendas e espaçamento intermediário.
#  - Emendas de chapa: contínuas ao longo do comprimento total, pelo tamanho da
#    chapa + alinhamento (seguindo a orientação).
#
# Ponto clicado = canto inferior de TRÁS (junto à parede): o volume projeta pra
# FRENTE (profundidade) e pra CIMA (altura).
#
# v1.9.10 (anti-pirataria, FASE 3): o CÁLCULO roda na function
# autoSigameCompute (Firebase), que valida licença + módulo antes de calcular.
# O plugin captura o caminho, envia (mm) e desenha as peças que voltam
# (desenhar_pecas_sigame + beam). Port validado pelo harness: 215/215 peças
# exatas contra o cálculo Ruby original. Mesmo padrão do Auto-ACM/Curvo/
# Corte & Encaixe/Logo 3D.
# ============================================================================

module SignEng
  module Generator
    module AutoSigame

      # Quantitativo da última geração (mm) — alimenta o PLANO DE CORTE do painel.
      @last_quant = nil
      class << self
        attr_accessor :last_quant
      end

      def self.ativar_ferramenta(acm_params, alt_mm, prof_mm, dialog = nil)
        model = Sketchup.active_model
        tool  = AutoSigameTool.new(model, acm_params, alt_mm, prof_mm, dialog)
        model.select_tool(tool)
        true
      end

      # Eixos do trecho p1→p2 (pro ghost). x = caminho; z = cima; y = perp horizontal.
      def self.axes_for(p1, p2)
        dir = Geom::Vector3d.new(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z)
        return nil if dir.length < 1.mm
        x_axis   = dir.normalize
        world_up = Geom::Vector3d.new(0, 0, 1)
        if x_axis.parallel?(world_up)
          z_axis = Geom::Vector3d.new(1, 0, 0)
          y_axis = z_axis.cross(x_axis); y_axis.normalize!
        else
          y_axis = world_up.cross(x_axis); y_axis.normalize!
          z_axis = world_up
        end
        [x_axis, y_axis, z_axis]
      end

      # ── BEAM: cria uma barra (caixa) de p1 a p2, seção sa×sb, centrada na linha.
      # ref = direção de referência pra orientar a seção (sa ao longo de ref).
      # cut_a / cut_b: normais (mundo, horizontais) do plano de meia-esquadria em
      # cada ponta. nil = ponta reta (comportamento original). Com normal, a ponta
      # é cisalhada no plano que passa pela extremidade — corte vertical de miter.
      def self.beam(parent, p1, p2, sa, sb, mat, name, layer, ref = nil, cut_a = nil, cut_b = nil)
        v = Geom::Vector3d.new(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z)
        len = v.length
        return nil if len < 0.5.mm
        xa = v.normalize
        up = Geom::Vector3d.new(0, 0, 1)
        if ref && !ref.parallel?(xa)
          dot = ref.dot(xa)
          ya = Geom::Vector3d.new(ref.x - xa.x * dot, ref.y - xa.y * dot, ref.z - xa.z * dot)
          return nil if ya.length < 1e-6
          ya.normalize!
        elsif xa.parallel?(up)
          ya = Geom::Vector3d.new(1, 0, 0)
        else
          ya = up.cross(xa); ya.normalize!
        end
        za = xa.cross(ya); za.normalize!

        # Recuo ao longo do eixo p/ cada canto da seção, pondo a ponta no plano
        # de miter. Em coords locais o corte (vertical) depende só de cy (ya):
        #   Δ = -(n·ya / n·xa) * cy   (clampeado p/ não passar de meio comprimento)
        shear = lambda do |n, cy|
          next 0.0 unless n
          nx = n.dot(xa); ny = n.dot(ya)
          next 0.0 if nx.abs < 1e-9
          d = -(ny / nx) * cy
          maxd = len * 0.49
          d =  maxd if d >  maxd
          d = -maxd if d < -maxd
          d
        end

        ha = sa / 2.0
        hb = sb / 2.0
        cs = [[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]]  # (cy, cz)
        pa = cs.map { |cy, cz| Geom::Point3d.new(shear.call(cut_a, cy),       cy, cz) }
        pb = cs.map { |cy, cz| Geom::Point3d.new(len + shear.call(cut_b, cy), cy, cz) }

        g = parent.add_group
        e = g.entities
        faces = []
        faces << (e.add_face(pa[0], pa[1], pa[2], pa[3]) rescue nil)              # tampa início
        faces << (e.add_face(pb[3], pb[2], pb[1], pb[0]) rescue nil)              # tampa fim
        faces << (e.add_face(pa[0], pa[1], pb[1], pb[0]) rescue nil)              # base
        faces << (e.add_face(pa[1], pa[2], pb[2], pb[1]) rescue nil)              # lado +ya
        faces << (e.add_face(pa[2], pa[3], pb[3], pb[2]) rescue nil)              # topo
        faces << (e.add_face(pa[3], pa[0], pb[0], pb[3]) rescue nil)              # lado -ya
        faces.compact!
        if faces.empty?
          g.erase! rescue nil
          return nil
        end
        faces.each { |fc| fc.material = mat } if mat
        g.transformation = Geom::Transformation.axes(p1, xa, ya, za)
        g.name = name
        g.layer = layer if layer
        g
      end

      # ── GERA A FAIXA CONTÍNUA (Fase 3 anti-pirataria: o CÁLCULO roda na
      # function autoSigameCompute, que valida licença + módulo. O plugin
      # captura o caminho, envia, e desenha as peças que voltam. Validado
      # pelo harness 215/215 peças exatas contra o cálculo Ruby original.) ──
      def self.build_band(model, pts, alt_mm, prof_mm, params)
        return 0 if pts.length < 2
        r = solicitar_pecas_servidor_sigame(pts, alt_mm, prof_mm, params)
        raise r[:error].to_s unless r[:ok]
        pecas = converter_pecas_servidor_sigame(r[:pecas])
        comp = 0.0
        (0...(pts.length - 1)).each { |i| comp += pts[i].distance(pts[i + 1]) / 1.mm }
        @last_quant = quantitativo_sigame(pecas, params, alt_mm, prof_mm, comp)
        desenhar_pecas_sigame(model, pecas, params)
        pts.length - 1
      end

      # ======================================================================
      # QUANTITATIVO_SIGAME — resumo DERIVADO das peças que o servidor devolveu
      # (nada é recalculado aqui): chapas da pele com dimensões, barras de
      # metalon, perfis de emenda, fita e juntas. Alimenta o plano de corte
      # do painel (clonado do Auto-ACM). Tudo em mm.
      # ======================================================================
      def self.quantitativo_sigame(pecas, params, alt_mm, prof_mm, comp_mm)
        d3 = lambda { |a, b| Math.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2 + (a[2] - b[2])**2) }
        mw = (params[:mw] || 20).to_f
        chapas = []; met = []; em = []; fita_mm = 0.0; juntas = 0
        spans = {}   # sp → { "frontal"=>{w,h}, "topo"=>..., "base"=>... }
        (pecas || []).each do |pc|
          case pc[:t]
          when "face"
            if pc[:g] == "junta"
              juntas += 1
            elsif pc[:g] == "skin"
              q = pc[:pts]
              w = d3.call(q[0], q[1]).round(1)
              h = d3.call(q[1], q[2]).round(1)
              f = pc[:f].to_s
              if %w[frontal topo base].include?(f) && pc[:sp]
                (spans[pc[:sp]] ||= {})[f] = { w: w, h: h }
              elsif f == "traseira"
                chapas << { w: w, h: h, face: "Traseira" }
              elsif f == "esq" || f == "dir"
                chapas << { w: w, h: h, face: "Lateral" }
              else
                chapas << { w: w, h: h, face: "Pele" }
              end
            end
          when "beam"
            len = d3.call(pc[:p1], pc[:p2])
            if pc[:g] == "fita"
              fita_mm += len
            elsif pc[:g] == "est"
              # tipo pelo nome (M.RB/RF=rail, M.Mt=montante, M.Tv=travessa,
              # M.Em=perfil de emenda) + endpoints pro DESENHO da estrutura
              nome = pc[:nome].to_s
              tipo = nome.start_with?("M.Em") ? "emenda" :
                     nome.start_with?("M.Mt") ? "montante" :
                     nome.start_with?("M.Tv") ? "travessa" : "rail"
              entry = { len: len.round(1), tipo: tipo,
                        p1: pc[:p1].map { |v| v.round(1) }, p2: pc[:p2].map { |v| v.round(1) } }
              if tipo == "emenda"
                em << entry
              else
                met << entry
              end
            end
          end
        end

        # ── DESENVOLVIMENTO COM DOBRAS (fabricação real): topo+frontal+base do
        # mesmo trecho saem de UMA chapa dobrada (bandeja) quando o desenvolvimento
        # cabe no limite transversal da chapa; senão, as abas viram peças
        # separadas = EMENDA na dobra de cima e/ou de baixo. ──
        orient = (params[:chapa_orient] || "horizontal").to_s
        limite = (orient == "vertical" ? (params[:chapa_comp] || 5000) : (params[:chapa_larg] || 1220)).to_f
        em_horiz = 0
        spans.keys.sort.each do |sp|
          m = spans[sp]
          topo = m["topo"]; fr = m["frontal"]; base = m["base"]
          membros = [["Topo", topo], ["Frontal", fr], ["Base", base]].select { |_, v| v }
          if fr && membros.length >= 2
            dev_h = membros.sum { |_, v| v[:h] }
            w_max = membros.map { |_, v| v[:w] }.max
            if dev_h <= limite + 0.1
              # bandeja única: dobras nas transições entre os membros
              dobras = []; acc = 0.0
              membros[0...-1].each { |_, v| acc += v[:h]; dobras << acc.round(1) }
              chapas << { w: w_max, h: dev_h.round(1), face: "Desenvolvida (#{membros.map { |n, _| n.downcase }.join('+')})", dobras: dobras }
              next
            end
            # não cabe → abas separadas (emenda na dobra de cima/baixo)
            em_horiz += membros.length - 1
          end
          membros.each do |nome, v|
            if v[:h] > limite + 0.1
              # até a face sozinha estoura o limite → divide em partes iguais
              nparts = (v[:h] / limite).ceil
              ph = (v[:h] / nparts).round(1)
              nparts.times { chapas << { w: v[:w], h: ph, face: nome } }
              em_horiz += nparts - 1
            else
              chapas << { w: v[:w], h: v[:h], face: nome }
            end
          end
        end
        met_m = met.sum { |b| b[:len] } / 1000.0
        em_m  = em.sum  { |b| b[:len] } / 1000.0
        {
          chapas: chapas, met_pecas: met, em_pecas: em,
          met_m: met_m.round(2), em_m: em_m.round(2), fita_m: (fita_mm / 1000.0).round(2),
          met_barras: met_m > 0 ? (met_m / 6.0).ceil : 0,
          em_barras: em_m > 0 ? (em_m / 6.0).ceil : 0,
          juntas: juntas, em_horiz: em_horiz,
          alt: alt_mm.to_f.round(0), prof: prof_mm.to_f.round(0), comp: comp_mm.to_f.round(0),
          metalon_wh: "#{(params[:mw] || 20).to_i}x#{(params[:mw] || 20).to_i}",
          emenda_wh:  "#{(params[:ew] || 30).to_i}x#{(params[:eh] || 20).to_i}",
          chapa_comp: (params[:chapa_comp] || 5000).to_f.round(0),
          chapa_larg: (params[:chapa_larg] || 1220).to_f.round(0),
          chapa_orient: (params[:chapa_orient] || "horizontal").to_s,
          cor_acm: (params[:cor_acm] || "").to_s,
          acm_mm: (params[:acm] || 3).to_f
        }
      end

      # ======================================================================
      # SOLICITAR_PECAS_SERVIDOR_SIGAME — chama a function autoSigameCompute.
      # Payload = { pts (mm), alt_mm, prof_mm, params }. Refresh de token com
      # retry 1x. Devolve { ok, pecas } ou { ok: false, error: msg }.
      # ======================================================================
      def self.solicitar_pecas_servidor_sigame(pts, alt_mm, prof_mm, params)
        ns = Core::Auth::DEFAULT_NS
        id_token = Sketchup.read_default(ns, "fb_id_token", "").to_s
        if Core::Auth::OFFLINE_MODE
          return { ok: true, pecas: pecas_locais_sigame(pts, alt_mm, prof_mm, params) }
        end
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if id_token.empty?

        payload = {
          "pts"     => pts.map { |p| [p.x / 1.mm, p.y / 1.mm, p.z / 1.mm] },
          "alt_mm"  => alt_mm.to_f,
          "prof_mm" => prof_mm.to_f,
          "params"  => params
        }

        r = Core::FirebaseClient.call_function("autoSigameCompute", payload, id_token)
        if !r[:ok] && r[:code].to_s == "UNAUTHENTICATED"
          refresh = Sketchup.read_default(ns, "fb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::FirebaseClient.refresh_id_token(refresh)
            if ref[:ok]
              id_token = ref[:id_token]
              Sketchup.write_default(ns, "fb_id_token", id_token)
              r = Core::FirebaseClient.call_function("autoSigameCompute", payload, id_token)
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

        res = r[:result] || {}
        { ok: true, pecas: res["pecas"] || [] }
      end

      # Geometria local mínima e determinística para uso sem Firebase. As
      # peças seguem o mesmo contrato consumido por converter/desenhar.
      def self.pecas_locais_sigame(pts, alt_mm, prof_mm, params)
        return [] if pts.length < 2
        altura = alt_mm.to_f
        profundidade = prof_mm.to_f
        perfil = (params[:mw] || params["mw"] || 20).to_f
        out = []
        pts.each_cons(2).with_index do |(a, b), i|
          a_mm = [a.x / 1.mm, a.y / 1.mm, a.z / 1.mm]
          b_mm = [b.x / 1.mm, b.y / 1.mm, b.z / 1.mm]
          dx = b_mm[0] - a_mm[0]; dy = b_mm[1] - a_mm[1]
          len = Math.sqrt(dx * dx + dy * dy)
          next if len < 0.1
          nx = -dy / len; ny = dx / len
          c = [a_mm[0] + nx * profundidade, a_mm[1] + ny * profundidade, a_mm[2]]
          d = [b_mm[0] + nx * profundidade, b_mm[1] + ny * profundidade, b_mm[2]]
          out << { "t" => "face", "g" => "skin", "f" => "frontal", "sp" => i,
                   "pts" => [a_mm, b_mm, [b_mm[0], b_mm[1], b_mm[2] + altura], [a_mm[0], a_mm[1], a_mm[2] + altura]] }
          out << { "t" => "face", "g" => "skin", "f" => "traseira", "sp" => i,
                   "pts" => [c, [c[0], c[1], c[2] + altura], [d[0], d[1], d[2] + altura], d] }
          out << { "t" => "beam", "g" => "est", "nome" => "M.RB.#{i}", "p1" => a_mm,
                   "p2" => b_mm, "sa" => perfil, "sb" => perfil }
          out << { "t" => "beam", "g" => "est", "nome" => "M.RF.#{i}", "p1" => [a_mm[0], a_mm[1], a_mm[2] + altura],
                   "p2" => [b_mm[0], b_mm[1], b_mm[2] + altura], "sa" => perfil, "sb" => perfil }
        end
        pts.each_with_index do |point, i|
          p = [point.x / 1.mm, point.y / 1.mm, point.z / 1.mm]
          out << { "t" => "beam", "g" => "est", "nome" => "M.Mt.#{i}", "p1" => p,
                   "p2" => [p[0], p[1], p[2] + altura], "sa" => perfil, "sb" => perfil }
        end
        out
      end

      # ======================================================================
      # CONVERTER_PECAS_SERVIDOR_SIGAME — chaves string (JSON) → símbolos, no
      # formato que o desenhar_pecas_sigame consome.
      # ======================================================================
      def self.converter_pecas_servidor_sigame(raw)
        (raw || []).map do |pc|
          if pc["t"] == "face"
            { t: "face", g: pc["g"], f: pc["f"], sp: pc["sp"], pts: pc["pts"] }
          else
            { t: "beam", g: pc["g"], nome: pc["nome"],
              p1: pc["p1"], p2: pc["p2"], sa: pc["sa"], sb: pc["sb"],
              ref: pc["ref"], ca: pc["ca"], cb: pc["cb"] }
          end
        end
      end

      # ======================================================================
      # DESENHAR_PECAS_SIGAME — única ponte cálculo→SketchUp: recebe a lista
      # de peças (mm) e desenha. Materiais/layers/grupos idênticos ao antigo.
      # ======================================================================
      def self.desenhar_pecas_sigame(model, pecas, params)
        cor = (params[:cor_acm] || "Branco Brilho (VX103)").to_s
        fe  = (params[:inc_fita] != false) ? (params[:fe] || 0.9).to_f.mm : 0.0

        Generator.criar_mats(model, { cor: cor, cor_junta: params[:cor_junta] || "Preto",
                                      cor_junta_rgb: params[:cor_junta_rgb] })
        mat_acm = model.materials["ACM_#{cor}"]
        mat_met = model.materials["Metalon"]
        mat_junta = model.materials["Junta_#{(params[:cor_junta] || "Preto")}"]
        mat_fita = model.materials["Fita_DF"] || model.materials.add("Fita_DF")
        mat_fita.color = Sketchup::Color.new(0, 210, 210)   # ciano, igual ao Auto-ACM

        ly = model.layers
        lay_main = ly["ACM_AutoSigame"] || ly.add("ACM_AutoSigame")
        lay_acm  = ly["ACM_Chapas"]     || ly.add("ACM_Chapas")
        lay_est  = ly["ACM_Estrutura"]  || ly.add("ACM_Estrutura")

        grp = model.active_entities.add_group
        grp.name = "AutoSigame_Faixa"
        grp.layer = lay_main

        skin = grp.entities.add_group
        skin.name = "ACM_Chapas"
        skin.layer = lay_acm
        se = skin.entities

        est = grp.entities.add_group
        est.name = "EST_Metalon"
        est.layer = lay_est
        ee = est.entities

        gfita = nil
        if fe > 0
          gfita = grp.entities.add_group
          gfita.name = "FITA_DF"
          gfita.layer = (ly["ACM_FitaDF"] || ly.add("ACM_FitaDF"))
        end

        p3 = lambda { |a| Geom::Point3d.new(a[0].mm, a[1].mm, a[2].mm) }
        v3 = lambda { |a| a ? Geom::Vector3d.new(a[0], a[1], a[2]) : nil }

        pecas.each do |pc|
          case pc[:t]
          when "face"
            q = pc[:pts]
            f = se.add_face(p3.call(q[0]), p3.call(q[1]), p3.call(q[2]), p3.call(q[3])) rescue nil
            if f
              # g "junta" = faixa da junta de dilatação (material da junta)
              mt = (pc[:g] == "junta" && mat_junta) ? mat_junta : mat_acm
              f.material = mt; f.back_material = mt if mt
              f.layer = lay_acm
            end
          when "beam"
            if pc[:g] == "fita"
              next unless gfita
              beam(gfita.entities, p3.call(pc[:p1]), p3.call(pc[:p2]),
                   pc[:sa].mm, pc[:sb].mm, mat_fita, pc[:nome], gfita.layer,
                   v3.call(pc[:ref]), v3.call(pc[:ca]), v3.call(pc[:cb]))
            else
              beam(ee, p3.call(pc[:p1]), p3.call(pc[:p2]),
                   pc[:sa].mm, pc[:sb].mm, mat_met, pc[:nome], lay_est,
                   v3.call(pc[:ref]), v3.call(pc[:ca]), v3.call(pc[:cb]))
            end
          end
        end

        pecas.length
      end

    end # AutoSigame

    # ========================================================================
    # AUTO SIGAM-ME TOOL — desenha o caminho (polilinha) e gera ao finalizar
    # ========================================================================
    class AutoSigameTool

      def initialize(model, acm_params, alt_mm, prof_mm, dialog = nil)
        @model      = model
        @acm_params = acm_params || {}
        @alt_mm     = alt_mm.to_f
        @prof_mm    = prof_mm.to_f
        @dialog     = dialog
        @points     = []
        @mouse_pt   = nil
        @snap_pt    = nil
        @snap_ang   = nil
        @shift_down = false
        @ip         = Sketchup::InputPoint.new
        @ip_prev    = Sketchup::InputPoint.new
      end

      def activate
        Sketchup.status_text =
          "[Auto Sigam-me] Clique os pontos do caminho. Shift=trava 45°. Enter/duplo-clique=gerar. Esc=cancelar."
        @model.active_view.invalidate
      end

      def deactivate(view)
        view.invalidate
      end

      def onLButtonDown(flags, x, y, view)
        @ip.pick(view, x, y)
        pt = (@snap_pt && @shift_down) ? @snap_pt.clone : @ip.position.clone
        @points << pt
        Sketchup.status_text =
          "[Auto Sigam-me] #{@points.length} ponto(s). Próximo ponto ou Enter/duplo-clique pra gerar."
        @ip_prev.copy!(@ip)
        view.invalidate
      end

      def onMouseMove(flags, x, y, view)
        @ip.pick(view, x, y, @ip_prev)
        @mouse_pt = @ip.position.clone
        @shift_down = (flags & 1) != 0

        @snap_pt = nil; @snap_ang = nil
        if @shift_down && @points.length > 0
          last = @points.last
          dx = @mouse_pt.x - last.x
          dy = @mouse_pt.y - last.y
          dist_h = Math.sqrt(dx * dx + dy * dy)
          if dist_h > 1.mm
            ang_rad = Math.atan2(dy, dx)
            step    = Math::PI / 4.0
            snapped = (ang_rad / step).round * step
            @snap_ang = (snapped * 180 / Math::PI).round
            sx = last.x + dist_h * Math.cos(snapped)
            sy = last.y + dist_h * Math.sin(snapped)
            @snap_pt = Geom::Point3d.new(sx, sy, last.z)
          end
        end

        view.tooltip = @ip.tooltip
        view.invalidate
      end

      def draw(view)
        red = Sketchup::Color.new(200, 40, 20)
        if @points.length > 1
          @points.each_cons(2) { |a, b| draw_band_ghost(view, a, b, red) }
          view.drawing_color = red; view.line_width = 3
          @points.each_cons(2) { |a, b| view.draw_lines(a, b) }
        end
        view.draw_points(@points, 8, 2, red) if @points.length > 0

        if @points.length > 0 && @mouse_pt
          last   = @points.last
          target = (@snap_pt && @shift_down) ? @snap_pt : @mouse_pt
          view.drawing_color = red; view.line_width = 2; view.line_stipple = "_"
          view.draw_lines(last, target); view.line_stipple = ""
          draw_band_ghost(view, last, target, red)
          dist_mm = (last.distance(target) / 1.mm).round(0)
          mid = Geom::Point3d.linear_combination(0.5, last, 0.5, target)
          lbl = (@snap_pt && @shift_down) ? "#{dist_mm}mm [#{@snap_ang}°]" : "#{dist_mm}mm"
          view.draw_text(mid, lbl, size: 13)
        end
        @ip.draw(view) if @ip.valid?
      end

      def draw_band_ghost(view, p1, p2, color)
        ax = AutoSigame.axes_for(p1, p2)
        return unless ax
        x_axis, y_axis, z_axis = ax
        comp = Geom::Vector3d.new(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).length
        prof = @prof_mm.to_f.mm
        alt  = @alt_mm.to_f.mm
        o = p1
        c = []
        [[0,0,0],[comp,0,0],[comp,-prof,0],[0,-prof,0],
         [0,0,alt],[comp,0,alt],[comp,-prof,alt],[0,-prof,alt]].each do |lx, lyv, lz|
          c << Geom::Point3d.new(
            o.x + x_axis.x*lx + y_axis.x*lyv + z_axis.x*lz,
            o.y + x_axis.y*lx + y_axis.y*lyv + z_axis.y*lz,
            o.z + x_axis.z*lx + y_axis.z*lyv + z_axis.z*lz)
        end
        edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
        view.drawing_color = color; view.line_width = 1
        edges.each { |a, b| view.draw_lines(c[a], c[b]) }
      end

      def getExtents
        bb = Geom::BoundingBox.new
        @points.each { |p| bb.add(p) }
        bb.add(@mouse_pt) if @mouse_pt
        bb
      end

      def onReturn(view)
        gerar_tudo(view)
        @model.select_tool(nil)
      end

      def onLButtonDoubleClick(flags, x, y, view)
        gerar_tudo(view)
        @model.select_tool(nil)
      end

      def onKeyUp(key, repeat, flags, view)
        if key == 16
          @shift_down = false; @snap_pt = nil; @snap_ang = nil
          view.invalidate
        end
      end

      def onCancel(reason, view)
        @model.select_tool(nil)
      end

      def gerar_tudo(view)
        return if @points.length < 2
        cam = view.camera
        eye, target, up = cam.eye, cam.target, cam.up
        begin
          @model.start_operation("Auto Sigam-me", true)
          AutoSigame.build_band(@model, @points, @alt_mm, @prof_mm, @acm_params)
          @model.commit_operation
          Sketchup.status_text = "[Auto Sigam-me] faixa gerada (#{@points.length - 1} trecho(s))."
          enviar_preview rescue nil
        rescue => e
          @model.abort_operation rescue nil
          UI.messagebox("Erro Auto Sigam-me: #{e.message}\n#{e.backtrace.first(3).join("\n")}")
        end
        cam.set(eye, target, up) rescue nil
        view.invalidate
      end

      # Manda os dados do que foi gerado pro painel desenhar a planta 2D + iso.
      def enviar_preview
        return unless @dialog && @points.length >= 2
        require 'json'
        p0 = @points[0]
        pts = @points.map { |p| [((p.x - p0.x) / 1.mm).round(1), ((p.y - p0.y) / 1.mm).round(1)] }
        pa = @acm_params
        orient = (pa[:chapa_orient] || "horizontal").to_s
        chapa = (orient == "vertical") ? (pa[:chapa_larg] || 1220).to_f : (pa[:chapa_comp] || 5000).to_f
        data = {
          points: pts, prof: @prof_mm, alt: @alt_mm, chapa: chapa,
          quant: Generator::AutoSigame.last_quant,
          origin: [(p0.x / 1.mm).round(1), (p0.y / 1.mm).round(1), (p0.z / 1.mm).round(1)],
          faces: {
            frontal:  pa[:enab_frontal]  != false,
            traseira: pa[:enab_traseira] == true,
            topo:     pa[:enab_topo]     != false,
            base:     pa[:enab_base]     != false,
            esq:      pa[:enab_esq]      == true,
            dir:      pa[:enab_dir]      == true
          }
        }
        @dialog.execute_script("if(window.AutoSigame&&AutoSigame.onGerado)AutoSigame.onGerado(#{data.to_json})")
      end

    end # AutoSigameTool

  end
end
