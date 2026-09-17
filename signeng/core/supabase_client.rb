# encoding: UTF-8
require 'net/http'
require 'uri'
require 'json'
require 'openssl'

# ═══════════════════════════════════════════════════════════════════════════
# SignEng::Core::SupabaseClient
# ═══════════════════════════════════════════════════════════════════════════
# Único cliente de backend do SignEng (substitui o antigo FirebaseClient).
# Cobre:
#   - Auth REST      (/auth/v1/*)       → login, refresh, logout, recuperação
#   - PostgREST       (/rest/v1/*)       → leitura de perfil/licença
#   - RPC             (/rest/v1/rpc/*)   → verify_machine_license (server-side)
#   - Edge Functions   (/functions/v1/*)  → cálculos dos módulos (autoAcmCompute
#                                           etc. — infraestrutura pronta; as
#                                           funções em si ainda não existem no
#                                           projeto Supabase)
#
# PUBLISHABLE_KEY não é secreta: quem protege os dados são as regras de RLS
# no Postgres + o Supabase Auth. Nunca colocar service_role aqui.
# ═══════════════════════════════════════════════════════════════════════════

module SignEng
  module Core
    module SupabaseClient
      SUPABASE_URL = "https://mxtpmkverfvyucagckey.supabase.co".freeze
      PUBLISHABLE_KEY = "sb_publishable_sMEKnb9H_XQhesG1AJK3Yg_mry0JdrM".freeze
      TIMEOUT_SEC = 30

      # ═══════════════════════════════════════════════════════════════════
      # AUTH — Supabase Auth REST
      # ═══════════════════════════════════════════════════════════════════

      def self.sign_in(email, password)
        post_json("/auth/v1/token?grant_type=password", {
          email: email.to_s.strip.downcase,
          password: password.to_s
        }) do |data|
          {
            ok: true,
            access_token: data["access_token"],
            refresh_token: data["refresh_token"],
            user: data["user"] || {},
            expires_in: data["expires_in"].to_i
          }
        end
      end

      def self.refresh_session(refresh_token)
        post_json("/auth/v1/token?grant_type=refresh_token", { refresh_token: refresh_token.to_s }) do |data|
          {
            ok: true,
            access_token: data["access_token"],
            refresh_token: data["refresh_token"] || refresh_token,
            user: data["user"] || {},
            expires_in: data["expires_in"].to_i
          }
        end
      end

      def self.user(access_token)
        request("/auth/v1/user", "Bearer #{access_token}") do |data|
          { ok: true, user: data }
        end
      end

      def self.sign_out(access_token)
        request("/auth/v1/logout", "Bearer #{access_token}", method: :post) { { ok: true } }
      end

      # POST /auth/v1/recover — dispara o email de reset de senha do Supabase.
      def self.recover_password(email)
        post_json("/auth/v1/recover", { email: email.to_s.strip.downcase }) { { ok: true } }
      end

      # ═══════════════════════════════════════════════════════════════════
      # POSTGREST — leitura de tabelas (RLS restringe a linha do próprio user)
      # ═══════════════════════════════════════════════════════════════════

      # select(table, filters: {coluna: valor}, access_token) → { ok: true, rows: [...] }
      # Ex.: select("users", { external_id: "eq.#{uid}" }, token)
      def self.select(table, filters, access_token)
        query = filters.map { |k, v| "#{k}=#{URI.encode_www_form_component(v.to_s)}" }.join("&")
        url = URI("#{SUPABASE_URL}/rest/v1/#{table}?#{query}")
        req = Net::HTTP::Get.new(url)
        apply_headers(req, access_token)
        res = http_request(url, req)
        return res unless res[:ok]
        { ok: true, rows: res[:data] || [] }
      end

      def self.select_one(table, filters, access_token)
        r = select(table, filters, access_token)
        return r unless r[:ok]
        row = r[:rows].first
        row ? { ok: true, row: row } : { ok: false, code: "#{table}.not_found", error: "Registro não encontrado." }
      end

      # ═══════════════════════════════════════════════════════════════════
      # RPC — funções Postgres (security definer) via PostgREST
      # ═══════════════════════════════════════════════════════════════════

      # rpc("verify_machine_license", { p_machine_hash: "...", ... }, token)
      def self.rpc(name, args, access_token)
        url = URI("#{SUPABASE_URL}/rest/v1/rpc/#{name}")
        req = Net::HTTP::Post.new(url)
        apply_headers(req, access_token)
        req.body = JSON.generate(args || {})
        res = http_request(url, req)
        return res unless res[:ok]
        { ok: true, result: res[:data] }
      end

      # ═══════════════════════════════════════════════════════════════════
      # EDGE FUNCTIONS — cálculos dos módulos (autoAcmCompute, etc.)
      # ═══════════════════════════════════════════════════════════════════
      # Mesmo contrato usado antes com o Firebase callable: envia { data },
      # espera { result } de volta. Enquanto a função não existir no projeto
      # Supabase, o Supabase responde 404 e isso vira { ok:false, code:
      # "function.not_found" } — erro explícito, não um stub silencioso.
      def self.call_function(name, data, access_token, timeout = TIMEOUT_SEC)
        url = URI("#{SUPABASE_URL}/functions/v1/#{name}")
        req = Net::HTTP::Post.new(url)
        apply_headers(req, access_token)
        req.body = JSON.generate({ data: data || {} })
        res = http_request(url, req, timeout)

        if res[:ok]
          payload = res[:data] || {}
          return { ok: true, result: payload["result"] }
        end

        if res[:status] == 404
          return { ok: false, code: "function.not_found",
                    error: "A função '#{name}' ainda não foi implantada no Supabase." }
        end

        { ok: false, code: res[:code] || "fn.error", error: res[:error] || "Function failed", status: res[:status] }
      end

      # ═══════════════════════════════════════════════════════════════════
      # HELPERS
      # ═══════════════════════════════════════════════════════════════════

      def self.apply_headers(req, bearer = nil)
        req["apikey"] = PUBLISHABLE_KEY
        req["Authorization"] = bearer ? "Bearer #{bearer}" : "Bearer #{PUBLISHABLE_KEY}"
        req["Content-Type"] = "application/json"
      end

      def self.post_json(path, body, &block)
        request(path, nil, method: :post, body: body, &block)
      end

      def self.request(path, bearer = nil, method: :get, body: nil)
        url = URI("#{SUPABASE_URL}#{path}")
        req = method == :post ? Net::HTTP::Post.new(url) : Net::HTTP::Get.new(url)
        apply_headers(req, bearer && bearer.start_with?("Bearer ") ? bearer.sub("Bearer ", "") : bearer)
        req.body = JSON.generate(body) if body
        res = http_request(url, req)
        return yield(res[:data] || {}).merge(status: res[:status]) if res[:ok]
        res
      end

      def self.http_request(url, req, timeout = TIMEOUT_SEC)
        http = Net::HTTP.new(url.host, url.port)
        http.use_ssl = true
        http.open_timeout = TIMEOUT_SEC
        http.read_timeout = timeout
        res = http.request(req)
        data = res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue {})

        if res.is_a?(Net::HTTPSuccess)
          return { ok: true, data: data, status: res.code.to_i }
        end

        message = data.is_a?(Hash) ? (data["msg"] || data["message"] || data["error_description"] || data["error"]) : nil
        { ok: false, code: "supabase.error", error: (message || "Supabase HTTP #{res.code}").to_s, status: res.code.to_i }
      rescue => e
        { ok: false, code: "network.error", error: e.message }
      end
    end
  end
end
