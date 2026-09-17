# encoding: UTF-8
require 'digest'
require 'time'

# ═══════════════════════════════════════════════════════════════════════════
# SignEng::Core::Auth
# ═══════════════════════════════════════════════════════════════════════════
# Autenticação e licenciamento 100% via Supabase (Auth + Postgres). Sistema
# somente online: não existe modo offline nem fallback local de emergência —
# o admin vitalício (pierreprincipal@gmail.com) é reconhecido pelo próprio
# banco (trigger da migração 002/003), não por um atalho no código do plugin.
#
# Fluxo:
#   1. login(email, pwd)
#        → SupabaseClient.sign_in → access_token + refresh_token
#        → lê perfil em public.users (RLS: só a própria linha)
#        → lê licença em public.licenses (RLS: só a própria linha)
#        → chama a RPC verify_machine_license (gate forte, sempre online)
#        → salva tokens em Sketchup.write_default
#
#   2. validate_session (no boot do plugin)
#        → lê tokens salvos; renova se expirado; repete o fluxo acima
#
#   3. assert_valid!(force=false) — gate dos botões Gerar
#        → sempre reconfirma online via verify_machine_license (sem cache,
#          sem grace offline: qualquer falha de rede bloqueia na hora)
#
#   4. destroy_session → limpa tokens, mantém last_email pra UX
# ═══════════════════════════════════════════════════════════════════════════

