# encoding: UTF-8
require 'net/http'
require 'uri'
require 'json'
require 'openssl'

module SignEng
  module Core
    module SupabaseClient
      SUPABASE_URL = "https://mxtpmkverfvyucagckey.supabase.co".freeze
      PUBLISHABLE_KEY = "sb_publishable_sMEKnb9H_XQhesG1AJK3Yg_mry0JdrM".freeze
      TIMEOUT_SEC = 30

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

      def self.post_json(path, body, &block)
        request(path, nil, method: :post, body: body, &block)
      end

      def self.request(path, bearer = nil, method: :get, body: nil)
        url = URI("#{SUPABASE_URL}#{path}")
        http = Net::HTTP.new(url.host, url.port)
        http.use_ssl = true
        http.open_timeout = TIMEOUT_SEC
        http.read_timeout = TIMEOUT_SEC
        req = method == :post ? Net::HTTP::Post.new(url) : Net::HTTP::Get.new(url)
        req["apikey"] = PUBLISHABLE_KEY
        req["Authorization"] = bearer || "Bearer #{PUBLISHABLE_KEY}"
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(body) if body
        res = http.request(req)
        data = res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue {})
        return yield(data).merge(status: res.code.to_i) if res.is_a?(Net::HTTPSuccess)
        message = data["msg"] || data["message"] || data["error_description"] || data["error"] || "Supabase HTTP #{res.code}"
        { ok: false, code: "supabase.error", error: message.to_s, status: res.code.to_i }
      rescue => e
        { ok: false, code: "network.error", error: e.message }
      end
    end
  end
end
