# encoding: UTF-8
require 'digest'
require 'time'

# ═══════════════════════════════════════════════════════════════════════════
# ACMFacil::Core::Auth
# ═══════════════════════════════════════════════════════════════════════════
# Autenticação via Firebase Auth REST + sessão persistente via idToken.
#
# Fluxo:
#   1. login(email, pwd)
#        → FirebaseClient.sign_in → id_token + refresh_token
#        → lê perfil em /users/{uid}
#        → lê/cria licença vinculada
#        → registra ativação da máquina (verifyMachineLicense)
#        → salva tokens em Sketchup.write_default
#
#   2. validate_session (no boot do plugin)
#        → lê tokens salvos
#        → se id_token ainda válido, usa direto
#        → se expirou, tenta refresh
#        → re-busca perfil + licença
#        → re-roda verifyMachineLicense (gate forte)
#
#   3. assert_valid!(force=false)
#        → gate rápido pros botões Gerar.
#        → cache de 1h (re-chama Cloud Function só se last_validated > 1h).
#        → fail-CLOSED com grace de 24h offline.
#
#   4. destroy_session → limpa tokens, mantém last_email pra UX
#
# Fallback: se Firebase estiver OFFLINE e o email for o master hardcoded,
# permite login local. Garante que eu nunca fique trancado fora do plugin.
# ═══════════════════════════════════════════════════════════════════════════

