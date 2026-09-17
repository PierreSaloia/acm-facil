# encoding: UTF-8
# ============================================================================
# SignEng — Módulo LOGO 3D
# ============================================================================
# Importa um arquivo DXF/DWG, extrude pra criar um logo 3D sólido ou oco,
# com opção de contorno externo (tipo placa atrás do logo).
#
# ANTI-PIRATARIA (v1.9.8): os parsers de DXF/SVG rodam na function
# logo3dCompute (Supabase Edge Function — pendente, ver
# supabase/EDGE_FUNCTIONS_PENDING.md), que valida licença + módulo antes de
# parsear.
# O plugin envia o texto do arquivo e recebe paths 2D prontos. Sem
# carregamento validado pelo servidor, o gerar não tem dados (SVG) nem
# @current_path (todos os formatos).
#
# Fluxo:
#   1. Usuário clica "Carregar DXF/DWG/SVG" → abre UI.openpanel
#   2. Ruby lê o arquivo e envia pro servidor → paths 2D + dimensões
#   3. JS renderiza o preview no canvas, pré-preenche largura/altura
#   4. Usuário ajusta params (dimensões, extrusão, cor, contorno)
#   5. Clica "Gerar" → DXF/DWG: model.import nativo; SVG: geometria a
#      partir dos subpaths devolvidos pelo servidor no carregamento
# ============================================================================

