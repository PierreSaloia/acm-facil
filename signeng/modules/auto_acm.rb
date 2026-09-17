# encoding: UTF-8
# ============================================================================
# ACM Facade Generator — Modulo AUTO-ACM
# Modo reverso: usuario cria uma caixa (grupo), seleciona, e o modulo
# preenche com estrutura ACM completa (metalon, ACM, fita, juntas, spots).
# ============================================================================

module SignEng
  module Generator
    module AutoACM

      # Cores usadas para pintar as 6 faces (uma por direcao do bbox)
      # Direcao -> [nome_amigavel, RGB]
      FACE_COLORS = {
        "px" => ["AA_Vermelho",  [220,  40,  40]],  # +X (lateral direita normalmente)
        "nx" => ["AA_Ciano",     [ 40, 200, 220]],  # -X
        "py" => ["AA_Verde",     [ 40, 200,  60]],  # +Y
        "ny" => ["AA_Magenta",   [220,  40, 200]],  # -Y
        "pz" => ["AA_Azul",      [ 40,  80, 220]],  # +Z (topo)
        "nz" => ["AA_Amarelo",   [240, 220,  40]]   # -Z (base)
      }

      # ======================================================================
      # PINTAR FACES — pinta cada face do grupo selecionado com cor por direcao
      # ======================================================================
      # ======================================================================
      # CAPTURAR FACES — suporta MULTIPLOS grupos selecionados
      # Para cada grupo selecionado, pinta as 6 faces por direcao dominante
      # e envia ao dialog a lista completa de modulos com entity_ids.
      # ======================================================================
      # BAKE_GROUP_SCALE — absorve a escala da .transformation de um grupo
      # diretamente nas entidades internas. Após a chamada, a transformação
      # do grupo só carrega rotação+posição; suas dimensões locais batem com
      # as dimensões mundo. Idempotente: se a escala já é 1, retorna false
      # sem mexer em nada. Funciona só pra Sketchup::Group (ComponentInstance
      # compartilha definition entre instâncias — risco de afetar outras).
      # ======================================================================
      def self.bake_group_scale(grp)
        return false unless grp.is_a?(Sketchup::Group)
        t = grp.transformation
        a = t.to_a
        sx = Math.sqrt(a[0]**2  + a[1]**2  + a[2]**2)
        sy = Math.sqrt(a[4]**2  + a[5]**2  + a[6]**2)
        sz = Math.sqrt(a[8]**2  + a[9]**2  + a[10]**2)
        # Tolerância — escala já normalizada
        return false if (sx - 1.0).abs < 0.0001 &&
                        (sy - 1.0).abs < 0.0001 &&
                        (sz - 1.0).abs < 0.0001
        # Nova transformação só com rotação+posição (sem escala)
        rot_x = Geom::Vector3d.new(a[0] / sx, a[1] / sx, a[2] / sx)
        rot_y = Geom::Vector3d.new(a[4] / sy, a[5] / sy, a[6] / sy)
        rot_z = Geom::Vector3d.new(a[8] / sz, a[9] / sz, a[10] / sz)
        pos   = Geom::Point3d.new(a[12], a[13], a[14])
        pure_t = Geom::Transformation.axes(pos, rot_x, rot_y, rot_z)
        # Escala as entidades internas pra absorver o fator
        scale_t = Geom::Transformation.scaling(ORIGIN, sx, sy, sz)
        ents = grp.entities
        ents.transform_entities(scale_t, ents.to_a)
        grp.transformation = pure_t
        true
      rescue => _e
        false
      end

      # ======================================================================
      # ======================================================================
      # CAPTURAR FACES — versao BRIDGE (retorna hash em vez de execute_script)
      # Usada pelo novo plugin SignEng. Retorna:
      #   { ok: true, modulos: [...], face_colors: [...] }
      #   { ok: false, code: "autoacm.no_selection" }
      # ======================================================================
      def self.capturar_faces_data
        model = Sketchup.active_model
        sel = model.selection

        grupos = []
        sel.each do |ent|
          if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
            grupos << ent
          end
        end

        return { ok: false, code: "autoacm.no_selection" } if grupos.empty?

        model.start_operation("Auto-ACM Capturar Faces", true)
        modulos_data = []
        begin
          mats = {}
          FACE_COLORS.each do |dir, (nome, rgb)|
            m = model.materials[nome] || model.materials.add(nome)
            m.color = Sketchup::Color.new(*rgb)
            mats[dir] = m
          end

          grupos.each_with_index do |grp, idx|
            # Absorve escala da transformação do grupo NA geometria interna,
            # se houver. Necessário porque a ferramenta Escala do SketchUp
            # aplica o redimensionamento na .transformation do grupo (não nas
            # entidades internas) — sem isso, local_bb fica defasado após
            # editar com a Escala. Pushpull já modifica as entidades direto,
            # então cai no caminho normal.
            bake_group_scale(grp) if grp.is_a?(Sketchup::Group)

            ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
            count = 0
            ents.grep(Sketchup::Face).each do |f|
              n = f.normal
              dir = dominant_dir(n)
              next unless dir
              f.material = mats[dir]
              f.back_material = mats[dir]
              count += 1
            end

            local_bb = Geom::BoundingBox.new
            ents.each { |e| local_bb.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
            next unless local_bb.valid?
            w = ((local_bb.max.x - local_bb.min.x) / 1.mm).round(0)
            d = ((local_bb.max.y - local_bb.min.y) / 1.mm).round(0)
            h = ((local_bb.max.z - local_bb.min.z) / 1.mm).round(0)

            nome_grp = grp.respond_to?(:name) ? grp.name.to_s : ""
            nome_grp = "Modulo #{idx+1}" if nome_grp.strip.empty?

            modulos_data << {
              entity_id: grp.entityID,
              idx:       idx,
              nome:      nome_grp,
              w:         w,
              h:         h,
              d:         d,
              n_faces:   count
            }
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          return { ok: false, code: "autoacm.capture_error", error: e.message }
        end

        return { ok: false, code: "autoacm.no_valid_modules" } if modulos_data.empty?

        face_colors = FACE_COLORS.map do |dir, (nome, rgb)|
          { dir: dir, nome: nome, rgb: rgb }
        end

        { ok: true, modulos: modulos_data, face_colors: face_colors }
      end

      # ======================================================================
      # aplicar_edicoes_data — versao BRIDGE da aplicar_edicoes legada.
      # Retorna hash com {ok, n_del, n_ofs, quant?} em vez de usar execute_script.
      # Move/deleta sub-grupos diretamente no modelo e recalcula o quantitativo.
      # ======================================================================
      def self.aplicar_edicoes_data(entity_id, del_ids, ofs_list, params_raw = nil, extras_add = nil)
        model = Sketchup.active_model
        grp = find_entity_by_id(model, entity_id.to_i)
        return { ok: false, code: "autoacm.entity_not_found" } unless grp

        model.start_operation("Auto-ACM Aplicar Edicoes", true)
        n_del = 0
        n_ofs = 0
        n_add = 0

        begin
          mapa = mapear_pecas(grp)

          # 1) MOVER pecas (antes de deletar — ids continuam estaveis)
          (ofs_list || []).each do |o|
            id = o["id"] || o[:id]
            dx = (o["dx"] || o[:dx] || 0).to_f
            dy = (o["dy"] || o[:dy] || 0).to_f
            dz = (o["dz"] || o[:dz] || 0).to_f
            ent = mapa[id.to_s]
            next if ent.nil? || !ent.valid?
            next if dx.abs < 0.1 && dy.abs < 0.1 && dz.abs < 0.1
            tr = Geom::Transformation.translation([dx.mm, dy.mm, dz.mm])
            ent.transform!(tr)
            n_ofs += 1
          end

          # 2) DELETAR pecas
          (del_ids || []).each do |id|
            ent = mapa[id.to_s]
            next if ent.nil? || !ent.valid?
            ent.erase!
            n_del += 1
          end

          # 3) ADICIONAR ferragens extras (novos sub-grupos)
          # Cada extra: {x,y,z,w,d,h,cat:'met'|'em'|'fita',orient,eixo,prof_w,prof_h}
          # Coordenadas em mm, no sistema local do grupo principal.
          unless (extras_add.nil? || extras_add.empty?)
            # Garante materiais (cores padrao se ainda nao existirem)
            { "Metalon" => [155,160,165], "Emenda" => [140,145,150],
              "Fita_DF" => [0,210,210] }.each do |n, rgb|
              model.materials.add(n).color = Sketchup::Color.new(*rgb) unless model.materials[n]
            end

            # Origem local do grupo (canto bb_min) — extras vem em coords locais
            # IMPORTANTE: usa SÓ as faces ACM diretas do grupo (não sub-grupos
            # EST_Metalon/SPOTS/FITA). Sub-grupos como spots projetam pra fora
            # do painel original (z negativo na base, etc.) e bagunçariam a
            # origem usada pra posicionar o extra — o que jogava o perfil pra
            # fora da estrutura. As faces ACM dão sempre o bbox correto do
            # painel original, independente do que gerar() tenha adicionado.
            bb_local = Geom::BoundingBox.new
            ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
            ents.grep(Sketchup::Face).each { |f| bb_local.add(f.bounds) if f.bounds.valid? }
            # Fallback (sem faces — caso muito edge): cai pro comportamento legado
            unless bb_local.valid?
              ents.each { |e| bb_local.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
            end
            ox = bb_local.min.x; oy = bb_local.min.y; oz = bb_local.min.z

            extras_add.each_with_index do |ex, i|
              x_mm = (ex["x"] || ex[:x] || 0).to_f
              y_mm = (ex["y"] || ex[:y] || 0).to_f
              z_mm = (ex["z"] || ex[:z] || 0).to_f
              w_mm = (ex["w"] || ex[:w] || 0).to_f
              d_mm = (ex["d"] || ex[:d] || 0).to_f
              h_mm = (ex["h"] || ex[:h] || 0).to_f
              cat  = (ex["cat"] || ex[:cat] || "met").to_s
              next if w_mm < 0.5 || d_mm < 0.5 || h_mm < 0.5

              mat_name, prefix = case cat
                                 when "em"   then ["Emenda",  "EX.EM"]
                                 when "fita" then ["Fita_DF", "EX.FT"]
                                 else             ["Metalon", "EX.MT"]
                                 end
              eixo = (ex["eixo"] || ex[:eixo] || "z").to_s
              nome = "#{prefix}.#{eixo.upcase}.#{i}"

              x_abs = ox + x_mm.mm
              y_abs = oy + y_mm.mm
              z_abs = oz + z_mm.mm
              g = Generator.box(ents, x_abs, y_abs, z_abs, w_mm.mm, d_mm.mm, h_mm.mm, mat_name, nome)
              n_add += 1 if g
            end
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          return { ok: false, code: "autoacm.aplicar_erro", error: e.message }
        end

        # Recalcula o quantitativo pra devolver ao JS (pra preview atualizar).
        # IMPORTANTE: usar `extrair(params_raw)` em vez de montar sym_params
        # na mão. Os valores que vêm do JS são raw (em mm); `extrair` faz
        # `.to_f.mm` que converte pra unidades internas do SketchUp. Sem
        # essa conversão, `calcular_quantitativo` faz `value / 1.mm` e
        # transforma 20mm em 508 (= 20 × 25.4), bagunçando metalon_wh,
        # emenda_w/h etc. no relatório.
        quant = nil
        begin
          sym_params = {}
          (params_raw || {}).each { |k, v| sym_params[k.to_sym] = v }
          extracted = extrair(sym_params)
          quant = calcular_quantitativo(grp, extracted)
        rescue => ex
          puts "[AutoACM] Erro ao recalcular quant apos edicao: #{ex.message}"
        end

        { ok: true, n_del: n_del, n_ofs: n_ofs, quant: quant }
      end

      # ======================================================================
      # selecionar_modulo_por_id — seleciona o grupo no SU pelo entity_id
      # Usado pelo clique em aba (zoom opcional)
      # ======================================================================
      def self.selecionar_modulo_por_id(entity_id, zoom = false)
        model = Sketchup.active_model
        grp = find_entity_by_id(model, entity_id.to_i)
        return { ok: false, code: "autoacm.entity_not_found" } unless grp
        sel = model.selection
        sel.clear
        sel.add(grp)
        if zoom
          begin
            model.active_view.zoom(grp)
          rescue
          end
        end
        { ok: true }
      end

      # ══════════════════════════════════════════════════════════════════════
      # (LEGADO) pintar_faces com execute_script — preservado pra nao quebrar
      # nada que ainda dependa dele. Nao e usado pelo novo plugin SignEng.
      # ══════════════════════════════════════════════════════════════════════
      def self.pintar_faces(dialog)
        model = Sketchup.active_model
        sel = model.selection

        # Coletar TODOS os grupos/componentes selecionados
        grupos = []
        sel.each do |ent|
          if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
            grupos << ent
          end
        end

        if grupos.empty?
          UI.messagebox("Selecione um ou mais GRUPOS (ou componentes) antes de capturar as faces.\n\nDica: para fachadas com multiplos modulos, selecione todos (CTRL+click) antes de clicar em Capturar Faces.")
          return
        end

        model.start_operation("Auto-ACM Capturar Faces", true)
        modulos_data = []
        begin
          # Cria materiais (compartilhados entre modulos)
          mats = {}
          FACE_COLORS.each do |dir, (nome, rgb)|
            m = model.materials[nome] || model.materials.add(nome)
            m.color = Sketchup::Color.new(*rgb)
            mats[dir] = m
          end

          grupos.each_with_index do |grp, idx|
            ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
            count = 0
            ents.grep(Sketchup::Face).each do |f|
              n = f.normal
              dir = dominant_dir(n)
              next unless dir
              f.material = mats[dir]
              f.back_material = mats[dir]
              count += 1
            end

            # Bounds LOCAIS do grupo
            local_bb = Geom::BoundingBox.new
            ents.each { |e| local_bb.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
            next unless local_bb.valid?
            w = ((local_bb.max.x - local_bb.min.x) / 1.mm).round(0)
            d = ((local_bb.max.y - local_bb.min.y) / 1.mm).round(0)
            h = ((local_bb.max.z - local_bb.min.z) / 1.mm).round(0)

            # Nome do grupo
            nome_grp = grp.respond_to?(:name) ? grp.name.to_s : ""
            nome_grp = "Modulo #{idx+1}" if nome_grp.strip.empty?

            modulos_data << {
              entity_id: grp.entityID,
              idx: idx,
              nome: nome_grp,
              w: w, h: h, d: d,
              n_faces: count
            }
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao capturar faces: #{e.message}")
          return
        end

        if modulos_data.empty?
          UI.messagebox("Nenhum modulo valido capturado.")
          return
        end

        # Cores de face (mesmas pra todos os modulos)
        cores_js = FACE_COLORS.map { |dir, (nome, rgb)|
          "{dir:'#{dir}',nome:'#{nome}',rgb:[#{rgb.join(',')}]}"
        }.join(',')

        # Monta lista JS de modulos capturados
        mods_js = modulos_data.map { |m|
          "{entity_id:#{m[:entity_id]},idx:#{m[:idx]},nome:#{json_str(m[:nome])}," +
          "w:#{m[:w]},h:#{m[:h]},d:#{m[:d]},n_faces:#{m[:n_faces]}}"
        }.join(',')

        dialog.execute_script("aaReceberModulos([#{mods_js}],[#{cores_js}])")
      end

      def self.dominant_dir(normal)
        ax = normal.x.abs
        ay = normal.y.abs
        az = normal.z.abs
        max = [ax, ay, az].max
        return nil if max < 0.5
        if ax == max
          normal.x > 0 ? "px" : "nx"
        elsif ay == max
          normal.y > 0 ? "py" : "ny"
        else
          normal.z > 0 ? "pz" : "nz"
        end
      end

      # ======================================================================
      # GERAR MULTI — recebe um array de modulos {entity_id, params}
      # e chama gerar() para cada um individualmente, acumulando quantitativos.
      # ======================================================================
      def self.gerar_multi(modulos_array, dialog = nil)
        model = Sketchup.active_model
        if !modulos_array.is_a?(Array) || modulos_array.empty?
          UI.messagebox("Nenhum modulo para gerar.")
          return
        end
        quantitativos = []
        ok_count = 0
        err_msgs = []
        modulos_array.each_with_index do |mod, i|
          eid = (mod[:entity_id] || mod['entity_id']).to_i
          params = mod[:params] || mod['params'] || {}
          nome = (mod[:nome] || mod['nome'] || "Modulo #{i+1}").to_s
          grp = find_entity_by_id(model, eid)
          if grp.nil?
            err_msgs << "Modulo #{i+1} (#{nome}): grupo nao encontrado (id=#{eid})"
            next
          end
          begin
            q = gerar(params, nil, grp)
            if q
              q[:nome_modulo] = nome
              q[:idx_modulo] = i
              quantitativos << q
              ok_count += 1
            end
          rescue => e
            err_msgs << "Modulo #{i+1} (#{nome}): #{e.message}"
          end
        end
        # Envia lista completa de quantitativos ao dialog
        if dialog && !quantitativos.empty?
          payload = quantitativos.map { |q| construir_hash_quantitativo(q) }
          data_js = "[" + payload.map { |p| p }.join(',') + "]"
          dialog.execute_script("aaReceberQuantitativosMulti(#{data_js})")
        end
        if err_msgs.any?
          UI.messagebox("Geracao concluida com avisos:\n\n#{err_msgs.join("\n")}")
        end
      end

      # Localiza entidade por entityID varrendo as entidades do modelo
      def self.find_entity_by_id(model, eid)
        return nil if eid.nil? || eid == 0
        # Tenta model.find_entity_by_id (Sketchup 2015+)
        if model.respond_to?(:find_entity_by_id)
          ent = model.find_entity_by_id(eid) rescue nil
          return ent if ent
        end
        # Fallback: varredura (pode ser caro em modelos grandes)
        model.entities.each do |e|
          return e if e.entityID == eid
        end
        nil
      end

      # ======================================================================
      # MAPEAR PECAS — percorre o grupo gerado na mesma ordem do
      # calcular_quantitativo e devolve {'met_0' => sub_grupo, 'em_0' => ...}
      # Usado para aplicar edicoes (del/ofs) mantendo os IDs consistentes
      # com o que o JS recebeu.
      # ======================================================================
      def self.mapear_pecas(grp)
        map = { 'met' => [], 'em' => [], 'fita' => [], 'spots' => [] }
        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
        mapear_pecas_rec(ents, map)
        result = {}
        map['met'].each_with_index { |g, i| result["met_#{i}"] = g }
        map['em'].each_with_index  { |g, i| result["em_#{i}"]  = g }
        map['fita'].each_with_index { |g, i| result["fita_#{i}"] = g }
        map['spots'].each_with_index { |g, i| result["spots_#{i}"] = g }
        result
      end

      def self.mapear_pecas_rec(entities, map)
        entities.each do |ent|
          next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          sub = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities
          mat_name = nil
          sub.grep(Sketchup::Face).each do |f|
            if f.material
              mat_name = f.material.name
              break
            end
          end
          if mat_name && ent.bounds.valid?
            case mat_name
            when "Metalon" then map['met']   << ent
            when "Emenda"  then map['em']    << ent
            when "Fita_DF" then map['fita']  << ent
            when "Spot"    then map['spots'] << ent
            end
          end
          mapear_pecas_rec(sub, map)
        end
      end

      # ======================================================================
      # APLICAR EDICOES — recebe listas del/ofs do JS e modifica o modelo SU.
      # del_ids: array de strings tipo ['met_0', 'em_2', ...]
      # ofs_map: array de [{id:'met_3', dx:0, dy:50, dz:0}, ...]
      # Retorna o novo quantitativo recalculado via execute_script
      # ======================================================================
      def self.aplicar_edicoes(dialog, entity_id, del_ids, ofs_list)
        model = Sketchup.active_model
        grp = find_entity_by_id(model, entity_id.to_i)
        return UI.messagebox("Grupo nao encontrado (id=#{entity_id})") unless grp

        model.start_operation("Auto-ACM Aplicar Edicoes", true)
        begin
          mapa = mapear_pecas(grp)
          n_del = 0
          n_ofs = 0

          # 1) MOVER pecas (aplicar offset) — antes de deletar!
          (ofs_list || []).each do |o|
            id = o[:id] || o['id']
            dx = (o[:dx] || o['dx'] || 0).to_f
            dy = (o[:dy] || o['dy'] || 0).to_f
            dz = (o[:dz] || o['dz'] || 0).to_f
            ent = mapa[id.to_s]
            next if ent.nil? || !ent.valid?
            next if dx.abs < 0.1 && dy.abs < 0.1 && dz.abs < 0.1
            tr = Geom::Transformation.translation([dx.mm, dy.mm, dz.mm])
            ent.transform!(tr)
            n_ofs += 1
          end

          # 2) DELETAR pecas
          (del_ids || []).each do |id|
            ent = mapa[id.to_s]
            next if ent.nil? || !ent.valid?
            ent.erase!
            n_del += 1
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao aplicar edicoes: #{e.message}\n#{e.backtrace.first(3).join("\n")}")
          return
        end

        # Recalcular quantitativo e enviar (sem alert - atualizacao silenciosa)
        if dialog
          begin
            fake_params = { cor_acm: '', cor_junta: '', mw: 20.mm, mh: 20.mm, ew: 30.mm, eh: 20.mm, acm: 3.mm, fe: 0.9.mm, chapa_larg: 1220.mm, chapa_comp: 5000.mm, chapa_orient: 'horizontal', roles: {}, enab_frontal: true, enab_traseira: true, enab_topo: true, enab_base: true, enab_esq: true, enab_dir: true }
            quant = calcular_quantitativo(grp, fake_params)
            dialog.execute_script(construir_js_quantitativo(quant))
          rescue => ex
            puts "Auto-ACM recalcular apos editar erro: #{ex.message}"
          end
        end
      end

      # ======================================================================
      # SELECIONAR MODULO — destaca o grupo no SketchUp quando o usuario
      # clica numa aba do painel, dando zoom e feedback visual
      # ======================================================================
      def self.selecionar_modulo(entity_id, zoom = false)
        model = Sketchup.active_model
        grp = find_entity_by_id(model, entity_id.to_i)
        return false unless grp
        sel = model.selection
        sel.clear
        sel.add(grp)
        if zoom
          begin
            model.active_view.zoom(grp)
          rescue
          end
        end
        true
      end

      # ======================================================================
      # GERAR — preenche a caixa com estrutura ACM
      # Se grp_override for fornecido, usa ele em vez do primeiro selecionado.
      # Se dialog for nil (chamado via gerar_multi), retorna o quantitativo
      # em vez de enviar ao dialog.
      # ======================================================================
      def self.gerar(params, dialog = nil, grp_override = nil)
        model = Sketchup.active_model
        if grp_override
          grp = grp_override
        else
          sel = model.selection
          grp = sel.first
        end

        if !grp || !(grp.is_a?(Sketchup::Group) || grp.is_a?(Sketchup::ComponentInstance))
          UI.messagebox("Selecione o grupo da caixa antes de gerar.")
          return nil
        end

        p = extrair(params)

        model.start_operation("Auto-ACM Gerar", true)
        begin
          # Cria materiais ACM/Metalon/etc
          Generator.criar_mats(model, { cor: p[:cor_acm], cor_junta: p[:cor_junta], cor_junta_rgb: p[:cor_junta_rgb] })

          # Bounds LOCAIS do grupo (no espaco interno onde vamos criar a estrutura)
          ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
          local_bb = Geom::BoundingBox.new
          ents.each { |e| local_bb.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
          if !local_bb.valid? || local_bb.diagonal < 1.mm
            raise "Grupo vazio ou sem geometria valida."
          end
          ox = local_bb.min.x; oy = local_bb.min.y; oz = local_bb.min.z
          w  = local_bb.max.x - local_bb.min.x
          d  = local_bb.max.y - local_bb.min.y
          h  = local_bb.max.z - local_bb.min.z

          # Calcula mapa de direcoes habilitadas
          dir_enabled = dir_enabled_map(p)

          # Detecta recortes (vãos) desenhados nas faces e vaza o ACM neles.
          # Sem recortes → recortes_map vazio e nada é apagado (fluxo normal).
          det = detectar_recortes(grp, dir_enabled, p[:roles], ox, oy, oz)
          recortes_map = det[:recortes]
          ents.erase_entities(det[:faces_vazar]) unless det[:faces_vazar].empty?

          # PINTA as faces habilitadas e DELETA as desabilitadas
          paint_acm_faces(model, grp, p, dir_enabled)

          # NUNCA deleta as faces originais — elas sao a casca ACM
          # Sub-grupos para a estrutura interna
          ge = ents.add_group; ge.name = "EST_Metalon"
          gf = nil
          if p[:inc_fita]
            gf = ents.add_group; gf.name = "FITA_DF"
          end
          gs = nil
          if p[:spots]
            gs = ents.add_group; gs.name = "SPOTS"
          end
          ga = nil  # nao geramos ACM solido — a casca original e o ACM
          # Juntas visuais (tanto seca quanto dilatacao)
          gj = ents.add_group; gj.name = "JUNTAS"

          # Para cada face habilitada (frontal, traseira, topo, base, esq, dir)
          # gera o painel correspondente.
          # Sistema local: origem em (ox, oy, oz), com x=W, y=D, z=H
          # Mapeamento:
          #   frontal -> face em y=0  (-Y) ... ou depende de qual o usuario marcou
          #   traseira-> face em y=D  (+Y)
          #   esq     -> face em x=0  (-X)
          #   dir     -> face em x=W  (+X)
          #   topo    -> face em z=H  (+Z)
          #   base    -> face em z=0  (-Z)
          #
          # Mas o usuario pode ter marcado direcoes diferentes. A logica:
          # extrair pega de p[:roles] = { 'frontal' => 'ny', 'traseira' => 'py', ... }

          roles = p[:roles] # role -> dir

          # ── CÁLCULO NO SERVIDOR (Fase 3 da migração anti-pirataria) ──
          # A lista de peças (perímetro + faces: metalon, emendas, fita,
          # juntas, spots) é calculada pela function autoAcmCompute, que
          # valida licença + módulo. Sem servidor + licença → não gera.
          mmv = lambda { |v| (v / 1.mm).round(4) }
          rec_mm = {}
          recortes_map.each { |rl, arr| rec_mm[rl] = arr.map { |r4| r4.map { |vv| mmv.call(vv) } } }
          srv = solicitar_pecas_servidor(params, mmv.call(w), mmv.call(d), mmv.call(h), rec_mm)
          raise srv[:error] unless srv[:ok]

          # Converte mm (servidor) → unidades internas, com a origem do grupo
          pecas = srv[:pecas].map do |pc|
            if pc["tipo"] == "cylinder"
              { g: pc["g"], tipo: "cylinder",
                cx: ox + pc["cx"].to_f.mm, cy: oy + pc["cy"].to_f.mm, cz: oz + pc["cz"].to_f.mm,
                nx: pc["nx"].to_f, ny: pc["ny"].to_f, nz: pc["nz"].to_f,
                r: pc["r"].to_f.mm, prof: pc["prof"].to_f.mm,
                mat: pc["mat"], nome: pc["nome"] }
            else
              { g: pc["g"], tipo: "box",
                x: ox + pc["x"].to_f.mm, y: oy + pc["y"].to_f.mm, z: oz + pc["z"].to_f.mm,
                dx: pc["dx"].to_f.mm, dy: pc["dy"].to_f.mm, dz: pc["dz"].to_f.mm,
                mat: pc["mat"], nome: pc["nome"] }
            end
          end

          # Desenha TODAS as pecas calculadas (unica ponte calculo → SketchUp)
          desenhar_pecas({ "est" => ge, "fita" => gf, "juntas" => gj, "spots" => gs }, pecas)

          # 3) ETIQUETAS (LAYERS) — uma para cada tipo de material
          ly = model.layers
          lay_main = ly["ACM_AutoACM"]   || ly.add("ACM_AutoACM")
          lay_acm  = ly["ACM_Chapas"]    || ly.add("ACM_Chapas")
          lay_est  = ly["ACM_Estrutura"] || ly.add("ACM_Estrutura")
          lay_fita = ly["ACM_FitaDF"]    || ly.add("ACM_FitaDF")
          lay_spot = ly["ACM_Spots"]     || ly.add("ACM_Spots")
          lay_junt = ly["ACM_Juntas"]   || ly.add("ACM_Juntas")

          # Grupo principal (a caixa do usuario)
          grp.layer = lay_main
          # Sub-grupo metalon
          ge.layer = lay_est
          # Sub-grupo fita
          gf.layer = lay_fita if gf
          # Sub-grupo spots
          gs.layer = lay_spot if gs
          gj.layer = lay_junt if gj
          # Faces da casca ACM (faces originais pintadas) -> layer ACM_Chapas
          ents.grep(Sketchup::Face).each do |f|
            d_face = dominant_dir(f.normal)
            next unless d_face && dir_enabled[d_face]
            f.layer = lay_acm
          end
          # Edges das faces da casca tambem na layer ACM_Chapas
          ents.grep(Sketchup::Edge).each do |e|
            e.layer = lay_acm
          end

          model.commit_operation
          model.active_view.zoom_extents

          # Calcular quantitativo
          quant_result = nil
          begin
            quant_result = calcular_quantitativo(grp, p)
          rescue => ex
            puts "Auto-ACM quantitativo erro: #{ex.message}"
          end

          # Enviar ao dialog se disponivel, ou retornar se for multi
          if dialog && quant_result
            dialog.execute_script(construir_js_quantitativo(quant_result))
          elsif dialog.nil?
            # Modo multi: retorna pro chamador
            return quant_result
          else
            UI.messagebox("Auto-ACM gerado dentro do grupo selecionado.\nEtiquetas criadas: ACM_Chapas, ACM_Estrutura, ACM_FitaDF, ACM_Spots")
          end
        rescue => e
          model.abort_operation
          UI.messagebox("Erro Auto-ACM: #{e.message}\n#{e.backtrace.first(3).join("\n")}")
          return nil
        end
        nil
      end

      # ======================================================================
      # CALCULAR QUANTITATIVO — percorre o grupo gerado e extrai:
      #   - ACM: area total + area por face + num chapas estimadas
      #   - Metalon: metros lineares + barras 6m + lista de pecas
      #   - Emendas: metros + quantidade
      #   - Fita DF: metros
      # ======================================================================
      def self.calcular_quantitativo(grp, params)
        bb_local = Geom::BoundingBox.new
        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
        ents.each { |e| bb_local.add(e.bounds) if e.respond_to?(:bounds) && e.bounds.valid? }
        ox = bb_local.min.x; oy = bb_local.min.y; oz = bb_local.min.z
        w_mm = ((bb_local.max.x - bb_local.min.x) / 1.mm).round(0)
        h_mm_box = ((bb_local.max.z - bb_local.min.z) / 1.mm).round(0)
        d_mm_box = ((bb_local.max.y - bb_local.min.y) / 1.mm).round(0)

        result = {
          w_mm: w_mm,
          h_mm: h_mm_box,
          d_mm: d_mm_box,
          ox_mm: (ox / 1.mm).round(1),
          oy_mm: (oy / 1.mm).round(1),
          oz_mm: (oz / 1.mm).round(1),
          cor_acm: params[:cor_acm] || '',
          cor_junta: params[:cor_junta] || '',
          chapa_larg: ((params[:chapa_larg] || 1220.mm) / 1.mm).round(0),
          chapa_comp: ((params[:chapa_comp] || 5000.mm) / 1.mm).round(0),
          chapa_orient: params[:chapa_orient] || 'horizontal',
          acm_mm:    ((params[:acm] || 3.mm) / 1.mm).round(1),
          fita_mm:   ((params[:fe]  || 0.9.mm) / 1.mm).round(1),
          metalon_w: ((params[:mw]||20.mm)/1.mm).round(0),
          metalon_h: ((params[:mh]||20.mm)/1.mm).round(0),
          emenda_w:  ((params[:ew]||30.mm)/1.mm).round(0),
          emenda_h:  ((params[:eh]||20.mm)/1.mm).round(0),
          metalon_wh: "#{((params[:mw]||20.mm)/1.mm).round(0)}x#{((params[:mh]||20.mm)/1.mm).round(0)}",
          enab_frontal:  params[:enab_frontal]  ? true : false,
          enab_traseira: params[:enab_traseira] ? true : false,
          enab_topo:     params[:enab_topo]     ? true : false,
          enab_base:     params[:enab_base]     ? true : false,
          enab_esq:      params[:enab_esq]      ? true : false,
          enab_dir:      params[:enab_dir]      ? true : false,
          acm_total_m2: 0.0,
          acm_faces: [],        # [{dir, label, area_m2, larg_mm, comp_mm}]
          acm_chapas_est: 0,    # estimativa de chapas inteiras necessarias
          met_m: 0.0,
          met_barras: 0,
          met_pecas: [],        # [{nome,comp,x,y,z,w,d,h,eixo,tipo}]
          em_m: 0.0,
          em_qtd: 0,
          em_pecas: [],
          fita_m: 0.0,
          fita_pecas: [],
          spots_qtd: 0,
          spots_pecas: []       # [{nome,x,y,z,w,d,h,eixo}]
        }

        # Area de uma chapa padrao para estimar num_chapas
        chapa_larg = params[:chapa_larg] || 1220.mm
        chapa_comp = params[:chapa_comp] || 5000.mm
        chapa_area = (chapa_larg * chapa_comp) / (1.mm * 1.mm) / 1e6  # m2

        # === ACM via faces diretas pintadas com material ACM_* ===
        face_por_dir = {}
        ents.grep(Sketchup::Face).each do |f|
          m = f.material
          next unless m && m.name.to_s =~ /^ACM_/
          dir = dominant_dir(f.normal)
          next unless dir
          area_m2 = (f.area.abs / (1.mm * 1.mm)) / 1e6
          fb = f.bounds
          dims = [fb.width, fb.height, fb.depth].map { |v| (v / 1.mm).round(0) }.sort
          face_por_dir[dir] ||= { area: 0.0, larg: 0, comp: 0 }
          face_por_dir[dir][:area] += area_m2
          face_por_dir[dir][:larg] = dims[1] if dims[1] > face_por_dir[dir][:larg]
          face_por_dir[dir][:comp] = dims[2] if dims[2] > face_por_dir[dir][:comp]
        end
        roles_inv = {}
        (params[:roles] || {}).each { |r, d| roles_inv[d] = r if d && !d.empty? }
        dir_labels = {
          "px" => "+X (dir)", "nx" => "-X (esq)",
          "py" => "+Y (tras)","ny" => "-Y (frente)",
          "pz" => "+Z (topo)","nz" => "-Z (base)"
        }
        face_por_dir.each do |dir, info|
          role = roles_inv[dir] || ""
          label = role.empty? ? dir_labels[dir] : role.capitalize
          result[:acm_faces] << {
            dir: dir, label: label,
            area_m2: info[:area].round(3),
            larg_mm: info[:larg], comp_mm: info[:comp]
          }
          result[:acm_total_m2] += info[:area]
        end
        result[:acm_total_m2] = result[:acm_total_m2].round(3)

        # ── Contagem de chapas COM aproveitamento de retalho ──
        # Perímetro vertical desdobrado (base→frontal→topo→traseira habilitadas)
        # gera painéis principais; sobras (faixa direita + faixa topo de cada
        # chapa) viram retalhos. Laterais (esq/dir) tentam encaixar em retalho
        # antes de alocar chapa nova. SEM rotação — direção da peça segue a
        # orientação da chapa.
        chapa_comp_r = params[:chapa_comp] || 5000.mm
        chapa_larg_r = params[:chapa_larg] || 1220.mm
        if params[:chapa_orient] == "vertical"
          ver_chapa_r = chapa_comp_r
          hor_chapa_r = chapa_larg_r
        else
          ver_chapa_r = chapa_larg_r
          hor_chapa_r = chapa_comp_r
        end
        jt_str_r = (params[:junta_tipo] || "seca").to_s
        jt_r = (jt_str_r == "seca") ? 0 : (params[:junta_mm] || 8).to_f.mm
        align_r = params[:emenda_align] || "esquerda"
        w_r = w_mm * 1.mm
        h_r = h_mm_box * 1.mm
        d_r = d_mm_box * 1.mm

        slice_dims = ->(total, ems) {
          out = []; prev = 0
          ems.each { |e| out << (e - prev); prev = e }
          out << (total - prev)
          out
        }
        retalhos = []  # [{w:, h:}]
        alloc_panel = ->(pw, ph) {
          right_w = hor_chapa_r - pw
          top_h   = ver_chapa_r - ph
          retalhos << { w: right_w,      h: ph }      if right_w > 1.mm
          retalhos << { w: hor_chapa_r,  h: top_h }   if top_h   > 1.mm
        }
        place_in_retalho = ->(pw, ph) {
          best_idx = -1; best_waste = Float::INFINITY
          retalhos.each_with_index do |r, i|
            if pw <= r[:w] + 0.5.mm && ph <= r[:h] + 0.5.mm
              waste = (r[:w] * r[:h]) - (pw * ph)
              if waste < best_waste
                best_waste = waste
                best_idx = i
              end
            end
          end
          if best_idx < 0
            false
          else
            r = retalhos.delete_at(best_idx)
            retalhos << { w: (r[:w] - pw), h: r[:h]         } if (r[:w] - pw) > 1.mm
            retalhos << { w: pw,           h: (r[:h] - ph)  } if (r[:h] - ph) > 1.mm
            true
          end
        }

        chapas_total = 0
        panels = []   # [{pw:, ph:}]
        perim_total_r = 0
        perim_total_r += d_r if params[:enab_base]
        perim_total_r += h_r if params[:enab_frontal]
        perim_total_r += d_r if params[:enab_topo]
        perim_total_r += h_r if params[:enab_traseira]
        if perim_total_r > 1.mm
          em_h_r = (params[:custom_em_h] && !params[:custom_em_h].empty?) ?
                     params[:custom_em_h] : calc_emendas(w_r, hor_chapa_r, jt_r, align_r)
          em_v_r = (params[:custom_em_v] && !params[:custom_em_v].empty?) ?
                     params[:custom_em_v] : calc_emendas(perim_total_r, ver_chapa_r, jt_r, align_r)
          widths  = slice_dims.call(w_r,          em_h_r)
          heights = slice_dims.call(perim_total_r, em_v_r)
          heights.each do |ph|
            widths.each do |pw|
              panels << { pw: pw, ph: ph }
            end
          end
        end
        add_side = ->(sw, sh) {
          if sw >= 1.mm && sh >= 1.mm
            em_h_s = calc_emendas(sw, hor_chapa_r, jt_r, align_r)
            em_v_s = calc_emendas(sh, ver_chapa_r, jt_r, align_r)
            widths_s  = slice_dims.call(sw, em_h_s)
            heights_s = slice_dims.call(sh, em_v_s)
            heights_s.each do |ph|
              widths_s.each do |pw|
                panels << { pw: pw, ph: ph }
              end
            end
          end
        }
        add_side.call(d_r, h_r) if params[:enab_esq]
        add_side.call(d_r, h_r) if params[:enab_dir]
        # FFD: maiores primeiro
        panels.sort_by! { |x| -(x[:pw] * x[:ph]) }
        panels.each do |pan|
          unless place_in_retalho.call(pan[:pw], pan[:ph])
            chapas_total += 1
            alloc_panel.call(pan[:pw], pan[:ph])
          end
        end
        result[:acm_chapas_est] = chapas_total

        # === Sub-grupos: Metalon / Emenda / Fita_DF ===
        percorrer_quant(ents, result, Geom::Transformation.new, ox, oy, oz, w_mm, d_mm_box, h_mm_box)

        # Classificar peças de metalon (por posição relativa)
        classificar_metalon(result)

        # Barras de 6m
        result[:met_barras] = (result[:met_m] / 6.0).ceil
        result[:met_m] = result[:met_m].round(2)
        result[:em_m]  = result[:em_m].round(2)
        result[:fita_m] = result[:fita_m].round(2)
        result[:em_barras] = (result[:em_m] / 6.0).ceil

        result
      end

      # Percorre sub-grupos recursivamente, captura bounds LOCAIS ao grupo principal
      # (usando transformacao acumulada) e classifica por material/eixo.
      def self.percorrer_quant(entities, result, tr, ox, oy, oz, bw, bd, bh)
        entities.each do |ent|
          next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          sub = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities
          sub_tr = tr * ent.transformation

          # Material da primeira face com material atribuido
          mat_name = nil
          sub.grep(Sketchup::Face).each do |f|
            if f.material
              mat_name = f.material.name
              break
            end
          end

          if mat_name && ent.bounds.valid?
            # Aplicar transformacao aos 8 cantos do bbox para ter coords no espaco do grupo principal
            local_bb = ent.bounds
            wb = Geom::BoundingBox.new
            (0..7).each do |i|
              wb.add(local_bb.corner(i).transform(tr))
            end
            # Coordenadas ja no sistema do grupo principal, ainda em polegadas
            x_in = wb.min.x - ox
            y_in = wb.min.y - oy
            z_in = wb.min.z - oz
            w_in = wb.max.x - wb.min.x
            d_in = wb.max.y - wb.min.y
            h_in = wb.max.z - wb.min.z

            x_mm = (x_in / 1.mm).round(1)
            y_mm = (y_in / 1.mm).round(1)
            z_mm = (z_in / 1.mm).round(1)
            w_mm = (w_in / 1.mm).round(1)
            d_mm = (d_in / 1.mm).round(1)
            h_mm = (h_in / 1.mm).round(1)

            # Eixo dominante (maior dimensao)
            eixo = if w_mm >= d_mm && w_mm >= h_mm
                     'x'
                   elsif d_mm >= w_mm && d_mm >= h_mm
                     'y'
                   else
                     'z'
                   end
            comp_mm = [w_mm, d_mm, h_mm].max

            nome = ent.respond_to?(:name) ? ent.name.to_s : ""
            peca = {
              nome: nome, comp: comp_mm, eixo: eixo,
              x: x_mm, y: y_mm, z: z_mm,
              w: w_mm, d: d_mm, h: h_mm,
              tipo: ''
            }
            case mat_name
            when "Metalon"
              result[:met_m] += comp_mm / 1000.0
              result[:met_pecas] << peca
            when "Emenda"
              result[:em_m] += comp_mm / 1000.0
              result[:em_qtd] += 1
              result[:em_pecas] << peca
            when "Fita_DF"
              result[:fita_m] += comp_mm / 1000.0
              result[:fita_pecas] << peca
            when "Spot"
              result[:spots_qtd] += 1
              result[:spots_pecas] << peca
            end
          end
          percorrer_quant(sub, result, sub_tr, ox, oy, oz, bw, bd, bh)
        end
      end

      # Classifica as pecas de metalon em: perim (12 arestas da caixa),
      # longarina (borda horizontal/vertical interna), travessa (interior)
      def self.classificar_metalon(result)
        bw = result[:w_mm]; bd = result[:d_mm]; bh = result[:h_mm]
        mw = result[:metalon_w]
        tol = (mw || 20) + 5.0
        result[:met_pecas].each do |p|
          # Posicao do centro da peca
          cx = p[:x] + p[:w] / 2.0
          cy = p[:y] + p[:d] / 2.0
          cz = p[:z] + p[:h] / 2.0
          # Esta em alguma "borda" da caixa?
          bx_min = cx < tol
          bx_max = cx > (bw - tol)
          by_min = cy < tol
          by_max = cy > (bd - tol)
          bz_min = cz < tol
          bz_max = cz > (bh - tol)
          n_bordas = [bx_min, bx_max, by_min, by_max, bz_min, bz_max].count(true)
          p[:tipo] = if n_bordas >= 2
                       'perim'    # aresta da caixa
                     elsif n_bordas == 1
                       'longarina'  # encostado em uma face mas nao na aresta
                     else
                       'travessa'   # no meio
                     end
        end
      end

      # Monta apenas o literal JS (hash) do quantitativo, sem a chamada de funcao
      def self.construir_hash_quantitativo(q)
        faces_js = q[:acm_faces].map { |f|
          "{dir:'#{f[:dir]}',label:#{json_str(f[:label])},area:#{f[:area_m2]},larg:#{f[:larg_mm]},comp:#{f[:comp_mm]}}"
        }.join(',')

        peca_js = lambda { |p|
          "{nome:#{json_str(p[:nome])},comp:#{p[:comp]},eixo:#{json_str(p[:eixo]||'')},tipo:#{json_str(p[:tipo]||'')}," +
          "x:#{p[:x]||0},y:#{p[:y]||0},z:#{p[:z]||0}," +
          "w:#{p[:w]||0},d:#{p[:d]||0},h:#{p[:h]||0}}"
        }
        met_js = q[:met_pecas].first(500).map(&peca_js).join(',')
        em_js  = q[:em_pecas].first(500).map(&peca_js).join(',')
        fita_js = q[:fita_pecas].first(500).map(&peca_js).join(',')
        spots_js = (q[:spots_pecas] || []).first(500).map(&peca_js).join(',')

        enab_js = "enab:{frontal:#{q[:enab_frontal]},traseira:#{q[:enab_traseira]}," +
                  "topo:#{q[:enab_topo]},base:#{q[:enab_base]}," +
                  "esq:#{q[:enab_esq]},dir:#{q[:enab_dir]}}"

        nome_mod = q[:nome_modulo] || ""
        idx_mod  = q[:idx_modulo]  || 0

        "{" +
          "nome_modulo:#{json_str(nome_mod)},idx_modulo:#{idx_mod}," +
          "w:#{q[:w_mm]},h:#{q[:h_mm]},d:#{q[:d_mm]}," +
          "cor_acm:#{json_str(q[:cor_acm])},cor_junta:#{json_str(q[:cor_junta])}," +
          "chapa_larg:#{q[:chapa_larg]},chapa_comp:#{q[:chapa_comp]},chapa_orient:#{json_str(q[:chapa_orient])}," +
          "acm_mm:#{q[:acm_mm]},fita_mm:#{q[:fita_mm]}," +
          "metalon_w:#{q[:metalon_w]},metalon_h:#{q[:metalon_h]}," +
          "emenda_w:#{q[:emenda_w]},emenda_h:#{q[:emenda_h]}," +
          "metalon_wh:#{json_str(q[:metalon_wh])}," +
          "acm_total_m2:#{q[:acm_total_m2]}," +
          "acm_chapas_est:#{q[:acm_chapas_est]}," +
          "acm_faces:[#{faces_js}]," +
          "met_m:#{q[:met_m]},met_barras:#{q[:met_barras]}," +
          "em_m:#{q[:em_m]},em_qtd:#{q[:em_qtd]},em_barras:#{q[:em_barras]}," +
          "fita_m:#{q[:fita_m]}," +
          "met_pecas:[#{met_js}]," +
          "em_pecas:[#{em_js}]," +
          "fita_pecas:[#{fita_js}]," +
          "spots_qtd:#{q[:spots_qtd]||0}," +
          "spots_pecas:[#{spots_js}]," +
          enab_js +
          "}"
      end

      # Wrapper que envia chamada aaReceberQuantitativo para modo single
      def self.construir_js_quantitativo(q)
        "aaReceberQuantitativo(#{construir_hash_quantitativo(q)})"
      end

      def self.json_str(s)
        "'" + s.to_s.gsub("\\", "\\\\\\\\").gsub("'", "\\\\'").gsub("\n", ' ').gsub("\r", '') + "'"
      end

      # ======================================================================
      # DIR_ENABLED — calcula quais direcoes (px,nx,py,ny,pz,nz) estao ativas
      # ======================================================================
      def self.dir_enabled_map(p)
        roles_inv = {}
        p[:roles].each { |r, dir| roles_inv[dir] = r if dir && !dir.empty? }
        enabled_role = {
          "frontal"  => p[:enab_frontal],
          "traseira" => p[:enab_traseira],
          "topo"     => p[:enab_topo],
          "base"     => p[:enab_base],
          "esq"      => p[:enab_esq],
          "dir"      => p[:enab_dir]
        }
        m = {}
        ["px","nx","py","ny","pz","nz"].each do |d|
          r = roles_inv[d]
          m[d] = (r && enabled_role[r]) ? true : false
        end
        m
      end

      # Limite p/ tratar a caixa como "testeira" (só moldura da frente): a
      # profundidade no eixo aberto tem que ser pequena EM RELAÇÃO AO METALON.
      # Abaixo de ~2,5× o perfil não há espaço pra uma caixa real (2 molduras +
      # travamento de profundidade), então é testeira. Ex: metalon 20×20 → ~50mm;
      # 15×15 → ~37,5mm. Acima disso é CAIXA e monta a estrutura completa.
      OPP_DIR = { "nx"=>"px","px"=>"nx","ny"=>"py","py"=>"ny","nz"=>"pz","pz"=>"nz" }.freeze
      TESTEIRA_PROF_RATIO = 2.5

      # Faces "principais" = habilitadas cujo oposto está DESLIGADO (caixa aberta
      # de um lado). Ex: testeira/caixa de fundo aberto → só a frontal é principal.
      def self.faces_principais(dir_enabled)
        ["nx","px","ny","py","nz","pz"].select { |dd| dir_enabled[dd] && !dir_enabled[OPP_DIR[dd]] }
      end

      # MODO TESTEIRA: caixa aberta de um lado E RASA no eixo aberto (profundidade
      # ≤ 2,5× a profundidade do metalon `mh`). Só nesse caso geramos apenas a
      # moldura da frente. Caixa funda, fechada (6 faces) ou parede (frente+verso)
      # → false → estrutura completa de sempre. (w=X, d=Y, h=Z, mh em unidades
      # internas.)
      def self.modo_testeira?(dir_enabled, w, d, h, mh)
        main = faces_principais(dir_enabled)
        return false if main.empty?
        return false if mh.nil? || mh <= 0
        perp = { "nx"=>w, "px"=>w, "ny"=>d, "py"=>d, "nz"=>h, "pz"=>h }
        lim  = TESTEIRA_PROF_RATIO * mh
        main.all? { |dd| perp[dd] <= lim }
      end

      # ======================================================================
      # PAINT_ACM_FACES — pinta as faces habilitadas, DELETA as desabilitadas
      # ======================================================================
      # ======================================================================
      # DETECTAR_RECORTES — acha vãos (portas/janelas) desenhados nas faces.
      # Estratégia AUTO: por plano (dir + posição na normal), a face de MAIOR
      # área é a parede; as faces coplanares menores são recortes (vãos).
      # Retorna:
      #   { recortes: { role => [[u0,u1,v0,v1], ...] em mm },
      #     faces_vazar: [Face, ...] }   (faces dos vãos, pra apagar = vazado)
      # Coords u,v no MESMO sistema local que gerar_face_interior usa por role.
      # Sem recortes → retorna tudo vazio (fluxo da parede cheia inalterado).
      # ======================================================================
      def self.detectar_recortes(grp, dir_enabled, roles, ox, oy, oz)
        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
        dir_to_role = {}
        (roles || {}).each { |r, dd| dir_to_role[dd] = r }

        grupos = Hash.new { |hsh, k| hsh[k] = [] }
        ents.grep(Sketchup::Face).each do |f|
          dd = dominant_dir(f.normal)
          next unless dd && dir_enabled[dd] && dir_to_role[dd]
          c = f.bounds.center
          plano = case dd
                  when "nx", "px" then (c.x / 1.mm).round(0)
                  when "ny", "py" then (c.y / 1.mm).round(0)
                  else                 (c.z / 1.mm).round(0)
                  end
          grupos[[dd, plano]] << f
        end

        recortes    = Hash.new { |hsh, k| hsh[k] = [] }
        faces_vazar = []

        grupos.each do |(dd, _plano), faces|
          next if faces.length < 2  # plano sem recorte
          role   = dir_to_role[dd]
          parede = faces.max_by { |f| f.area }
          faces.each do |f|
            next if f == parede
            # Só vira recorte se for claramente menor que a parede — evita tratar
            # uma face dividida em metades parecidas como se fosse um vão.
            next if f.area >= parede.area * 0.85
            faces_vazar << f
            bb = f.bounds
            case dd
            when "ny", "py"   # u=x, v=z
              u0 = bb.min.x - ox; u1 = bb.max.x - ox
              v0 = bb.min.z - oz; v1 = bb.max.z - oz
            when "nz", "pz"   # u=x, v=y
              u0 = bb.min.x - ox; u1 = bb.max.x - ox
              v0 = bb.min.y - oy; v1 = bb.max.y - oy
            else              # nx/px: u=y, v=z
              u0 = bb.min.y - oy; u1 = bb.max.y - oy
              v0 = bb.min.z - oz; v1 = bb.max.z - oz
            end
            recortes[role] << [u0, u1, v0, v1]
          end
        end

        { recortes: recortes, faces_vazar: faces_vazar }
      end

      def self.paint_acm_faces(model, grp, p, dir_enabled)
        acm_mat_name = "ACM_#{p[:cor_acm]}"
        acm_mat = model.materials[acm_mat_name]
        # Se nao existe, usa Generator.load_acm_material (carrega .skm se possivel)
        unless acm_mat
          # FIX 1.0.24: era ACMFacade::Generator (namespace do legado),
          # silenciado por rescue nil → info virava nil, rgb caia no fallback
          # vermelho [180,0,0] e o material METALICO/VX nunca era resolvido.
          info = SignEng::Generator::CORES_ACM[p[:cor_acm]] rescue nil
          rgb = info ? info[:rgb] : [187,187,187]
          acm_mat = Generator.load_acm_material(model, acm_mat_name, p[:cor_acm].to_s, rgb)
        end
        # ATENCAO: NAO sobrescrever acm_mat.color aqui!
        # Se o material ja tem textura do .skm VISUALMAXX, sobrescrever a cor
        # aplica um tint em cima que arruina o visual do material real.
        # Se o material esta sem textura (fallback RGB), a cor ja foi aplicada
        # em criar_mats / load_acm_material.

        ents = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities
        to_del = []
        ents.grep(Sketchup::Face).each do |f|
          d = dominant_dir(f.normal)
          next unless d
          if dir_enabled[d]
            f.material = acm_mat
            f.back_material = acm_mat
          else
            to_del << f
          end
        end
        ents.erase_entities(to_del) unless to_del.empty?
      end

      # ======================================================================
      # PARSE_EM_LIST — converte string "100,200,300" em array de mm internos
      # ======================================================================
      def self.parse_em_list(s)
        return nil if s.nil? || s.to_s.strip.empty?
        # Aceita CSV (JS padrão do preview 2D) OU pipe-separated (formato legado)
        s.to_s.split(/[,|]/).map { |x| x.strip.to_f.mm }.select { |v| v > 0 }
      end

      # ======================================================================
      # CALC_EMENDAS — calcula posicoes de emenda para uma dimensao.
      # MANTIDO LOCAL (o preview 2D do JS tem o mesmo algoritmo): usado só
      # pelo QUANTITATIVO. O layout real das peças vem do servidor (Fase 3).
      # ======================================================================
      def self.calc_emendas(dim, chapa, jt, align)
        return [] if dim <= chapa + 1.mm
        ems = []
        case align
        when "simetrica"
          # Todas as chapas com largura IGUAL = dim / n_chapas
          n = ((dim + jt) / (chapa + jt)).ceil
          n = 2 if n < 2
          panel_w = (dim - (n - 1) * jt) / n.to_f
          cur = 0.0
          (1...n).each do |i|
            cur += panel_w
            ems << cur
            cur += jt
          end
        else
          n_full = ((dim + jt) / (chapa + jt)).floor
          n_full = 1 if n_full < 1

          case align
          when "esquerda"
            total_full = n_full * chapa + (n_full - 1) * jt
            side = dim - total_full - jt
            if side > 1.mm
              sheet_widths = [side] + [chapa] * n_full
            else
              sheet_widths = [chapa] * n_full
            end

          when "direita"
            total_full = n_full * chapa + (n_full - 1) * jt
            side = dim - total_full - jt
            if side > 1.mm
              sheet_widths = [chapa] * n_full + [side]
            else
              sheet_widths = [chapa] * n_full
            end

          when "central"
            inner_jts = (n_full > 1) ? (n_full - 1) * jt : 0
            side_jts  = (n_full > 0) ? 2 * jt : 0
            side_w = (dim - n_full * chapa - inner_jts - side_jts) / 2.0
            if side_w > 1.mm
              sheet_widths = [side_w] + [chapa] * n_full + [side_w]
            else
              sheet_widths = [chapa] * n_full
            end

          else
            sheet_widths = [chapa] * n_full
          end

          cur = 0.0
          (0...(sheet_widths.length - 1)).each do |i|
            cur += sheet_widths[i]
            ems << cur
            cur += jt
          end
        end
        ems.select { |e| e > 1.mm && e < dim - 1.mm }
      end

      # ======================================================================
      # SOLICITAR_PECAS_SERVIDOR — chama a function autoAcmCompute (Fase 3).
      # Renova o id_token se expirado e tenta 1 vez de novo. Devolve
      # { ok: true, pecas: [...] } ou { ok: false, error: "msg pro usuário" }.
      # ======================================================================
      def self.solicitar_pecas_servidor(params, w_mm, d_mm, h_mm, rec_mm)
        ns = Core::Auth::DEFAULT_NS
        id_token = Sketchup.read_default(ns, "fb_id_token", "").to_s
        if Core::Auth::OFFLINE_MODE
          return { ok: true, pecas: pecas_locais(params, w_mm, d_mm, h_mm) }
        end
        return { ok: false, error: "Sessão expirada — faça login novamente no SignEng." } if id_token.empty?

        payload = { params: params, w: w_mm, d: d_mm, h: h_mm, recortes: rec_mm }
        r = Core::FirebaseClient.call_function("autoAcmCompute", payload, id_token)

        # Token expirado → renova e tenta mais uma vez
        if !r[:ok] && r[:code].to_s == "UNAUTHENTICATED"
          refresh = Sketchup.read_default(ns, "fb_refresh_token", "").to_s
          unless refresh.empty?
            ref = Core::FirebaseClient.refresh_id_token(refresh)
            if ref[:ok]
              id_token = ref[:id_token]
              Sketchup.write_default(ns, "fb_id_token", id_token)
              r = Core::FirebaseClient.call_function("autoAcmCompute", payload, id_token)
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

        result = r[:result] || {}
        pecas  = result["pecas"]
        return { ok: false, error: "Resposta inválida do servidor SignEng." } unless pecas.is_a?(Array)
        { ok: true, pecas: pecas }
      end

      # Calculador local usado quando o plugin está sem servidor. Mantém o
      # renderizador único: a saída usa o mesmo formato da Cloud Function.
      def self.pecas_locais(params, w_mm, d_mm, h_mm)
        p = extrair(params.transform_keys(&:to_sym))
        roles = p[:roles]
        enabled = dir_enabled_map(p)
        mw = (params[:mw] || params["mw"] || 20).to_f
        mh = (params[:mh] || params["mh"] || 20).to_f
        pieces = []
        add_box = lambda do |group, x, y, z, dx, dy, dz, mat, name|
          return if [dx, dy, dz].any? { |v| v.to_f <= 0.1 }
          pieces << { "g" => group, "tipo" => "box", "x" => x, "y" => y, "z" => z,
                      "dx" => dx, "dy" => dy, "dz" => dz, "mat" => mat, "nome" => name }
        end

        # Mesmo envelope da prévia 3D: 4 montantes nos cantos, 4 perfis no
        # eixo X e 4 no eixo Y. Cada perfil fica na face correspondente; nunca
        # usamos um bloco com d_mm x h_mm para representar uma parede inteira.
        front = enabled[roles["frontal"]]
        back  = enabled[roles["traseira"]]
        left  = enabled[roles["esq"]]
        right = enabled[roles["dir"]]
        top   = enabled[roles["topo"]]
        base  = enabled[roles["base"]]

        if front || back
          y_front = 0.0
          y_back = [d_mm - mw, 0.0].max
          [front ? [y_front, "F"] : nil, back ? [y_back, "T"] : nil].compact.each do |y, label|
            add_box.call("est", 0, y, 0, w_mm, mw, mh, "Metalon", "M.X.B.#{label}") if base
            add_box.call("est", 0, y, [h_mm - mh, 0.0].max, w_mm, mw, mh, "Metalon", "M.X.T.#{label}") if top
            add_box.call("est", 0, y, 0, mw, mw, h_mm, "Metalon", "M.Z.L.#{label}")
            add_box.call("est", [w_mm - mw, 0.0].max, y, 0, mw, mw, h_mm, "Metalon", "M.Z.R.#{label}")

            count_x = [(w_mm / 600.0).floor, 0].max
            (1..count_x).each do |i|
              x = (w_mm * i / (count_x + 1.0)) - mw / 2.0
              add_box.call("est", x, y, 0, mw, mw, h_mm, "Metalon", "M.Mt.X#{i}.#{label}")
            end
            count_z = [(h_mm / 600.0).floor, 0].max
            (1..count_z).each do |i|
              z = (h_mm * i / (count_z + 1.0)) - mh / 2.0
              add_box.call("est", 0, y, z, w_mm, mw, mh, "Metalon", "M.Tv.Z#{i}.#{label}")
            end
          end
        end

        # Perfis laterais ligam frente/trás somente quando a face lateral está
        # habilitada. Isso reproduz as quatro arestas Y da prévia.
        [[left, 0.0, "E"], [right, [w_mm - mw, 0.0].max, "D"]].each do |on, x, label|
          next unless on
          add_box.call("est", x, 0, 0, mw, d_mm, mh, "Metalon", "M.Y.B.#{label}") if base
          add_box.call("est", x, 0, [h_mm - mh, 0.0].max, mw, d_mm, mh, "Metalon", "M.Y.T.#{label}") if top
        end

        # Se nenhuma face de fechamento foi habilitada, ainda mantém um
        # perímetro mínimo visível, em vez de gerar uma caixa inconsistente.
        if pieces.empty?
          add_box.call("est", 0, 0, 0, w_mm, mw, mh, "Metalon", "M.X.B.Fallback")
          add_box.call("est", 0, 0, [h_mm - mh, 0.0].max, w_mm, mw, mh, "Metalon", "M.X.T.Fallback")
          add_box.call("est", 0, 0, 0, mw, mw, h_mm, "Metalon", "M.Z.L.Fallback")
          add_box.call("est", [w_mm - mw, 0.0].max, 0, 0, mw, mw, h_mm, "Metalon", "M.Z.R.Fallback")
        end

        if p[:inc_fita]
          add_box.call("fita", 0, 0, 0, w_mm, [p[:fe] / 1.mm, 0.9].max, 1.0, "Fita_DF", "Fita.Perimetro")
        end
        pieces
      end



      # ======================================================================
      # DESENHAR_PECAS — unica ponte calculo → SketchUp. Recebe a lista de
      # pecas (dados puros: numeros + strings) e desenha cada uma no grupo
      # certo. "Renderizador burro": nenhuma decisao de layout acontece aqui.
      # grupos = { "est" => ge, "fita" => gf, "juntas" => gj, "spots" => gs }
      # ======================================================================
      def self.desenhar_pecas(grupos, pecas)
        pecas.each do |pc|
          grp = grupos[pc[:g]]
          next unless grp
          if pc[:tipo] == "cylinder"
            c_pt  = Geom::Point3d.new(pc[:cx], pc[:cy], pc[:cz])
            n_vec = Geom::Vector3d.new(pc[:nx], pc[:ny], pc[:nz])
            Generator.cylinder(grp.entities, c_pt, n_vec, pc[:r], pc[:prof], pc[:mat], pc[:nome])
          else
            Generator.box(grp.entities, pc[:x], pc[:y], pc[:z], pc[:dx], pc[:dy], pc[:dz], pc[:mat], pc[:nome])
          end
        end
      end

      # ======================================================================
      # EXTRAIR — converte parametros do JSON em valores internos (mm -> in)
      # ======================================================================
      def self.extrair(params)
        roles = {
          "frontal"  => (params[:role_frontal]  || "ny"),
          "traseira" => (params[:role_traseira] || "py"),
          "topo"     => (params[:role_topo]     || "pz"),
          "base"     => (params[:role_base]     || "nz"),
          "esq"      => (params[:role_esq]      || "nx"),
          "dir"      => (params[:role_dir]      || "px")
        }

        jt_str = (params[:junta_tipo] || "seca").to_s
        jt = (jt_str == "seca") ? 0 : (params[:junta_mm] || 8).to_f.mm

        {
          mw:  (params[:mw] || 20).to_f.mm,
          mh:  (params[:mh] || 20).to_f.mm,
          ew:  (params[:ew] || 30).to_f.mm,
          eh:  (params[:eh] || 20).to_f.mm,
          acm: (params[:acm] || 3).to_f.mm,
          fl:  (params[:fl] || 12).to_f.mm,
          fe:  (params[:fe] || 0.9).to_f.mm,
          jt:  jt,
          inc_fita: params[:inc_fita] != false,
          spots: params[:spots] == true,
          spots_tipo:  (params[:spots_tipo] || "circular").to_s,
          spots_qtd:   (params[:spots_qtd] || 5).to_i,
          spots_dim1:  (params[:spots_dim1] || 85).to_f.mm,
          spots_dim2:  (params[:spots_dim2] || 85).to_f.mm,
          spots_prof:  (params[:spots_prof] || 30).to_f.mm,
          spots_recuo: (params[:spots_recuo] || 800).to_f.mm,
          spots_modo:  (params[:spots_modo] || "ambas").to_s,
          # ── spots_faces: JS envia flags individuais sp_f_* (boolean).
          # Também aceita o formato legado "spots_faces" string CSV.
          spots_faces: (
            face_list = []
            %w[frontal traseira topo base esq dir].each do |face|
              key_sym = "sp_f_#{face}".to_sym
              key_str = "sp_f_#{face}"
              if params[key_sym] == true || params[key_str] == true
                face_list << face
              end
            end
            if face_list.empty? && params[:spots_faces]
              # Fallback legado
              face_list = params[:spots_faces].to_s.split(',').reject(&:empty?)
            end
            face_list.empty? ? ["frontal"] : face_list
          ),
          cor_acm:   params[:cor_acm] || "Branco Brilho (VX103)",
          cor_junta: params[:cor_junta] || "Preto",
          cor_junta_rgb: params[:cor_junta_rgb],
          emenda_align: params[:emenda_align] || "esquerda",
          chapa_larg: (params[:chapa_larg] || 1220).to_f.mm,
          chapa_comp: (params[:chapa_comp] || 5000).to_f.mm,
          chapa_orient: params[:chapa_orient] || "horizontal",
          # ── Emendas customizadas do preview 2D: JS envia como
          # preview_em_h / preview_em_v (CSV). Aceita também o nome
          # antigo custom_em_h / custom_em_v como fallback.
          custom_em_h: parse_em_list(params[:preview_em_h] || params[:custom_em_h]),
          custom_em_v: parse_em_list(params[:preview_em_v] || params[:custom_em_v]),
          enab_frontal:  params[:enab_frontal]  != false,
          enab_traseira: params[:enab_traseira] == true,
          enab_topo:     params[:enab_topo]     != false,
          enab_base:     params[:enab_base]     != false,
          enab_esq:      params[:enab_esq]      != false,
          enab_dir:      params[:enab_dir]      != false,
          roles: roles
        }
      end

    end # AutoACM
  end
end
