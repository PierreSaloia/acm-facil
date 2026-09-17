# encoding: UTF-8
# Configuracao do novo backend Firebase do SignEng.
# Preencha estes valores com o NOVO projeto Firebase antes de publicar.
module SignEng
  module Core
    module FirebaseConfig
      PROJECT_ID = "COLOQUE_O_NOVO_FIREBASE_PROJECT_ID_AQUI".freeze
      API_KEY = "COLOQUE_A_NOVA_FIREBASE_WEB_API_KEY_AQUI".freeze
      REGION = "us-central1".freeze

      def self.configured?
        !PROJECT_ID.start_with?("COLOQUE_") && !API_KEY.start_with?("COLOQUE_")
      end
    end
  end
end