module SignEng
  module Core
    module Auth
      DEFAULT_NS = "SignEng".freeze

      # ─────────────────────────────────────────────────────────────────────
      # login(email, pwd) → { ok, user, license } OR { ok: false, code }
      # ─────────────────────────────────────────────────────────────────────
      def self.login(email, pwd)
        email = email.to_s.strip.downcase
        pwd   = pwd.to_s

        return { ok: false, code: "auth.empty_email" }    if email.empty?
        return { ok: false, code: "auth.empty_password" } if pwd.empty?

        res = SupabaseClient.sign_in(email, pwd)
        unless res[:ok]
          return { ok: false, code: map_supabase_error(res[:error]), error: res[:error] }
        end

        uid = (res[:user] || {})["id"].to_s
        save_tokens(res, uid)

        session = build_session(res[:access_token], uid)
        return session unless session[:ok]

        Sketchup.write_default(DEFAULT_NS, "session_email", email)
        session
      rescue => e
        puts "[SignEng::Auth] login exception: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        { ok: false, code: "auth.exception", error: e.message }
      end

      # ─────────────────────────────────────────────────────────────────────
      # validate_session — chamado no boot do plugin (auto-login)
      # ─────────────────────────────────────────────────────────────────────
      def self.validate_session
        access_token  = Sketchup.read_default(DEFAULT_NS, "sb_access_token",  "").to_s
        refresh_token = Sketchup.read_default(DEFAULT_NS, "sb_refresh_token", "").to_s
        uid           = Sketchup.read_default(DEFAULT_NS, "sb_local_id",      "").to_s
        expires_at    = Sketchup.read_default(DEFAULT_NS, "sb_expires_at",    "0").to_i

        return { ok: false, code: "session.none" } if access_token.empty? || uid.empty?

        if Time.now.to_i >= expires_at - 60
          return { ok: false, code: "session.no_refresh" } if refresh_token.empty?
          ref = SupabaseClient.refresh_session(refresh_token)
          unless ref[:ok]
            return { ok: false, code: "session.refresh_failed", error: ref[:error] }
          end
          access_token = ref[:access_token]
          save_tokens(ref, uid)
        end

        build_session(access_token, uid)
      rescue => e
        puts "[SignEng::Auth] validate_session exception: #{e.message}"
        { ok: false, code: "session.exception", error: e.message }
      end

      # ─────────────────────────────────────────────────────────────────────
      # assert_valid!(force_recheck) — gate rápido pros botões Gerar.
      # Sistema é somente online: qualquer falha de rede/servidor BLOQUEIA
      # na hora, sem grace period e sem fallback local.
      # ─────────────────────────────────────────────────────────────────────
      def self.assert_valid!(force_recheck = false)
        access_token  = Sketchup.read_default(DEFAULT_NS, "sb_access_token",  "").to_s
        refresh_token = Sketchup.read_default(DEFAULT_NS, "sb_refresh_token", "").to_s
        uid           = Sketchup.read_default(DEFAULT_NS, "sb_local_id",      "").to_s
        expires_at    = Sketchup.read_default(DEFAULT_NS, "sb_expires_at",    "0").to_i

        if access_token.empty? || uid.empty?
          return { ok: false, code: "session.none", error: "Sessão não encontrada. Faça login.", blocked: true }
        end

        if Time.now.to_i >= expires_at - 60
          return { ok: false, code: "session.no_refresh", error: "Sessão expirou. Faça login.", blocked: true } if refresh_token.empty?
          ref = SupabaseClient.refresh_session(refresh_token)
          unless ref[:ok]
            return { ok: false, code: "session.refresh_failed",
                      error: "Não foi possível renovar sua sessão. Conecte-se à internet e faça login novamente.",
                      blocked: true }
          end
          access_token = ref[:access_token]
          save_tokens(ref, uid)
        end

        # Pré-checagem local (grátis, lê do disco): pega trial/plano vencido
        # sem round-trip. Não substitui a checagem online — só adianta o
        # bloqueio óbvio; se disser "ok", ainda assim confirma no servidor.
        lcc = local_clock_check
        unless lcc[:ok]
          persist_block_msg(lcc[:error])
          destroy_session
          return lcc.merge(blocked: true)
        end

        ml_res = check_machine_license(access_token)
        unless ml_res[:ok]
          if ml_res[:code].to_s.start_with?("license.")
            persist_block_msg(ml_res[:error])
            destroy_session
          end
          return ml_res.merge(blocked: true)
        end

        { ok: true, code: "assert.fresh" }
      rescue => e
        puts "[SignEng::Auth] assert_valid exception: #{e.message}"
        { ok: false, code: "assert.exception",
          error: "Não foi possível confirmar sua licença. Conecte-se à internet. (#{e.message})",
          blocked: true }
      end

      # Compara o relógio local com as datas de licença cacheadas no último
      # check_machine_license bem-sucedido. Custo zero (lê Sketchup defaults).
      # Não é a fronteira de segurança (o assert_valid! sempre reconfirma
      # online logo em seguida) — só evita um round-trip óbvio.
      def self.local_clock_check
        role = Sketchup.read_default(DEFAULT_NS, "cached_role", "").to_s
        return { ok: true } if role == "admin" || role == "master"

        plan          = Sketchup.read_default(DEFAULT_NS, "cached_plan",          "").to_s
        plan_end_str  = Sketchup.read_default(DEFAULT_NS, "cached_plan_ends_at",  "").to_s
        trial_end_str = Sketchup.read_default(DEFAULT_NS, "cached_trial_ends_at", "").to_s
        now = Time.now

        if (plan == "pro" || plan == "enterprise") && !plan_end_str.empty?
          begin
            if Time.parse(plan_end_str) > now
              return { ok: true, code: "local.paid_active" }
            else
              return {
                ok:    false,
                code:  "license.plan_expired",
                error: "Seu plano expirou. Renove em signeng.com.br/painel pra continuar."
              }
            end
          rescue => e
            puts "[SignEng::Auth] local_clock_check: plan_ends_at inválido (#{e.message}) — segue pro check online"
          end
        end

        if !trial_end_str.empty?
          begin
            if Time.parse(trial_end_str) > now
              return { ok: true, code: "local.trial_active" }
            else
              return {
                ok:    false,
                code:  "license.trial_expired",
                error: "Seu período de teste terminou. Assine um plano em signeng.com.br pra continuar."
              }
            end
          rescue => e
            puts "[SignEng::Auth] local_clock_check: trial_ends_at inválido (#{e.message}) — segue pro check online"
          end
        end

        { ok: true, code: "local.no_cache" }
      end

      # ─────────────────────────────────────────────────────────────────────
      # destroy_session — logout
      # ─────────────────────────────────────────────────────────────────────
      def self.destroy_session
        token = Sketchup.read_default(DEFAULT_NS, "sb_access_token", "").to_s
        SupabaseClient.sign_out(token) unless token.empty?
        %w[sb_access_token sb_refresh_token sb_local_id sb_expires_at
           last_validated_at cached_role cached_plan cached_plan_ends_at
           cached_trial_ends_at].each do |k|
          Sketchup.write_default(DEFAULT_NS, k, "")
        end
        # NÃO limpa session_email/last_email pra pré-preencher na próxima
      end

      # ─────────────────────────────────────────────────────────────────────
      # recover_password — manda email de reset via Supabase Auth
      # ─────────────────────────────────────────────────────────────────────
      def self.recover_password(email)
        email = email.to_s.strip.downcase
        return { ok: false, code: "auth.empty_email" } if email.empty?
        res = SupabaseClient.recover_password(email)
        res[:ok] ? { ok: true } : { ok: false, code: map_supabase_error(res[:error]), error: res[:error] }
      end

      # ─────────────────────────────────────────────────────────────────────
      # Lista de módulos disponíveis baseada na role/moduleAccess. Sem
      # restrição específica, libera tudo (comportamento original).
      # ─────────────────────────────────────────────────────────────────────
      def self.modules_for(user)
        return all_modules if user[:role] == "admin" || user[:role] == "master"
        mods = user[:modules]
        return mods if mods.is_a?(Array) && mods.any?
        all_modules
      end

      def self.all_modules
        %w[auto_acm auto_acm_curvo auto_sigame textura_sync logo3d planifica
           corte_encaixe alinhar luminoso letra3d desenho_geometrico movel_parametrico]
      end

      # ─────────────────────────────────────────────────────────────────────
      # Block message — persiste a razão do último bloqueio pro JS ler
      # ao montar a tela de login.
      # ─────────────────────────────────────────────────────────────────────
      def self.persist_block_msg(msg)
        Sketchup.write_default(DEFAULT_NS, "auth_block_msg", msg.to_s) if msg
      rescue => e
        puts "[SignEng::Auth] persist_block_msg erro: #{e.message}"
      end

      def self.read_and_clear_block_msg
        msg = Sketchup.read_default(DEFAULT_NS, "auth_block_msg", "").to_s
        Sketchup.write_default(DEFAULT_NS, "auth_block_msg", "") unless msg.empty?
        msg
      end

      # ═══════════════════════════════════════════════════════════════════
      # INTERNOS
      # ═══════════════════════════════════════════════════════════════════

      # Monta { ok, user, license } a partir de um access_token + uid válidos:
      # perfil (public.users) → licença (public.licenses) → machine gate (RPC).
      def self.build_session(access_token, uid)
        profile_res = fetch_profile(uid, access_token)
        return profile_res unless profile_res[:ok]

        license_res = fetch_license(profile_res[:user][:db_id], access_token)
        unless license_res[:ok]
          persist_block_msg(license_res[:error])
          destroy_session
          return license_res
        end

        ml_res = check_machine_license(access_token)
        unless ml_res[:ok]
          if ml_res[:code].to_s.start_with?("license.")
            persist_block_msg(ml_res[:error])
            destroy_session
          end
          return ml_res
        end

        { ok: true, user: profile_res[:user], license: license_res[:license] }
      end

      def self.fetch_profile(uid, access_token)
        r = SupabaseClient.select_one("users", { external_id: "eq.#{uid}" }, access_token)
        return { ok: false, code: "profile.not_found", error: "Perfil não encontrado." } unless r[:ok]

        d = r[:row] || {}
        user = {
          db_id:      d["id"],
          local_id:   uid,
          email:      d["email"],
          nome:       d["name"],
          role:       d["role"] || "user",
          status:     d["status"] || "active",
          created_at: d["created_at"],
          modules:    d["modules"]
        }
        user[:modules] = modules_for(user)
        { ok: true, user: user }
      end

      def self.fetch_license(user_db_id, access_token)
        r = SupabaseClient.select_one("licenses", { user_id: "eq.#{user_db_id}" }, access_token)
        return { ok: false, code: "license.missing",
                  error: "Licença não encontrada. Entre em contato com o suporte em signeng.com.br." } unless r[:ok]

        d = r[:row] || {}
        now = Time.now
        expires_at = d["expires_at"]
        days_left = nil
        if expires_at
          begin
            days_left = [((Time.parse(expires_at.to_s) - now) / 86400).ceil, 0].max
          rescue
          end
        end

        { ok: true, license: {
          plan:         d["plan"],
          status:       d["status"],
          paid:         d["paid"] == true,
          expires_at:   expires_at,
          renews_on:    expires_at,
          days_left:    days_left || 99999,
          max_machines: d["max_machines"]
        } }
      end

      # Chama a RPC verify_machine_license (server-side, security definer).
      # Em sucesso, cacheia role/plan/trial pra local_clock_check usar depois.
      def self.check_machine_license(access_token)
        machine_hash = self.machine_hash
        machine_name = ENV["COMPUTERNAME"] || `hostname`.to_s.strip
        os = RUBY_PLATFORM.to_s

        r = SupabaseClient.rpc("verify_machine_license", {
          p_machine_hash: machine_hash,
          p_machine_name: machine_name,
          p_os:           os,
          p_plugin_ver:   Core::VERSION
        }, access_token)

        unless r[:ok]
          return { ok: false, code: "machine.fn_unavailable",
                    error: "Não foi possível confirmar sua licença. Conecte-se à internet. (#{r[:error]})" }
        end

        result = r[:result] || {}

        if result["ok"] == true
          Sketchup.write_default(DEFAULT_NS, "last_validated_at", Time.now.to_i.to_s)
          puts "[SignEng::Auth] machine OK (#{result['machines']})"
          return { ok: true, code: "machine.ok" }
        end

        code = result["code"].to_s
        machines = result["machines"] || []
        machine_lines = machines.map { |m|
          name = m["machineName"].to_s.empty? ? m["machineHash"].to_s[0, 8] : m["machineName"]
          last_seen = "?"
          if m["lastSeenAt"]
            begin
              last_seen = Time.parse(m["lastSeenAt"].to_s).strftime("%d/%m/%Y")
            rescue
            end
          end
          "  • #{name} (#{m['os']}, último uso: #{last_seen})"
        }.join("\n")

        case code
        when "machine_limit"
          msg = "Limite de máquinas do seu plano atingido (#{result['maxMachines']}).\n\n" +
                "Máquinas ativas:\n#{machine_lines}\n\n" +
                "Pra usar este PC, acesse signeng.com.br/painel e desative uma das máquinas."
          { ok: false, code: "license.machine_limit", error: msg, machines: machines, max_machines: result["maxMachines"] }
        when "plan_expired"
          { ok: false, code: "license.plan_expired",
            error: "Seu plano expirou. Renove em signeng.com.br/painel pra continuar." }
        when "machine_disabled"
          { ok: false, code: "license.machine_disabled",
            error: "Este PC foi bloqueado pelo administrador. Entre em contato com o suporte em signeng.com.br." }
        else
          { ok: false, code: "machine.unknown", error: result["message"] || "Verificação de licença falhou." }
        end
      rescue => e
        puts "[SignEng::Auth] check_machine_license exception: #{e.message}"
        { ok: false, code: "machine.exception",
          error: "Não foi possível confirmar sua licença. Conecte-se à internet. (#{e.message})" }
      end

      # ═══════════════════════════════════════════════════════════════════
      # MACHINE HASH — identifica unicamente o PC
      # ═══════════════════════════════════════════════════════════════════
      def self.machine_hash
        hostname = ENV["COMPUTERNAME"] || `hostname`.to_s.strip
        user     = ENV["USERNAME"]     || ENV["USER"] || "user"
        os       = RUBY_PLATFORM.to_s
        vol = ""
        begin
          if RUBY_PLATFORM.downcase.include?("mingw") || RUBY_PLATFORM.downcase.include?("mswin")
            out = `vol C:`.to_s
            if out =~ /Serial Number is ([A-F0-9-]+)/i
              vol = $1
            end
          end
        rescue; end
        seed = "#{hostname}|#{user}|#{os}|#{vol}|signeng"
        Digest::SHA256.hexdigest(seed)[0, 32]
      end

      def self.save_tokens(res, uid = nil)
        now = Time.now.to_i
        Sketchup.write_default(DEFAULT_NS, "sb_access_token",  res[:access_token].to_s)
        Sketchup.write_default(DEFAULT_NS, "sb_refresh_token", res[:refresh_token].to_s)
        Sketchup.write_default(DEFAULT_NS, "sb_expires_at",    (now + res[:expires_in].to_i).to_s)
        Sketchup.write_default(DEFAULT_NS, "sb_local_id", uid.to_s) if uid && !uid.to_s.empty?
      end

      # Mapeia mensagens de erro do Supabase Auth (GoTrue) pros códigos de
      # i18n já existentes na UI (mesmos usados antes com o Firebase).
      def self.map_supabase_error(msg)
        m = msg.to_s.downcase
        return "auth.invalid_credentials" if m.include?("invalid login") || m.include?("invalid_credentials") || m.include?("invalid grant")
        return "auth.user_disabled"       if m.include?("email not confirmed") || m.include?("banned") || m.include?("disabled")
        return "auth.too_many_attempts"   if m.include?("rate limit") || m.include?("too many")
        return "auth.invalid_email"       if m.include?("invalid email") || m.include?("unable to validate email")
        return "auth.empty_email"         if m.empty?
        "auth.unknown_error"
      end
    end
  end
end