module SignEng
  module Generator
    module Logo3D

      MM = 1.mm

      # Estado entre callbacks
      @current_path = nil
      @svg_subpaths = nil

      class << self
        attr_accessor :current_path
      end

      # ======================================================================
      # CARREGAR ARQUIVO — abre UI.openpanel do SketchUp
      #
      # Retorno:
      #   { ok: true, filename: "logo.dxf", path: "C:/...",
      #     paths_2d: [[[x,y],[x,y],...], ...], dims_mm: [w, h] }
      #   { ok: false, code: "logo3d.cancelled" | "logo3d.invalid_ext" | ... }
      # ======================================================================
      def self.carregar_arquivo_data
        path = UI.openpanel(
          "Selecione um arquivo DXF, DWG ou SVG",
          "",
          "Vetor (DXF/DWG/SVG)|*.dxf;*.dwg;*.svg||"
        )
        return { ok: false, code: "logo3d.cancelled" } unless path
        return { ok: false, code: "logo3d.invalid_file" } unless File.exist?(path)

        ext = File.extname(path).downcase
        unless %w[.dxf .dwg .svg].include?(ext)
          return { ok: false, code: "logo3d.invalid_ext" }
        end

        # Conteúdo do arquivo (DXF/SVG são texto — DWG é binário e não sobe)
        content = ""
        if ext != ".dwg"
          begin
            content = File.read(path, encoding: 'UTF-8')
            content = File.read(path, encoding: 'ISO-8859-1').encode('UTF-8') unless content.valid_encoding?
          rescue
            return { ok: false, code: "logo3d.invalid_file" }
          end
          if content.bytesize > 15_000_000
            return { ok: false, code: "logo3d.server", error: "Arquivo muito grande (máx. 15 MB)." }
          end
        end

        # Parse no servidor — valida licença + módulo logo3d (anti-pirataria)
        r = solicitar_parse_servidor(ext.delete("."), content)
        return { ok: false, code: "logo3d.server", error: r[:error] } unless r[:ok]

        @current_path = path
        @svg_subpaths = (ext == ".svg") ? (r[:subpaths] || []) : nil

        paths_2d = (ext == ".svg") ? (r[:subpaths] || []) : (r[:paths_2d] || [])
        dims_mm  = r[:dims_mm]

        # Fallback: se não conseguiu extrair dimensões, calcula do bbox dos paths
        if dims_mm.nil? && !paths_2d.empty?
          xs = []
          ys = []
          paths_2d.each do |pth|
            pth.each do |pt|
              xs << pt[0]
              ys << pt[1]
            end
          end
          if !xs.empty? && !ys.empty?
            w = (xs.max - xs.min).abs
            h = (ys.max - ys.min).abs
            dims_mm = [w.round(1), h.round(1), 1.0] if w > 0 && h > 0
          end
        end

        {
          ok: true,
          filename: File.basename(path),
          path: path,
          paths_2d: paths_2d,
          dims_mm: dims_mm,
          n_paths: paths_2d.length,
          is_dxf: ext == ".dxf"
        }
      rescue => e
        puts "[Logo3D] carregar_arquivo exception: #{e.message}"
        { ok: false, code: "logo3d.exception", error: e.message }
      end

      # ======================================================================
      # SOLICITAR_PARSE_SERVIDOR — chama a function logo3dCompute (anti-
      # pirataria). Os parsers DXF/SVG rodam no servidor, que valida licença
      # + módulo. Payload = { kind: "dxf"|"svg"|"dwg", content: texto }.
      # Refresh de token com retry 1x. Devolve { ok, paths_2d, dims_mm,
      # subpaths } ou { ok: false, error: msg }.
      # ======================================================================
      def self.solicitar_parse_servidor(kind, content)
        ns = Core::Auth::DEFAULT_NS
        access_token = Sketchup.read_default(ns, "sb_access_token", "").to_s
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if access_token.empty?

        payload = { "kind" => kind, "content" => content }

        r = Core::SupabaseClient.call_function("logo3dCompute", payload, access_token)
        if !r[:ok] && r[:status].to_i == 401
          refresh = Sketchup.read_default(ns, "sb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::SupabaseClient.refresh_session(refresh)
            if ref[:ok]
              access_token = ref[:access_token]
              Core::Auth.save_tokens(ref)
              r = Core::SupabaseClient.call_function("logo3dCompute", payload, access_token)
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
        { ok: true, paths_2d: res["paths_2d"], dims_mm: res["dims_mm"], subpaths: res["subpaths"] }
      end

      # ======================================================================
      # GERAR — importa o DXF/DWG e faz a extrusão 3D
      #
      # Params (vindos do JS):
      #   largura, altura, extrusao      (em mm)
      #   tipo                            ("solido" | "oco")
      #   espessura_casca                (mm, só se oco)
      #   cor_nome                        (string)
      #   cor_r, cor_g, cor_b             (0-255)
      #   contorno                        (bool)
      #   contorno_esp, contorno_ext      (mm)
      #   contorno_cor_r/g/b              (0-255)
      #
      # Retorno:
      #   { ok: true, n_faces: N, group_name: "Logo3D_xxx" }
      #   { ok: false, code: "logo3d.no_file" | "logo3d.import_failed" | ... }
      # ======================================================================
      def self.gerar(params)
        return { ok: false, code: "logo3d.no_file" } unless @current_path && File.exist?(@current_path)

        model = Sketchup.active_model
        model.start_operation('Logo 3D', true)
        begin
          dxf_path  = @current_path
          largura   = (get_num(params, :largura,        1000)).to_f * MM
          altura    = (get_num(params, :altura,         500)).to_f  * MM
          extrusao  = (get_num(params, :extrusao,       30)).to_f   * MM
          tipo      = (get_str(params, :tipo,          'solido'))
          esp_casca = (get_num(params, :espessura_casca, 3)).to_f   * MM
          cor_nome  = (get_str(params, :cor_nome,      'Logo3D'))
          cor_r     = (get_num(params, :cor_r, 180)).to_i
          cor_g     = (get_num(params, :cor_g, 180)).to_i
          cor_b     = (get_num(params, :cor_b, 180)).to_i

          contorno      = get_bool(params, :contorno, false)
          contorno_esp  = (get_num(params, :contorno_esp, 5)).to_f  * MM
          contorno_ext  = (get_num(params, :contorno_ext, 10)).to_f * MM
          contorno_r    = (get_num(params, :contorno_cor_r, cor_r)).to_i
          contorno_g    = (get_num(params, :contorno_cor_g, cor_g)).to_i
          contorno_b    = (get_num(params, :contorno_cor_b, cor_b)).to_i

          keep_miolos   = get_bool(params, :keep_miolos, true)

          return { ok: false, code: "logo3d.invalid_size" } if largura <= 0 || altura <= 0 || extrusao <= 0

          ext = File.extname(dxf_path).downcase

          if ext == '.svg'
            # SVG: sem importador nativo no SketchUp. Constrói a geometria a partir
            # dos subpaths devolvidos pelo servidor no carregamento e resolve os
            # miolos (furos) por even-odd. group/ents/faces saem prontas pro fluxo
            # comum abaixo.
            group, ents, faces = build_svg_geometry(model, @svg_subpaths, keep_miolos)
            if group.nil? || faces.nil? || faces.empty?
              model.abort_operation
              return { ok: false, code: "logo3d.no_faces_created" }
            end
          else

          # 1. Guarda entidades existentes
          model.selection.clear
          existing_ids = {}
          model.active_entities.each { |e| existing_ids[e.entityID] = true }

          # 2. Importa DXF/DWG
          success = model.import(dxf_path)
          unless success
            model.abort_operation
            return { ok: false, code: "logo3d.import_failed" }
          end

          # 3. Identifica as novas entidades
          new_ents = model.active_entities.select { |e| !existing_ids[e.entityID] }
          imported_group = new_ents.find { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
          if imported_group
            imported_group.explode
            new_ents = model.active_entities.select { |e| !existing_ids[e.entityID] }
          end
          if new_ents.empty?
            model.abort_operation
            return { ok: false, code: "logo3d.no_geometry" }
          end

          # 4. Agrupa
          group = model.active_entities.add_group(new_ents)
          ents = group.entities

          # 5. Cria faces a partir de edges (se DXF só tiver linhas)
          faces = ents.grep(Sketchup::Face)
          if faces.empty?
            edges = ents.grep(Sketchup::Edge)
            edges.each { |e| e.find_faces }
            faces = ents.grep(Sketchup::Face)
          end
          if faces.empty?
            model.abort_operation
            return { ok: false, code: "logo3d.no_faces_created" }
          end

          # 5b. Remove miolos (contornos internos) se o user pediu.
          # Estratégia: pra cada face com inner loops, apaga as arestas dos
          # inner loops. O SketchUp automaticamente transforma a face com
          # furo numa face sólida (contorno externo preenchido).
          unless keep_miolos
            faces_com_furos = ents.grep(Sketchup::Face).select { |f|
              f.valid? && f.loops.length > 1
            }
            inner_edges_to_delete = []
            faces_com_furos.each do |face|
              face.loops.each do |lp|
                next if lp.outer?
                inner_edges_to_delete.concat(lp.edges)
              end
            end
            inner_edges_to_delete.uniq!
            ents.erase_entities(inner_edges_to_delete) unless inner_edges_to_delete.empty?
            # Re-coleta as faces (algumas podem ter sido recriadas/mescladas)
            faces = ents.grep(Sketchup::Face)
          end

          end # fim do branch ext (.svg / import nativo)

          # 6. Material principal
          mat_name = "Logo3D_#{cor_nome.gsub(/[^a-zA-Z0-9]/, '_')}"
          mat = model.materials[mat_name] || model.materials.add(mat_name)
          mat.color = Sketchup::Color.new(cor_r, cor_g, cor_b)

          # 7. Escala pras dimensões desejadas
          bb = group.bounds
          cur_w = bb.width
          cur_h = bb.height
          if cur_w > 0 && cur_h > 0
            sx = largura / cur_w
            sy = altura  / cur_h
            origin = bb.min
            t_to_origin = Geom::Transformation.translation(
              Geom::Vector3d.new(-origin.x, -origin.y, -origin.z)
            )
            t_scale = Geom::Transformation.scaling(ORIGIN, sx, sy, 1.0)
            group.transform!(t_to_origin)
            group.transform!(t_scale)
          end

          # 7b. Extrai loops antes da extrusão (pra contorno)
          contorno_loops = []
          if contorno && contorno_esp > 0
            ents.grep(Sketchup::Face).each do |face|
              next unless face.valid?
              face.reverse! if face.normal.z < 0
              outer_pts = face.outer_loop.vertices.map { |v| v.position.clone }
              contorno_loops << outer_pts
            end
          end

          # 8. Aplica material + extruda
          faces = ents.grep(Sketchup::Face)
          faces_extrudadas = 0
          faces.each do |face|
            next unless face.valid?
            face.material = mat
            face.back_material = mat
            face.reverse! if face.normal.z < 0
            face.pushpull(extrusao)
            faces_extrudadas += 1
          end
          if faces_extrudadas == 0
            model.abort_operation
            return { ok: false, code: "logo3d.extrusion_failed" }
          end

          # 9. Modo oco (opcional)
          if tipo == 'oco' && esp_casca > 0
            begin
              top_faces = ents.grep(Sketchup::Face).select { |f|
                f.valid? && f.normal.z > 0.9
              }
              top_faces.each do |tf|
                offset_edges = tf.offset(-esp_casca)
                if offset_edges && !offset_edges.empty?
                  inner_faces = ents.grep(Sketchup::Face).select { |f|
                    f.valid? && f != tf && f.normal.z > 0.9 &&
                    f.edges.any? { |e| offset_edges.include?(e) }
                  }
                  inner_faces.each do |inf|
                    inf.pushpull(-(extrusao - esp_casca))
                  end
                end
              end
            rescue => e
              puts "[Logo3D] modo oco falhou — #{e.message} (mantendo sólido)"
            end
          end

          # 10. Aplica material em TODAS as faces (laterais + topo + base)
          ents.grep(Sketchup::Face).each do |f|
            f.material = mat
            f.back_material = mat
          end

          # 11. Contorno externo (opcional)
          if contorno && contorno_esp > 0 && !contorno_loops.empty?
            begin
              mat_cont_name = "Logo3D_Contorno_#{cor_nome.gsub(/[^a-zA-Z0-9]/, '_')}"
              mat_cont = model.materials[mat_cont_name] || model.materials.add(mat_cont_name)
              mat_cont.color = Sketchup::Color.new(contorno_r, contorno_g, contorno_b)

              cont_group = ents.add_group
              cont_ents = cont_group.entities

              contorno_loops.each do |outer_pts|
                next if outer_pts.length < 3
                outer_offset = offset_loop_pts(outer_pts, contorno_esp, 0)
                next if outer_offset.length < 3

                existing_face_ids = {}
                cont_ents.grep(Sketchup::Face).each { |f| existing_face_ids[f.entityID] = true }

                # Loop externo
                outer_offset.each_with_index do |pt, i|
                  nxt = outer_offset[(i + 1) % outer_offset.length]
                  cont_ents.add_line(pt, nxt)
                end
                # Loop interno (= contorno do logo)
                outer_pts.each_with_index do |pt, i|
                  nxt = outer_pts[(i + 1) % outer_pts.length]
                  p1 = Geom::Point3d.new(pt.x, pt.y, 0)
                  p2 = Geom::Point3d.new(nxt.x, nxt.y, 0)
                  cont_ents.add_line(p1, p2)
                end

                cont_ents.grep(Sketchup::Face).each do |cf|
                  next unless cf.valid?
                  next if existing_face_ids[cf.entityID]
                  cf.reverse! if cf.normal.z < 0
                  if cf.loops.length >= 2
                    # Anel = face com furo → extruda (é o contorno)
                    cf.material = mat_cont
                    cf.back_material = mat_cont
                    cf.pushpull(contorno_ext)
                  else
                    # Face interna coincide com o logo → deleta
                    cont_ents.erase_entities(cf)
                  end
                end
              end

              cont_ents.grep(Sketchup::Face).each do |f|
                f.material = mat_cont
                f.back_material = mat_cont
              end
            rescue => e
              puts "[Logo3D] contorno falhou — #{e.message}"
            end
          end

          base_name = File.basename(dxf_path, ext)
          group.name = "Logo3D_#{base_name}"
          model.commit_operation

          # Seleciona e enquadra o novo grupo. Sem isso, gerações sucessivas
          # se empilham na origem e parecem "não ter gerado" (ficam enterradas
          # sob o logo anterior). Selecionar deixa o resultado óbvio e pronto
          # pra mover.
          begin
            model.selection.clear
            model.selection.add(group) if group && group.valid?
            model.active_view.zoom(group)
          rescue
            begin; model.active_view.zoom_extents; rescue; end
          end

          {
            ok: true,
            n_faces: faces_extrudadas,
            group_name: group.name,
            tipo: tipo,
            has_contorno: contorno
          }
        rescue => e
          model.abort_operation
          puts "[Logo3D] gerar exception: #{e.message}"
          puts e.backtrace.first(5).join("\n")
          { ok: false, code: "logo3d.exception", error: e.message }
        end
      end

      # ======================================================================
      # RESET
      # ======================================================================
      def self.reset_state
        @current_path = nil
        @svg_subpaths = nil
        { ok: true }
      end

      # ======================================================================
      # HELPERS — extração de params (aceita symbol ou string)
      # ======================================================================
      def self.get_num(h, key, default)
        v = h[key] || h[key.to_s]
        v.nil? ? default : v.to_f
      end

      def self.get_str(h, key, default)
        v = h[key] || h[key.to_s]
        v.nil? ? default : v.to_s
      end

      def self.get_bool(h, key, default)
        v = h[key] || h[key.to_s]
        return default if v.nil?
        v == true || v.to_s == "true" || v.to_s == "1"
      end

      # ======================================================================
      # offset_loop_pts — offset 2D pra criar o anel do contorno
      # ======================================================================
      def self.offset_loop_pts(pts, dist, z_val)
        n = pts.length
        return [] if n < 3

        offset_pts = []
        n.times do |i|
          p_prev = pts[(i - 1) % n]
          p_curr = pts[i]
          p_next = pts[(i + 1) % n]

          e1_x = p_curr.x - p_prev.x
          e1_y = p_curr.y - p_prev.y
          e2_x = p_next.x - p_curr.x
          e2_y = p_next.y - p_curr.y

          len1 = Math.sqrt(e1_x * e1_x + e1_y * e1_y)
          len2 = Math.sqrt(e2_x * e2_x + e2_y * e2_y)
          if len1 < 0.001 || len2 < 0.001
            offset_pts << Geom::Point3d.new(p_curr.x, p_curr.y, z_val)
            next
          end

          n1_x = -e1_y / len1
          n1_y =  e1_x / len1
          n2_x = -e2_y / len2
          n2_y =  e2_x / len2

          lp1 = Geom::Point3d.new(p_prev.x + n1_x * dist, p_prev.y + n1_y * dist, z_val)
          lp2 = Geom::Point3d.new(p_curr.x + n2_x * dist, p_curr.y + n2_y * dist, z_val)
          line1 = [lp1, Geom::Vector3d.new(e1_x, e1_y, 0)]
          line2 = [lp2, Geom::Vector3d.new(e2_x, e2_y, 0)]
          new_pt = Geom.intersect_line_line(line1, line2)

          if new_pt
            dx = new_pt.x - p_curr.x
            dy = new_pt.y - p_curr.y
            moved = Math.sqrt(dx * dx + dy * dy)
            if moved > dist * 5
              scale = dist * 5 / moved
              new_pt = Geom::Point3d.new(p_curr.x + dx * scale, p_curr.y + dy * scale, z_val)
            end
            offset_pts << Geom::Point3d.new(new_pt.x, new_pt.y, z_val)
          else
            offset_pts << Geom::Point3d.new(p_curr.x + n1_x * dist, p_curr.y + n1_y * dist, z_val)
          end
        end
        offset_pts
      end

      # ======================================================================
      # build_svg_geometry — constrói a geometria 3D a partir dos subpaths
      # devolvidos pelo servidor (logo3dCompute) no carregamento.
      #
      # SVG não tem importador nativo no SketchUp, então montamos as arestas
      # no Z=0. Os furos (miolos) são resolvidos por EVEN-ODD: o SketchUp
      # cria o anel (a letra, com loop de furo) E o disco-ilha que ocupa o
      # furo. Pra preservar o furo, apagamos as faces-ilha (mantendo as
      # arestas), detectando-as por: o loop externo da ilha é IGUAL ao loop
      # interno (furo) de outra face — comparação de arestas compartilhadas,
      # determinística (sem adivinhar por centroide).
      #
      # keep_miolos = true  → apaga ilhas, furos sobrevivem.
      # keep_miolos = false → mantém ilhas, furos somem (letra sólida).
      #
      # Retorna [group, ents, faces] ou [nil, nil, []] em falha.
      # ======================================================================
      def self.build_svg_geometry(model, subpaths, keep_miolos)
        return [nil, nil, []] if subpaths.nil? || subpaths.empty?

        group = model.active_entities.add_group
        ents  = group.entities

        # 1. Cria as arestas de cada subpath no plano Z=0
        subpaths.each do |pts|
          next if pts.length < 2
          (0...(pts.length - 1)).each do |i|
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            next if (x1 - x2).abs < 1e-9 && (y1 - y2).abs < 1e-9
            begin
              ents.add_line(
                Geom::Point3d.new(x1 * MM, y1 * MM, 0),
                Geom::Point3d.new(x2 * MM, y2 * MM, 0)
              )
            rescue
              # segmento curto demais pro SketchUp — ignora
            end
          end
        end

        # 2. Garante faces (o SketchUp normalmente cria sozinho ao fechar loops)
        faces = ents.grep(Sketchup::Face)
        if faces.empty?
          ents.grep(Sketchup::Edge).each { |e| e.find_faces }
          faces = ents.grep(Sketchup::Face)
        end
        return [group, ents, []] if faces.empty?

        # 3. Remove as faces-ilha pra preservar os furos (só se keep_miolos)
        if keep_miolos
          inner_loop_sets = []
          faces.each do |f|
            next unless f.valid?
            f.loops.each do |lp|
              next if lp.outer?
              inner_loop_sets << lp.edges.map(&:entityID).sort
            end
          end
          unless inner_loop_sets.empty?
            islands = faces.select do |f|
              next false unless f.valid?
              next false if f.loops.length > 1   # face com furo é o anel, não ilha
              outer_ids = f.outer_loop.edges.map(&:entityID).sort
              inner_loop_sets.include?(outer_ids)
            end
            ents.erase_entities(islands) unless islands.empty?
            faces = ents.grep(Sketchup::Face)
          end
        end

        [group, ents, faces]
      rescue => e
        puts "[Logo3D] build_svg_geometry exception: #{e.message}"
        [nil, nil, []]
      end

    end
  end
end
