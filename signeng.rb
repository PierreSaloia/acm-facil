require 'sketchup.rb'
require 'extensions.rb'

# ═════════════════════════════════════════════════════════════════════════
# SignEng — Plugin SketchUp para geração de fachadas em ACM
# ═════════════════════════════════════════════════════════════════════════
# Este arquivo é o ponto de entrada descoberto pelo SketchUp.
# Registra a extensão e carrega o main.rb sob demanda.
# ═════════════════════════════════════════════════════════════════════════

module SignEng
  unless file_loaded?(__FILE__)
    ext = SketchupExtension.new(
      "SignEng",
      File.join(File.dirname(__FILE__), "signeng", "main")
    )
    ext.version     = "1.9.32"
    ext.creator     = "Marcelo Para Oficial"
    ext.copyright   = "© 2026 Marcelo Para Oficial"
    ext.description = "Plugin para geração paramétrica de fachadas em ACM. " \
                      "Suporta múltiplos módulos geradores (marquise, colunas, " \
                      "auto-ACM, corte CNC e mais) com design moderno e fluxo " \
                      "unificado de login."
    Sketchup.register_extension(ext, true)
    file_loaded(__FILE__)
  end
end