module ACMFacil
  module Core
    module Auth
      DEFAULT_NS = "SignEng".freeze
      OFFLINE_MODE = true.freeze

      # ── Grace period offline (segundos) ──
      # Erros de rede / Cloud Function indisponível só liberam acesso se
      # a última validação bem-sucedida foi nesse intervalo. Depois disso,
      # bloqueia até voltar a internet.
      GRACE_OFFLINE_SEC = 24 * 3600

      # NOTA: o cache do assert_valid! foi removido na v1.5.8 — cada clique
      # em Gerar agora faz 1 chamada à verifyMachineLicense pra garantir que
      # bloqueios admin (machine_disabled) sejam detectados imediatamente.
      # O custo é desprezível (Gerar é raro, ~10x por sessão), e o trade-off
      # de garantia >> economia. last_validated_at continua sendo salvo
      # pra o grace offline de 24h.

      # ── Fallback offline (emergência) ──
      MASTER_EMAIL    = "marcelo.para.oficial@gmail.com".freeze
      MASTER_NAME     = "Marcelo Para Oficial".freeze
      SALT            = "acmfacil_salt_v1_2026".freeze
      MASTER_FALLBACK = Digest::SHA256.hexdigest("Master@332025" + SALT).freeze

      # ─────────────────────────────────────────────────────────────────────
      # login(email, pwd) → { ok, user, license } OR { ok: false, code }
      # ─────────────────────────────────────────────────────────────────────
      def self.login(email, pwd)
        return offline_user_session if OFFLINE_MODE

        email = email.to_s.strip.downcase
        pwd   = pwd.to_s

        return { ok: false, code: "auth.empty_email" }    if email.empty?
        return { ok: false, code: "auth.empty_password" } if pwd.empty?

        res = FirebaseClient.sign_in(email, pwd)

        if !res[:ok]
          # Firebase offline? Fallback pro master
          if res[:code] == "network.error" && email == MASTER_EMAIL &&
             Digest::SHA256.hexdigest(pwd + SALT) == MASTER_FALLBACK
            puts "[ACMFacil::Auth] Firebase offline — fallback local pro master"
            return {
              ok: true,
              user: build_master_fallback_user,
              license: build_master_license,
              offline: true
            }
          end
          return { ok: false, code: res[:code], error: res[:error] }
        end

        save_tokens(res)

        profile_res = fetch_profile(res[:local_id], res[:id_token])
        return profile_res unless profile_res[:ok]

        license_res = fetch_or_create_license(profile_res[:user], res[:id_token])
        unless license_res[:ok]
          persist_block_msg(license_res[:error])
          destroy_session
          return license_res
        end

        # MACHINE LICENSE CHECK (autoritativo)
        ml_res = check_machine_license(profile_res[:user], res[:id_token])
        unless ml_res[:ok]
          persist_block_msg(ml_res[:error])
          destroy_session
          return ml_res
        end

        {
          ok:      true,
          user:    profile_res[:user],
          license: license_res[:license]
        }
      rescue => e
        puts "[ACMFacil::Auth] login exception: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        { ok: false, code: "auth.exception", error: e.message }
      end

      # ─────────────────────────────────────────────────────────────────────
      # validate_session — chamado no boot do plugin (auto-login)
      # ─────────────────────────────────────────────────────────────────────
      def self.validate_session
        return offline_user_session if OFFLINE_MODE

        id_token      = Sketchup.read_default(DEFAULT_NS, "fb_id_token",      "").to_s
        refresh_token = Sketchup.read_default(DEFAULT_NS, "fb_refresh_token", "").to_s
        local_id      = Sketchup.read_default(DEFAULT_NS, "fb_local_id",      "").to_s
        expires_at    = Sketchup.read_default(DEFAULT_NS, "fb_expires_at",    "0").to_i

        return { ok: false, code: "session.none" } if id_token.empty? || local_id.empty?

        if Time.now.to_i >= expires_at - 60
          return { ok: false, code: "session.no_refresh" } if refresh_token.empty?
          ref = FirebaseClient.refresh_id_token(refresh_token)
          if !ref[:ok]
            return { ok: false, code: "session.refresh_failed", error: ref[:error] }
          end
          id_token      = ref[:id_token]
          refresh_token = ref[:refresh_token]
          save_tokens_from_refresh(id_token, refresh_token, local_id, ref[:expires_in])
        end

        profile_res = fetch_profile(local_id, id_token)
        return profile_res unless profile_res[:ok]

        license_res = fetch_or_create_license(profile_res[:user], id_token)
        unless license_res[:ok]
          persist_block_msg(license_res[:error])
          destroy_session
          return license_res
        end

        ml_res = check_machine_license(profile_res[:user], id_token)
        unless ml_res[:ok]
          persist_block_msg(ml_res[:error])
          destroy_session
          return ml_res
        end

        {
          ok:      true,
          user:    profile_res[:user],
          license: license_res[:license]
        }
      rescue => e
        puts "[ACMFacil::Auth] validate_session exception: #{e.message}"
        { ok: false, code: "session.exception", error: e.message }
      end

      # ─────────────────────────────────────────────────────────────────────
      # assert_valid!(force_recheck) — gate rápido pros botões Gerar
      # ─────────────────────────────────────────────────────────────────────
      # Retorna { ok: true } se licença/máquina OK,
      # senão { ok: false, code, error, blocked: true } pra o JS tratar.
      #
      # Estratégia:
      #   - Lê tokens salvos. Se não existem → ok:false (não logado).
      #   - Se id_token expirou e tem refresh → refresha.
      #   - Cache: se last_validated_at < ASSERT_CACHE_SEC, retorna ok:true
      #     sem chamar a Cloud Function (evita hammer).
      #   - Force=true ignora cache (heartbeat / revalidate).
      #   - Chama verifyMachineLicense. Em sucesso → atualiza last_validated_at.
      #   - Em erro de rede / exception: fail-CLOSED com grace de GRACE_OFFLINE_SEC.
      # ─────────────────────────────────────────────────────────────────────
      def self.assert_valid!(force_recheck = false)
        return { ok: true, code: "offline.mode" } if OFFLINE_MODE

        id_token   = Sketchup.read_default(DEFAULT_NS, "fb_id_token",   "").to_s
        local_id   = Sketchup.read_default(DEFAULT_NS, "fb_local_id",   "").to_s
        expires_at = Sketchup.read_default(DEFAULT_NS, "fb_expires_at", "0").to_i
        refresh_tk = Sketchup.read_default(DEFAULT_NS, "fb_refresh_token", "").to_s

        if id_token.empty? || local_id.empty?
          return { ok: false, code: "session.none", error: "Sessão não encontrada. Faça login.", blocked: true }
        end

        # Refresh token se necessário (não conta como validação, só renova auth)
        if Time.now.to_i >= expires_at - 60
          return { ok: false, code: "session.no_refresh", error: "Sessão expirou. Faça login.", blocked: true } if refresh_tk.empty?
          ref = FirebaseClient.refresh_id_token(refresh_tk)
          if !ref[:ok]
            return offline_grace_or_block("session.refresh_failed", "Não foi possível renovar sua sessão.")
          end
          id_token = ref[:id_token]
          save_tokens_from_refresh(id_token, ref[:refresh_token], local_id, ref[:expires_in])
        end

        # Local clock check primeiro (free, lê de disco). Pega trial
        # vencido sem nenhuma chamada de rede.
        lcc = local_clock_check
        unless lcc[:ok]
          persist_block_msg(lcc[:error])
          destroy_session
          return lcc.merge(blocked: true)
        end

        # Re-chama Cloud Function pra confirmar licença/máquina
        profile_res = fetch_profile(local_id, id_token)
        unless profile_res[:ok]
          return offline_grace_or_block(profile_res[:code], profile_res[:error])
        end

        license_res = fetch_or_create_license(profile_res[:user], id_token)
        unless license_res[:ok]
          persist_block_msg(license_res[:error])
          destroy_session
          return license_res.merge(blocked: true)
        end

        ml_res = check_machine_license(profile_res[:user], id_token)
        unless ml_res[:ok]
          # check_machine_license já cuidou de grace internamente
          if ml_res[:code].to_s.start_with?("license.")
            persist_block_msg(ml_res[:error])
            destroy_session
          end
          return ml_res.merge(blocked: true)
        end

        { ok: true, code: "assert.fresh" }
      rescue => e
        puts "[ACMFacil::Auth] assert_valid exception: #{e.message}"
        offline_grace_or_block("assert.exception", e.message)
      end

      # Compara o relógio local com as datas de licença cacheadas no último
      # check_machine_license bem-sucedido. Custo zero (lê Sketchup defaults).
      # Permite que o Gerar bloqueie trial vencido sem chamar Firebase.
      # Sem cache (primeira execução / pós-logout) → libera, deixa o flow
      # principal decidir via Firebase.
      def self.local_clock_check
        role  = Sketchup.read_default(DEFAULT_NS, "cached_role", "").to_s
        return { ok: true } if role == "admin" || role == "master"

        plan          = Sketchup.read_default(DEFAULT_NS, "cached_plan",          "").to_s
        plan_end_str  = Sketchup.read_default(DEFAULT_NS, "cached_plan_ends_at",  "").to_s
        trial_end_str = Sketchup.read_default(DEFAULT_NS, "cached_trial_ends_at", "").to_s
        now = Time.now

        # Plano pago vigente tem prioridade.
        if (plan == "pro" || plan == "enterprise") && !plan_end_str.empty?
          begin
            if Time.parse(plan_end_str) > now
              return { ok: true, code: "local.paid_active" }
            else
              return {
                ok:    false,
                code:  "license.plan_expired",
                error: "Seu plano expirou. Renove em acmfacil.com.br/painel pra continuar."
              }
            end
          rescue
          end
        end

        # Trial.
        if !trial_end_str.empty?
          begin
            if Time.parse(trial_end_str) > now
              return { ok: true, code: "local.trial_active" }
            else
              return {
                ok:    false,
                code:  "license.trial_expired",
                error: "Seu período de teste terminou. Assine um plano em acmfacil.com.br pra continuar."
              }
            end
          rescue
          end
        end

        # Sem cache → não bloqueia aqui; fluxo principal decide.
        { ok: true, code: "local.no_cache" }
      end

      # Decide se um erro de rede/transiente é tolerável pelo grace offline
      # ou se deve bloquear. Não persiste block_msg (é transitório).
      def self.offline_grace_or_block(code, error)
        last_ok = Sketchup.read_default(DEFAULT_NS, "last_validated_at", "0").to_i
        if last_ok > 0 && (Time.now.to_i - last_ok) < GRACE_OFFLINE_SEC
          puts "[ACMFacil::Auth] grace offline (último OK há #{((Time.now.to_i - last_ok)/3600.0).round(1)}h): #{code}"
          return { ok: true, code: "assert.grace_offline" }
        end
        msg = "Não foi possível confirmar sua licença. Conecte-se à internet."
        msg += " (#{error})" if error && !error.to_s.empty?
        { ok: false, code: code || "assert.offline_no_grace", error: msg, blocked: true }
      end

      # ─────────────────────────────────────────────────────────────────────
      # destroy_session — logout
      # ─────────────────────────────────────────────────────────────────────
      def self.destroy_session
        %w[fb_id_token fb_refresh_token fb_local_id fb_expires_at
           last_validated_at cached_role cached_plan cached_plan_ends_at
           cached_trial_ends_at].each do |k|
          Sketchup.write_default(DEFAULT_NS, k, "")
        end
        # NÃO limpa session_email/last_email pra pré-preencher na próxima
      end

      def self.offline_user_session
        {
          ok: true,
          user: {
            local_id: "offline-local-user",
            email: "offline@local",
            nome: "Local",
            role: "admin",
            status: "active",
            modules: all_modules
          },
          license: {
            plan: "admin",
            status: "active",
            paid: true,
            expires_at: nil,
            days_left: 99999,
            max_machines: 999
          }
        }
      end

      # ─────────────────────────────────────────────────────────────────────
      # Block message — persiste a razão do último bloqueio pro JS ler
      # ao montar a tela de login (e o user entender por que foi deslogado).
      # ─────────────────────────────────────────────────────────────────────
      def self.persist_block_msg(msg)
        Sketchup.write_default(DEFAULT_NS, "auth_block_msg", msg.to_s) if msg
      rescue => e
        puts "[ACMFacil::Auth] persist_block_msg erro: #{e.message}"
      end

      def self.read_and_clear_block_msg
        msg = Sketchup.read_default(DEFAULT_NS, "auth_block_msg", "").to_s
        Sketchup.write_default(DEFAULT_NS, "auth_block_msg", "") unless msg.empty?
        msg
      end

      # ─────────────────────────────────────────────────────────────────────
      # recover_password — manda email de reset via Firebase
      # ─────────────────────────────────────────────────────────────────────
      def self.recover_password(email)
        email = email.to_s.strip.downcase
        return { ok: false, code: "auth.empty_email" } if email.empty?
        res = FirebaseClient.send_password_reset(email)
        res[:ok] ? { ok: true } : { ok: false, code: res[:code], error: res[:error] }
      end

      # ─────────────────────────────────────────────────────────────────────
      # Lista de módulos disponíveis baseada na role/licença/moduleAccess
      # ─────────────────────────────────────────────────────────────────────
      def self.modules_for(user)
        return all_modules if user[:role] == "admin" || user[:role] == "master"

        access = user[:module_access]
        if access.is_a?(Hash) && !access.empty?
          now = Time.now
          manual_ids = []
          access.each do |mod_id, info|
            next unless info.is_a?(Hash)
            next unless info["enabled"] == true
            exp_raw = info["expiresAt"]
            if exp_raw && !exp_raw.to_s.empty?
              begin
                exp = Time.parse(exp_raw.to_s)
                next if exp < now
              rescue
              end
            end
            manual_ids << mod_id.to_s
          end
          return manual_ids if manual_ids.any?
        end

        all_modules
      end

      def self.all_modules
        %w[auto_acm auto_sigame textura_sync logo3d marquise colunas testeira
           caixa_luminosa letras_caixa painel_fatiado sigamme
           letras3d_print marcenaria captura corte_cnc]
      end

      # ═══════════════════════════════════════════════════════════════════
      # INTERNOS
      # ═══════════════════════════════════════════════════════════════════

      def self.save_tokens(res)
        now = Time.now.to_i
        Sketchup.write_default(DEFAULT_NS, "fb_id_token",      res[:id_token])
        Sketchup.write_default(DEFAULT_NS, "fb_refresh_token", res[:refresh_token])
        Sketchup.write_default(DEFAULT_NS, "fb_local_id",      res[:local_id])
        Sketchup.write_default(DEFAULT_NS, "fb_expires_at",    (now + res[:expires_in].to_i).to_s)
        Sketchup.write_default(DEFAULT_NS, "session_email",    res[:email].to_s)
      end

      def self.save_tokens_from_refresh(id_token, refresh_token, local_id, expires_in)
        now = Time.now.to_i
        Sketchup.write_default(DEFAULT_NS, "fb_id_token",      id_token)
        Sketchup.write_default(DEFAULT_NS, "fb_refresh_token", refresh_token)
        Sketchup.write_default(DEFAULT_NS, "fb_local_id",      local_id)
        Sketchup.write_default(DEFAULT_NS, "fb_expires_at",    (now + expires_in.to_i).to_s)
      end

      def self.fetch_profile(local_id, id_token)
        r = FirebaseClient.get_document("users/#{local_id}", id_token)
        if !r[:ok]
          if r[:status] == 404
            return { ok: false, code: "profile.not_found", error: "Perfil não encontrado." }
          end
          return { ok: false, code: r[:code] || "profile.fetch_error", error: r[:error] }
        end
        d = r[:doc] || {}
        user = {
          local_id:      local_id,
          email:         d["email"],
          nome:          d["name"],
          role:          d["role"] || "user",
          status:        d["status"] || "active",
          created_at:    d["createdAt"],
          trial_ends_at: d["trialEndsAt"],
          plan:          d["plan"],
          plan_period:   d["planPeriod"],
          plan_ends_at:  d["planEndsAt"],
          stripe_subscription_id: d["stripeSubscriptionId"],
          stripe_subscription_status: d["stripeSubscriptionStatus"],
          module_access: d["moduleAccess"]
        }
        user[:modules] = modules_for(user)
        { ok: true, user: user }
      end

      # ─────────────────────────────────────────────────────────────────────
      # fetch_or_create_license — devolve license OU ok:false se expirado.
      # Prioridade:
      #   1. Admin → vitalício ilimitado
      #   2. Plano pago vigente → Pro/Enterprise
      #   3. Trial vigente → Trial ativo
      #   4. Trial vencido E sem pago → ok:false code:"license.trial_expired"
      # ─────────────────────────────────────────────────────────────────────
      def self.fetch_or_create_license(user, id_token)
        now = Time.now

        # 1. Admin vitalício
        if user[:role] == "admin" || user[:role] == "master"
          return { ok: true, license: build_master_license }
        end

        # 2. Plano pago ativo
        plan         = user[:plan].to_s
        plan_end_str = user[:plan_ends_at].to_s
        if !plan.empty? && (plan == "pro" || plan == "enterprise") && !plan_end_str.empty?
          begin
            plan_exp = Time.parse(plan_end_str)
            if plan_exp > now
              days_left = ((plan_exp - now) / 86400).ceil
              max_m     = plan == "enterprise" ? 5 : 2
              return {
                ok: true,
                license: {
                  plan:         plan,
                  status:       "active",
                  paid:         true,
                  expires_at:   plan_end_str,
                  days_left:    [days_left, 0].max,
                  renews_on:    plan_end_str,
                  period:       user[:plan_period].to_s,
                  max_machines: max_m
                }
              }
            end
          rescue => e
            puts "[ACMFacil::Auth] parse plan_ends_at erro: #{e.message}"
          end
        end

        # 3. Trial vigente
        trial_end = user[:trial_ends_at]
        if trial_end
          begin
            exp = Time.parse(trial_end.to_s)
            if exp > now
              days_left = ((exp - now) / 86400).ceil
              return {
                ok: true,
                license: {
                  plan:         "trial",
                  status:       "active",
                  paid:         false,
                  expires_at:   trial_end,
                  days_left:    [days_left, 0].max,
                  max_machines: 1
                }
              }
            end
            # 4. Trial venceu → BLOQUEIA
            return {
              ok:    false,
              code:  "license.trial_expired",
              error: "Seu período de teste terminou. Assine um plano em acmfacil.com.br pra continuar.",
              license: {
                plan: "expired", status: "expired", paid: false,
                expires_at: trial_end, days_left: 0
              }
            }
          rescue
            # Não conseguiu parsear trial_end — trata como bloqueado (paranoia)
            return {
              ok:    false,
              code:  "license.trial_invalid",
              error: "Não foi possível ler a data do seu trial. Entre em contato com o suporte."
            }
          end
        end

        # Sem trial e sem plano → primeiro login, cria trial 15d
        { ok: true, license: build_default_trial }
      end

      # ═══════════════════════════════════════════════════════════════════
      # CHECK MACHINE LICENSE — fail-CLOSED com grace offline de 24h.
      # ═══════════════════════════════════════════════════════════════════
      def self.check_machine_license(user, id_token)
        return { ok: true, code: "machine.admin_bypass" } if user[:role].to_s == "admin" || user[:role].to_s == "master"

        machine_hash = FirebaseClient.machine_hash
        machine_name = ENV["COMPUTERNAME"] || `hostname`.to_s.strip
        os = RUBY_PLATFORM.to_s

        r = FirebaseClient.call_function(
          "verifyMachineLicense",
          {
            machineHash: machine_hash,
            machineName: machine_name,
            os:          os,
            pluginVer:   Core::VERSION
          },
          id_token
        )

        # Erro de transporte (rede / 5xx / função fora) → grace de 24h
        unless r[:ok]
          if r[:code].to_s.start_with?("network") || r[:status].to_i >= 500
            return offline_grace_or_block("machine.fn_unavailable", r[:error])
          end
          # 4xx ou erro lógico do callable → propaga como bloqueio
          return {
            ok:    false,
            code:  "machine.fn_error",
            error: r[:error] || "Verificação de máquina falhou."
          }
        end

        result = r[:result] || {}

        # OK liberado → renova cache de última validação + cacheia dados
        # de licença pra local_clock_check usar entre validações.
        if result["ok"] == true
          Sketchup.write_default(DEFAULT_NS, "last_validated_at", Time.now.to_i.to_s)
          Sketchup.write_default(DEFAULT_NS, "cached_role",          user[:role].to_s)
          Sketchup.write_default(DEFAULT_NS, "cached_plan",          user[:plan].to_s)
          Sketchup.write_default(DEFAULT_NS, "cached_plan_ends_at",  user[:plan_ends_at].to_s)
          Sketchup.write_default(DEFAULT_NS, "cached_trial_ends_at", user[:trial_ends_at].to_s)
          puts "[ACMFacil::Auth] machine OK (#{result['currentCount']}/#{result['maxMachines']})"
          return { ok: true, code: "machine.ok", machines: result["machines"] }
        end

        # Bloqueado pela função → mensagem específica
        code = result["code"].to_s
        machines = result["machines"] || []
        machine_lines = machines.map { |m|
          name = m["machineName"].to_s.empty? ? m["machineHash"].to_s[0,8] : m["machineName"]
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
                "Pra usar este PC, acesse acmfacil.com.br/painel e desative uma das máquinas."
          { ok: false, code: "license.machine_limit", error: msg, machines: machines, max_machines: result["maxMachines"] }
        when "plan_expired"
          { ok: false, code: "license.plan_expired",
            error: "Seu plano expirou. Renove em acmfacil.com.br/painel pra continuar." }
        when "machine_disabled"
          { ok: false, code: "license.machine_disabled",
            error: "Este PC foi bloqueado pelo administrador. Entre em contato com o suporte em acmfacil.com.br." }
        else
          { ok: false, code: "machine.unknown",
            error: result["message"] || "Verificação de licença falhou." }
        end
      rescue => e
        puts "[ACMFacil::Auth] check_machine_license exception: #{e.message}"
        offline_grace_or_block("machine.exception", e.message)
      end

      def self.build_master_fallback_user
        {
          local_id:  "admin-master",
          email:     MASTER_EMAIL,
          nome:      MASTER_NAME,
          role:      "admin",
          status:    "active",
          modules:   all_modules
        }
      end

      def self.build_master_license
        {
          plan:         "admin",
          status:       "active",
          expires_at:   nil,
          days_left:    99999,
          max_machines: 999
        }
      end

      def self.build_default_trial
        {
          plan:         "trial",
          status:       "active",
          expires_at:   (Time.now + 15 * 86400).utc.iso8601,
          days_left:    15,
          max_machines: 1
        }
      end
    end
  end
end
