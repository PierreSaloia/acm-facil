# encoding: UTF-8
# ============================================================================
# ACM Facade Generator — Utilitários compartilhados
# Funções: box(), parse_json(), criar_mats()
# ============================================================================

module ACMFacil
  module Generator

    MM = 1.mm

    # ========================================================================
    # BOX — Cria um sólido retangular (grupo) com material
    # ========================================================================
    def self.box(ent, x, y, z, dx, dy, dz, mat_name, nome)
      return nil if dx.abs < 0.01 || dy.abs < 0.01 || dz.abs < 0.01
      mat = Sketchup.active_model.materials[mat_name]
      g = ent.add_group; g.name = nome; ge = g.entities
      pts = [Geom::Point3d.new(x,y,z), Geom::Point3d.new(x+dx,y,z),
             Geom::Point3d.new(x+dx,y+dy,z), Geom::Point3d.new(x,y+dy,z)]
      f = ge.add_face(pts)
      if f
        f.reverse! if f.normal.z < 0
        f.pushpull(dz)
      end
      ge.grep(Sketchup::Face).each { |fc| fc.material = mat; fc.back_material = mat } if mat
      g
    end

    # ========================================================================
    # CYLINDER — cria um cilindro orientado a partir de centro+normal+raio+profundidade.
    # Usado pra spots circulares (luminárias redondas embutidas/de sobrepor).
    # ========================================================================
    def self.cylinder(ent, center, normal, radius, depth, mat_name, nome, segments = 24)
      return nil if radius.abs < 0.01 || depth.abs < 0.01
      mat = Sketchup.active_model.materials[mat_name]
      g = ent.add_group; g.name = nome; ge = g.entities
      edges = ge.add_circle(center, normal, radius, segments)
      return g unless edges && !edges.empty?
      # add_circle só cria as arestas — a face precisa ser construída a partir delas
      face = ge.add_face(edges)
      return g unless face
      # Garante que o pushpull vá na direção da normal solicitada
      pp = depth
      pp = -pp if face.normal.dot(normal) < 0
      face.pushpull(pp)
      ge.grep(Sketchup::Face).each { |fc| fc.material = mat; fc.back_material = mat } if mat
      g
    end

    # ========================================================================
    # ADD_QUAD_SAFE — add_face de quadrilátero com fallback pra 2 triângulos
    # quando os 4 pontos não são coplanares (acontece em montantes/fitas de
    # estruturas torcidas no auto_acm_curvo).
    # ========================================================================
    def self.add_quad_safe(ge, p1, p2, p3, p4)
      begin
        f = ge.add_face(p1, p2, p3, p4)
        return f if f
      rescue ArgumentError
        # cai no fallback de triangulação
      end
      ge.add_face(p1, p2, p3)
      ge.add_face(p1, p3, p4)
    end

    # ========================================================================
    # SOLID6 — Cria um sólido a partir de 8 vértices (prisma genérico)
    # Usado para peças trapezoidais no pórtico com avanço
    # pb = [p1, p2, p3, p4] face inferior (sentido horário vista de baixo)
    # pt = [p5, p6, p7, p8] face superior (mesma ordem dos cantos)
    # ========================================================================
    def self.solid6(ent, pb, pt, mat_name, nome)
      mat = mat_name ? Sketchup.active_model.materials[mat_name] : nil
      g = ent.add_group; g.name = nome; ge = g.entities
      pb = pb.map { |v| v.is_a?(Geom::Point3d) ? v : Geom::Point3d.new(v[0], v[1], v[2]) }
      pt = pt.map { |v| v.is_a?(Geom::Point3d) ? v : Geom::Point3d.new(v[0], v[1], v[2]) }
      # 6 faces: base, topo, 4 lados.
      # Quando a estrutura é torcida (sub-segmentos com tangente diferente entre
      # base e topo no auto_acm_curvo), os 4 pontos da face lateral podem não
      # ser coplanares — add_face dispara "Points are not planar". Fallback:
      # triangular em 2 faces na diagonal pb[i]→pt[j].
      add_quad_safe(ge, pb[0], pb[1], pb[2], pb[3])
      add_quad_safe(ge, pt[3], pt[2], pt[1], pt[0])
      (0..3).each { |i| j = (i + 1) % 4; add_quad_safe(ge, pb[i], pb[j], pt[j], pt[i]) }
      ge.grep(Sketchup::Face).each { |fc| fc.material = mat; fc.back_material = mat } if mat
      g
    end

    # ========================================================================
    # SMOOTH_TUBE — Tubo retangular calandrado (curva suave, sem arestas visíveis)
    # z_pts: array de valores Z ao longo da curva (denso, ex: 30+ pontos)
    # x_func: lambda(z) → X do canto exterior do tubo
    # y0, yw: posição Y e largura Y do tubo
    # tw: espessura do tubo (largura X)
    # ========================================================================
    def self.smooth_tube(ent, z_pts, x_func, y0, yw, tw, mat_name, nome)
      mat = mat_name ? Sketchup.active_model.materials[mat_name] : nil
      g = ent.add_group; g.name = nome; ge = g.entities

      n = z_pts.length
      rings = z_pts.map do |z|
        xo = x_func.call(z)
        xi = xo - tw
        [Geom::Point3d.new(xi, y0, z),
         Geom::Point3d.new(xo, y0, z),
         Geom::Point3d.new(xo, y0+yw, z),
         Geom::Point3d.new(xi, y0+yw, z)]
      end

      # 4 faces laterais por segmento
      (n - 1).times do |i|
        r0 = rings[i]; r1 = rings[i + 1]
        ge.add_face(r0[0], r0[1], r1[1], r1[0])
        ge.add_face(r0[1], r0[2], r1[2], r1[1])
        ge.add_face(r0[2], r0[3], r1[3], r1[2])
        ge.add_face(r0[3], r0[0], r1[0], r1[3])
      end

      # Tampas
      ge.add_face(rings.first[0], rings.first[1], rings.first[2], rings.first[3])
      ge.add_face(rings.last[3], rings.last[2], rings.last[1], rings.last[0])

      # Suavizar arestas internas (efeito calandrado)
      ge.grep(Sketchup::Edge).each do |e|
        pts = e.vertices.map(&:position)
        z0 = pts[0].z; z1 = pts[1].z
        # Arestas horizontais internas (mesma Z, não são base/topo)
        if (z0 - z1).abs < 0.01 && z0 > z_pts.first + 0.01 && z0 < z_pts.last - 0.01
          e.smooth = true; e.soft = true
        end
      end

      ge.grep(Sketchup::Face).each { |f| f.material = mat; f.back_material = mat } if mat
      g
    end

    # ========================================================================
    # SMOOTH_PANEL — Painel curvo suave (para ACM lateral/frontal)
    # Sem arestas visíveis entre segmentos
    # ========================================================================
    def self.smooth_panel(ent, z_pts, x_func, y0, yw, th, mat_name, nome, side = :lateral)
      mat = mat_name ? Sketchup.active_model.materials[mat_name] : nil
      g = ent.add_group; g.name = nome; ge = g.entities

      n = z_pts.length
      rings = z_pts.map do |z|
        xo = x_func.call(z)
        xi = xo - th
        [Geom::Point3d.new(xi, y0, z),
         Geom::Point3d.new(xo, y0, z),
         Geom::Point3d.new(xo, y0+yw, z),
         Geom::Point3d.new(xi, y0+yw, z)]
      end

      (n - 1).times do |i|
        r0 = rings[i]; r1 = rings[i + 1]
        ge.add_face(r0[0], r0[1], r1[1], r1[0])
        ge.add_face(r0[1], r0[2], r1[2], r1[1])
        ge.add_face(r0[2], r0[3], r1[3], r1[2])
        ge.add_face(r0[3], r0[0], r1[0], r1[3])
      end

      ge.add_face(rings.first[0], rings.first[1], rings.first[2], rings.first[3])
      ge.add_face(rings.last[3], rings.last[2], rings.last[1], rings.last[0])

      # Suavizar arestas internas
      ge.grep(Sketchup::Edge).each do |e|
        pts = e.vertices.map(&:position)
        z0 = pts[0].z; z1 = pts[1].z
        if (z0 - z1).abs < 0.01 && z0 > z_pts.first + 0.01 && z0 < z_pts.last - 0.01
          e.smooth = true; e.soft = true
        end
      end

      ge.grep(Sketchup::Face).each { |f| f.material = mat; f.back_material = mat } if mat
      g
    end

    # ========================================================================
    # SMOOTH_WIDE_PANEL — Painel curvo com largura variável (para ACM lateral)
    # Borda interna reta (x_inner) e borda externa curva (x_outer_func)
    # ========================================================================
    def self.smooth_wide_panel(ent, z_pts, x_inner, x_outer_func, y0, yw, mat_name, nome)
      mat = mat_name ? Sketchup.active_model.materials[mat_name] : nil
      g = ent.add_group; g.name = nome; ge = g.entities

      n = z_pts.length
      rings = z_pts.map do |z|
        xo = x_outer_func.call(z)
        [Geom::Point3d.new(x_inner, y0, z),
         Geom::Point3d.new(xo, y0, z),
         Geom::Point3d.new(xo, y0+yw, z),
         Geom::Point3d.new(x_inner, y0+yw, z)]
      end

      (n - 1).times do |i|
        r0 = rings[i]; r1 = rings[i + 1]
        ge.add_face(r0[0], r0[1], r1[1], r1[0])
        ge.add_face(r0[1], r0[2], r1[2], r1[1])
        ge.add_face(r0[2], r0[3], r1[3], r1[2])
        ge.add_face(r0[3], r0[0], r1[0], r1[3])
      end

      ge.add_face(rings.first[0], rings.first[1], rings.first[2], rings.first[3])
      ge.add_face(rings.last[3], rings.last[2], rings.last[1], rings.last[0])

      ge.grep(Sketchup::Edge).each do |e|
        pts = e.vertices.map(&:position)
        zv0 = pts[0].z; zv1 = pts[1].z
        if (zv0 - zv1).abs < 0.01 && zv0 > z_pts.first + 0.01 && zv0 < z_pts.last - 0.01
          e.smooth = true; e.soft = true
        end
      end

      ge.grep(Sketchup::Face).each { |f| f.material = mat; f.back_material = mat } if mat
      g
    end

    # ========================================================================
    # PARSE_JSON — Parser simples de JSON (sem dependência externa)
    # Converte string JSON flat em Hash com chaves simbólicas
    # ========================================================================
    def self.parse_json(s)
      h = {}
      s.gsub(/[{}"]/, '').strip.split(',').each do |pair|
        k, v = pair.split(':', 2).map(&:strip)
        next unless k && v
        sym = k.to_sym
        h[sym] = case v
                 when 'true' then true; when 'false' then false
                 when /\A-?\d+(\.\d+)?\z/ then v.include?('.') ? v.to_f : v.to_i
                 else v; end
      end; h
    end

    # ========================================================================
    # ACM_SKM_DIRS — pastas onde procurar os .skm reais da paleta VISUALMAXX
    #
    # O SignEng tem PLUGIN_DIR fora da hierarquia do SketchUp (fica no
    # diretorio do projeto), entao ../../ NAO cai em Materials/ACM como
    # caia no plugin legado. Procuramos em multiplos lugares:
    #
    #   1. AppData/.../SketchUp/Plugins/acm_facade_generator/../../Materials/ACM
    #      (path do legado — onde o usuario provavelmente ja tem os .skm)
    #   2. Sketchup.find_support_file('Materials/ACM') — pasta padrao
    #   3. AppData/Roaming/SketchUp/SketchUp <ano>/SketchUp/Materials/ACM
    #      direto (varias versoes do SU)
    #   4. Pasta interna do plugin novo (resources/materials/ACM)
    #   5. ENV['APPDATA']/SketchUp/SketchUp 2023/SketchUp/Materials/ACM
    # ========================================================================
    def self.acm_skm_dirs
      dirs = []

      # 1) Tentativa: pasta de Materials do SketchUp (find_support_file aceita
      #    paths relativos a partir das pastas de busca configuradas)
      begin
        sf = Sketchup.find_support_file('ACM', 'Materials')
        dirs << sf if sf && !sf.empty?
      rescue
      end

      # 2) Sketchup user_plugins_folder / Plugins/acm_facade_generator/../../Materials/ACM
      #    (replica a logica do plugin legado)
      begin
        if Sketchup.respond_to?(:plugins_folder)
          plugins = Sketchup.plugins_folder.to_s
          dirs << File.expand_path(File.join(plugins, '..', 'Materials', 'ACM'))
        end
      rescue
      end

      # 3) Caminhos absolutos comuns no Windows (varias versoes do SU)
      if ENV['APPDATA']
        appdata = ENV['APPDATA']
        %w[2024 2023 2022 2021 2020].each do |yr|
          dirs << File.join(appdata, 'SketchUp', "SketchUp #{yr}", 'SketchUp', 'Materials', 'ACM')
        end
      end

      # 4) Pasta interna do plugin (fallback portatil — se o usuario copiar
      #    os .skm pra dentro do projeto)
      dirs << File.join(PLUGIN_DIR, 'resources', 'materials', 'ACM')

      # 5) Path antigo (compat retroativa)
      dirs << File.expand_path(File.join(PLUGIN_DIR, '..', '..', 'Materials', 'ACM'))

      # Filtra so as pastas que existem
      result = dirs.uniq.select { |d| File.directory?(d) }
      puts "[SignEng] acm_skm_dirs encontradas: #{result.inspect}" if result.empty?
      result
    end

    # ========================================================================
    # find_acm_skm — procura o arquivo .skm correspondente a uma cor
    # Usa o codigo VX### do nome da cor para matching (ex: "VX103")
    # Retorna o caminho completo ou nil
    # ========================================================================
    def self.find_acm_skm(cor_nome)
      m = cor_nome.to_s.match(/VX\s*(\d+)/i)
      return nil unless m
      codigo = "VX#{m[1]}"
      acm_skm_dirs.each do |dir|
        Dir.glob(File.join(dir, '*.skm')).each do |f|
          return f if File.basename(f) =~ /#{codigo}/i
        end
      end
      nil
    end

    # ========================================================================
    # load_acm_material — tenta carregar o .skm real da paleta VISUALMAXX
    # e registrar no modelo com o nome padrao do plugin (ACM_<cor>).
    #
    # Se o material ja existe mas NAO tem textura, aplica a textura do .skm
    # nele (upgrade do RGB antigo).
    # Se nao achar o .skm, cria material com RGB (fallback).
    # ========================================================================
    # Copia TODOS os attribute_dictionaries de src para dst.
    # Isso e fundamental para materiais PBR (Enscape, VRay) que armazenam
    # propriedades metalness/roughness/ior/normal em dicionarios especificos.
    def self.copy_attributes(src, dst)
      return unless src.respond_to?(:attribute_dictionaries)
      dicts = src.attribute_dictionaries
      return unless dicts
      count = 0
      dicts.each do |dict|
        dict_name = dict.name
        dict.each_pair do |key, value|
          dst.set_attribute(dict_name, key, value)
          count += 1
        end
      end
      count
    end

    def self.load_acm_material(model, nome_plugin, cor_nome, rgb_fallback)
      m = model.materials
      existing = m[nome_plugin]
      ja_tem_attrs = false
      if existing && existing.respond_to?(:attribute_dictionaries) && existing.attribute_dictionaries
        ja_tem_attrs = existing.attribute_dictionaries.length > 0
      end
      puts "[ACM] load_acm_material: '#{nome_plugin}' existing=#{existing ? 'SIM' : 'NAO'} attrs=#{ja_tem_attrs ? 'SIM' : 'NAO'}"

      # Se ja tem attribute dictionaries (materiais PBR), reusa
      if existing && ja_tem_attrs
        puts "[ACM] Material ja tem attributes PBR - reusando"
        return existing
      end

      # Procura o .skm real
      skm_path = find_acm_skm(cor_nome)
      puts "[ACM] find_acm_skm: #{skm_path ? File.basename(skm_path) : 'NIL'}"
      unless skm_path && File.exist?(skm_path)
        puts "[ACM] Nenhum .skm - usando RGB fallback"
        mt = existing || m.add(nome_plugin)
        mt.color = Sketchup::Color.new(*(rgb_fallback || [180,0,0]))
        return mt
      end

      # Carrega o .skm
      mat_loaded = nil
      begin
        mat_loaded = m.load(skm_path)
      rescue => e
        puts "[ACM] Erro ao carregar #{File.basename(skm_path)}: #{e.message}"
      end

      unless mat_loaded
        puts "[ACM] load falhou - fallback RGB"
        mt = existing || m.add(nome_plugin)
        mt.color = Sketchup::Color.new(*(rgb_fallback || [180,0,0]))
        return mt
      end

      puts "[ACM] .skm loaded OK: '#{mat_loaded.display_name}'"
      loaded_attr_count = 0
      if mat_loaded.respond_to?(:attribute_dictionaries) && mat_loaded.attribute_dictionaries
        loaded_attr_count = mat_loaded.attribute_dictionaries.length
      end
      puts "[ACM] mat_loaded attr_dicts: #{loaded_attr_count}"

      # CASO A: material nao existia → renomeia o mat_loaded (mais limpo)
      if existing.nil?
        begin
          mat_loaded.name = nome_plugin
          puts "[ACM] Renomeado -> '#{nome_plugin}' — todos os attrs PBR preservados"
          return mat_loaded
        rescue => rerr
          puts "[ACM] Renomeacao falhou: #{rerr.message} - tentando via copy"
        end
      end

      # CASO B: existe sem attrs OU renomear falhou → copia attrs + cor + textura
      target = existing || m.add(nome_plugin)
      begin
        # Copia cor base
        target.color = mat_loaded.color if mat_loaded.color
      rescue => e
        puts "[ACM] Erro copiando cor: #{e.message}"
      end
      begin
        target.alpha = mat_loaded.alpha if mat_loaded.alpha
      rescue
      end
      # Copia textura se houver (bitmap)
      begin
        if mat_loaded.respond_to?(:texture) && mat_loaded.texture
          fn = mat_loaded.texture.filename rescue nil
          if fn && !fn.empty?
            target.texture = fn
            puts "[ACM] Textura bitmap copiada"
          end
        end
      rescue => te
        puts "[ACM] Erro textura: #{te.message}"
      end
      # ★ CRUCIAL: copia attribute_dictionaries (PBR, Enscape, normal maps, etc)
      begin
        n = copy_attributes(mat_loaded, target)
        puts "[ACM] Copiados #{n} atributos PBR para '#{nome_plugin}'"
      rescue => ae
        puts "[ACM] Erro copiando atributos: #{ae.message}"
      end

      # Remove o material temporario
      if mat_loaded != target
        begin
          m.remove(mat_loaded)
        rescue
        end
      end

      target
    end

    # ========================================================================
    # CRIAR_MATS — Cria materiais padrão no modelo
    # @param model [Model] modelo ativo
    # @param p [Hash] parâmetros com :cor e :cor_junta
    # ========================================================================
    def self.criar_mats(model, p)
      m = model.materials
      mn = "ACM_#{p[:cor]}"
      info = CORES_ACM[p[:cor]]
      rgb_fallback = info ? info[:rgb] : [180,0,0]
      # Usa o .skm real da paleta VISUALMAXX se disponivel, senao RGB puro
      load_acm_material(model, mn, p[:cor].to_s, rgb_fallback)
      # Materiais secundarios (estrutura/fita/spot/emenda)
      cor_fita_rgb = CORES_FITA[p[:cor_fita]] || [0,210,210]
      cor_fita_alpha = (p[:cor_fita] == "Transparente") ? 0.5 : nil
      { "Metalon" => [155,160,165], "Fita_DF" => cor_fita_rgb,
        "Spot" => [230,230,235], "Emenda" => [140,145,150] }.each do |n, rgb|
        # Fita_DF: sempre re-aplica a cor (pode ter mudado entre chamadas)
        if n == "Fita_DF"
          mt = m[n] || m.add(n)
          mt.color = Sketchup::Color.new(*rgb)
          mt.alpha = cor_fita_alpha if cor_fita_alpha
        else
          m.add(n).tap { |mt| mt.color = Sketchup::Color.new(*rgb) } unless m[n]
        end
      end
      jn = "Junta_#{p[:cor_junta]}"
      unless m[jn]
        mt = m.add(jn)
        # RGB custom (cor adicionada pelo usuário) tem prioridade; senão catálogo.
        crgb = p[:cor_junta_rgb]
        crgb = nil unless crgb.is_a?(Array) && crgb.size == 3
        mt.color = Sketchup::Color.new(*(crgb || CORES_JUNTA[p[:cor_junta]] || [20,20,20]))
        mt.alpha = 0.5 if p[:cor_junta] == "Transparente"
      end
    end

    # ========================================================================
    # Enviar cores para o dialog (usado por todos os módulos)
    # ========================================================================
    def self.enviar_cores(dialog)
      cats = {}
      CORES_ACM.each { |n, info| (cats[info[:cat]] ||= []) << { nome: n, rgb: info[:rgb] } }
      parts = cats.map { |cat, cores| "'#{cat}':[#{cores.map { |c| "{n:'#{c[:nome]}',r:[#{c[:rgb].join(',')}]}" }.join(",")}]" }
      dialog.execute_script("preencherCores({#{parts.join(',')}})")
      jp = CORES_JUNTA.map { |n, rgb| "{n:'#{n}',r:[#{rgb.join(',')}]}" }.join(",")
      dialog.execute_script("preencherCoresJunta([#{jp}])")
      fp = CORES_FITA.map { |n, rgb| "{n:'#{n}',r:[#{rgb.join(',')}]}" }.join(",")
      dialog.execute_script("preencherCoresFita([#{fp}])")
    end

  end
end
