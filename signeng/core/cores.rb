# encoding: UTF-8
# ============================================================================
# ACM Facade Generator — Cores (compartilhado entre todos os módulos)
# 54 cores ACM + 8 cores de junta
# ============================================================================

module SignEng
  module Generator

    # Cores VISUALMAXX — extraídas do arquivo "cores acm.skp"
    CORES_ACM = {
      # ---- BRILHO ----
      "Branco Brilho (VX103)"       => { rgb: [246,242,238], cat: "brilho" },
      "Amarelo Brilho (VX701)"      => { rgb: [255,148,0],   cat: "brilho" },
      "Laranja Brilho (VX751)"      => { rgb: [255,97,0],    cat: "brilho" },
      "Vermelho Brilho (VX502)"     => { rgb: [220,8,8],     cat: "brilho" },
      "Pink Brilho (VX918)"         => { rgb: [160,45,222],   cat: "brilho" },
      "Rosa Brilho (VX917)"         => { rgb: [238,159,160],  cat: "brilho" },
      "Roxo Brilho (VX919)"         => { rgb: [100,31,72],    cat: "brilho" },
      "Azul Brilho (VX406)"         => { rgb: [39,33,112],    cat: "brilho" },
      "Verde Brilho (VX451)"        => { rgb: [0,153,76],     cat: "brilho" },
      "Verde Limão Brilho (VX480)"  => { rgb: [185,214,0],    cat: "brilho" },
      "Verde Sicoob (VX453)"        => { rgb: [0,81,77],      cat: "brilho" },
      "Preto Brilho (VX151)"        => { rgb: [25,25,25],     cat: "brilho" },
      # ---- FOSCO ----
      "Branco Fosco (VX104)"        => { rgb: [238,245,246],  cat: "fosco" },
      "Prata Fosco (VX202)"         => { rgb: [182,182,182],  cat: "fosco" },
      "RAL 7037 (VX315)"            => { rgb: [178,178,178],  cat: "fosco" },
      "Dark Grey (VX205)"           => { rgb: [111,111,106],  cat: "fosco" },
      "Café Fosco (VX315)"          => { rgb: [61,51,40],     cat: "fosco" },
      "Amarelo Fosco (VX705)"       => { rgb: [255,153,0],    cat: "fosco" },
      "Laranja Fosco (VX750)"       => { rgb: [255,97,0],     cat: "fosco" },
      "Vermelho Fosco (VX504)"      => { rgb: [220,15,15],    cat: "fosco" },
      "Azul Fosco (VX413)"          => { rgb: [38,32,110],    cat: "fosco" },
      "Verde Fosco (VX471)"         => { rgb: [0,127,88],     cat: "fosco" },
      "Verde Finland (VX472)"       => { rgb: [0,122,108],    cat: "fosco" },
      "Preto Fosco (VX152)"         => { rgb: [25,25,25],     cat: "fosco" },
      # ---- METÁLICO ----
      "Prata Metálico (VX202)"      => { rgb: [182,182,182],  cat: "metalico" },
      "Champagne Metálico (VX300)"  => { rgb: [167,160,139],  cat: "metalico" },
      "Grafite Metálico (VX209)"    => { rgb: [128,127,123],  cat: "metalico" },
      "Dourado (VX329)"             => { rgb: [185,173,136],  cat: "metalico" },
      "Escovado (VX600)"            => { rgb: [187,187,187],  cat: "metalico" },
      "Ruby (VX501)"                => { rgb: [164,8,8],      cat: "metalico" },
      "Burgundy (VX509)"            => { rgb: [126,26,35],    cat: "metalico" },
      "Azul GM (VX401)"             => { rgb: [21,77,156],    cat: "metalico" },
      "Azul Ultramarine (VX400)"    => { rgb: [4,62,87],      cat: "metalico" },
      "Azul Turquesa (VX438)"       => { rgb: [0,179,193],    cat: "metalico" },
      # ---- ESPELHADO ----
      "Prata Espelhado (VX604)"     => { rgb: [219,219,219],  cat: "espelhado" },
      "Dourado Espelhado (VX605)"   => { rgb: [232,152,34],   cat: "espelhado" },
      "Cor B04"                     => { rgb: [255,101,50],    cat: "espelhado" },
      # ---- AMADEIRADO ----
      "Madeira Imbuia (VX961)"      => { rgb: [60,52,44],     cat: "amadeirado" },
      "Madeira Mogno (VX955)"       => { rgb: [130,93,61],    cat: "amadeirado" },
    }

    CORES_JUNTA = {
      "Preto"        => [20,20,20],
      "Cinza Escuro" => [60,60,60],
      "Cinza"        => [128,128,128],
      "Cinza Claro"  => [180,180,180],
      "Branco"       => [235,235,235],
      "Marrom"       => [80,50,30],
      "Bege"         => [190,170,140],
      "Transparente" => [200,200,200],
    }

    CORES_FITA = {
      "Cyan"         => [0,210,210],
      "Vermelho"     => [220,40,40],
      "Amarelo"      => [230,200,40],
      "Laranja"      => [230,140,40],
      "Branco"       => [240,240,240],
      "Preto"        => [30,30,30],
      "Transparente" => [200,200,200],
    }

  end
end
