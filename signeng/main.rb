require 'sketchup.rb'
require 'json'
require 'base64'
require 'fileutils'

# ═══════════════════════════════════════════════════════════════════════════
# SignEng — main.rb
# ═══════════════════════════════════════════════════════════════════════════
# Inicializa o diálogo HTML, registra callbacks, cria menu e toolbar.
# ═══════════════════════════════════════════════════════════════════════════

module SignEng
  PLUGIN_DIR = File.dirname(__FILE__)
  UI_DIR     = File.join(PLUGIN_DIR, 'ui')
  ICONS_DIR  = File.join(PLUGIN_DIR, 'resources', 'toolbar_icons')
  DEFAULT_NS = "SignEng".freeze

  # ── Core: versão, firebase client, auth, cores e geometria compartilhadas ──
  # Sketchup::require (não `require`): carrega tanto .rb (dev) quanto .rbe
  # (build assinado/criptografado pela Trimble). NÃO trocar de volta.
  Sketchup::require File.join(PLUGIN_DIR, 'core', 'version')
  Sketchup::require File.join(PLUGIN_DIR, 'core', 'firebase_client')
  Sketchup::require File.join(PLUGIN_DIR, 'core', 'auth')
  Sketchup::require File.join(PLUGIN_DIR, 'core', 'cores')
  Sketchup::require File.join(PLUGIN_DIR, 'core', 'geometry')

  # ── Modules ────────────────────────────────────────────────────────────
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'auto_acm')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'auto_acm_curvo')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'textura_sync')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'logo3d')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'planifica')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'corte_encaixe')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'auto_sigame')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'alinhar')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'luminoso')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'letra3d')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'desenho_geometrico')
  Sketchup::require File.join(PLUGIN_DIR, 'modules', 'movel_parametrico')

  @dialog = nil

  def self.abrir
    if @dialog && @dialog.visible?
      @dialog.bring_to_front
      # Dispara revalidação silenciosa toda vez que o user clica no botão da
      # toolbar/menu, mesmo com o diálogo já aberto. Se a licença foi
      # revogada/expirou desde a última checagem, o JS recebe blocked:true
      # e desloga o user.
      begin
        @dialog.execute_script("if(typeof App!=='undefined'&&App.revalidate)App.revalidate();")
      rescue => e
        puts "[SignEng] revalidate-on-reopen falhou: #{e.message}"
      end
      return
    end

    @dialog = UI::HtmlDialog.new(
      dialog_title:    "SignEng v#{Core::VERSION}",
      preferences_key: "com.signeng.plugin",
      width:           1100,
      height:          720,
      min_width:       900,
      min_height:      600,
      resizable:       true,
      style:           UI::HtmlDialog::STYLE_DIALOG
    )

    @dialog.set_file(File.join(UI_DIR, 'index.html'))
    registrar_callbacks(@dialog)

    # Garante que @dialog volta a null quando o usuário fechar — evita estado
    # zumbi onde o reference continua mas o visible? retorna false
    @dialog.set_on_closed do
      @dialog = nil
    end

    @dialog.show

    # Abre SEMPRE na tela principal. O preferences_key restaura a última
    # posição salva — se ela foi num monitor extra que agora está desconectado,
    # o diálogo abriria fora da tela. Forçar a posição no canto superior do
    # monitor primário (que no Windows começa em 0,0) garante que ele apareça;
    # o usuário arrasta pra onde quiser depois. Só no fresh-open — reabrir com o
    # diálogo já visível NÃO reposiciona (preserva quem usa 2 monitores).
    begin
      @dialog.set_position(100, 60)
    rescue => e
      puts "[SignEng] set_position inicial falhou: #{e.message}"
    end
  end

  # ─────────────────────────────────────────────────────────────────────────
  # Registra todos os callbacks JS → Ruby (padrão Bridge)
  # ─────────────────────────────────────────────────────────────────────────
  def self.registrar_callbacks(dlg)

    # ══════════════ AUTH (Firebase) ══════════════
    dlg.add_action_callback("auth_login") do |_ctx, json|
      begin
        data = parse_payload(json)
        result = Core::Auth.login(data["email"].to_s, data["pwd"].to_s)

        if result[:ok]
          if data["remember"]
            Sketchup.write_default(DEFAULT_NS, "last_email", data["email"].to_s)
          else
            Sketchup.write_default(DEFAULT_NS, "last_email", "")
          end
        end

        resolver(dlg, data["id"], result)

        if result[:ok] && dlg && dlg.visible?
          begin
            dlg.bring_to_front
          rescue => e
            puts "[SignEng] bring_to_front after login falhou: #{e.message}"
          end
        end
      rescue => e
        puts "[SignEng] auth_login callback exception: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        begin
          resolver(dlg, (data && data["id"]), { ok: false, code: "auth.exception", error: e.message })
        rescue; end
      end
    end

    dlg.add_action_callback("auth_validate_session") do |_ctx, json|
      data   = parse_payload(json)
      result = Core::Auth.validate_session
      resolver(dlg, data["id"], result)
    end

    dlg.add_action_callback("auth_saved_email") do |_ctx, json|
      data  = parse_payload(json)
      email = Sketchup.read_default(DEFAULT_NS, "last_email", "")
      resolver(dlg, data["id"], { ok: true, email: email })
    end

    dlg.add_action_callback("auth_logout") do |_ctx, json|
      data = parse_payload(json)
      Core::Auth.destroy_session
      resolver(dlg, data["id"], { ok: true })
    end

    # Recuperar senha agora manda email real via Firebase
    dlg.add_action_callback("auth_recuperar") do |_ctx, json|
      data  = parse_payload(json)
      email = data["email"].to_s.strip.downcase

      if email.empty?
        lang = Sketchup.read_default(DEFAULT_NS, "lang", "pt").to_s
        msg = case lang
              when "es" then "Escribe tu email en el formulario de inicio de sesión para recuperar la contraseña."
              when "en" then "Type your email in the login form to reset your password."
              else           "Digite seu email no formulário de login pra recuperar a senha."
              end
        UI.messagebox(msg)
        resolver(dlg, data["id"], { ok: false, code: "auth.empty_email" })
        next
      end

      res = Core::Auth.recover_password(email)
      if res[:ok]
        lang = Sketchup.read_default(DEFAULT_NS, "lang", "pt").to_s
        msg = case lang
              when "es" then "¡Email enviado! Revisa tu bandeja de entrada (y el spam)."
              when "en" then "Email sent! Check your inbox (and spam)."
              else           "Email enviado! Confira sua caixa de entrada (e o spam)."
              end
        UI.messagebox(msg)
      end
      resolver(dlg, data["id"], res)
    end

    # Novo callback: licença e info completa do user logado
    dlg.add_action_callback("user_me") do |_ctx, json|
      data = parse_payload(json)
      resolver(dlg, data["id"], Core::Auth.validate_session)
    end

    # Revalidação silenciosa — usada pelo heartbeat (a cada 30min), pela
    # reabertura do diálogo, e como gate dos botões Gerar.
    # force=true ignora o cache de 1h da assert_valid! e re-chama
    # verifyMachineLicense direto.
    dlg.add_action_callback("auth_revalidate") do |_ctx, json|
      data = parse_payload(json)
      force = data.is_a?(Hash) && (data["force"] == true)
      resolver(dlg, data["id"], Core::Auth.assert_valid!(force))
    end

    # Lê (e limpa) a mensagem do último bloqueio. A tela de login chama
    # isso ao montar pra mostrar pro user o motivo de ter sido deslogado
    # (ex: "Seu trial expirou", "PC bloqueado pelo admin").
    dlg.add_action_callback("auth_get_block_msg") do |_ctx, json|
      data = parse_payload(json)
      msg  = Core::Auth.read_and_clear_block_msg
      resolver(dlg, data["id"], { ok: true, msg: msg })
    end

    # ══════════════ I18N ══════════════
    dlg.add_action_callback("i18n_get") do |_ctx, json|
      data = parse_payload(json)
      lang = Sketchup.read_default(DEFAULT_NS, "lang", "pt").to_s
      resolver(dlg, data["id"], { ok: true, lang: lang })
    end

    dlg.add_action_callback("i18n_save") do |_ctx, json|
      data = parse_payload(json)
      lang = data["lang"].to_s
      lang = "pt" unless %w[pt es en].include?(lang)
      Sketchup.write_default(DEFAULT_NS, "lang", lang)
      resolver(dlg, data["id"], { ok: true, lang: lang })
    end

    # ══════════════ UI SCALE ══════════════
    dlg.add_action_callback("ui_scale_get") do |_ctx, json|
      data = parse_payload(json)
      scale = Sketchup.read_default(DEFAULT_NS, "ui_scale", "md").to_s
      scale = "md" unless %w[sm md lg].include?(scale)
      resolver(dlg, data["id"], { ok: true, scale: scale })
    end

    dlg.add_action_callback("ui_scale_save") do |_ctx, json|
      data = parse_payload(json)
      scale = data["scale"].to_s
      scale = "md" unless %w[sm md lg].include?(scale)
      Sketchup.write_default(DEFAULT_NS, "ui_scale", scale)
      resolver(dlg, data["id"], { ok: true, scale: scale })
    end

    dlg.add_action_callback("theme_get") do |_ctx, json|
      data = parse_payload(json)
      theme = Sketchup.read_default(DEFAULT_NS, "theme", "light").to_s
      theme = "light" unless %w[light dark].include?(theme)
      resolver(dlg, data["id"], { ok: true, theme: theme })
    end

    dlg.add_action_callback("theme_save") do |_ctx, json|
      data = parse_payload(json)
      theme = data["theme"].to_s
      theme = "light" unless %w[light dark].include?(theme)
      Sketchup.write_default(DEFAULT_NS, "theme", theme)
      resolver(dlg, data["id"], { ok: true, theme: theme })
    end

    # ══════════════ PRESETS (genérico por kind) ══════════════
    # Persistência: Sketchup.write_default não preserva strings com aspas/JSON
    # de forma confiável. Encodamos em Base64 antes de gravar e decodamos na leitura.
    dlg.add_action_callback("presets_get") do |_ctx, json|
      data = parse_payload(json)
      kind = data["kind"].to_s.gsub(/[^a-z0-9_]/i, '')
      kind = "default" if kind.empty?
      key  = "presets_b64_#{kind}"
      raw  = Sketchup.read_default(DEFAULT_NS, key, "").to_s
      presets = []
      begin
        unless raw.empty?
          decoded = Base64.strict_decode64(raw)
          parsed  = JSON.parse(decoded)
          presets = parsed if parsed.is_a?(Array)
        end
      rescue => e
        puts "[SignEng] presets_get parse erro: #{e.message}"
      end
      resolver(dlg, data["id"], { ok: true, presets: presets })
    end

    dlg.add_action_callback("presets_save") do |_ctx, json|
      data = parse_payload(json)
      kind = data["kind"].to_s.gsub(/[^a-z0-9_]/i, '')
      kind = "default" if kind.empty?
      key  = "presets_b64_#{kind}"
      presets = data["presets"] || []
      begin
        json_str = JSON.generate(presets)
        encoded  = Base64.strict_encode64(json_str)
        Sketchup.write_default(DEFAULT_NS, key, encoded)
        puts "[SignEng] presets_save ok: #{presets.length} preset(s), #{encoded.bytesize} bytes"
        resolver(dlg, data["id"], { ok: true, count: presets.length })
      rescue => e
        puts "[SignEng] presets_save erro: #{e.message}"
        resolver(dlg, data["id"], { ok: false, error: e.message })
      end
    end

    # ══════════════ EMPRESA (cadastro do escritório) ══════════════
    # Persistência em arquivo JSON: logo (base64 data URI) é grande demais
    # pra Sketchup.write_default. Arquivo em %APPDATA%/SignEng/empresa.json
    # (Windows) ou ~/.signeng/empresa.json (Mac/Linux).
    dlg.add_action_callback("empresa_get") do |_ctx, json|
      data = parse_payload(json)
      begin
        path = empresa_file_path
        if File.exist?(path)
          raw = File.read(path, mode: 'rb:UTF-8')
          empresa = JSON.parse(raw)
        else
          empresa = {}
        end
        resolver(dlg, data["id"], { ok: true, empresa: empresa })
      rescue => e
        puts "[SignEng] empresa_get erro: #{e.message}"
        resolver(dlg, data["id"], { ok: true, empresa: {} })
      end
    end

    dlg.add_action_callback("empresa_save") do |_ctx, json|
      data = parse_payload(json)
      begin
        empresa = data["empresa"] || {}
        path = empresa_file_path
        FileUtils.mkdir_p(File.dirname(path))
        File.open(path, 'wb') { |f| f.write(JSON.generate(empresa)) }
        puts "[SignEng] empresa_save ok: #{path}"
        resolver(dlg, data["id"], { ok: true })
      rescue => e
        puts "[SignEng] empresa_save erro: #{e.message}"
        resolver(dlg, data["id"], { ok: false, error: e.message })
      end
    end

    # ══════════════ APP — abrir URL externa ══════════════
    dlg.add_action_callback("app_open_url") do |_ctx, json|
      data = parse_payload(json)
      url = data["url"].to_s
      # Whitelist: só http/https pra evitar abrir caminhos arbitrários
      if url !~ /\Ahttps?:\/\//i
        resolver(dlg, data["id"], { ok: false, error: "URL inválida" })
        next
      end
      begin
        UI.openURL(url)
        resolver(dlg, data["id"], { ok: true })
      rescue => e
        resolver(dlg, data["id"], { ok: false, error: e.message })
      end
    end

    # ══════════════ APP ══════════════
    dlg.add_action_callback("app_info") do |_ctx, json|
      data = parse_payload(json)
      resolver(dlg, data["id"], {
        ok:      true,
        version: Core::VERSION,
        plugin:  "SignEng"
      })
    end

    dlg.add_action_callback("app_check_update") do |_ctx, json|
      data = parse_payload(json)
      begin
        # Query /plugin_versions where isLatest == true
        id_token = Sketchup.read_default(DEFAULT_NS, "fb_id_token", "").to_s
        # Fallback: se não tá logado, ainda tenta (query pública — rule permite read)
        # Mas Firestore REST exige algum Authorization. Usa o id_token se houver.
        r = Core::FirebaseClient.query_collection(
          "plugin_versions",
          where: { isLatest: true },
          id_token: id_token
        )

        if !r[:ok] || !r[:docs] || r[:docs].empty?
          # Sem resposta → assume uptodate
          resolver(dlg, data["id"], {
            ok:      true,
            current: Core::VERSION,
            remote:  Core::VERSION,
            update:  false,
            code:    "app.update.uptodate"
          })
          next
        end

        latest      = r[:docs].first
        remote_ver  = latest["version"].to_s
        download    = latest["downloadUrl"].to_s
        changelog   = latest["changelog"].to_s
        has_update  = !remote_ver.empty? && remote_ver != Core::VERSION

        resolver(dlg, data["id"], {
          ok:           true,
          current:      Core::VERSION,
          remote:       remote_ver,
          update:       has_update,
          download_url: download,
          changelog:    changelog,
          code:         has_update ? "app.update.available" : "app.update.uptodate"
        })
      rescue => e
        puts "[SignEng] app_check_update erro: #{e.message}"
        resolver(dlg, data["id"], {
          ok:    false,
          code:  "app.update.error",
          error: e.message
        })
      end
    end

    # (app_open_url já existe em outro lugar — não duplicar)

    # ══════════════ UI: módulo pendente (deep-link da toolbar) ══════════════
    # O boot/login do app consome o módulo clicado na toolbar e já abre
    # DIRETO nele (sem passar pelo dashboard). Lê e limpa.
    dlg.add_action_callback("ui_pending_module") do |_ctx, json|
      data = parse_payload(json)
      mod = @pending_module
      @pending_module = nil
      resolver(dlg, data["id"], { ok: true, module: mod })
    end

    # ══════════════ I18N ══════════════
    dlg.add_action_callback("i18n_get") do |_ctx, json|
      data = parse_payload(json)
      lang = Sketchup.read_default(DEFAULT_NS, "lang", "pt").to_s
      resolver(dlg, data["id"], { ok: true, lang: lang })
    end

    dlg.add_action_callback("i18n_save") do |_ctx, json|
      data = parse_payload(json)
      lang = data["lang"].to_s
      lang = "pt" unless %w[pt es en].include?(lang)
      Sketchup.write_default(DEFAULT_NS, "lang", lang)
      resolver(dlg, data["id"], { ok: true, lang: lang })
    end

    # ══════════════ UI SCALE ══════════════
    dlg.add_action_callback("ui_scale_get") do |_ctx, json|
      data = parse_payload(json)
      scale = Sketchup.read_default(DEFAULT_NS, "ui_scale", "md").to_s
      scale = "md" unless %w[sm md lg].include?(scale)
      resolver(dlg, data["id"], { ok: true, scale: scale })
    end

    dlg.add_action_callback("ui_scale_save") do |_ctx, json|
      data = parse_payload(json)
      scale = data["scale"].to_s
      scale = "md" unless %w[sm md lg].include?(scale)
      Sketchup.write_default(DEFAULT_NS, "ui_scale", scale)
      resolver(dlg, data["id"], { ok: true, scale: scale })
    end

    dlg.add_action_callback("theme_get") do |_ctx, json|
      data = parse_payload(json)
      theme = Sketchup.read_default(DEFAULT_NS, "theme", "light").to_s
      theme = "light" unless %w[light dark].include?(theme)
      resolver(dlg, data["id"], { ok: true, theme: theme })
    end

    dlg.add_action_callback("theme_save") do |_ctx, json|
      data = parse_payload(json)
      theme = data["theme"].to_s
      theme = "light" unless %w[light dark].include?(theme)
      Sketchup.write_default(DEFAULT_NS, "theme", theme)
      resolver(dlg, data["id"], { ok: true, theme: theme })
    end

    # ══════════════ PRESETS (genérico por kind) ══════════════
    # Persistência: Sketchup.write_default não preserva strings com aspas/JSON
    # de forma confiável. Encodamos em Base64 antes de gravar e decodamos na leitura.
    dlg.add_action_callback("presets_get") do |_ctx, json|
      data = parse_payload(json)
      kind = data["kind"].to_s.gsub(/[^a-z0-9_]/i, '')
      kind = "default" if kind.empty?
      key  = "presets_b64_#{kind}"
      raw  = Sketchup.read_default(DEFAULT_NS, key, "").to_s
      presets = []
      begin
        unless raw.empty?
          decoded = Base64.strict_decode64(raw)
          parsed  = JSON.parse(decoded)
          presets = parsed if parsed.is_a?(Array)
        end
      rescue => e
        puts "[SignEng] presets_get parse erro: #{e.message}"
      end
      resolver(dlg, data["id"], { ok: true, presets: presets })
    end

    dlg.add_action_callback("presets_save") do |_ctx, json|
      data = parse_payload(json)
      kind = data["kind"].to_s.gsub(/[^a-z0-9_]/i, '')
      kind = "default" if kind.empty?
      key  = "presets_b64_#{kind}"
      presets = data["presets"] || []
      begin
        json_str = JSON.generate(presets)
        encoded  = Base64.strict_encode64(json_str)
        Sketchup.write_default(DEFAULT_NS, key, encoded)
        puts "[SignEng] presets_save ok: #{presets.length} preset(s), #{encoded.bytesize} bytes"
        resolver(dlg, data["id"], { ok: true, count: presets.length })
      rescue => e
        puts "[SignEng] presets_save erro: #{e.message}"
        resolver(dlg, data["id"], { ok: false, error: e.message })
      end
    end

    # ══════════════ EMPRESA (cadastro do escritório) ══════════════
    # Persistência em arquivo JSON: logo (base64 data URI) é grande demais
    # pra Sketchup.write_default. Arquivo em %APPDATA%/SignEng/empresa.json
    # (Windows) ou ~/.signeng/empresa.json (Mac/Linux).
    dlg.add_action_callback("empresa_get") do |_ctx, json|
      data = parse_payload(json)
      begin
        path = empresa_file_path
        if File.exist?(path)
          raw = File.read(path, mode: 'rb:UTF-8')
          empresa = JSON.parse(raw)
        else
          empresa = {}
        end
        resolver(dlg, data["id"], { ok: true, empresa: empresa })
      rescue => e
        puts "[SignEng] empresa_get erro: #{e.message}"
        resolver(dlg, data["id"], { ok: true, empresa: {} })
      end
    end

    dlg.add_action_callback("empresa_save") do |_ctx, json|
      data = parse_payload(json)
      begin
        empresa = data["empresa"] || {}
        path = empresa_file_path
        FileUtils.mkdir_p(File.dirname(path))
        File.open(path, 'wb') { |f| f.write(JSON.generate(empresa)) }
        puts "[SignEng] empresa_save ok: #{path}"
        resolver(dlg, data["id"], { ok: true })
      rescue => e
        puts "[SignEng] empresa_save erro: #{e.message}"
        resolver(dlg, data["id"], { ok: false, error: e.message })
      end
    end

    # ══════════════ APP — abrir URL externa ══════════════
    dlg.add_action_callback("app_open_url") do |_ctx, json|
      data = parse_payload(json)
      url = data["url"].to_s
      # Whitelist: só http/https pra evitar abrir caminhos arbitrários
      if url !~ /\Ahttps?:\/\//i
        resolver(dlg, data["id"], { ok: false, error: "URL inválida" })
        next
      end
      begin
        UI.openURL(url)
        resolver(dlg, data["id"], { ok: true })
      rescue => e
        resolver(dlg, data["id"], { ok: false, error: e.message })
      end
    end

    # ══════════════ APP ══════════════
    dlg.add_action_callback("app_info") do |_ctx, json|
      data = parse_payload(json)
      resolver(dlg, data["id"], {
        ok:      true,
        version: Core::VERSION,
        plugin:  "SignEng"
      })
    end

    dlg.add_action_callback("app_check_update") do |_ctx, json|
      data = parse_payload(json)
      begin
        # Query /plugin_versions where isLatest == true
        id_token = Sketchup.read_default(DEFAULT_NS, "fb_id_token", "").to_s
        # Fallback: se não tá logado, ainda tenta (query pública — rule permite read)
        # Mas Firestore REST exige algum Authorization. Usa o id_token se houver.
        r = Core::FirebaseClient.query_collection(
          "plugin_versions",
          where: { isLatest: true },
          id_token: id_token
        )

        if !r[:ok] || !r[:docs] || r[:docs].empty?
          # Sem resposta → assume uptodate
          resolver(dlg, data["id"], {
            ok:      true,
            current: Core::VERSION,
            remote:  Core::VERSION,
            update:  false,
            code:    "app.update.uptodate"
          })
          next
        end

        latest      = r[:docs].first
        remote_ver  = latest["version"].to_s
        download    = latest["downloadUrl"].to_s
        changelog   = latest["changelog"].to_s
        has_update  = !remote_ver.empty? && remote_ver != Core::VERSION

        resolver(dlg, data["id"], {
          ok:           true,
          current:      Core::VERSION,
          remote:       remote_ver,
          update:       has_update,
          download_url: download,
          changelog:    changelog,
          code:         has_update ? "app.update.available" : "app.update.uptodate"
        })
      rescue => e
        puts "[SignEng] app_check_update erro: #{e.message}"
        resolver(dlg, data["id"], {
          ok:    false,
          code:  "app.update.error",
          error: e.message
        })
      end
    end

    # (app_open_url já existe em outro lugar — não duplicar)

    # ══════════════ UI: módulo pendente (deep-link da toolbar) ══════════════
    # O boot/login do app consome o módulo clicado na toolbar e já abre
    # DIRETO nele (sem passar pelo dashboard). Lê e limpa.
    dlg.add_action_callback("ui_pending_module") do |_ctx, json|
      data = parse_payload(json)
      mod = @pending_module
      @pending_module = nil
      resolver(dlg, data["id"], { ok: true, module: mod })
    end

    # ══════════════ UI: carrega painel de módulo dinamicamente ══════════════
    dlg.add_action_callback("ui_load_module") do |_ctx, json|
      data = parse_payload(json)
      name = data["name"].to_s
      name = name.gsub(/[^a-z0-9_]/, '') # sanitiza

      mod_dir = File.join(UI_DIR, 'modules', name)
      unless File.directory?(mod_dir)
        resolver(dlg, data["id"], { ok: false, code: "ui.module_not_found", name: name })
        next
      end

      begin
        html = read_module_file(mod_dir, 'panel.html')
        css  = read_module_file(mod_dir, 'panel.css')
        js   = read_module_file(mod_dir, 'panel.js')
        resolver(dlg, data["id"], {
          ok:   true,
          name: name,
          html: html,
          css:  css,
          js:   js
        })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "ui.load_error", error: e.message })
      end
    end

    # ══════════════ AUTO-ACM ══════════════
    dlg.add_action_callback("autoacm_get_cores") do |_ctx, json|
      data = parse_payload(json)
      begin
        cores_cat = {}
        ordem_cat = []
        Generator::CORES_ACM.each do |nome, info|
          cat = info[:cat].to_s
          ordem_cat << cat unless ordem_cat.include?(cat)
          cores_cat[cat] ||= []
          cores_cat[cat] << { nome: nome, rgb: info[:rgb] }
        end
        juntas = Generator::CORES_JUNTA.map { |n, rgb| { nome: n, rgb: rgb } }
        fitas  = Generator::CORES_FITA.map  { |n, rgb| { nome: n, rgb: rgb } }
        resolver(dlg, data["id"], {
          ok: true,
          cores_acm: cores_cat,
          ordem_cat: ordem_cat,
          cores_junta: juntas,
          cores_fita: fitas
        })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacm.cores_error", error: e.message })
      end
    end

    dlg.add_action_callback("autoacm_capturar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::AutoACM.capturar_faces_data
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacm.exception", error: e.message })
      end
    end

    # ══════════════ AUTO-ACM CURVO ══════════════
    dlg.add_action_callback("autoacm_curvo_capturar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::AutoACMCurvo.capturar_faces_data
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacmcurvo.exception", error: e.message })
      end
    end

    dlg.add_action_callback("autoacm_curvo_selecionar") do |_ctx, json|
      data = parse_payload(json)
      begin
        eid = data["entity_id"].to_i
        zoom = data["zoom"] == true
        result = Generator::AutoACMCurvo.selecionar_modulo_por_id(eid, zoom)
        resolver(dlg, data["id"], result || { ok: true })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacmcurvo.selecionar_error", error: e.message })
      end
    end

    dlg.add_action_callback("autoacm_curvo_gerar") do |_ctx, json|
      data = parse_payload(json)
      begin
        # Gate de licença silencioso (cache 1h, grace offline 24h).
        v = Core::Auth.assert_valid!
        unless v[:ok]
          resolver(dlg, data["id"], v.merge(blocked: true))
          next
        end

        eid    = data["entity_id"].to_i
        params = data["params"] || {}

        model = Sketchup.active_model
        grp   = Generator::AutoACMCurvo.find_entity_by_id(model, eid)
        if grp.nil?
          resolver(dlg, data["id"], { ok: false, code: "autoacmcurvo.entity_not_found" })
          next
        end

        sym_params = {}
        params.each { |k, v| sym_params[k.to_sym] = v }

        result = Generator::AutoACMCurvo.gerar(sym_params, nil, grp)
        resolver(dlg, data["id"], result || { ok: false, code: "autoacmcurvo.gerar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacmcurvo.gerar_exception", error: e.message })
      end
    end

    # AUTO-ACM CURVO — ADICIONAR PEÇA INCREMENTAL (sem regenerar a estrutura)
    # Espelho do autoacm_aplicar_edicoes do normal. Recebe { entity_id, piece, params }
    # e desenha SÓ a peça nova no grupo existente.
    dlg.add_action_callback("autoacm_curvo_adicionar_peca") do |_ctx, json|
      data = parse_payload(json)
      begin
        eid    = data["entity_id"].to_i
        piece  = data["piece"]  || {}
        params = data["params"] || {}
        result = Generator::AutoACMCurvo.adicionar_peca(eid, piece, params)
        resolver(dlg, data["id"], result || { ok: false, code: "autoacmcurvo.adicionar_peca_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacmcurvo.adicionar_peca_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # AUTO-ACM CURVO — APLICAR EDICOES (Tesoura/Mover na estrutura gerada)
    # Espelho do autoacm_aplicar_edicoes do normal. del_ids/ofs_list operam
    # sobre os sub-grupos da estrutura curva (met_N/em_N/fita_N), sem regenerar.
    dlg.add_action_callback("autoacm_curvo_aplicar_edicoes") do |_ctx, json|
      data = parse_payload(json)
      begin
        eid      = data["entity_id"].to_i
        del_ids  = data["del_ids"]  || []
        ofs_list = data["ofs_list"] || []
        result = Generator::AutoACMCurvo.aplicar_edicoes(eid, del_ids, ofs_list)
        resolver(dlg, data["id"], result || { ok: false, code: "autoacmcurvo.aplicar_edicoes_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacmcurvo.aplicar_edicoes_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # AUTO-ACM CURVO — DESFAZER (restaura estrutura de um snapshot de pecas_3d)
    dlg.add_action_callback("autoacm_curvo_restaurar_snapshot") do |_ctx, json|
      data = parse_payload(json)
      begin
        eid    = data["entity_id"].to_i
        pecas  = data["pecas"]  || []
        origin = data["origin"]
        result = Generator::AutoACMCurvo.restaurar_snapshot(eid, pecas, origin)
        resolver(dlg, data["id"], result || { ok: false, code: "autoacmcurvo.restaurar_snapshot_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacmcurvo.restaurar_snapshot_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ PLANIFICA — CAPTURAR PAINÉIS DO MÓVEL ══════════════
    dlg.add_action_callback("planifica_capturar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Planifica.capturar
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.capturar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.capturar_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ PLANIFICA — BLOCO DE MÓVEIS: GERAR MÓVEL INDUSTRIAL ══════════════
    # Cálculo no servidor (movelIndustrialCompute); aqui valida a licença,
    # desenha as peças e deixa o grupo selecionado pra captura em seguida.
    dlg.add_action_callback("planifica_gerar_movel") do |_ctx, json|
      data = parse_payload(json)
      begin
        v = Core::Auth.assert_valid!
        unless v[:ok]
          resolver(dlg, data["id"], v.merge(blocked: true))
          next
        end
        result = Generator::Planifica.gerar_movel(data["params"] || {})
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.gerar_movel_nil" })
      rescue => e
        Sketchup.active_model.abort_operation rescue nil
        resolver(dlg, data["id"], { ok: false, code: "planifica.gerar_movel_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ PLANIFICA — BLOCO DE MÓVEIS: SELECIONAR MÓVEL GERADO ══════════════
    dlg.add_action_callback("planifica_movel_selecionar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Planifica.movel_selecionar
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.movel_selecionar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.movel_selecionar_exception", error: e.message })
      end
    end

    # ══════════════ PLANIFICA — BLOCO DE MÓVEIS: ABRIR GAVETAS / EXPLODIR ══════════════
    dlg.add_action_callback("planifica_movel_transformar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Planifica.movel_transformar(
          data.key?("explode") ? data["explode"] : nil,
          data.key?("gavetas") ? data["gavetas"] : nil,
          data.key?("cotas") ? data["cotas"] : nil
        )
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.movel_transformar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.movel_transformar_exception", error: e.message })
      end
    end

    # ══════════════ PLANIFICA — DESTACAR PEÇA NO SKETCHUP ══════════════
    dlg.add_action_callback("planifica_destacar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Planifica.destacar(data["pid"])
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.destacar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.destacar_exception", error: e.message })
      end
    end

    # ══════════════ PLANIFICA — EXPORTAR EPS ══════════════
    dlg.add_action_callback("planifica_exportar_eps") do |_ctx, json|
      data = parse_payload(json)
      begin
        layout = data["layout"] || {}
        result = Generator::Planifica.exportar_eps(layout)
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.export_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.export_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ PLANIFICA — SALVAR PLANO DE CORTE (HTML) ══════════════
    dlg.add_action_callback("planifica_salvar_plano") do |_ctx, json|
      data = parse_payload(json)
      begin
        name    = data["name"].to_s.gsub(/[^a-zA-Z0-9_\-]/, '_')
        name    = "plano_corte" if name.empty?
        content = Base64.decode64(data["content"].to_s)

        path = UI.savepanel("Salvar Plano de Corte", Dir.home, "#{name}.html")
        if path.nil?
          resolver(dlg, data["id"], { ok: false, code: "user_cancelled" })
          next
        end
        path = path + ".html" unless path.downcase.end_with?(".html", ".htm")

        # Modo binário — os bytes do base64 já são UTF-8 válidos.
        File.open(path, 'wb') { |f| f.write(content) }
        puts "[Planifica] Plano salvo: #{path} (#{content.bytesize} bytes)"

        begin
          UI.openURL("file:///" + path.gsub('\\', '/'))
        rescue => open_err
          puts "[Planifica] Aviso: nao foi possivel abrir o plano: #{open_err.message}"
        end

        resolver(dlg, data["id"], { ok: true, path: File.basename(path) })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.salvar_plano_error", error: e.message })
      end
    end

    # ══════════════ PLANIFICA — MARCAR FITA DE BORDA NO SKETCHUP ══════════════
    dlg.add_action_callback("planifica_marcar_fitas") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Planifica.marcar_fitas(data["quads"] || [])
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.marcar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.marcar_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ PLANIFICA — LIMPAR FITA DE BORDA ══════════════
    dlg.add_action_callback("planifica_limpar_fitas") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Planifica.limpar_fitas
        resolver(dlg, data["id"], result || { ok: false, code: "planifica.limpar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "planifica.limpar_exception", error: e.message })
      end
    end

    # ══════════════ CORTE & ENCAIXE — CAPTURAR PAINÉIS ══════════════
    dlg.add_action_callback("corte_encaixe_capturar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::CorteEncaixe.capturar
        resolver(dlg, data["id"], result || { ok: false, code: "corte_encaixe.capturar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "corte_encaixe.capturar_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ CORTE & ENCAIXE — CALCULAR LAYOUT NO SERVIDOR ══════════════
    dlg.add_action_callback("corte_encaixe_compute") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::CorteEncaixe.compute_layout(data)
        resolver(dlg, data["id"], result || { ok: false, code: "corte_encaixe.compute_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "corte_encaixe.compute_exception", error: e.message })
      end
    end

    # ══════════════ CORTE & ENCAIXE — DESTACAR PEÇA NO SKETCHUP ══════════════
    dlg.add_action_callback("corte_encaixe_destacar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::CorteEncaixe.destacar(data["pid"])
        resolver(dlg, data["id"], result || { ok: false, code: "corte_encaixe.destacar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "corte_encaixe.destacar_exception", error: e.message })
      end
    end

    # ══════════════ CORTE & ENCAIXE — EXPORTAR SVG ══════════════
    dlg.add_action_callback("corte_encaixe_exportar_svg") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::CorteEncaixe.exportar_svg(data)
        resolver(dlg, data["id"], result || { ok: false, code: "corte_encaixe.export_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "corte_encaixe.export_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ CORTE & ENCAIXE — MARCAR PEÇAS COLORIDAS ══════════════
    dlg.add_action_callback("corte_encaixe_marcar_pecas") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::CorteEncaixe.marcar_pecas(data["pecas"] || [])
        resolver(dlg, data["id"], result || { ok: false, code: "corte_encaixe.marcar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "corte_encaixe.marcar_exception", error: e.message, trace: e.backtrace.first(8) })
      end
    end

    # ══════════════ CORTE & ENCAIXE — LIMPAR PEÇAS COLORIDAS ══════════════
    dlg.add_action_callback("corte_encaixe_limpar_pecas") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::CorteEncaixe.limpar_pecas
        resolver(dlg, data["id"], result || { ok: false, code: "corte_encaixe.limpar_nil" })
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "corte_encaixe.limpar_exception", error: e.message })
      end
    end

    # ══════════════ TEXTURA SYNC — CAPTURAR FACES ══════════════
    dlg.add_action_callback("texturasync_capturar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::TexturaSync.capturar_faces_data
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "texturasync.exception", error: e.message })
      end
    end

    # ══════════════ TEXTURA SYNC — CARREGAR IMAGEM ══════════════
    dlg.add_action_callback("texturasync_carregar_imagem") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::TexturaSync.carregar_imagem_data
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "texturasync.exception", error: e.message })
      end
    end

    # ══════════════ TEXTURA SYNC — APLICAR TEXTURA ══════════════
    dlg.add_action_callback("texturasync_aplicar") do |_ctx, json|
      data = parse_payload(json)
      begin
        params = {
          tx_x:   data["tx_x"],
          tx_y:   data["tx_y"],
          tx_w:   data["tx_w"],
          tx_h:   data["tx_h"],
          tx_rot: data["tx_rot"]
        }
        result = Generator::TexturaSync.aplicar_textura(params)
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "texturasync.exception", error: e.message })
      end
    end

    # ══════════════ TEXTURA SYNC — RESET STATE ══════════════
    dlg.add_action_callback("texturasync_reset") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::TexturaSync.reset_state
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "texturasync.exception", error: e.message })
      end
    end

    # ══════════════ LOGO 3D — CARREGAR ARQUIVO ══════════════
    dlg.add_action_callback("logo3d_carregar") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Logo3D.carregar_arquivo_data
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "logo3d.exception", error: e.message })
      end
    end

    # ══════════════ LOGO 3D — GERAR ══════════════
    dlg.add_action_callback("logo3d_gerar") do |_ctx, json|
      data = parse_payload(json)
      begin
        v = Core::Auth.assert_valid!
        unless v[:ok]
          resolver(dlg, data["id"], v.merge(blocked: true))
          next
        end

        params = {
          largura:         data["largura"],
          altura:          data["altura"],
          extrusao:        data["extrusao"],
          tipo:            data["tipo"],
          espessura_casca: data["espessura_casca"],
          cor_nome:        data["cor_nome"],
          cor_r:           data["cor_r"],
          cor_g:           data["cor_g"],
          cor_b:           data["cor_b"],
          contorno:        data["contorno"],
          contorno_esp:    data["contorno_esp"],
          contorno_ext:    data["contorno_ext"],
          contorno_cor_r:  data["contorno_cor_r"],
          contorno_cor_g:  data["contorno_cor_g"],
          contorno_cor_b:  data["contorno_cor_b"],
          keep_miolos:     data["keep_miolos"]
        }
        result = Generator::Logo3D.gerar(params)
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "logo3d.exception", error: e.message })
      end
    end

    # ══════════════ LOGO 3D — RESET ══════════════
    dlg.add_action_callback("logo3d_reset") do |_ctx, json|
      data = parse_payload(json)
      begin
        result = Generator::Logo3D.reset_state
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "logo3d.exception", error: e.message })
      end
    end

    # ══════════════ AUTO-ACM — DUPLICAR MÓDULO ══════════════
    # Clona o grupo do entity_id, posiciona ao lado direito do conjunto
    # selecionado, retorna o novo entity_id.
    dlg.add_action_callback("autoacm_duplicar_modulo") do |_ctx, json|
      data = parse_payload(json)
      begin
        eid = data["entity_id"].to_i
        existing_ids = data["existing_ids"] || []

        model = Sketchup.active_model
        src   = model.find_entity_by_id(eid)
        unless src && src.valid? && (src.is_a?(Sketchup::Group) || src.is_a?(Sketchup::ComponentInstance))
          resolver(dlg, data["id"], { ok: false, error: "Grupo de origem inválido." })
          next
        end

        model.start_operation("Duplicar módulo SignEng", true)

        # Calcula offset X baseado no conjunto inteiro de módulos
        max_x = 0.0
        existing_ids.each do |oeid|
          ent = model.find_entity_by_id(oeid.to_i) rescue nil
          if ent && ent.valid?
            mx = ent.bounds.max.x.to_f
            max_x = mx if mx > max_x
          end
        end
        # Inclui o próprio src se não estava na lista
        src_max = src.bounds.max.x.to_f
        max_x = src_max if src_max > max_x

        gap_in = 200.0 / 25.4
        offset_x = max_x + gap_in - src.bounds.min.x.to_f

        # Clona via add_instance da definition do grupo (funciona em SU 2014+)
        # Sketchup::Group herda de ComponentInstance, então .definition existe.
        tr   = Geom::Transformation.translation([offset_x, 0, 0])
        defn = src.definition
        copy = model.active_entities.add_instance(defn, tr)
        copy.name = (src.name.to_s.empty? ? "AutoACM Box" : src.name) + " (cópia)"

        # Seleciona TUDO: módulos antigos + src + nova cópia
        sel = model.selection
        sel.clear
        existing_ids.each do |oeid|
          ent = model.find_entity_by_id(oeid.to_i) rescue nil
          sel.add(ent) if ent && ent.valid?
        end
        sel.add(src) unless sel.include?(src)
        sel.add(copy)

        model.commit_operation

        # Centraliza no conjunto
        model.active_view.zoom(sel.to_a)

        # Pega bounds da cópia em mm pra retornar
        bb  = copy.bounds
        wmm = (bb.width  * 25.4).round
        hmm = (bb.height * 25.4).round
        dmm = (bb.depth  * 25.4).round

        resolver(dlg, data["id"], {
          ok: true,
          entity_id: copy.entityID,
          w: wmm, h: hmm, d: dmm,
          name: copy.name
        })
      rescue => e
        Sketchup.active_model.abort_operation rescue nil
        resolver(dlg, data["id"], {
          ok: false,
          code: "autoacm.duplicar_error",
          error: e.message
        })
      end
    end

    # ══════════════ AUTO-ACM — CRIAR CAIXA PARAMÉTRICA ══════════════
    # Aceita `existing_ids` opcional: lista de entity_ids dos módulos já
    # capturados. A nova caixa é POSICIONADA ao lado deles (translation X)
    # e adicionada à seleção JUNTO com os anteriores, pra que o
    # capturar_faces seguinte pegue todos e o usuário acumule módulos.
    dlg.add_action_callback("autoacm_criar_caixa") do |_ctx, json|
      data = parse_payload(json)
      begin
        w_mm = data["w"].to_f
        h_mm = data["h"].to_f
        d_mm = data["d"].to_f
        existing_ids = data["existing_ids"] || []

        if w_mm < 50 || h_mm < 50 || d_mm < 10
          resolver(dlg, data["id"], { ok: false, error: "Dimensões muito pequenas." })
          next
        end

        # mm → polegadas (unidade interna do SketchUp)
        mm_to_in = ->(mm) { mm / 25.4 }
        w = mm_to_in.call(w_mm)
        h = mm_to_in.call(h_mm)
        d = mm_to_in.call(d_mm)

        model = Sketchup.active_model
        model.start_operation("Criar caixa SignEng", true)

        # Resolve as entidades existentes pra calcular offset X
        existing_entities = []
        max_x = 0.0
        existing_ids.each do |eid|
          ent = model.find_entity_by_id(eid.to_i) rescue nil
          if ent && ent.valid?
            existing_entities << ent
            bb = ent.bounds
            mx = bb.max.x.to_f
            max_x = mx if mx > max_x
          end
        end

        # Offset em X (com gap de 200mm em polegadas) pra não sobrepor
        offset_x = existing_entities.empty? ? 0 : (max_x + (200.0 / 25.4))

        grp  = model.active_entities.add_group
        ents = grp.entities

        # Base no plano XY (Z=0), altura sobe em Z, profundidade em Y
        pts = [
          [offset_x,       0,   0],
          [offset_x + w,   0,   0],
          [offset_x + w,   d,   0],
          [offset_x,       d,   0]
        ]
        face = ents.add_face(pts)
        face.reverse! if face.normal.z < 0
        face.pushpull(h)

        grp.name = "AutoACM Box #{w_mm.to_i}x#{h_mm.to_i}x#{d_mm.to_i}"

        # Seleciona TUDO: módulos antigos + nova caixa
        sel = model.selection
        sel.clear
        existing_entities.each { |e| sel.add(e) }
        sel.add(grp)

        model.commit_operation

        # Centraliza a vista no conjunto selecionado (todos os módulos)
        view = model.active_view
        if existing_entities.empty?
          view.zoom(grp)
        else
          view.zoom(sel.to_a)
        end

        resolver(dlg, data["id"], {
          ok: true,
          entity_id: grp.entityID,
          w: w_mm, h: h_mm, d: d_mm,
          total_selected: sel.length
        })
      rescue => e
        Sketchup.active_model.abort_operation rescue nil
        resolver(dlg, data["id"], {
          ok: false,
          code: "autoacm.criar_caixa_error",
          error: e.message
        })
      end
    end

    dlg.add_action_callback("autoacm_selecionar") do |_ctx, json|
      data = parse_payload(json)
      begin
        eid  = data["entity_id"].to_i
        zoom = data["zoom"] == true
        result = Generator::AutoACM.selecionar_modulo_por_id(eid, zoom)
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], { ok: false, code: "autoacm.exception", error: e.message })
      end
    end

    # ══════════════ AUTO-ACM — SALVAR PLANO DE CORTE HTML ══════════════
    dlg.add_action_callback("autoacm_salvar_plano") do |_ctx, json|
      data = parse_payload(json)
      begin
        name    = data["name"].to_s
        content = Base64.decode64(data["content"].to_s)
        # Sanitiza nome pra evitar path traversal / chars inválidos
        name = name.gsub(/[^a-zA-Z0-9_\-]/, '_')
        name = "Plano_AutoACM" if name.empty?

        path = UI.savepanel(
          "Salvar Plano de Corte",
          Dir.home,
          "#{name}.html"
        )

        if path.nil?
          resolver(dlg, data["id"], { ok: false, code: "user_cancelled" })
          next
        end

        path = path + ".html" unless path.downcase.end_with?(".html", ".htm")

        # Escreve em modo BINÁRIO — os bytes do base64 já são UTF-8 válidos
        # (o JS fez `unescape(encodeURIComponent(html))` antes do btoa).
        # Escrever com `w:UTF-8` causa erro de conversão ASCII-8BIT → UTF-8.
        File.open(path, 'wb') { |f| f.write(content) }

        # Log de debug no Ruby Console
        puts "[AutoACM] Plano salvo: #{path} (#{content.bytesize} bytes)"

        # Abre no navegador padrão do SO
        begin
          UI.openURL("file:///" + path.gsub('\\', '/'))
        rescue => open_err
          puts "[AutoACM] Aviso: nao foi possivel abrir o plano: #{open_err.message}"
        end

        resolver(dlg, data["id"], { ok: true, path: File.basename(path) })
      rescue => e
        resolver(dlg, data["id"], {
          ok: false,
          code: "autoacm.salvar_plano_error",
          error: e.message
        })
      end
    end

    # ══════════════ AUTO-ACM — APLICAR EDIÇÕES 3D (cut/move) ══════════════
    dlg.add_action_callback("autoacm_aplicar_edicoes") do |_ctx, json|
      data = parse_payload(json)
      begin
        eid        = data["entity_id"].to_i
        del_ids    = data["del_ids"] || []
        ofs_list   = data["ofs_list"] || []
        extras_add = data["extras_add"] || []
        params     = data["params"] || {}
        result = Generator::AutoACM.aplicar_edicoes_data(eid, del_ids, ofs_list, params, extras_add)
        if result[:ok] && result[:quant]
          result[:quant] = sanitize_quant(result[:quant])
        end
        resolver(dlg, data["id"], result)
      rescue => e
        resolver(dlg, data["id"], {
          ok: false,
          code: "autoacm.aplicar_erro",
          error: e.message,
          backtrace: e.backtrace.first(3).join("\n")
        })
      end
    end

    # ══════════════ AUTO-ACM — GERAR ESTRUTURA ══════════════
    dlg.add_action_callback("autoacm_gerar") do |_ctx, json|
      data = parse_payload(json)
      begin
        v = Core::Auth.assert_valid!
        unless v[:ok]
          resolver(dlg, data["id"], v.merge(blocked: true))
          next
        end

        eid    = data["entity_id"].to_i
        params = data["params"] || {}

        model = Sketchup.active_model
        grp   = Generator::AutoACM.find_entity_by_id(model, eid)
        if grp.nil?
          resolver(dlg, data["id"], { ok: false, code: "autoacm.entity_not_found" })
          next
        end

        # Converte params JSON (string keys) → hash com symbol keys esperado por extrair
        sym_params = {}
        params.each { |k, v| sym_params[k.to_sym] = v }

        # Chama gerar sem dialog — retorna o quantitativo como hash
        quant = Generator::AutoACM.gerar(sym_params, nil, grp)

        if quant.nil?
          resolver(dlg, data["id"], { ok: false, code: "autoacm.gerar_nil" })
          next
        end

        # Converte quant pra um hash serializável (remove chaves problemáticas)
        safe_quant = sanitize_quant(quant)
        resolver(dlg, data["id"], { ok: true, quant: safe_quant })
      rescue => e
        resolver(dlg, data["id"], {
          ok: false,
          code: "autoacm.gerar_error",
          error: e.message,
          backtrace: e.backtrace.first(3).join("\n")
        })
      end
    end

    # ══════════════ AUTO SIGAM-ME ══════════════
    # Reusa autoacm_get_cores pras cores. Aqui só ativamos a ferramenta de
    # desenho: separamos altura/profundidade e passamos o resto como params do
    # Auto-ACM (mesmo contrato que AutoACM.extrair espera).
    dlg.add_action_callback("auto_sigame_desenhar") do |_ctx, json|
      data = parse_payload(json)
      begin
        v = Core::Auth.assert_valid!
        unless v[:ok]
          resolver(dlg, data["id"], v.merge(blocked: true))
          next
        end

        params  = data["params"] || {}
        alt_mm  = (params["altura"] || 600).to_f
        prof_mm = (params["prof"]   || 40).to_f

        # Converte params JSON (string keys) → symbol keys p/ AutoACM.extrair
        sym_params = {}
        params.each { |k, v| sym_params[k.to_sym] = v }

        Generator::AutoSigame.ativar_ferramenta(sym_params, alt_mm, prof_mm, dlg)
        resolver(dlg, data["id"], { ok: true })
      rescue => e
        resolver(dlg, data["id"], {
          ok: false,
          code: "auto_sigame.desenhar_error",
          error: e.message,
          backtrace: e.backtrace.first(3).join("\n")
        })
      end
    end

    # ══════════════ AUTO SIGAM-ME — SALVAR PLANO DE CORTE HTML ══════════════
    # Clone do autoacm_salvar_plano: recebe o HTML pronto do painel (base64),
    # salva onde o usuário escolher e abre no navegador.
    dlg.add_action_callback("auto_sigame_salvar_plano") do |_ctx, json|
      data = parse_payload(json)
      begin
        name    = data["name"].to_s
        content = Base64.decode64(data["content"].to_s)
        # Sanitiza nome pra evitar path traversal / chars inválidos
        name = name.gsub(/[^a-zA-Z0-9_\-]/, '_')
        name = "Plano_AutoSigame" if name.empty?

        path = UI.savepanel(
          "Salvar Plano de Corte",
          Dir.home,
          "#{name}.html"
        )

        if path.nil?
          resolver(dlg, data["id"], { ok: false, code: "user_cancelled" })
          next
        end

        path = path + ".html" unless path.downcase.end_with?(".html", ".htm")

        # Escreve em modo BINÁRIO — os bytes do base64 já são UTF-8 válidos
        # (o JS fez `unescape(encodeURIComponent(html))` antes do btoa).
        File.open(path, 'wb') { |f| f.write(content) }

        puts "[AutoSigame] Plano salvo: #{path} (#{content.bytesize} bytes)"

        begin
          UI.openURL("file:///" + path.gsub('\\', '/'))
        rescue => open_err
          puts "[AutoSigame] Aviso: nao foi possivel abrir o plano: #{open_err.message}"
        end

        resolver(dlg, data["id"], { ok: true, path: File.basename(path) })
      rescue => e
        resolver(dlg, data["id"], {
          ok: false,
          code: "auto_sigame.salvar_plano_error",
          error: e.message
        })
      end
    end
  end

  # Limpa o hash do quantitativo pra serialização JSON segura
  def self.sanitize_quant(q)
    return {} unless q.is_a?(Hash)
    out = {}
    q.each do |k, v|
      key = k.to_s
      if v.is_a?(Array)
        out[key] = v.map { |item| item.is_a?(Hash) ? sanitize_quant(item) : item }
      elsif v.is_a?(Hash)
        out[key] = sanitize_quant(v)
      elsif v.is_a?(Numeric) || v.is_a?(String) || v == true || v == false || v.nil?
        out[key] = v
      else
        out[key] = v.to_s
      end
    end
    out
  end

  # ─────────────────────────────────────────────────────────────────────────
  # Helpers
  # ─────────────────────────────────────────────────────────────────────────
  def self.parse_payload(json)
    JSON.parse(json.to_s)
  rescue
    {}
  end

  def self.resolver(dlg, id, data)
    return if id.nil?
    return unless dlg
    js_id   = id.to_json
    js_data = data.to_json
    # Proteção: se o dialog foi fechado entre a chamada e o resolve,
    # execute_script pode crashear. Silenciamos o erro.
    begin
      dlg.execute_script("Bridge._resolve(#{js_id}, #{js_data})")
    rescue => e
      puts "[SignEng] resolver execute_script falhou: #{e.message}"
    end
  end

  def self.read_module_file(mod_dir, filename)
    path = File.join(mod_dir, filename)
    return "" unless File.exist?(path)
    File.read(path, mode: 'rb:UTF-8')
  rescue
    begin
      File.read(path)
    rescue
      ""
    end
  end

  # Caminho do arquivo de cadastro da empresa.
  #   Windows: %APPDATA%\SignEng\empresa.json
  #   Mac/Linux: ~/.signeng/empresa.json
  def self.empresa_file_path
    base = ENV['APPDATA'] || File.join(Dir.home, '.signeng')
    dir  = ENV['APPDATA'] ? File.join(base, 'SignEng') : base
    File.join(dir, 'empresa.json')
  end

  # ─────────────────────────────────────────────────────────────────────────
  # DEV RELOAD — recarrega todos os arquivos Ruby sem reiniciar o SketchUp.
  # Útil durante desenvolvimento: edite qualquer .rb e clique neste menu
  # pra aplicar as mudanças imediatamente.
  # ─────────────────────────────────────────────────────────────────────────
  def self.reload_dev
    files = [
      File.join(PLUGIN_DIR, 'core', 'version.rb'),
      File.join(PLUGIN_DIR, 'core', 'auth.rb'),
      File.join(PLUGIN_DIR, 'core', 'cores.rb'),
      File.join(PLUGIN_DIR, 'core', 'geometry.rb'),
      File.join(PLUGIN_DIR, 'modules', 'auto_acm.rb'),
      File.join(PLUGIN_DIR, 'main.rb')
    ]
    $VERBOSE = nil
    files.each do |f|
      begin
        load f if File.exist?(f)
      rescue => e
        UI.messagebox("Erro ao recarregar #{File.basename(f)}: #{e.message}")
        return
      end
    end
    # Força reabrir o diálogo se estiver aberto
    if @dialog && @dialog.visible?
      @dialog.close
      @dialog = nil
    end
    UI.messagebox("SignEng v#{Core::VERSION}: Ruby recarregado. Abra o diálogo novamente.")
  end

  # ─────────────────────────────────────────────────────────────────────────
  # Abre o diálogo já navegando pro módulo (botões da toolbar por módulo).
  # O JS tenta a cada 300ms até o app estar logado (Router.current em
  # dashboard/module) — se cair na tela de login, navega assim que logar.
  # ─────────────────────────────────────────────────────────────────────────
  def self.abrir_modulo(mod_id)
    if @dialog && @dialog.visible?
      # Painel já aberto: logado → navega DIRETO (sem passar pelo dashboard);
      # na tela de login → espera logar e navega.
      js = "(function(){function go(){if(window.Router&&" \
           "(Router.current==='dashboard'||Router.current==='module')){" \
           "Router.goto('module',{moduleName:'#{mod_id}'});return true;}return false;}" \
           "if(go())return;var n=0,t=setInterval(function(){n++;" \
           "if(go()||n>60)clearInterval(t);},300);})();"
      begin
        @dialog.execute_script(js)
        @dialog.bring_to_front
      rescue => e
        puts "[SignEng] abrir_modulo(#{mod_id}) falhou: #{e.message}"
      end
    else
      # Painel fechado: o boot consome o pendente (ui_pending_module) e o
      # app já NASCE dentro do módulo — sem pisca de dashboard.
      @pending_module = mod_id
      abrir
    end
  end

  # ─────────────────────────────────────────────────────────────────────────
  # Registro de menu e toolbar (uma vez só)
  # ─────────────────────────────────────────────────────────────────────────
  unless file_loaded?(__FILE__)
    menu = UI.menu("Plugins")
    menu.add_item("SignEng") { SignEng.abrir }
    menu.add_item("SignEng — Reload (DEV)") { SignEng.reload_dev }

    toolbar = UI::Toolbar.new("SignEng")
    cmd = UI::Command.new("SignEng") { SignEng.abrir }
    cmd.tooltip         = "SignEng — Gerador de Fachadas ACM"
    cmd.status_bar_text = "Abre o plugin SignEng"
    cmd.small_icon      = File.join(ICONS_DIR, 'icon_24.svg')
    cmd.large_icon      = File.join(ICONS_DIR, 'icon_32.svg')
    toolbar.add_item(cmd)

    # ── Botões por módulo (abrem o painel já no módulo — padrão do app) ──
    modulos_toolbar = [
      ['auto_acm',       'Auto-ACM',        'Gera fachada em ACM com estrutura de metalon a partir de uma face'],
      ['auto_acm_curvo', 'Auto-ACM Curvo',  'Fachadas ACM curvas/calandradas com estrutura'],
      ['auto_sigame',    'Auto Sigam-me',   'Faixa contínua de ACM seguindo um caminho desenhado'],
      ['textura_sync',   'Textura Sync',    'Aplica uma textura contínua atravessando várias faces'],
      ['logo3d',         'Logo 3D',         'Importa DXF/DWG/SVG e extruda como logo 3D'],
      ['planifica',      'Planifica',       'Planifica painéis capturados e exporta o plano de corte'],
      ['corte_encaixe',  'Corte & Encaixe', 'Encaixes dente-a-dente e nesting com export SVG/DXF']
    ]
    modulos_toolbar.each do |mid, nome, desc|
      c = UI::Command.new("SignEng — #{nome}") { SignEng.abrir_modulo(mid) }
      c.tooltip         = "#{nome} — #{desc}"
      c.status_bar_text = desc
      c.small_icon      = File.join(ICONS_DIR, "#{mid}_24.svg")
      c.large_icon      = File.join(ICONS_DIR, "#{mid}_32.svg")
      toolbar.add_item(c)
    end

    cmd_alinhar = UI::Command.new("SignEng — Alinhar") { SignEng::Generator::Alinhar.ativar }
    cmd_alinhar.tooltip         = "Alinhar — objeto 2 alinha ao objeto 1 (fixo)"
    cmd_alinhar.status_bar_text = "Alinha um grupo/componente a outro por borda, centro e faceamento"
    cmd_alinhar.small_icon      = File.join(ICONS_DIR, 'alinhar_24.svg')
    cmd_alinhar.large_icon      = File.join(ICONS_DIR, 'alinhar_32.svg')
    toolbar.add_item(cmd_alinhar)

    cmd_luminoso = UI::Command.new("SignEng — Luminoso") { SignEng::Generator::Luminoso.ativar }
    cmd_luminoso.tooltip         = "Luminoso — gera luminoso em ACM (redondo/quadrado/retangular)"
    cmd_luminoso.status_bar_text = "Gera luminoso paramétrico em ACM como componente editável"
    cmd_luminoso.small_icon      = File.join(ICONS_DIR, 'luminoso_24.svg')
    cmd_luminoso.large_icon      = File.join(ICONS_DIR, 'luminoso_32.svg')
    toolbar.add_item(cmd_luminoso)

    # LETRA 3D — módulo PAUSADO (2026-07-12, pedido do Marcelo): botão oculto
    # da toolbar até retomarmos. Pra reativar, descomentar o bloco abaixo.
    # Estado da depuração: docs/SESSION_LOG.md (v1.8.78→v1.8.80).
    # cmd_letra3d = UI::Command.new("SignEng — Letra 3D") { SignEng::Generator::Letra3d.ativar }
    # cmd_letra3d.tooltip         = "Letra 3D — letras caixa pra impressão 3D a partir de SVG"
    # cmd_letra3d.status_bar_text = "Gera letras caixa pra impressão 3D (casca, suporte, fundo e acrílico)"
    # cmd_letra3d.small_icon      = File.join(ICONS_DIR, 'letra3d_24.svg')
    # cmd_letra3d.large_icon      = File.join(ICONS_DIR, 'letra3d_32.svg')
    # toolbar.add_item(cmd_letra3d)

    # DESENHO GEOMÉTRICO — Fase 1, OCULTO na release pública (2026-07-24,
    # pedido do Marcelo): sai da toolbar até o lançamento oficial.
    # Pra reativar (teste interno), descomentar o bloco abaixo.
    # cmd_geoart = UI::Command.new("SignEng — Desenho Geométrico") { SignEng::Generator::GeoArt.ativar }
    # cmd_geoart.tooltip         = "Desenho Geométrico — foto vira mosaico low-poly em ACM"
    # cmd_geoart.status_bar_text = "Transforma uma foto em quadro geométrico (mosaico de triângulos em ACM)"
    # cmd_geoart.small_icon      = File.join(ICONS_DIR, 'desenho_geometrico_24.svg')
    # cmd_geoart.large_icon      = File.join(ICONS_DIR, 'desenho_geometrico_32.svg')
    # toolbar.add_item(cmd_geoart)

    cmd_movelparam = UI::Command.new("SignEng — Móvel Paramétrico") { SignEng::Generator::MovelParametrico.ativar }
    cmd_movelparam.tooltip         = "Móvel Paramétrico — fatia um sólido em chapas paralelas com fixação"
    cmd_movelparam.status_bar_text = "Gera móvel/painel paramétrico fatiado a partir de um sólido selecionado"
    cmd_movelparam.small_icon      = File.join(ICONS_DIR, 'movel_parametrico_24.svg')
    cmd_movelparam.large_icon      = File.join(ICONS_DIR, 'movel_parametrico_32.svg')
    toolbar.add_item(cmd_movelparam)

    toolbar.show

    file_loaded(__FILE__)
  end
end
