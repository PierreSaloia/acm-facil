# encoding: UTF-8
# ═══════════════════════════════════════════════════════════════════════════
# SignEng::Core::FirebaseClient
# ═══════════════════════════════════════════════════════════════════════════
# Cliente HTTP+JSON pra Firebase Auth REST + Firestore REST.
#
# NÃO usa o Firebase Admin SDK (que exige service account). Usa só:
#   - Identity Toolkit (API pública com API key)
#   - Firestore REST (autenticado com idToken do usuário logado)
#
# Portanto o plugin opera exatamente com as MESMAS permissões que o user
# teria num navegador — respeita as firestore.rules já deployadas.
#
# Dependências: net/http, uri, json, digest, openssl (todas do stdlib Ruby
# que vem com SketchUp).
# ═══════════════════════════════════════════════════════════════════════════

require 'net/http'
require 'uri'
require 'json'
require 'digest'
require 'openssl'
require 'time'

module SignEng
  module Core
    module FirebaseClient
      # ────────── CONFIG PÚBLICA ──────────
      # Essas chaves NÃO são secretas. O que protege o sistema são as
      # security rules do Firestore + domain allowlist do Auth.
      #
      # TODO(SignEng): infraestrutura antiga (projeto Firebase do ACMFacil)
      # desativada de propósito — preencher com o novo projeto/API key do
      # SignEng assim que o novo Firebase/banco de dados for criado.
      API_KEY    = "".freeze
      PROJECT_ID = "".freeze

      AUTH_BASE = "https://identitytoolkit.googleapis.com/v1".freeze
      FS_BASE   = "https://firestore.googleapis.com/v1/projects/#{PROJECT_ID}/databases/(default)/documents".freeze

      # 45s: as functions de cálculo podem pegar cold start (~5s) + rede lenta;
      # com 15s o gerar estourava no primeiro uso do dia (v1.9.25).
      TIMEOUT_SEC = 45

      # ═══════════════════════════════════════════════════════════════════
      # AUTH — Identity Toolkit REST
      # ═══════════════════════════════════════════════════════════════════

      # POST /accounts:signInWithPassword
      # Returns: {ok: true, idToken, refreshToken, localId, email, expiresIn}
      #       OR {ok: false, code: "auth.xxx", error: "raw error"}
      def self.sign_in(email, password)
        url = URI("#{AUTH_BASE}/accounts:signInWithPassword?key=#{API_KEY}")
        body = {
          email: email.to_s.strip.downcase,
          password: password.to_s,
          returnSecureToken: true
        }
        res = http_post_json(url, body)
        return res unless res[:ok]

        data = res[:data]
        {
          ok:           true,
          id_token:     data["idToken"],
          refresh_token:data["refreshToken"],
          local_id:     data["localId"],
          email:        data["email"],
          expires_in:   data["expiresIn"].to_i
        }
      end

      # POST /accounts:sendOobCode (password reset)
      def self.send_password_reset(email)
        url = URI("#{AUTH_BASE}/accounts:sendOobCode?key=#{API_KEY}")
        body = {
          requestType: "PASSWORD_RESET",
          email: email.to_s.strip.downcase
        }
        http_post_json(url, body)
      end

      # POST https://securetoken.googleapis.com/v1/token
      # Renova um idToken usando o refresh_token
      def self.refresh_id_token(refresh_token)
        url = URI("https://securetoken.googleapis.com/v1/token?key=#{API_KEY}")
        body = {
          grant_type: "refresh_token",
          refresh_token: refresh_token.to_s
        }
        res = http_post_form(url, body)
        return res unless res[:ok]
        data = res[:data]
        {
          ok:            true,
          id_token:      data["id_token"],
          refresh_token: data["refresh_token"] || refresh_token,
          user_id:       data["user_id"],
          expires_in:    data["expires_in"].to_i
        }
      end

      # POST /accounts:lookup — pega info do user pelo idToken
      def self.lookup_user(id_token)
        url = URI("#{AUTH_BASE}/accounts:lookup?key=#{API_KEY}")
        body = { idToken: id_token.to_s }
        res = http_post_json(url, body)
        return res unless res[:ok]
        users = res[:data]["users"] || []
        return { ok: false, code: "auth.user_not_found" } if users.empty?
        u = users.first
        {
          ok:         true,
          local_id:   u["localId"],
          email:      u["email"],
          display_name: u["displayName"],
          email_verified: u["emailVerified"] == true
        }
      end

      # ═══════════════════════════════════════════════════════════════════
      # FIRESTORE REST
      # ═══════════════════════════════════════════════════════════════════

      # GET /{path} → retorna { ok, doc } ou { ok: false, code: "firestore.not_found" }
      # path: "users/abc123" ou "licenses/xyz"
      def self.get_document(path, id_token)
        url = URI("#{FS_BASE}/#{path}")
        req = Net::HTTP::Get.new(url)
        req["Authorization"] = "Bearer #{id_token}"
        req["X-Goog-User-Project"] = PROJECT_ID
        res = http_request(url, req)
        return res unless res[:ok]
        {
          ok:  true,
          doc: firestore_to_hash(res[:data])
        }
      end

      # PATCH /{path}?updateMask={fields}
      # fields: hash ruby simples, será convertido pro formato Firestore
      def self.set_document(path, fields, id_token, merge = true)
        query = merge ? "?currentDocument.exists=false" : ""
        url = URI("#{FS_BASE}/#{path}")
        req = Net::HTTP::Patch.new(url)
        req["Authorization"] = "Bearer #{id_token}"
        req["X-Goog-User-Project"] = PROJECT_ID
        req["Content-Type"] = "application/json"
        req.body = JSON.generate({ fields: hash_to_firestore(fields) })
        res = http_request(url, req)
        return res unless res[:ok]
        { ok: true, doc: firestore_to_hash(res[:data]) }
      end

      # POST /:runQuery — query numa collection
      # Ex: query_collection("licenses", where: {userId: uid, status: "active"})
      def self.query_collection(collection, where: {}, id_token:)
        url = URI("#{FS_BASE}:runQuery")

        # Monta a structuredQuery
        filters = where.map do |field, value|
          {
            fieldFilter: {
              field: { fieldPath: field.to_s },
              op:    "EQUAL",
              value: value_to_firestore(value)
            }
          }
        end

        query_body = {
          structuredQuery: {
            from: [{ collectionId: collection }]
          }
        }

        if filters.length == 1
          query_body[:structuredQuery][:where] = filters.first
        elsif filters.length > 1
          query_body[:structuredQuery][:where] = {
            compositeFilter: { op: "AND", filters: filters }
          }
        end

        req = Net::HTTP::Post.new(url)
        req["Authorization"] = "Bearer #{id_token}"
        req["X-Goog-User-Project"] = PROJECT_ID
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(query_body)

        res = http_request(url, req)
        return res unless res[:ok]

        # Resposta é array de {document: {...}} (ou {readTime: ...} se vazio)
        docs = (res[:data] || []).map do |row|
          next nil unless row["document"]
          firestore_to_hash(row["document"])
        end.compact
        { ok: true, docs: docs }
      end

      # ═══════════════════════════════════════════════════════════════════
      # MACHINE HASH — identifica unicamente o PC
      # ═══════════════════════════════════════════════════════════════════
      def self.machine_hash
        hostname = ENV["COMPUTERNAME"] || `hostname`.to_s.strip
        user     = ENV["USERNAME"]     || ENV["USER"] || "user"
        os       = RUBY_PLATFORM.to_s
        # Adiciona o volume serial do C: como dado adicional (Windows)
        vol = ""
        begin
          if RUBY_PLATFORM.downcase.include?("mingw") || RUBY_PLATFORM.downcase.include?("mswin")
            out = `vol C:`.to_s
            if out =~ /Serial Number is ([A-F0-9-]+)/i
              vol = $1
            end
          end
        rescue; end
        seed = "#{hostname}|#{user}|#{os}|#{vol}|acmfacil"
        Digest::SHA256.hexdigest(seed)[0, 32]
      end

      # ═══════════════════════════════════════════════════════════════════
      # CLOUD FUNCTIONS (callable v2)
      # ═══════════════════════════════════════════════════════════════════
      # Chama function callable do Firebase. Mesmo protocolo do
      # httpsCallable do SDK web:
      #   POST https://us-central1-{project}.cloudfunctions.net/{name}
      #   Authorization: Bearer {idToken}
      #   Body: { "data": {...} }
      #   Sucesso: { "result": {...} }
      #   Erro:    { "error": { "status", "message", "details" } }
      #
      # Retorna { ok: true, result } OU { ok: false, code, error, details }
      def self.call_function(name, data, id_token, region = "us-central1", timeout = TIMEOUT_SEC)
        url = URI("https://#{region}-#{PROJECT_ID}.cloudfunctions.net/#{name}")
        req = Net::HTTP::Post.new(url)
        req["Authorization"] = "Bearer #{id_token}"
        req["Content-Type"]  = "application/json"
        req.body = JSON.generate({ data: data || {} })
        res = http_request(url, req, timeout)

        if res[:ok]
          payload = res[:data] || {}
          return { ok: true, result: payload["result"] }
        end

        # Erro — extrai info do callable se disponível
        details = nil
        begin
          if res[:raw_body] && !res[:raw_body].empty?
            parsed = JSON.parse(res[:raw_body]) rescue nil
            if parsed.is_a?(Hash) && parsed["error"]
              details = parsed["error"]
            end
          end
        rescue; end

        {
          ok:      false,
          code:    (details && details["status"]) || res[:code] || "fn.error",
          error:   (details && details["message"]) || res[:error] || "Function failed",
          status:  res[:status],
          details: details && details["details"]
        }
      end

      # ═══════════════════════════════════════════════════════════════════
      # HELPERS HTTP
      # ═══════════════════════════════════════════════════════════════════

      def self.http_post_json(url, body_hash)
        req = Net::HTTP::Post.new(url)
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(body_hash)
        http_request(url, req)
      end

      def self.http_post_form(url, body_hash)
        req = Net::HTTP::Post.new(url)
        req["Content-Type"] = "application/x-www-form-urlencoded"
        req.body = URI.encode_www_form(body_hash)
        http_request(url, req)
      end

      def self.http_request(url, req, timeout = TIMEOUT_SEC)
        http = Net::HTTP.new(url.host, url.port)
        http.use_ssl = (url.scheme == "https")
        http.verify_mode = OpenSSL::SSL::VERIFY_PEER
        http.read_timeout = timeout
        http.open_timeout = TIMEOUT_SEC
        res = http.request(req)
        data = (res.body && !res.body.empty?) ? (JSON.parse(res.body) rescue nil) : nil

        if res.is_a?(Net::HTTPSuccess)
          return { ok: true, data: data, status: res.code.to_i }
        end

        # Erro — tenta mapear código Firebase pra nosso code
        err = ""
        if data.is_a?(Hash) && data["error"]
          err = data["error"]["message"].to_s rescue ""
        end
        {
          ok:       false,
          status:   res.code.to_i,
          code:     map_firebase_error(err),
          error:    err,
          raw_body: res.body.to_s   # pra parse posterior em call_function
        }
      rescue => e
        { ok: false, code: "network.error", error: e.message }
      end

      def self.map_firebase_error(msg)
        case msg
        when "EMAIL_NOT_FOUND"           then "auth.user_not_found"
        when "INVALID_PASSWORD"          then "auth.wrong_password"
        when "INVALID_LOGIN_CREDENTIALS" then "auth.invalid_credentials"
        when "USER_DISABLED"             then "auth.user_disabled"
        when "EMAIL_EXISTS"              then "auth.email_exists"
        when /^WEAK_PASSWORD/            then "auth.weak_password"
        when "INVALID_EMAIL"             then "auth.invalid_email"
        when /TOO_MANY_ATTEMPTS/         then "auth.too_many_attempts"
        when "MISSING_PASSWORD"          then "auth.empty_password"
        when "MISSING_EMAIL"             then "auth.empty_email"
        when "TOKEN_EXPIRED"             then "auth.token_expired"
        when "INVALID_ID_TOKEN"          then "auth.token_invalid"
        else
          msg.empty? ? "auth.unknown_error" : "auth.error.#{msg.downcase.gsub(/[^a-z0-9]/, '_')}"
        end
      end

      # ═══════════════════════════════════════════════════════════════════
      # FIRESTORE ↔ HASH CONVERTERS
      # Firestore REST usa formato {fields: {field: {stringValue: "x"}}}
      # ═══════════════════════════════════════════════════════════════════

      def self.hash_to_firestore(hash)
        result = {}
        hash.each do |k, v|
          result[k.to_s] = value_to_firestore(v)
        end
        result
      end

      def self.value_to_firestore(v)
        case v
        when String      then { "stringValue" => v }
        when Integer     then { "integerValue" => v.to_s }
        when Float       then { "doubleValue" => v }
        when TrueClass, FalseClass then { "booleanValue" => v }
        when NilClass    then { "nullValue" => nil }
        when Time        then { "timestampValue" => v.utc.iso8601 }
        when Hash        then { "mapValue" => { "fields" => hash_to_firestore(v) } }
        when Array       then { "arrayValue" => { "values" => v.map { |x| value_to_firestore(x) } } }
        else                  { "stringValue" => v.to_s }
        end
      end

      def self.firestore_to_hash(doc)
        return nil unless doc.is_a?(Hash)
        result = {
          "_name"       => doc["name"],
          "_createTime" => doc["createTime"],
          "_updateTime" => doc["updateTime"]
        }
        (doc["fields"] || {}).each do |k, v|
          result[k] = firestore_value_to_ruby(v)
        end
        result
      end

      def self.firestore_value_to_ruby(v)
        return nil unless v.is_a?(Hash)
        if v.key?("stringValue")    then v["stringValue"]
        elsif v.key?("integerValue")then v["integerValue"].to_i
        elsif v.key?("doubleValue") then v["doubleValue"].to_f
        elsif v.key?("booleanValue")then v["booleanValue"] == true
        elsif v.key?("timestampValue") then v["timestampValue"]
        elsif v.key?("nullValue")   then nil
        elsif v.key?("mapValue")    then firestore_to_hash("fields" => v["mapValue"]["fields"] || {})
        elsif v.key?("arrayValue")  then (v["arrayValue"]["values"] || []).map { |x| firestore_value_to_ruby(x) }
        else nil
        end
      end
    end
  end
end
