/* ══════════════════════════════════════════════════════════════════════════
   ACMFacil — Luminoso (diálogo da ferramenta)
   ══════════════════════════════════════════════════════════════════════════
   Gera/regenera o luminoso via Bridge. Se um luminoso gerado for carregado
   (Carregar selecionado), o Gerar REGENERA aquele componente no lugar.
   ══════════════════════════════════════════════════════════════════════════ */

const LuminosoUI = {

  state: {
    lang: 'pt',
    editingId: null,  // entityID do luminoso em edição (null = novo)
    cores: {},        // categorias → [{nome, rgb}] (vem do Ruby)
    ordemCat: [],
    cor: { arco: {}, borda: {} } // seleção atual { nome, rgb, cat }
  },

  i18n: {
    pt: {
      title: 'Luminoso', subtitle: 'Luminoso em ACM — redondo, quadrado ou retangular.',
      novo: 'Novo', carregar: 'Carregar selecionado', gerar: 'Gerar', regerar: 'Regenerar',
      editando: 'Editando luminoso #',
      secFormato: 'FORMATO', secAcm: 'ACM E CORES', secCorpo: 'CORPO (ARCO)',
      secTampas: 'TAMPAS (BORDAS)', secAcr: 'ACRÍLICO', secSuporte: 'SUPORTE (BRAÇO)',
      secCint: 'CHAPA INTERNA (REFORÇO DO BRAÇO)', secCext: 'CHAPA DE PAREDE (EXTERNA)',
      secParafBorda: 'PARAFUSOS — BORDA (TAMPAS)', secParafChapas: 'PARAFUSOS — CHAPAS',
      parafOrient: 'Distribuição', orientH: 'Horizontal', orientV: 'Vertical',
      formato: 'Formato', fRedondo: 'Redondo', fQuadrado: 'Quadrado', fRetangular: 'Retangular',
      diametro: 'Diâmetro (mm)', largura: 'Largura (mm)', altura: 'Altura (mm)', raio: 'Raio do canto (mm)',
      acmEsp: 'Espessura ACM (mm)', corArco: 'Cor do arco (corpo)', corBorda: 'Cor das bordas (tampas)',
      arcoLarg: 'Largura do arco (mm)', emendas: 'Emendas',
      bordaFace: 'Borda da face (mm)', bordaExt: 'Borda externa (mm)',
      folgaTampa: 'Folga tampa×arco (mm)', dupla: 'Dupla-face',
      acrEsp: 'Espessura (mm)', acrTipo: 'Tipo',
      acrLeitoso: 'Branco leitoso', acrCristal: 'Cristal (adesivo retroverso)',
      comSuporte: 'Com suporte (braço + estrutura metálica)',
      secFundo: 'FUNDO (FACE ÚNICA)', fundoTipo: 'Tipo de fundo',
      fundoTampa: 'Tampa ACM (veste o arco)', fundoEmbutido: 'Embutido (chapa interna com folga)',
      fundoFolga: 'Folga p/ parede interna (mm/lado)', fundoEsp: 'Espessura do fundo (mm)',
      bilongoOn: 'Bilongos (rasgos de pendurar)', bilongoTipo: 'Tipo',
      bilongoNormal: 'Normal (furo + cava)', bilongoCruz: 'Em cruz',
      bilongoFuro: 'Ø do furo (mm)', bilongoComp: 'Comprimento do rasgo (mm)',
      bilongoLarg: 'Largura da cava (mm)', bilongoPos: 'Posição do furo',
      bilongoSup: 'Superior (cava desce)', bilongoInf: 'Inferior (cava sobe)', bilongoCen: 'Central (cava dos 2 lados)',
      cruzW: 'Cruz — largura (mm)', cruzH: 'Cruz — altura (mm)',
      bilongoQtd: 'Quantidade', bilongoDist: 'Distância entre eles (mm)', bilongoAlt: 'Altura do centro (mm ↑)',
      comBraco: 'Com braço', lado: 'Lado', direita: 'Direita', esquerda: 'Esquerda',
      ladoSuperior: 'Superior (topo)', ladoInferior: 'Inferior (base)',
      bracoDuplo: 'Braço duplo', bracoDist: 'Distância entre braços (mm)',
      chapaModo: 'Chapas (parede/interna)', chapaUnica: 'Única (pega os dois)', chapaDuas: 'Duas separadas',
      bracoExt: 'Braço externo (mm)', metalon: 'Metalon (mm)', folgaFuro: 'Folga do furo (mm)',
      cintLarg: 'Largura (mm)', cintEsp: 'Espessura (mm)',
      cintComp: 'Comprimento (0=auto)',
      cextLarg: 'Largura (mm)', cextAlt: 'Altura (mm)', cextEsp: 'Espessura (mm)',
      pbQtd: 'Quantidade por tampa', pceQtd: 'Qtd. chapa parede', pciQtd: 'Qtd. por chapa interna',
      parafDBorda: 'Ø cabeça (mm)', parafDChapa: 'Ø cabeça (mm)',
      parafDistLat: 'Dist. bordas laterais (mm)', parafDistTb: 'Dist. bordas topo/baixo (mm)',
      msgOk: 'Luminoso gerado!', msgRegen: 'Luminoso atualizado!',
      msgCarregado: 'Parâmetros carregados — edite e clique Regenerar.',
      msgNadaSel: 'Selecione um luminoso gerado pelo ACMFacil primeiro.',
      msgBlocked: 'Licença inválida. Faça login no painel do ACMFacil.',
      msgError: 'Erro: ',
      tabParams: 'Parâmetros', tabMats: 'Materiais & Corte',
      secChapaAcm: 'CHAPA DE ACM (PRA CÁLCULO)', chapaComp: 'Comprimento (mm)', chapaLarg: 'Largura (mm)',
      secLista: 'MATERIAIS PLANIFICADOS', secExport: 'EXPORTAR',
      btnSvgProj: 'SVG do projeto (corte)', btnDxfProj: 'DXF do projeto (Corel)', btnPlano: 'Plano de Corte (PDF)',
      msgPlanoOk: 'Plano salvo (abra no navegador e imprima em PDF): ',
      pArco: 'Arco', pBordaExt: 'Borda externa', pTesta: 'Testa (moldura)', pFundo: 'Fundo cego',
      pAcr: 'Acrílico', pBraco: 'Braço metalon', pCParede: 'Chapa parede', pCInterna: 'Chapa interna',
      listArea: 'Área', listChapa: 'chapa(s) de', listComp: 'Comprimento total', listChapasMet: 'CHAPAS METÁLICAS',
      msgSvgOk: 'Arquivo salvo: ',
      msgSemVistas: 'Não consegui capturar as vistas do modelo (o plano sai sem elas). Reinicie o SketchUp e tente de novo.',
      prevHint: 'Scroll = zoom · arrastar = mover · duplo clique = enquadrar'
    },
    es: {
      title: 'Luminoso', subtitle: 'Luminoso en ACM — redondo, cuadrado o rectangular.',
      novo: 'Nuevo', carregar: 'Cargar seleccionado', gerar: 'Generar', regerar: 'Regenerar',
      editando: 'Editando luminoso #',
      secFormato: 'FORMATO', secAcm: 'ACM Y COLORES', secCorpo: 'CUERPO (ARO)',
      secTampas: 'TAPAS (BORDES)', secAcr: 'ACRÍLICO', secSuporte: 'SOPORTE (BRAZO)',
      secCint: 'CHAPA INTERNA (REFUERZO DEL BRAZO)', secCext: 'CHAPA DE PARED (EXTERNA)',
      secParafBorda: 'TORNILLOS — BORDE (TAPAS)', secParafChapas: 'TORNILLOS — CHAPAS',
      parafOrient: 'Distribución', orientH: 'Horizontal', orientV: 'Vertical',
      formato: 'Formato', fRedondo: 'Redondo', fQuadrado: 'Cuadrado', fRetangular: 'Rectangular',
      diametro: 'Diámetro (mm)', largura: 'Ancho (mm)', altura: 'Alto (mm)', raio: 'Radio de esquina (mm)',
      acmEsp: 'Espesor ACM (mm)', corArco: 'Color del aro (cuerpo)', corBorda: 'Color de los bordes (tapas)',
      arcoLarg: 'Ancho del aro (mm)', emendas: 'Uniones',
      bordaFace: 'Borde de la cara (mm)', bordaExt: 'Borde externo (mm)',
      folgaTampa: 'Holgura tapa×aro (mm)', dupla: 'Doble cara',
      acrEsp: 'Espesor (mm)', acrTipo: 'Tipo',
      acrLeitoso: 'Blanco lechoso', acrCristal: 'Cristal (vinilo retro)',
      comSuporte: 'Con soporte (brazo + estructura metálica)',
      secFundo: 'FONDO (UNA CARA)', fundoTipo: 'Tipo de fondo',
      fundoTampa: 'Tapa ACM (viste el arco)', fundoEmbutido: 'Embutido (placa interna con holgura)',
      fundoFolga: 'Holgura a la pared interna (mm/lado)', fundoEsp: 'Espesor del fondo (mm)',
      bilongoOn: 'Ranuras de colgado (bilongos)', bilongoTipo: 'Tipo',
      bilongoNormal: 'Normal (agujero + ranura)', bilongoCruz: 'En cruz',
      bilongoFuro: 'Ø del agujero (mm)', bilongoComp: 'Largo de la ranura (mm)',
      bilongoLarg: 'Ancho de la ranura (mm)', bilongoPos: 'Posición del agujero',
      bilongoSup: 'Superior (ranura baja)', bilongoInf: 'Inferior (ranura sube)', bilongoCen: 'Central (ambos lados)',
      cruzW: 'Cruz — ancho (mm)', cruzH: 'Cruz — alto (mm)',
      bilongoQtd: 'Cantidad', bilongoDist: 'Distancia entre ellos (mm)', bilongoAlt: 'Altura del centro (mm ↑)',
      comBraco: 'Con brazo', lado: 'Lado', direita: 'Derecha', esquerda: 'Izquierda',
      ladoSuperior: 'Superior (arriba)', ladoInferior: 'Inferior (base)',
      bracoDuplo: 'Brazo doble', bracoDist: 'Distancia entre brazos (mm)',
      chapaModo: 'Chapas (pared/interna)', chapaUnica: 'Única (toma los dos)', chapaDuas: 'Dos separadas',
      bracoExt: 'Brazo externo (mm)', metalon: 'Metalón (mm)', folgaFuro: 'Holgura del agujero (mm)',
      cintLarg: 'Ancho (mm)', cintEsp: 'Espesor (mm)',
      cintComp: 'Largo (0=auto)',
      cextLarg: 'Ancho (mm)', cextAlt: 'Alto (mm)', cextEsp: 'Espesor (mm)',
      pbQtd: 'Cantidad por tapa', pceQtd: 'Cant. chapa pared', pciQtd: 'Cant. por chapa interna',
      parafDBorda: 'Ø cabeza (mm)', parafDChapa: 'Ø cabeza (mm)',
      parafDistLat: 'Dist. bordes laterales (mm)', parafDistTb: 'Dist. bordes sup/inf (mm)',
      msgOk: '¡Luminoso generado!', msgRegen: '¡Luminoso actualizado!',
      msgCarregado: 'Parámetros cargados — edita y pulsa Regenerar.',
      msgNadaSel: 'Selecciona primero un luminoso generado por ACMFacil.',
      msgBlocked: 'Licencia inválida. Inicia sesión en el panel de ACMFacil.',
      msgError: 'Error: ',
      tabParams: 'Parámetros', tabMats: 'Materiales y Corte',
      secChapaAcm: 'CHAPA DE ACM (PARA CÁLCULO)', chapaComp: 'Largo (mm)', chapaLarg: 'Ancho (mm)',
      secLista: 'MATERIALES APLANADOS', secExport: 'EXPORTAR',
      btnSvgProj: 'SVG del proyecto (corte)', btnDxfProj: 'DXF del proyecto (Corel)', btnPlano: 'Plan de Corte (PDF)',
      msgPlanoOk: 'Plan guardado (ábrelo en el navegador e imprime en PDF): ',
      pArco: 'Aro', pBordaExt: 'Borde externo', pTesta: 'Frente (marco)', pFundo: 'Fondo ciego',
      pAcr: 'Acrílico', pBraco: 'Brazo metalón', pCParede: 'Chapa pared', pCInterna: 'Chapa interna',
      listArea: 'Área', listChapa: 'chapa(s) de', listComp: 'Largo total', listChapasMet: 'CHAPAS METÁLICAS',
      msgSvgOk: 'Archivo guardado: ',
      msgSemVistas: 'No pude capturar las vistas del modelo (el plan sale sin ellas). Reinicia SketchUp e inténtalo de nuevo.',
      prevHint: 'Scroll = zoom · arrastrar = mover · doble clic = encuadrar'
    },
    en: {
      title: 'Lightbox', subtitle: 'ACM lightbox sign — round, square or rectangular.',
      novo: 'New', carregar: 'Load selected', gerar: 'Generate', regerar: 'Regenerate',
      editando: 'Editing lightbox #',
      secFormato: 'SHAPE', secAcm: 'ACM & COLORS', secCorpo: 'BODY (RING)',
      secTampas: 'CAPS (BORDERS)', secAcr: 'ACRYLIC', secSuporte: 'SUPPORT (ARM)',
      secCint: 'INNER PLATE (ARM REINFORCEMENT)', secCext: 'WALL PLATE (OUTER)',
      secParafBorda: 'SCREWS — BORDER (CAPS)', secParafChapas: 'SCREWS — PLATES',
      parafOrient: 'Layout', orientH: 'Horizontal', orientV: 'Vertical',
      formato: 'Shape', fRedondo: 'Round', fQuadrado: 'Square', fRetangular: 'Rectangular',
      diametro: 'Diameter (mm)', largura: 'Width (mm)', altura: 'Height (mm)', raio: 'Corner radius (mm)',
      acmEsp: 'ACM thickness (mm)', corArco: 'Body (ring) color', corBorda: 'Border (caps) color',
      arcoLarg: 'Ring depth (mm)', emendas: 'Seams',
      bordaFace: 'Face border (mm)', bordaExt: 'Outer border (mm)',
      folgaTampa: 'Cap×ring gap (mm)', dupla: 'Double-sided',
      acrEsp: 'Thickness (mm)', acrTipo: 'Type',
      acrLeitoso: 'Milky white', acrCristal: 'Clear (backlit vinyl)',
      comSuporte: 'With support (arm + metal frame)',
      secFundo: 'BACK PANEL (SINGLE FACE)', fundoTipo: 'Back type',
      fundoTampa: 'ACM cap (wraps the body)', fundoEmbutido: 'Inset (inner panel with clearance)',
      fundoFolga: 'Clearance to inner wall (mm/side)', fundoEsp: 'Back thickness (mm)',
      bilongoOn: 'Keyhole hanging slots', bilongoTipo: 'Type',
      bilongoNormal: 'Normal (hole + slot)', bilongoCruz: 'Cross',
      bilongoFuro: 'Hole Ø (mm)', bilongoComp: 'Slot length (mm)',
      bilongoLarg: 'Slot width (mm)', bilongoPos: 'Hole position',
      bilongoSup: 'Top (slot goes down)', bilongoInf: 'Bottom (slot goes up)', bilongoCen: 'Center (both sides)',
      cruzW: 'Cross — width (mm)', cruzH: 'Cross — height (mm)',
      bilongoQtd: 'Quantity', bilongoDist: 'Spacing between them (mm)', bilongoAlt: 'Center height (mm ↑)',
      comBraco: 'With arm', lado: 'Side', direita: 'Right', esquerda: 'Left',
      ladoSuperior: 'Top', ladoInferior: 'Bottom',
      bracoDuplo: 'Double arm', bracoDist: 'Arm spacing (mm)',
      chapaModo: 'Plates (wall/inner)', chapaUnica: 'Single (spans both)', chapaDuas: 'Two separate',
      bracoExt: 'Outer arm (mm)', metalon: 'Steel tube (mm)', folgaFuro: 'Hole gap (mm)',
      cintLarg: 'Width (mm)', cintEsp: 'Thickness (mm)',
      cintComp: 'Length (0=auto)',
      cextLarg: 'Width (mm)', cextAlt: 'Height (mm)', cextEsp: 'Thickness (mm)',
      pbQtd: 'Quantity per cap', pceQtd: 'Wall plate qty.', pciQtd: 'Qty. per inner plate',
      parafDBorda: 'Head Ø (mm)', parafDChapa: 'Head Ø (mm)',
      parafDistLat: 'Side edge dist. (mm)', parafDistTb: 'Top/bottom edge dist. (mm)',
      msgOk: 'Lightbox generated!', msgRegen: 'Lightbox updated!',
      msgCarregado: 'Parameters loaded — edit and click Regenerate.',
      msgNadaSel: 'Select an ACMFacil-generated lightbox first.',
      msgBlocked: 'Invalid license. Log in on the ACMFacil panel.',
      msgError: 'Error: ',
      tabParams: 'Parameters', tabMats: 'Materials & Cutting',
      secChapaAcm: 'ACM SHEET (FOR ESTIMATE)', chapaComp: 'Length (mm)', chapaLarg: 'Width (mm)',
      secLista: 'FLATTENED MATERIALS', secExport: 'EXPORT',
      btnSvgProj: 'Project SVG (cutting)', btnDxfProj: 'Project DXF (Corel)', btnPlano: 'Cutting Plan (PDF)',
      msgPlanoOk: 'Plan saved (open in browser and print to PDF): ',
      pArco: 'Ring', pBordaExt: 'Outer border', pTesta: 'Face (frame)', pFundo: 'Blind back',
      pAcr: 'Acrylic', pBraco: 'Steel tube arm', pCParede: 'Wall plate', pCInterna: 'Inner plate',
      listArea: 'Area', listChapa: 'sheet(s) of', listComp: 'Total length', listChapasMet: 'METAL PLATES',
      msgSvgOk: 'File saved: ',
      msgSemVistas: 'Could not capture the model views (plan goes out without them). Restart SketchUp and try again.',
      prevHint: 'Scroll = zoom · drag = pan · double-click = fit'
    }
  },

  t(key) {
    const d = LuminosoUI.i18n[LuminosoUI.state.lang] || LuminosoUI.i18n.pt;
    return d[key] || key;
  },

  // Defaults (§17 — sincronizar com extrair do Ruby e values do HTML)
  _defaultParams() {
    return {
      formato: 'redondo', larg: 500, alt: 500, raio: 0,
      acm: 3, arco_larg: 100, emendas: 1,
      borda_face: 7, borda_ext: 25, folga_tampa: 1,
      dupla: true, acr_esp: 2, acr_tipo: 'leitoso',
      suporte: true,
      fundo_tipo: 'tampa', fundo_folga: 2, fundo_esp: 10,
      bilongo_on: false, bilongo_tipo: 'normal', bilongo_furo: 16, bilongo_comp: 38,
      bilongo_larg: 8, bilongo_pos: 'superior', cruz_w: 46, cruz_h: 44,
      bilongo_qtd: 2, bilongo_dist: 250, bilongo_alt: 100,
      braco: true, braco_lado: 'direita', braco_duplo: false, braco_dist: 300,
      chapa_modo: 'unica', braco_ext: 60, metalon: 25, folga_furo: 2,
      cint_larg: 50, cint_esp: 2, cint_comp: 0,
      cext_larg: 175, cext_alt: 75, cext_esp: 2,
      pb_qtd: 8, pce_qtd: 4, pci_qtd: 2, paraf_d_borda: 10, paraf_d_chapa: 10,
      paraf_dist_lat: 12, paraf_dist_tb: 12, paraf_orient: 'horizontal'
    };
  },

  // ── Diagramas representativos das seções ──────────────────────────────────
  // Esquemas em SVG (linha = currentColor, destaque = dourado) com as cotas.
  // O de FORMATO é dinâmico: redesenha com formato/medidas atuais.
  _svgOpen: '<svg viewBox="0 0 240 80" fill="none" stroke="currentColor" stroke-width="1.3" font-size="9">',

  _txt(x, y, t, anchor) {
    return `<text x="${x}" y="${y}" fill="currentColor" stroke="none"${anchor ? ` text-anchor="${anchor}"` : ''}>${t}</text>`;
  },

  _cota(x1, y1, x2, y2, label) {
    // linha de cota com tiques nas pontas + rótulo no meio
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const vert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    const t = 3;
    const ticks = vert
      ? `<line x1="${x1 - t}" y1="${y1}" x2="${x1 + t}" y2="${y1}"/><line x1="${x2 - t}" y1="${y2}" x2="${x2 + t}" y2="${y2}"/>`
      : `<line x1="${x1}" y1="${y1 - t}" x2="${x1}" y2="${y1 + t}"/><line x1="${x2}" y1="${y2 - t}" x2="${x2}" y2="${y2 + t}"/>`;
    const lbl = vert
      ? LuminosoUI._txt(mx + 5, my + 3, label)
      : LuminosoUI._txt(mx, my - 4, label, 'middle');
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` + ticks + lbl;
  },

  diagFormato() {
    const f = LuminosoUI.val('lum_formato');
    const larg = LuminosoUI.num('lum_larg');
    const alt = LuminosoUI.num('lum_alt');
    const raio = LuminosoUI.num('lum_raio');
    let s = LuminosoUI._svgOpen;
    if (f === 'redondo') {
      s += '<circle cx="80" cy="40" r="30"/>';
      s += LuminosoUI._cota(50, 40, 110, 40, `Ø ${larg}`);
    } else if (f === 'quadrado') {
      s += '<rect x="55" y="12" width="56" height="56" rx="2"/>';
      s += LuminosoUI._cota(55, 76, 111, 76, `${larg}`);
      s += LuminosoUI._cota(120, 12, 120, 68, `${larg}`);
    } else {
      const rx = Math.min(18, Math.max(0, raio / Math.max(larg, 1) * 110));
      s += `<rect x="30" y="20" width="110" height="44" rx="${rx}"/>`;
      s += LuminosoUI._cota(30, 74, 140, 74, `L ${larg}`);
      s += LuminosoUI._cota(150, 20, 150, 64, `A ${alt}`);
      if (raio > 0) s += LuminosoUI._txt(180, 30, `r ${raio}`);
    }
    return s + '</svg>';
  },

  // Seta-guia: linha do rótulo até o alvo, com ponta no alvo
  _seta(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / l, uy = dy / l;
    const ax = x2 - ux * 6, ay = y2 - uy * 6;
    const px = -uy * 3, py = ux * 3;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
           `<path d="M ${x2} ${y2} L ${ax + px} ${ay + py} L ${ax - px} ${ay - py} Z" fill="currentColor" stroke="none"/>`;
  },

  diagAcm() {
    const acm = LuminosoUI.num('lum_acm');
    let s = LuminosoUI._svgOpen;
    s += '<rect x="35" y="36" width="110" height="10" fill="#d4af37" fill-opacity="0.25"/>';
    s += LuminosoUI._txt(35, 28, 'chapa ACM');
    s += LuminosoUI._cota(158, 36, 158, 46, `${acm} mm`);
    return s + '</svg>';
  },

  diagCorpo() {
    const arco = LuminosoUI.num('lum_arco_larg');
    const em = LuminosoUI.num('lum_emendas');
    let s = LuminosoUI._svgOpen;
    s += '<rect x="62" y="18" width="148" height="38"/>';                       // arco desenrolado
    s += '<line x1="136" y1="18" x2="136" y2="56" stroke-dasharray="3 3"/>';    // emenda
    // cota da largura (fora, à esquerda, valor legível)
    s += `<line x1="48" y1="18" x2="48" y2="56"/><line x1="44" y1="18" x2="52" y2="18"/><line x1="44" y1="56" x2="52" y2="56"/>`;
    s += LuminosoUI._txt(40, 40, `${arco}`, 'end');
    // seta apontando a linha de emenda
    s += LuminosoUI._seta(136, 74, 136, 60);
    s += LuminosoUI._txt(142, 78, `emendas: ${em}`);
    return s + '</svg>';
  },

  diagTampas() {
    const bf = LuminosoUI.num('lum_borda_face');
    const be = LuminosoUI.num('lum_borda_ext');
    const fol = LuminosoUI.num('lum_folga_tampa');
    let s = LuminosoUI._svgOpen;
    s += '<rect x="118" y="30" width="8" height="52"/>';                                        // parede do arco
    s += '<rect x="102" y="18" width="8" height="44" fill="#d4af37" fill-opacity="0.35"/>';     // borda externa
    s += '<rect x="102" y="10" width="46" height="8" fill="#d4af37" fill-opacity="0.35"/>';     // testa
    // b.face (testa): cota horizontal em cima
    s += `<line x1="102" y1="4" x2="148" y2="4"/><line x1="102" y1="1" x2="102" y2="7"/><line x1="148" y1="1" x2="148" y2="7"/>`;
    s += LuminosoUI._txt(156, 7, `face ${bf}`);
    // b.ext: cota vertical à esquerda
    s += `<line x1="88" y1="18" x2="88" y2="62"/><line x1="84" y1="18" x2="92" y2="18"/><line x1="84" y1="62" x2="92" y2="62"/>`;
    s += LuminosoUI._txt(80, 43, `ext ${be}`, 'end');
    // folga: seta apontando o vão entre borda e arco
    s += LuminosoUI._seta(150, 66, 116, 50);
    s += LuminosoUI._txt(154, 69, `folga ${fol}`);
    return s + '</svg>';
  },

  diagAcr() {
    const esp = LuminosoUI.num('lum_acr_esp');
    const tipo = LuminosoUI.val('lum_acr_tipo');
    let s = LuminosoUI._svgOpen;
    s += '<circle cx="62" cy="45" r="28"/>';
    s += '<circle cx="62" cy="45" r="21" fill="#d4af37" fill-opacity="0.2"/>';
    s += LuminosoUI._seta(118, 22, 78, 32);
    s += LuminosoUI._txt(122, 25, `acrílico ${esp} mm`);
    s += LuminosoUI._txt(122, 40, tipo === 'cristal' ? 'cristal + adesivo' : 'branco leitoso');
    return s + '</svg>';
  },

  diagSuporte() {
    const ext = LuminosoUI.num('lum_braco_ext');
    const m = LuminosoUI.num('lum_metalon');
    const duplo = LuminosoUI.chk('lum_braco_duplo');
    const dist = LuminosoUI.num('lum_braco_dist');
    let s = LuminosoUI._svgOpen;
    if (duplo) {
      // vista de frente: 2 braços espaçados + chapa
      s += '<circle cx="52" cy="42" r="26"/>';
      s += '<rect x="74" y="26" width="88" height="7" fill="#d4af37" fill-opacity="0.35"/>';
      s += '<rect x="74" y="50" width="88" height="7" fill="#d4af37" fill-opacity="0.35"/>';
      s += '<rect x="162" y="16" width="5" height="52"/>';
      s += '<line x1="174" y1="8" x2="174" y2="76" stroke-dasharray="3 3"/>';
      s += `<line x1="186" y1="30" x2="186" y2="53"/><line x1="182" y1="30" x2="190" y2="30"/><line x1="182" y1="53" x2="190" y2="53"/>`;
      s += LuminosoUI._txt(194, 44, `${dist}`);
      s += LuminosoUI._txt(78, 14, `2× metalon ${m}×${m}`);
    } else {
      s += '<circle cx="52" cy="48" r="24"/>';                                                  // luminoso (topo)
      s += '<rect x="74" y="44" width="88" height="8" fill="#d4af37" fill-opacity="0.35"/>';    // braço
      s += '<rect x="162" y="30" width="5" height="36"/>';                                      // chapa parede
      s += '<line x1="174" y1="20" x2="174" y2="76" stroke-dasharray="3 3"/>';                  // parede
      s += LuminosoUI._seta(110, 22, 110, 42);
      s += LuminosoUI._txt(116, 20, `metalon ${m}×${m}`);
      s += `<line x1="78" y1="66" x2="162" y2="66"/><line x1="78" y1="62" x2="78" y2="70"/><line x1="162" y1="62" x2="162" y2="70"/>`;
      s += LuminosoUI._txt(120, 80, `externo ${ext}`, 'middle');
    }
    return s + '</svg>';
  },

  diagCint() {
    const cc = LuminosoUI.num('lum_cint_comp');
    const cil = LuminosoUI.num('lum_cint_larg');
    const cie = LuminosoUI.num('lum_cint_esp');
    let s = LuminosoUI._svgOpen;
    // parede do arco (curva) + chapa dourada acompanhando por dentro + braço
    s += '<path d="M 130 8 A 120 120 0 0 0 130 76"/>';
    s += '<path d="M 122 20 A 104 104 0 0 0 122 64 L 114 62 A 96 96 0 0 1 114 22 Z" fill="#d4af37" fill-opacity="0.35"/>';
    s += '<rect x="30" y="38" width="96" height="8"/>';   // braço atravessando
    s += LuminosoUI._seta(168, 18, 126, 26);
    s += LuminosoUI._txt(172, 21, 'acompanha a curva');
    s += LuminosoUI._seta(168, 44, 128, 42);
    s += LuminosoUI._txt(172, 47, 'braço (furo)');
    s += LuminosoUI._txt(30, 66, `comprimento ${cc > 0 ? cc : 'auto'} · larg ${cil} · esp ${cie}`);
    return s + '</svg>';
  },

  diagCext() {
    const cel = LuminosoUI.num('lum_cext_larg');
    const cea = LuminosoUI.num('lum_cext_alt');
    const cee = LuminosoUI.num('lum_cext_esp');
    let s = LuminosoUI._svgOpen;
    s += '<rect x="70" y="16" width="80" height="46"/>';
    s += '<rect x="102" y="32" width="16" height="14" fill="#d4af37" fill-opacity="0.35"/>'; // ponta do braço
    // cotas
    s += `<line x1="70" y1="70" x2="150" y2="70"/><line x1="70" y1="66" x2="70" y2="74"/><line x1="150" y1="66" x2="150" y2="74"/>`;
    s += LuminosoUI._txt(110, 82, `largura ${cel}`, 'middle');
    s += `<line x1="158" y1="16" x2="158" y2="62"/><line x1="154" y1="16" x2="162" y2="16"/><line x1="154" y1="62" x2="162" y2="62"/>`;
    s += LuminosoUI._txt(164, 42, `altura ${cea}`);
    s += LuminosoUI._seta(40, 20, 68, 24);
    s += LuminosoUI._txt(4, 14, `esp ${cee}`);
    return s + '</svg>';
  },

  // FUNDO (face única): vista de trás — corpo + chapa embutida com folga
  diagFundo() {
    const tipo = LuminosoUI.val('lum_fundo_tipo');
    const fg  = LuminosoUI.num('lum_fundo_folga');
    const esp = LuminosoUI.num('lum_fundo_esp');
    let s = LuminosoUI._svgOpen;
    if (tipo === 'embutido') {
      s += '<circle cx="60" cy="42" r="30"/>';
      s += '<circle cx="60" cy="42" r="24" fill="#d4af37" fill-opacity="0.35"/>';
      s += '<circle cx="60" cy="42" r="24"/>';
      s += LuminosoUI._seta(120, 22, 87, 32);
      s += LuminosoUI._txt(124, 25, `folga ${fg} mm da parede`);
      s += LuminosoUI._txt(124, 40, `espessura ${esp} mm`);
      s += LuminosoUI._txt(124, 55, 'rente à traseira');
    } else {
      s += '<circle cx="60" cy="42" r="30"/>';
      s += '<circle cx="60" cy="42" r="26" fill="#171717" fill-opacity="0.12" stroke="none"/>';
      s += LuminosoUI._seta(120, 30, 88, 38);
      s += LuminosoUI._txt(124, 33, 'tampa ACM cega');
      s += LuminosoUI._txt(124, 48, 'veste o arco');
    }
    return s + '</svg>';
  },

  // BILONGO: desenho real do rasgo — furo + cava (posição sup/inf/central)
  // ou a cruz, sempre com as medidas atuais ao lado.
  diagBilongo() {
    const tipo = LuminosoUI.val('lum_bilongo_tipo');
    const larg = LuminosoUI.num('lum_bilongo_larg');
    let s = LuminosoUI._svgOpen;
    const cx = 60, cy = 42;
    if (tipo === 'cruz') {
      const w = LuminosoUI.num('lum_cruz_w'), h = LuminosoUI.num('lum_cruz_h');
      const sc = 48 / Math.max(w, h, 1);
      const hw = w * sc / 2, hh = h * sc / 2;
      const t = Math.max(1.5, Math.min(larg * sc / 2, hw - 1, hh - 1));
      const pts = [[t, t], [t, hh], [-t, hh], [-t, t], [-hw, t], [-hw, -t], [-t, -t], [-t, -hh], [t, -hh], [t, -t], [hw, -t], [hw, t]]
        .map(([x, y]) => `${(cx + x).toFixed(1)},${(cy - y).toFixed(1)}`).join(' ');
      s += `<polygon points="${pts}" fill="#d4af37" fill-opacity="0.55"/>`;
      s += LuminosoUI._seta(120, 25, cx + hw + 3, cy - 4);
      s += LuminosoUI._txt(124, 28, `${w} × ${h} mm`);
      s += LuminosoUI._txt(124, 43, `cava ${larg} mm`);
    } else {
      const fd = LuminosoUI.num('lum_bilongo_furo');
      const comp = LuminosoUI.num('lum_bilongo_comp');
      const pos = LuminosoUI.val('lum_bilongo_pos');
      const sc = 52 / Math.max(comp, fd, 1);
      const rf = Math.max(3, fd * sc / 2);
      const rc = Math.max(1.5, Math.min(larg * sc / 2, rf - 1));
      const half = comp * sc / 2;
      let holeY, slotY0, slotY1;
      if (pos === 'superior') { holeY = cy - half + rf; slotY0 = holeY; slotY1 = cy + half - rc; }
      else if (pos === 'inferior') { holeY = cy + half - rf; slotY0 = cy - half + rc; slotY1 = holeY; }
      else { holeY = cy; slotY0 = cy - half + rc; slotY1 = cy + half - rc; }
      s += `<rect x="${(cx - rc).toFixed(1)}" y="${Math.min(slotY0, slotY1).toFixed(1)}" width="${(rc * 2).toFixed(1)}" height="${Math.abs(slotY1 - slotY0).toFixed(1)}" rx="${rc.toFixed(1)}" fill="#d4af37" fill-opacity="0.55" stroke="none"/>`;
      s += `<circle cx="${cx}" cy="${holeY.toFixed(1)}" r="${rf.toFixed(1)}" fill="#d4af37" fill-opacity="0.75" stroke="none"/>`;
      s += `<circle cx="${cx}" cy="${holeY.toFixed(1)}" r="${rf.toFixed(1)}"/>`;
      s += LuminosoUI._seta(120, 22, cx + rf + 3, holeY);
      s += LuminosoUI._txt(124, 25, `furo Ø ${fd} mm`);
      s += LuminosoUI._txt(124, 40, `rasgo ${comp} mm`);
      s += LuminosoUI._txt(124, 55, `cava ${larg} mm`);
    }
    return s + '</svg>';
  },

  diagPBorda() {
    const qtd = Math.max(0, Math.min(24, LuminosoUI.num('lum_pb_qtd')));
    const db = LuminosoUI.num('lum_paraf_d_borda');
    let s = LuminosoUI._svgOpen;
    s += '<circle cx="70" cy="42" r="30"/>';
    s += '<circle cx="70" cy="42" r="23"/>';
    for (let i = 0; i < qtd; i++) {
      const a = (Math.PI * 2 * i) / Math.max(qtd, 1);
      s += `<circle cx="${70 + 26.5 * Math.cos(a)}" cy="${42 + 26.5 * Math.sin(a)}" r="3" fill="#d4af37" stroke="none"/>`;
    }
    s += LuminosoUI._seta(130, 22, 96, 30);
    s += LuminosoUI._txt(134, 25, `${qtd}× na borda`);
    s += LuminosoUI._txt(134, 40, `Ø ${db} mm`);
    return s + '</svg>';
  },

  // Mesma grade do Ruby (grade_parafusos): 2 linhas/colunas conforme a
  // orientação, cantos primeiro, ímpar centraliza o último.
  _grade(pu, pv, qtd, orient) {
    if (qtd <= 0) return [];
    if (qtd === 1) return [[0, 0]];
    const pts = [];
    if (orient === 'vertical') {
      const rows = Math.ceil(qtd / 2);
      for (let i = 0; i < qtd; i++) {
        const row = Math.floor(i / 2);
        let col = i % 2 === 0 ? -1 : 1;
        if (i === qtd - 1 && qtd % 2 === 1) col = 0;
        const v = rows === 1 ? 0 : -pv / 2 + (pv * row) / (rows - 1);
        pts.push([col * pu / 2, v]);
      }
    } else {
      const cols = Math.ceil(qtd / 2);
      for (let i = 0; i < qtd; i++) {
        const colIdx = Math.floor(i / 2);
        let row = i % 2 === 0 ? -1 : 1;
        if (i === qtd - 1 && qtd % 2 === 1) row = 0;
        const u = cols === 1 ? 0 : -pu / 2 + (pu * colIdx) / (cols - 1);
        pts.push([u, row * pv / 2]);
      }
    }
    return pts;
  },

  diagPChapas() {
    const qtd = Math.max(0, Math.min(16, LuminosoUI.num('lum_pce_qtd')));
    const pci = LuminosoUI.num('lum_pci_qtd');
    const dc = LuminosoUI.num('lum_paraf_d_chapa');
    const lat = LuminosoUI.num('lum_paraf_dist_lat');
    const tb = LuminosoUI.num('lum_paraf_dist_tb');
    const orient = LuminosoUI.val('lum_paraf_orient');
    let s = LuminosoUI._svgOpen;
    s += '<rect x="60" y="14" width="120" height="54"/>';
    const pu = 120 - 2 * 18, pv = 54 - 2 * 12;
    const pts = LuminosoUI._grade(pu, pv, qtd, orient);
    pts.forEach(pt => {
      s += `<circle cx="${120 + pt[0]}" cy="${41 + pt[1]}" r="3.5" fill="#d4af37" stroke="none"/>`;
    });
    if (pts.length) {
      // cotas nas bordas usando o primeiro parafuso (canto sup. esquerdo)
      let minx = 999, miny = 999;
      pts.forEach(pt => { minx = Math.min(minx, 120 + pt[0]); miny = Math.min(miny, 41 + pt[1]); });
      s += `<line x1="60" y1="${miny}" x2="${minx}" y2="${miny}"/><line x1="60" y1="${miny - 4}" x2="60" y2="${miny + 4}"/><line x1="${minx}" y1="${miny - 4}" x2="${minx}" y2="${miny + 4}"/>`;
      s += LuminosoUI._txt(54, miny + 3, `lat ${lat}`, 'end');
      s += `<line x1="${minx}" y1="14" x2="${minx}" y2="${miny}"/><line x1="${minx - 4}" y1="14" x2="${minx + 4}" y2="14"/><line x1="${minx - 4}" y1="${miny}" x2="${minx + 4}" y2="${miny}"/>`;
      s += LuminosoUI._txt(minx, 10, `topo ${tb}`, 'middle');
    }
    s += LuminosoUI._txt(186, 30, `parede: ${qtd}×`);
    s += LuminosoUI._txt(186, 44, `interna: ${pci}×`);
    s += LuminosoUI._txt(186, 58, `Ø ${dc}`);
    return s + '</svg>';
  },

  renderDiagrams() {
    const put = (id, svg) => { const el = document.getElementById(id); if (el) el.innerHTML = svg; };
    put('lum_diag_formato', LuminosoUI.diagFormato());
    put('lum_diag_acm', LuminosoUI.diagAcm());
    put('lum_diag_corpo', LuminosoUI.diagCorpo());
    put('lum_diag_tampas', LuminosoUI.diagTampas());
    put('lum_diag_acr', LuminosoUI.diagAcr());
    put('lum_diag_fundo', LuminosoUI.diagFundo());
    put('lum_diag_bilongo', LuminosoUI.diagBilongo());
    put('lum_diag_suporte', LuminosoUI.diagSuporte());
    put('lum_diag_cint', LuminosoUI.diagCint());
    put('lum_diag_cext', LuminosoUI.diagCext());
    put('lum_diag_pborda', LuminosoUI.diagPBorda());
    put('lum_diag_pchapas', LuminosoUI.diagPChapas());
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MATERIAIS & CORTE — planificação, estimativa de chapa e SVG
  // ══════════════════════════════════════════════════════════════════════════

  _per(f, w, h, r) {
    if (f === 'redondo') return Math.PI * w;
    if (f === 'quadrado') h = w;
    if (r > 0) return 2 * (w + h) - 8 * r + 2 * Math.PI * r;
    return 2 * (w + h);
  },

  // Todas as peças planificadas, agrupadas por material. Dimensões em mm.
  computeMaterials() {
    const P = LuminosoUI.coletarParams();
    const f = P.formato;
    const w = P.larg;
    const h = f === 'retangular' ? P.alt : w;
    const r = f === 'redondo' ? 0 : P.raio;
    const tw = w + 2 * (P.folga_tampa + P.acm);
    const th = h + 2 * (P.folga_tampa + P.acm);
    const trr = r > 0 ? r + P.folga_tampa + P.acm : 0;
    const N = Math.max(1, Math.round(P.emendas));
    const Pc = LuminosoUI._per(f, w, h, r);
    const Pt = LuminosoUI._per(f, tw, th, trr);
    const rd = v => Math.round(v);

    const g = { acm: [], acr: [], met: [], chapa: [] };

    // ACM — arco (cor do arco), desenrolado e dividido pelas emendas
    for (let i = 0; i < N; i++) {
      g.acm.push({ kind: 'rect', w: rd(Pc / N), h: rd(P.arco_larg), label: LuminosoUI.t('pArco'), cor: P.cor_arco_nome });
    }
    // ACM — bordas externas das 2 tampas (cor da borda)
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < N; i++) {
        g.acm.push({ kind: 'rect', w: rd(Pt / N), h: rd(P.borda_ext), label: LuminosoUI.t('pBordaExt'), cor: P.cor_borda_nome });
      }
    }
    // ACM — testas (anel com abertura); face única troca a de trás por fundo cego
    const nTestas = P.dupla ? 2 : 1;
    for (let t = 0; t < nTestas; t++) {
      g.acm.push({
        kind: 'ring', f: f, w: rd(tw), h: rd(th), r: trr,
        iw: rd(tw - 2 * P.borda_face), ih: rd(th - 2 * P.borda_face),
        ir: trr > P.borda_face ? trr - P.borda_face : 0,
        label: LuminosoUI.t('pTesta'), cor: P.cor_borda_nome
      });
    }
    if (!P.dupla) {
      g.acm.push({ kind: 'plate', f: f, w: rd(tw), h: rd(th), r: trr, label: LuminosoUI.t('pFundo'), cor: P.cor_borda_nome });
    }

    // Acrílico
    const nAcr = P.dupla ? 2 : 1;
    for (let t = 0; t < nAcr; t++) {
      g.acr.push({ kind: 'plate', f: f, w: rd(w), h: rd(h), r: r, label: LuminosoUI.t('pAcr') + ` ${P.acr_esp}mm` });
    }

    // Metalon (braço simples ou duplo)
    if (P.braco) {
      const len = rd(w / 2 - P.acm - P.cint_esp + tw / 2 + P.braco_ext);
      const nBracos = P.braco_duplo ? 2 : 1;
      for (let t = 0; t < nBracos; t++) {
        g.met.push({ kind: 'rect', w: len, h: P.metalon, label: `${LuminosoUI.t('pBraco')} ${P.metalon}×${P.metalon}`, len: len });
      }
    }

    // Chapas metálicas (parede/internas conforme o modo do braço duplo)
    const cintComp = P.cint_comp > 0 ? P.cint_comp : 150;
    if (P.braco) {
      if (P.braco_duplo && P.chapa_modo !== 'duas') {
        g.chapa.push({ kind: 'rect', w: rd(P.cext_larg), h: rd(P.braco_dist + P.cext_alt), label: `${LuminosoUI.t('pCParede')} e${P.cext_esp}` });
        const compEf = Math.max(cintComp, P.braco_dist + 150);
        for (let t = 0; t < 2; t++) {
          g.chapa.push({ kind: 'rect', w: rd(compEf), h: rd(P.cint_larg), label: `${LuminosoUI.t('pCInterna')} e${P.cint_esp}` });
        }
      } else {
        const nPl = P.braco_duplo ? 2 : 1;
        for (let t = 0; t < nPl; t++) {
          g.chapa.push({ kind: 'rect', w: rd(P.cext_larg), h: rd(P.cext_alt), label: `${LuminosoUI.t('pCParede')} e${P.cext_esp}` });
        }
        const nCint = P.braco_duplo ? 4 : 2;
        for (let t = 0; t < nCint; t++) {
          g.chapa.push({ kind: 'rect', w: rd(cintComp), h: rd(P.cint_larg), label: `${LuminosoUI.t('pCInterna')} e${P.cint_esp}` });
        }
      }
    } else {
      g.chapa.push({ kind: 'rect', w: rd(cintComp), h: rd(P.cint_larg), label: `${LuminosoUI.t('pCInterna')} e${P.cint_esp}` });
    }
    return g;
  },

  // Empacotamento por prateleiras (shelf) em chapas SW×SH, com rotação 90°
  _pack(pieces, SW, SH, gap) {
    gap = gap || 15;
    const sheets = [];
    const place = (sh, pc) => {
      const fits = (bw, bh) => {
        for (const shelf of sh.shelves) {
          if (shelf.x + bw <= SW && bh <= shelf.h && shelf.y + shelf.h <= SH) return shelf;
        }
        return null;
      };
      for (const [bw, bh, rot] of [[pc.w, pc.h, false], [pc.h, pc.w, true]]) {
        let shelf = fits(bw + gap, bh);
        if (!shelf) {
          const yNext = sh.shelves.length ? sh.shelves[sh.shelves.length - 1].y + sh.shelves[sh.shelves.length - 1].h + gap : gap;
          if (yNext + bh <= SH && bw + 2 * gap <= SW) {
            shelf = { y: yNext, h: bh, x: gap };
            sh.shelves.push(shelf);
          }
        }
        if (shelf) {
          sh.placed.push({ pc: pc, x: shelf.x, y: shelf.y, w: bw, h: bh, rot: rot });
          shelf.x += bw + gap;
          shelf.h = Math.max(shelf.h, bh);
          return true;
        }
      }
      return false;
    };
    const sorted = pieces.slice().sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
    sorted.forEach(pc => {
      let ok = false;
      for (const sh of sheets) { if (place(sh, pc)) { ok = true; break; } }
      if (!ok) {
        const sh = { shelves: [], placed: [] };
        sheets.push(sh);
        if (!place(sh, pc)) sh.placed.push({ pc: pc, x: 15, y: 15, w: pc.w, h: pc.h, rot: false, oversize: true });
      }
    });
    return sheets;
  },

  renderMats() {
    const g = LuminosoUI.computeMaterials();
    const SW = LuminosoUI.num('lum_chapa_comp') || 5000;
    const SH = LuminosoUI.num('lum_chapa_larg') || 1220;
    const el = document.getElementById('lum_mats_list');
    const m2 = mm2 => (mm2 / 1e6).toFixed(2);
    let html = '';

    const grupo = (titulo, linhas, total, prev) => {
      let s = `<div class="lum__mats-group"><div class="lum__mats-title">${titulo}</div>`;
      linhas.forEach(l => { s += `<div class="lum__mats-line"><span>${l[0]}</span><span>${l[1]}</span></div>`; });
      if (total) s += `<div class="lum__mats-total">${total}</div>`;
      if (prev && prev.svg) {
        s += `<div class="lum__mats-prev">${prev.svg}</div>`;
        s += `<div class="lum__mats-leg">${prev.leg.map(t => `<div>${t}</div>`).join('')}</div>`;
        s += `<div class="lum__mats-hint">${LuminosoUI.t('prevHint')}</div>`;
      }
      return s + '</div>';
    };

    // ACM por cor (com estimativa de chapas + preview 2D da disposição)
    const porCor = {};
    g.acm.forEach(pc => { (porCor[pc.cor] = porCor[pc.cor] || []).push(pc); });
    Object.keys(porCor).forEach(cor => {
      const pcs = porCor[cor];
      const linhas = pcs.map(pc => [`${pc.label}`, `${pc.w} × ${pc.h} mm`]);
      const area = pcs.reduce((a, pc) => a + pc.w * pc.h, 0);
      const nChapas = LuminosoUI._pack(pcs, SW, SH).length;
      html += grupo(`ACM — ${cor}`, linhas,
        `${LuminosoUI.t('listArea')}: ${m2(area)} m² · ${nChapas}× ${LuminosoUI.t('listChapa')} ${SW}×${SH}`,
        LuminosoUI._prevSvg(pcs, SW, SH));
    });

    // Acrílico
    if (g.acr.length) {
      const area = g.acr.reduce((a, pc) => a + pc.w * pc.h, 0);
      html += grupo('ACRÍLICO', g.acr.map(pc => [pc.label, `${pc.w} × ${pc.h} mm`]),
        `${LuminosoUI.t('listArea')}: ${m2(area)} m²`,
        LuminosoUI._prevSvg(g.acr, SW, SH));
    }
    // Metalon
    if (g.met.length) {
      const len = g.met.reduce((a, pc) => a + (pc.len || pc.w), 0);
      html += grupo('METALON', g.met.map(pc => [pc.label, `${pc.w} mm`]),
        `${LuminosoUI.t('listComp')}: ${(len / 1000).toFixed(2)} m`);
    }
    // Chapas metálicas
    if (g.chapa.length) {
      html += grupo(LuminosoUI.t('listChapasMet'), g.chapa.map(pc => [pc.label, `${pc.w} × ${pc.h} mm`]), null,
        LuminosoUI._prevSvg(g.chapa, SW, SH));
    }
    el.innerHTML = html;
    LuminosoUI._bindPanZoom(el);
  },

  // ── Paths (o anel sai VAZADO de verdade via fill-rule evenodd) ──────────
  _pathCircle(cx, cy, r) {
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  },

  _pathRRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, Math.min(w, h) / 2));
    if (r <= 0) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
    return `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
  },

  _pathForma(pc, w, h, r, ox, oy) {
    if (pc.f === 'redondo') return LuminosoUI._pathCircle(ox + w / 2, oy + w / 2, w / 2);
    return LuminosoUI._pathRRect(ox, oy, w, h, r);
  },

  // Desenha uma peça. prev = estilo preview (dourado); senão estilo corte
  // (vermelho 0.1mm). num = número da peça (a legenda fica FORA, sem sobrepor).
  _svgShape(pc, x, y, prev, num) {
    const stroke = prev
      ? 'stroke="currentColor" stroke-width="4"'
      : 'stroke="#ff0000" stroke-width="0.1"';
    const fillGold = prev ? 'fill="#d4af37" fill-opacity="0.3"' : 'fill="none"';
    let s = '';
    let labelY = y + pc.h / 2; // onde escrever o número

    if (pc.kind === 'rect') {
      s += `<rect x="${x}" y="${y}" width="${pc.w}" height="${pc.h}" ${fillGold} ${stroke}/>`;
    } else if (pc.kind === 'plate') {
      s += `<path d="${LuminosoUI._pathForma(pc, pc.w, pc.h, pc.r, x, y)}" ${fillGold} ${stroke}/>`;
    } else if (pc.kind === 'ring') {
      // anel VAZADO: contorno externo + interno num path só (evenodd)
      const off = (pc.w - pc.iw) / 2, offv = (pc.h - pc.ih) / 2;
      const dOut = LuminosoUI._pathForma(pc, pc.w, pc.h, pc.r, x, y);
      const dIn = pc.f === 'redondo'
        ? LuminosoUI._pathCircle(x + pc.w / 2, y + pc.w / 2, pc.iw / 2)
        : LuminosoUI._pathRRect(x + off, y + offv, pc.iw, pc.ih, pc.ir);
      if (prev) {
        s += `<path d="${dOut} ${dIn}" fill-rule="evenodd" ${fillGold} ${stroke}/>`;
      } else {
        s += `<path d="${dOut}" fill="none" ${stroke}/><path d="${dIn}" fill="none" ${stroke}/>`;
      }
      labelY = y + (pc.h - pc.ih) / 4; // número na faixa de cima do anel
    }

    // No PREVIEW a identificação vai FORA da peça (chamada com seta, feita
    // pelo _layout); número dentro da peça só no SVG de corte.
    if (num !== undefined && !prev) {
      const banda = pc.kind === 'ring' ? (pc.h - pc.ih) / 2 : Math.min(pc.w, pc.h);
      const fs = Math.max(20, Math.min(40, banda * 0.6));
      s += `<text x="${x + pc.w / 2}" y="${labelY + fs * 0.35}" fill="#0000ff" stroke="none" font-size="${fs}" font-family="monospace" text-anchor="middle">${num}</text>`;
    }
    return s;
  },

  // Seta genérica (tamanho configurável — os previews usam viewBox em mm)
  _setaN(x1, y1, x2, y2, size) {
    const dx = x2 - x1, dy = y2 - y1;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const ax = x2 - ux * size, ay = y2 - uy * size;
    const px = -uy * size / 2, py = ux * size / 2;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="5"/>` +
           `<path d="M ${x2} ${y2} L ${ax + px} ${ay + py} L ${ax - px} ${ay - py} Z" fill="currentColor" stroke="none"/>`;
  },

  // Layout comum: chapas + peças numeradas. Retorna { body, H, leg }.
  // oy0 desloca tudo em Y com coordenadas ABSOLUTAS (sem <g transform> —
  // o Corel importa grupos como objetos travados/agrupados).
  _layout(pieces, comGuia, SW, SH, prev, oy0) {
    oy0 = oy0 || 0;
    const sheets = LuminosoUI._pack(pieces, SW, SH);
    const GAP = 100;
    const H = sheets.length * (SH + GAP) - (sheets.length ? GAP : 0);
    const leg = [];
    let body = '';
    let n = 0;
    const guiaStroke = prev
      ? 'stroke="currentColor" stroke-width="4" opacity="0.5"'
      : 'stroke="#00aa00" stroke-width="0.2"';
    sheets.forEach((sh, i) => {
      const oy = oy0 + i * (SH + GAP);
      if (comGuia || prev) body += `<rect x="0" y="${oy}" width="${SW}" height="${SH}" fill="none" ${guiaStroke} stroke-dasharray="20 20"/>`;
      const entradas = [];
      sh.placed.forEach(pl => {
        n++;
        const pc = pl.rot ? Object.assign({}, pl.pc, { w: pl.pc.h, h: pl.pc.w }) : pl.pc;
        body += LuminosoUI._svgShape(pc, pl.x, oy + pl.y, prev, n);
        entradas.push({ n: n, pc: pc, x: pl.x, y: oy + pl.y });
        leg.push(`${n}. ${pl.pc.label} — ${pl.pc.w}×${pl.pc.h} mm${pl.rot ? ' (girada)' : ''}`);
      });
      if (prev) body += LuminosoUI._callouts(entradas);
    });
    return { body: body, H: H, leg: leg };
  },

  // Etiquetas inteligentes: DENTRO da peça quando cabe (anel = no furo);
  // senão ao lado com seta CURTA, desviando de peças e de outras etiquetas.
  _callouts(entradas) {
    const fs = 50;
    let s = '';
    const occ = entradas.map(en => ({ x: en.x, y: en.y, w: en.pc.w, h: en.pc.h }));
    const labels = [];
    const rectFor = (cx, cy, tw) => ({ x: cx - tw / 2, y: cy - fs * 0.7, w: tw, h: fs * 1.4 });
    const hit = (r, list) => list.some(o =>
      r.x < o.x + o.w + 18 && r.x + r.w > o.x - 18 && r.y < o.y + o.h + 18 && r.y + r.h > o.y - 18);

    entradas.forEach(en => {
      const txt = `${en.n} · ${en.pc.w}×${en.pc.h}`;
      const tw = txt.length * fs * 0.62;
      const px = en.x, py = en.y, pw = en.pc.w, ph = en.pc.h;
      const cx = px + pw / 2, cy = py + ph / 2;
      let pos = null, dentro = false;

      // 1º: dentro da peça (anel usa o furo central, que é vazio)
      const cabe = en.pc.kind === 'ring'
        ? tw < (en.pc.iw || pw) * 0.9
        : (tw < pw * 0.9 && fs * 1.6 < ph * 0.9);
      if (cabe) {
        const r = rectFor(cx, cy, tw);
        if (!hit(r, labels)) { pos = [cx, cy]; dentro = true; labels.push(r); }
      }

      // 2º: ao lado (baixo, cima, direita, esquerda, depois baixo escalonado)
      if (!pos) {
        const cands = [
          [cx, py + ph + 55], [cx, py - 40],
          [px + pw + tw / 2 + 40, cy], [px - tw / 2 - 40, cy]
        ];
        for (let k = 1; k <= 6; k++) cands.push([cx, py + ph + 55 + k * 78]);
        for (const c of cands) {
          const r = rectFor(c[0], c[1], tw);
          if (!hit(r, occ) && !hit(r, labels)) { pos = c; labels.push(r); break; }
        }
        if (!pos) { pos = [cx, py + ph + 55]; labels.push(rectFor(pos[0], pos[1], tw)); }
      }

      s += `<text x="${pos[0]}" y="${pos[1] + fs * 0.35}" fill="currentColor" stroke="none" font-size="${fs}" font-family="monospace" text-anchor="middle">${txt}</text>`;
      if (!dentro) {
        // seta curta: da etiqueta até o ponto mais próximo da borda da peça
        const tx = Math.max(px, Math.min(pos[0], px + pw));
        const ty = Math.max(py, Math.min(pos[1], py + ph));
        const sy = pos[1] < cy ? pos[1] + fs * 0.55 : pos[1] - fs * 0.75;
        s += LuminosoUI._setaN(pos[0], sy, tx, ty, 22);
      }
    });
    return s;
  },

  // Preview 2D interativo (zoom no scroll + pan arrastando)
  _prevSvg(pieces, SW, SH) {
    const L = LuminosoUI._layout(pieces, true, SW, SH, true);
    if (!L.body) return { svg: '', leg: [] };
    const svg = `<svg class="lum__prev-svg" viewBox="-60 -80 ${SW + 120} ${L.H + 620}" fill="none" font-family="monospace">${L.body}</svg>`;
    return { svg: svg, leg: L.leg };
  },

  // SVG de CORTE: peças numeradas + legenda escrita ABAIXO das chapas
  _svgDoc(pieces, comGuia, SW, SH) {
    const L = LuminosoUI._layout(pieces, comGuia, SW, SH, false);
    const legLine = 34;
    const legH = L.leg.length * legLine + 40;
    const H = L.H + legH;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${SW}mm" height="${H}mm" viewBox="0 0 ${SW} ${H}">`;
    s += L.body;
    L.leg.forEach((t, i) => {
      s += `<text x="10" y="${L.H + 40 + i * legLine}" fill="#0000ff" font-size="24" font-family="monospace">${t}</text>`;
    });
    return s + '</svg>';
  },

  // Pan (arrastar) + zoom (scroll) nos previews renderizados
  _bindPanZoom(container) {
    container.querySelectorAll('.lum__prev-svg').forEach(svg => {
      const vb0 = svg.getAttribute('viewBox').split(' ').map(Number);
      let vb = vb0.slice();
      const apply = () => svg.setAttribute('viewBox', vb.join(' '));
      svg.style.cursor = 'grab';

      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const k = e.deltaY > 0 ? 1.25 : 0.8;
        const rect = svg.getBoundingClientRect();
        const mx = vb[0] + ((e.clientX - rect.left) / rect.width) * vb[2];
        const my = vb[1] + ((e.clientY - rect.top) / rect.height) * vb[3];
        vb = [mx - (mx - vb[0]) * k, my - (my - vb[1]) * k, vb[2] * k, vb[3] * k];
        apply();
      }, { passive: false });

      let drag = null;
      svg.addEventListener('mousedown', e => {
        drag = { x: e.clientX, y: e.clientY, vb: vb.slice() };
        svg.style.cursor = 'grabbing';
        e.preventDefault();
      });
      svg.addEventListener('mousemove', e => {
        if (!drag) return;
        const rect = svg.getBoundingClientRect();
        vb[0] = drag.vb[0] - ((e.clientX - drag.x) / rect.width) * vb[2];
        vb[1] = drag.vb[1] - ((e.clientY - drag.y) / rect.height) * vb[3];
        apply();
      });
      ['mouseup', 'mouseleave'].forEach(ev => svg.addEventListener(ev, () => {
        drag = null;
        svg.style.cursor = 'grab';
      }));
      // duplo-clique = volta ao enquadramento inicial
      svg.addEventListener('dblclick', () => { vb = vb0.slice(); apply(); });
    });
  },

  // Grupos de material na ordem do documento (ACM por cor primeiro)
  _gruposMateriais() {
    const g = LuminosoUI.computeMaterials();
    const grupos = [];
    const porCor = {};
    g.acm.forEach(pc => { (porCor[pc.cor] = porCor[pc.cor] || []).push(pc); });
    Object.keys(porCor).forEach(cor => grupos.push({ titulo: `ACM — ${cor}`, pecas: porCor[cor], guia: true }));
    if (g.acr.length) grupos.push({ titulo: 'ACRÍLICO', pecas: g.acr, guia: false });
    if (g.met.length) grupos.push({ titulo: 'METALON', pecas: g.met, guia: false });
    if (g.chapa.length) grupos.push({ titulo: LuminosoUI.t('listChapasMet'), pecas: g.chapa, guia: false });
    return grupos;
  },

  // SVG ÚNICO do projeto: cada material numa seção empilhada com título e
  // legenda — importa tudo organizado, nada montado um sobre o outro.
  _svgProjeto(SW, SH) {
    const grupos = LuminosoUI._gruposMateriais();
    const GAP_SEC = 200;
    const legLine = 34;
    let body = '';
    let y = 0;
    grupos.forEach(gr => {
      body += `<text x="0" y="${y + 50}" fill="#0000ff" font-size="44" font-family="monospace" font-weight="bold">${gr.titulo}</text>`;
      // SEM <g transform>: coordenadas absolutas — no Corel tudo chega como
      // curvas soltas e editáveis, nada agrupado/travado
      const L = LuminosoUI._layout(gr.pecas, gr.guia, SW, SH, false, y + 80);
      body += L.body;
      let ly = y + 80 + L.H + 40;
      L.leg.forEach((t, i) => {
        body += `<text x="10" y="${ly + i * legLine}" fill="#0000ff" font-size="24" font-family="monospace">${t}</text>`;
      });
      y = ly + L.leg.length * legLine + GAP_SEC;
    });
    const H = Math.max(y, 100);
    return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${SW}mm" height="${H}mm" viewBox="0 0 ${SW} ${H}">${body}</svg>`;
  },

  async _salvarCorte(conteudo, ext) {
    try {
      // 10 min: o Ruby fica parado no savepanel esperando o usuário escolher
      const r = await Bridge.call('luminoso_salvar_svg', {
        name: 'luminoso_projeto',
        ext: ext,
        content: btoa(unescape(encodeURIComponent(conteudo)))
      }, 600000);
      if (r.ok) LuminosoUI.setMsg(LuminosoUI.t('msgSvgOk') + r.path, 'ok');
      else if (r.code !== 'user_cancelled') LuminosoUI.setMsg(LuminosoUI.t('msgError') + (r.error || '?'), 'error');
    } catch (e) {
      LuminosoUI.setMsg(LuminosoUI.t('msgError') + e.message, 'error');
    }
  },

  async exportSvgProjeto() {
    const SW = LuminosoUI.num('lum_chapa_comp') || 5000;
    const SH = LuminosoUI.num('lum_chapa_larg') || 1220;
    await LuminosoUI._salvarCorte(LuminosoUI._svgProjeto(SW, SH), 'svg');
  },

  async exportDxfProjeto() {
    const SW = LuminosoUI.num('lum_chapa_comp') || 5000;
    const SH = LuminosoUI.num('lum_chapa_larg') || 1220;
    await LuminosoUI._salvarCorte(LuminosoUI._dxfProjeto(SW, SH), 'dxf');
  },

  // ── DXF R12 do projeto (Corel/CAM importam como curvas soltas, em mm) ────
  // Camadas: CORTE (vermelho), GRAVACAO (azul), GUIA (verde). Y invertido
  // (DXF cresce pra cima).
  _dxfProjeto(SW, SH) {
    const ents = [];
    const Y = v => (-v).toFixed(3);
    const ascii = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/×/g, 'x').replace(/[^\x20-\x7E]/g, '');

    const poly = (pts, layer, cor) => {
      let s = `0\nPOLYLINE\n8\n${layer}\n62\n${cor}\n66\n1\n70\n1\n`;
      pts.forEach(p => { s += `0\nVERTEX\n8\n${layer}\n10\n${p[0].toFixed(3)}\n20\n${Y(p[1])}\n`; });
      ents.push(s + '0\nSEQEND\n');
    };
    const circle = (cx, cy, r, layer, cor) =>
      ents.push(`0\nCIRCLE\n8\n${layer}\n62\n${cor}\n10\n${cx.toFixed(3)}\n20\n${Y(cy)}\n40\n${r.toFixed(3)}\n`);
    const text = (x, y, h, t, cor) =>
      ents.push(`0\nTEXT\n8\nGRAVACAO\n62\n${cor}\n10\n${x.toFixed(3)}\n20\n${Y(y)}\n40\n${h}\n1\n${ascii(t)}\n`);

    const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const rrectPts = (x, y, w, h, r) => {
      if (!r || r <= 0) return rectPts(x, y, w, h);
      r = Math.min(r, Math.min(w, h) / 2);
      const pts = [], n = 8;
      const cantos = [
        [x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0],
        [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]
      ];
      cantos.forEach(c => {
        for (let k = 0; k <= n; k++) {
          const a = c[2] + (Math.PI / 2) * k / n;
          pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
        }
      });
      return pts;
    };
    const shape = (pc, x, y) => {
      if (pc.kind === 'rect') {
        poly(rectPts(x, y, pc.w, pc.h), 'CORTE', 1);
      } else if (pc.kind === 'plate') {
        if (pc.f === 'redondo') circle(x + pc.w / 2, y + pc.w / 2, pc.w / 2, 'CORTE', 1);
        else poly(rrectPts(x, y, pc.w, pc.h, pc.r), 'CORTE', 1);
      } else {
        const off = (pc.w - pc.iw) / 2, offv = (pc.h - pc.ih) / 2;
        if (pc.f === 'redondo') {
          circle(x + pc.w / 2, y + pc.w / 2, pc.w / 2, 'CORTE', 1);
          circle(x + pc.w / 2, y + pc.w / 2, pc.iw / 2, 'CORTE', 1);
        } else {
          poly(rrectPts(x, y, pc.w, pc.h, pc.r), 'CORTE', 1);
          poly(rrectPts(x + off, y + offv, pc.iw, pc.ih, pc.ir), 'CORTE', 1);
        }
      }
    };

    let y0 = 0;
    LuminosoUI._gruposMateriais().forEach(gr => {
      text(0, y0 + 50, 34, gr.titulo, 5);
      const base = y0 + 80;
      const sheets = LuminosoUI._pack(gr.pecas, SW, SH);
      const GAP = 100;
      let n = 0;
      const leg = [];
      sheets.forEach((sh, i) => {
        const oy = base + i * (SH + GAP);
        if (gr.guia) poly(rectPts(0, oy, SW, SH), 'GUIA', 3);
        sh.placed.forEach(pl => {
          n++;
          const pc = pl.rot ? Object.assign({}, pl.pc, { w: pl.pc.h, h: pl.pc.w }) : pl.pc;
          shape(pc, pl.x, oy + pl.y);
          const ly = pc.kind === 'ring' ? oy + pl.y + (pc.h - pc.ih) / 4 : oy + pl.y + pc.h / 2;
          text(pl.x + pc.w / 2 - 8, ly + 8, 24, String(n), 5);
          leg.push(`${n}. ${pl.pc.label} - ${pl.pc.w}x${pl.pc.h} mm${pl.rot ? ' (girada)' : ''}`);
        });
      });
      const hSheets = sheets.length * (SH + GAP) - (sheets.length ? GAP : 0);
      let ly = base + hSheets + 60;
      leg.forEach((t, i) => text(10, ly + i * 34, 20, t, 5));
      y0 = ly + leg.length * 34 + 200;
    });

    // HEADER declara MILÍMETROS ($INSUNITS 4) — importa 1:1 no Corel/CAM
    const header = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n`;
    return `${header}0\nSECTION\n2\nENTITIES\n${ents.join('')}0\nENDSEC\n0\nEOF\n`;
  },

  // ── Plano de Corte (HTML A4 → imprimir em PDF), padrão da casa ──────────
  async gerarPlano() {
    let empresa = {};
    try {
      const r = await Bridge.call('luminoso_empresa');
      if (r && r.ok) empresa = r.empresa || {};
    } catch (e) { console.warn('luminoso_empresa falhou:', e); }

    // vistas do luminoso gerado (precisa ter um em edição/gerado)
    let vistas = {};
    if (LuminosoUI.state.editingId) {
      try {
        const s = await Bridge.call('luminoso_snapshots', { entity_id: LuminosoUI.state.editingId }, 120000);
        if (s && s.ok) vistas = s.vistas || {};
      } catch (e) { console.warn('luminoso_snapshots falhou:', e); }
      if (!Object.keys(vistas).length) {
        LuminosoUI.setMsg(LuminosoUI.t('msgSemVistas'), 'error');
      }
    }

    const html = LuminosoUI._buildPlanoHtml(empresa, vistas);
    const dateStr = new Date().toISOString().slice(0, 10);
    try {
      // 10 min: savepanel fica aberto esperando o usuário escolher a pasta
      const r = await Bridge.call('luminoso_salvar_plano', {
        name: `Plano_Luminoso_${dateStr}`,
        content: btoa(unescape(encodeURIComponent(html)))
      }, 600000);
      if (r.ok) LuminosoUI.setMsg(LuminosoUI.t('msgPlanoOk') + r.path, 'ok');
      else if (r.code !== 'user_cancelled') LuminosoUI.setMsg(LuminosoUI.t('msgError') + (r.error || '?'), 'error');
    } catch (e) {
      LuminosoUI.setMsg(LuminosoUI.t('msgError') + e.message, 'error');
    }
  },

  _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _buildPlanoHtml(empresa, vistas) {
    vistas = vistas || {};
    const E = LuminosoUI._esc;
    const P = LuminosoUI.coletarParams();
    const SW = LuminosoUI.num('lum_chapa_comp') || 5000;
    const SH = LuminosoUI.num('lum_chapa_larg') || 1220;
    const dt = new Date().toLocaleDateString('pt-BR');
    const grupos = LuminosoUI._gruposMateriais();
    const dimStr = P.formato === 'redondo' ? `Ø ${P.larg} mm`
      : `${P.larg} × ${P.formato === 'quadrado' ? P.larg : P.alt} mm` + (P.raio > 0 ? ` · r${P.raio}` : '');
    const fmtNome = { redondo: 'Redondo', quadrado: 'Quadrado', retangular: 'Retangular' }[P.formato] || P.formato;

    // resumo de quantidades
    const acmChapas = {};
    grupos.filter(gr => gr.guia).forEach(gr => {
      acmChapas[gr.titulo.replace('ACM — ', '')] = LuminosoUI._pack(gr.pecas, SW, SH).length;
    });
    const g = LuminosoUI.computeMaterials();
    const metM = (g.met.reduce((a, pc) => a + (pc.len || pc.w), 0) / 1000).toFixed(2);
    const acrM2 = (g.acr.reduce((a, pc) => a + pc.w * pc.h, 0) / 1e6).toFixed(2);

    const temEmp = empresa && (empresa.nome || empresa.logo);
    const docLabel = empresa.doc_tipo === 'cpf' ? 'CPF' : 'CNPJ';
    const empresaHtml = temEmp ? `
      <div class="capa-empresa">
        ${empresa.logo ? `<div class="capa-empresa__logo"><img src="${empresa.logo}" alt="logo"></div>` : ''}
        <div>
          ${empresa.nome ? `<h1 class="capa-empresa__name">${E(empresa.nome)}</h1>` : ''}
          <ul class="capa-empresa__list">
            ${empresa.doc ? `<li><span>${docLabel}</span> <b>${E(empresa.doc)}</b></li>` : ''}
            ${empresa.endereco ? `<li><span>Endereço</span> <b>${E(empresa.endereco)}</b></li>` : ''}
            ${empresa.fone ? `<li><span>Telefone</span> <b>${E(empresa.fone)}</b></li>` : ''}
            ${empresa.email ? `<li><span>Email</span> <b>${E(empresa.email)}</b></li>` : ''}
          </ul>
        </div>
      </div>` : '';

    const assinatura = (empresa.repr || empresa.cargo) ? `
      <div class="capa-assinatura">
        <div class="capa-assinatura__line"></div>
        <div class="capa-assinatura__nome">${E(empresa.repr || '')}</div>
        ${empresa.cargo ? `<div class="capa-assinatura__cargo">${E(empresa.cargo)}</div>` : ''}
      </div>` : '';

    const resumoItem = (lbl, val) =>
      `<div class="capa-resumo__item"><span class="capa-resumo__lbl">${lbl}</span><span class="capa-resumo__val">${val}</span></div>`;
    let resumo = '<div class="capa-resumo">';
    resumo += resumoItem('Formato', `${fmtNome}<br><small>${dimStr}</small>`);
    resumo += resumoItem('ACM', `${P.acm} mm`);
    resumo += resumoItem('Faces', P.dupla ? 'Dupla-face' : 'Face única');
    Object.keys(acmChapas).forEach(cor => {
      resumo += resumoItem(`Chapas ACM<br><small>${E(cor)}</small>`, `${acmChapas[cor]}× ${SW}×${SH}`);
    });
    resumo += resumoItem('Acrílico', `${acrM2} m²<br><small>${P.acr_esp}mm ${P.acr_tipo === 'cristal' ? 'cristal' : 'leitoso'}</small>`);
    if (P.braco) resumo += resumoItem(`Metalon ${P.metalon}×${P.metalon}`, `${metM} m`);
    resumo += '</div>';
    // isométrica do projeto gerado na capa, ao lado do resumo
    const capaCorpo = vistas.iso
      ? `<div class="capa-body"><div class="capa-body__resumo">${resumo}</div><div class="capa-body__iso"><img src="${vistas.iso}"></div></div>`
      : resumo;

    // página de vistas do projeto (só se as capturas vieram)
    const nomesVistas = { frente: 'Frente', fundo: 'Fundo', lateral: 'Lateral', topo: 'Topo', iso: 'Isométrica' };
    const temVistas = Object.keys(vistas).length > 0;
    const vistasHtml = temVistas ? `<div class="page">
      ${'{BRAND_VISTAS}'}
      <h2 class="page-title">Vistas do Projeto</h2>
      <div class="vistas-grid">
        ${Object.keys(nomesVistas).filter(k => vistas[k]).map(k =>
          `<figure class="vista"><img src="${vistas[k]}"><figcaption>${nomesVistas[k]}</figcaption></figure>`).join('')}
      </div>
    </div>` : '';

    const brand = lbl => `<div class="brand-strip">
      ${empresa.logo ? `<img src="${empresa.logo}">` : ''}
      <span class="brand-strip__name">${E(empresa.nome || 'ACMFacil')}</span>
      <span class="brand-strip__sep"></span>
      <span class="brand-strip__label">${lbl}</span>
    </div>`;

    // páginas de corte: um material por página (preview + legenda)
    let paginas = '';
    grupos.forEach(gr => {
      const prev = LuminosoUI._prevSvg(gr.pecas, SW, SH);
      paginas += `<div class="page">
        ${brand('Plano de Corte · Luminoso')}
        <h2 class="page-title">${E(gr.titulo)}</h2>
        <div class="page-svg">${prev.svg.replace('class="lum__prev-svg"', 'class="plano-svg"')}</div>
        <div class="page-leg">${prev.leg.map(t => `<div>${E(t)}</div>`).join('')}</div>
      </div>`;
    });

    // página de parâmetros do projeto
    const par = (l, v) => `<tr><td>${l}</td><td>${v}</td></tr>`;
    let paramRows = '';
    paramRows += par('Formato', `${fmtNome} — ${dimStr}`);
    paramRows += par('Espessura ACM', `${P.acm} mm`);
    paramRows += par('Cor do arco', E(P.cor_arco_nome));
    paramRows += par('Cor das bordas', E(P.cor_borda_nome));
    paramRows += par('Largura do arco', `${P.arco_larg} mm · ${P.emendas} emenda(s)`);
    paramRows += par('Borda da face / externa', `${P.borda_face} / ${P.borda_ext} mm · folga ${P.folga_tampa} mm`);
    paramRows += par('Faces', P.dupla ? 'Dupla-face' : 'Face única (fundo cego)');
    paramRows += par('Acrílico', `${P.acr_esp} mm — ${P.acr_tipo === 'cristal' ? 'cristal c/ adesivo retroverso' : 'branco leitoso'}`);
    if (P.braco) {
      paramRows += par('Braço', `metalon ${P.metalon}×${P.metalon} · ${P.braco_lado} · externo ${P.braco_ext} mm · folga furo ${P.folga_furo} mm`);
      paramRows += par('Chapa de parede', `${P.cext_larg} × ${P.cext_alt} × ${P.cext_esp} mm`);
      paramRows += par('Chapas internas', `${P.cint_comp > 0 ? P.cint_comp : 'auto'} × ${P.cint_larg} × ${P.cint_esp} mm (2×)`);
    }
    paramRows += par('Parafusos', `borda ${P.pb_qtd}× Ø${P.paraf_d_borda} · parede ${P.pce_qtd}× · interna ${P.pci_qtd}× Ø${P.paraf_d_chapa} · dist ${P.paraf_dist_lat}/${P.paraf_dist_tb} mm`);

    return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">
<title>Plano de Corte — Luminoso</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #171717; background: #fff; }
  .page { page-break-after: always; padding: 8mm; min-height: 180mm; position: relative; }
  .capa .capa__frame { border: 1px solid #d4d4d4; padding: 14mm; min-height: 175mm; position: relative; }
  .capa-empresa { display: flex; gap: 10mm; align-items: center; }
  .capa-empresa__logo img { max-height: 30mm; max-width: 60mm; object-fit: contain; }
  .capa-empresa__name { font-size: 22px; letter-spacing: -0.02em; }
  .capa-empresa__list { list-style: none; margin-top: 3mm; font-size: 11px; color: #525252; }
  .capa-empresa__list span { color: #a3a3a3; text-transform: uppercase; font-size: 9px; margin-right: 4px; }
  .capa__divider { height: 1px; background: #e5e5e5; margin: 8mm 0; }
  .capa-kicker { font-family: monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #a3a3a3; }
  .capa h2 { font-size: 34px; letter-spacing: -0.02em; margin: 2mm 0; }
  .capa-sub { font-size: 12px; color: #737373; }
  .capa-body { display: flex; gap: 8mm; align-items: flex-start; }
  .capa-body__resumo { flex: 1; }
  .capa-body__iso { width: 75mm; margin-top: 10mm; }
  .capa-body__iso img { width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; }
  .vistas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .vista { text-align: center; }
  .vista img { width: 100%; border: 1px solid #e5e5e5; border-radius: 6px; }
  .vista figcaption { font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #737373; margin-top: 2mm; }
  .capa-resumo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 10mm; }
  .capa-resumo__item { border: 1px solid #e5e5e5; border-radius: 8px; padding: 5mm; }
  .capa-resumo__lbl { display: block; font-family: monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #a3a3a3; margin-bottom: 2mm; }
  .capa-resumo__val { font-size: 16px; font-weight: 600; }
  .capa-resumo__val small, .capa-resumo__lbl small { font-weight: 400; color: #737373; font-size: 10px; }
  .capa-assinatura { margin-top: 14mm; width: 70mm; }
  .capa-assinatura__line { border-top: 1px solid #171717; margin-bottom: 2mm; }
  .capa-assinatura__nome { font-size: 12px; font-weight: 600; }
  .capa-assinatura__cargo { font-size: 10px; color: #737373; }
  .capa-footer { position: absolute; bottom: 8mm; left: 14mm; right: 14mm; display: flex; justify-content: space-between; font-family: monospace; font-size: 9px; color: #a3a3a3; }
  .brand-strip { display: flex; align-items: center; gap: 4mm; border-bottom: 1px solid #e5e5e5; padding-bottom: 3mm; margin-bottom: 5mm; }
  .brand-strip img { max-height: 8mm; }
  .brand-strip__name { font-weight: 700; font-size: 12px; }
  .brand-strip__sep { flex: 1; }
  .brand-strip__label { font-family: monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: #a3a3a3; }
  .page-title { font-size: 18px; margin-bottom: 4mm; }
  .page-svg { border: 1px solid #e5e5e5; border-radius: 6px; padding: 3mm; color: #404040; }
  .page-svg svg { width: 100%; height: 120mm; display: block; }
  .page-leg { columns: 3; margin-top: 4mm; font-family: monospace; font-size: 10px; color: #525252; }
  .params-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .params-table td { border: 1px solid #e5e5e5; padding: 2.5mm 4mm; }
  .params-table td:first-child { font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #737373; width: 60mm; }
</style></head><body>

<div class="page capa"><div class="capa__frame">
  ${empresaHtml}
  <div class="capa__divider"></div>
  <div>
    <span class="capa-kicker">Plano de Corte · Luminoso</span>
    <h2>Luminoso ${fmtNome} ${dimStr}</h2>
    <p class="capa-sub">Gerado em ${dt} · ACMFacil</p>
  </div>
  ${capaCorpo}
  ${assinatura}
  <div class="capa-footer"><span>ACMFacil · Plano de Corte</span><span>${dt}</span></div>
</div></div>

${vistasHtml.replace('{BRAND_VISTAS}', brand('Vistas do Projeto'))}

<div class="page">
  ${brand('Parâmetros do Projeto')}
  <h2 class="page-title">Parâmetros do Projeto</h2>
  <table class="params-table">${paramRows}</table>
</div>

${paginas}

</body></html>`;
  },

  switchTab(mats) {
    document.getElementById('lum_page_params').hidden = mats;
    document.getElementById('lum_page_mats').hidden = !mats;
    document.getElementById('lum_tab_params').classList.toggle('lum__tab--sel', !mats);
    document.getElementById('lum_tab_mats').classList.toggle('lum__tab--sel', mats);
    if (mats) LuminosoUI.renderMats();
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    try {
      const ctx = await Bridge.call('luminoso_ctx');
      if (ctx && ctx.ok) {
        LuminosoUI.state.lang = ctx.lang || 'pt';
        document.documentElement.dataset.theme = ctx.theme || 'light';
        LuminosoUI.montarCores(ctx.cores || {}, ctx.ordem_cat || []);
      }
    } catch (e) {
      console.warn('luminoso_ctx falhou:', e);
    }
    LuminosoUI.renderTexts();

    document.getElementById('lum_formato').addEventListener('change', LuminosoUI.refreshFormato);
    document.getElementById('lum_braco_duplo').addEventListener('change', LuminosoUI.refreshBracoDuplo);
    document.getElementById('lum_suporte').addEventListener('change', LuminosoUI.refreshSuporte);
    ['lum_dupla', 'lum_fundo_tipo', 'lum_bilongo_on', 'lum_bilongo_tipo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { LuminosoUI.refreshFundo(); LuminosoUI.renderDiagrams(); });
    });
    document.getElementById('lum_btn_gerar').addEventListener('click', LuminosoUI.handleGerar);
    document.getElementById('lum_btn_carregar').addEventListener('click', LuminosoUI.handleCarregar);
    document.getElementById('lum_btn_novo').addEventListener('click', LuminosoUI.handleNovo);
    // todos os diagramas mostram as medidas atuais — redesenha ao digitar
    document.querySelectorAll('.lum__scroll input, .lum__scroll select').forEach(el => {
      el.addEventListener('input', LuminosoUI.renderDiagrams);
      el.addEventListener('change', LuminosoUI.renderDiagrams);
    });
    // Página 2: materiais & corte
    document.getElementById('lum_tab_params').addEventListener('click', () => LuminosoUI.switchTab(false));
    document.getElementById('lum_tab_mats').addEventListener('click', () => LuminosoUI.switchTab(true));
    ['lum_chapa_comp', 'lum_chapa_larg'].forEach(id => {
      document.getElementById(id).addEventListener('input', LuminosoUI.renderMats);
    });
    document.getElementById('lum_svg_proj').addEventListener('click', LuminosoUI.exportSvgProjeto);
    document.getElementById('lum_dxf_proj').addEventListener('click', LuminosoUI.exportDxfProjeto);
    document.getElementById('lum_btn_plano').addEventListener('click', LuminosoUI.gerarPlano);

    LuminosoUI.refreshFormato();
    LuminosoUI.renderDiagrams();
  },

  renderTexts() {
    document.querySelectorAll('[data-key]').forEach(el => {
      el.textContent = LuminosoUI.t(el.dataset.key);
    });
  },

  // Seletor de cores por SWATCHES visuais (mesmo padrão do Auto-ACM):
  // tabs de categoria + grade de quadradinhos rgb + check na selecionada.
  montarCores(cores, ordem) {
    LuminosoUI.state.cores = cores || {};
    LuminosoUI.state.ordemCat = ordem || [];
    LuminosoUI.state.cor.arco.cat = ordem[0];
    LuminosoUI.state.cor.borda.cat = ordem[0];
    LuminosoUI.selecionarCor('arco', 'VX151');
    LuminosoUI.selecionarCor('borda', 'VX502');
  },

  // Seleciona por nome completo OU trecho (ex: 'VX151') e re-renderiza
  selecionarCor(key, trecho) {
    if (!trecho) return;
    for (const cat of LuminosoUI.state.ordemCat) {
      const found = (LuminosoUI.state.cores[cat] || []).find(c => c.nome === trecho || c.nome.includes(trecho));
      if (found) {
        LuminosoUI.state.cor[key] = { nome: found.nome, rgb: found.rgb, cat: cat };
        break;
      }
    }
    LuminosoUI.renderCorPicker(key);
  },

  renderCorPicker(key) {
    const st = LuminosoUI.state.cor[key];
    const tabs = document.getElementById(`lum_cor_${key}_tabs`);
    const grid = document.getElementById(`lum_cor_${key}_grid`);
    const chip = document.getElementById(`lum_cor_${key}_chip`);
    const nomeEl = document.getElementById(`lum_cor_${key}_nome`);
    if (!tabs || !grid) return;
    const cat = st.cat || LuminosoUI.state.ordemCat[0];

    tabs.innerHTML = LuminosoUI.state.ordemCat.map(c =>
      `<button type="button" class="lum__cor-tab${c === cat ? ' is-active' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
    tabs.querySelectorAll('.lum__cor-tab').forEach(btn => {
      btn.onclick = () => { st.cat = btn.dataset.cat; LuminosoUI.renderCorPicker(key); };
    });

    const colors = LuminosoUI.state.cores[cat] || [];
    grid.innerHTML = colors.map((c, i) =>
      `<div class="lum__cor-swatch${st.nome === c.nome ? ' is-selected' : ''}" style="background: rgb(${c.rgb.join(',')})" data-idx="${i}" title="${c.nome}"></div>`
    ).join('');
    grid.querySelectorAll('.lum__cor-swatch').forEach(sw => {
      const c = colors[parseInt(sw.dataset.idx, 10)];
      if (!c) return;
      sw.onclick = () => {
        LuminosoUI.state.cor[key] = { nome: c.nome, rgb: c.rgb, cat: cat };
        LuminosoUI.renderCorPicker(key);
      };
    });

    if (chip && st.rgb) chip.style.background = `rgb(${st.rgb.join(',')})`;
    if (nomeEl) nomeEl.textContent = st.nome || '—';
  },

  refreshBracoDuplo() {
    const duplo = LuminosoUI.chk('lum_braco_duplo');
    document.getElementById('lum_f_braco_dist').hidden = !duplo;
    document.getElementById('lum_f_chapa_modo').hidden = !duplo;
  },

  // Checkbox mestre "Com suporte": desligado esconde as seções de braço/
  // chapas/parafusos-de-chapa e o gerar sai só com as chapas de ACM.
  refreshSuporte() {
    const on = LuminosoUI.chk('lum_suporte');
    document.querySelectorAll('.lum__sec-suporte').forEach(s => { s.hidden = !on; });
  },

  // Seção FUNDO: só no modo FACE ÚNICA (dupla desmarcada). Fundo embutido
  // libera folga/espessura/bilongos; tipo do bilongo alterna normal ↔ cruz.
  refreshFundo() {
    const hid = (id, h) => { const el = document.getElementById(id); if (el) el.hidden = h; };
    const faceUnica = !LuminosoUI.chk('lum_dupla');
    hid('lum_sec_fundo', !faceUnica);
    const embutido = LuminosoUI.val('lum_fundo_tipo') === 'embutido';
    hid('lum_f_fundo_folga', !embutido);
    hid('lum_f_fundo_esp', !embutido);
    hid('lum_f_bilongo_on', !embutido);
    const bilongos = embutido && LuminosoUI.chk('lum_bilongo_on');
    hid('lum_bilongo_wrap', !bilongos);
    const cruz = LuminosoUI.val('lum_bilongo_tipo') === 'cruz';
    hid('lum_f_bilongo_furo', cruz);
    hid('lum_f_bilongo_comp', cruz);
    hid('lum_f_bilongo_pos', cruz);
    hid('lum_f_cruz_w', !cruz);
    hid('lum_f_cruz_h', !cruz);
  },

  refreshFormato() {
    const f = document.getElementById('lum_formato').value;
    document.getElementById('lum_f_alt').hidden = (f !== 'retangular');
    document.getElementById('lum_f_raio').hidden = (f === 'redondo');
    document.getElementById('lum_larg_label').textContent =
      LuminosoUI.t(f === 'redondo' ? 'diametro' : 'largura');
    const el = document.getElementById('lum_diag_formato');
    if (el) el.innerHTML = LuminosoUI.diagFormato();
  },

  // ── Coleta de params do form ──────────────────────────────────────────────
  num(id) { return parseFloat(document.getElementById(id).value) || 0; },
  val(id) { return document.getElementById(id).value; },
  chk(id) { return document.getElementById(id).checked; },

  coletarParams() {
    const corArco = LuminosoUI.state.cor.arco.nome ?
      LuminosoUI.state.cor.arco : { nome: 'Preto Brilho (VX151)', rgb: [25, 25, 25] };
    const corBorda = LuminosoUI.state.cor.borda.nome ?
      LuminosoUI.state.cor.borda : { nome: 'Vermelho Brilho (VX502)', rgb: [220, 8, 8] };

    return {
      formato: LuminosoUI.val('lum_formato'),
      larg: LuminosoUI.num('lum_larg'),
      alt: LuminosoUI.num('lum_alt'),
      raio: LuminosoUI.num('lum_raio'),
      acm: LuminosoUI.num('lum_acm'),
      arco_larg: LuminosoUI.num('lum_arco_larg'),
      emendas: LuminosoUI.num('lum_emendas'),
      borda_face: LuminosoUI.num('lum_borda_face'),
      borda_ext: LuminosoUI.num('lum_borda_ext'),
      folga_tampa: LuminosoUI.num('lum_folga_tampa'),
      dupla: LuminosoUI.chk('lum_dupla'),
      acr_esp: LuminosoUI.num('lum_acr_esp'),
      acr_tipo: LuminosoUI.val('lum_acr_tipo'),
      cor_arco_nome: corArco.nome,  cor_arco_rgb: corArco.rgb,
      cor_borda_nome: corBorda.nome, cor_borda_rgb: corBorda.rgb,
      suporte: LuminosoUI.chk('lum_suporte'),
      fundo_tipo: LuminosoUI.val('lum_fundo_tipo'),
      fundo_folga: LuminosoUI.num('lum_fundo_folga'),
      fundo_esp: LuminosoUI.num('lum_fundo_esp'),
      bilongo_on: LuminosoUI.chk('lum_bilongo_on'),
      bilongo_tipo: LuminosoUI.val('lum_bilongo_tipo'),
      bilongo_furo: LuminosoUI.num('lum_bilongo_furo'),
      bilongo_comp: LuminosoUI.num('lum_bilongo_comp'),
      bilongo_larg: LuminosoUI.num('lum_bilongo_larg'),
      bilongo_pos: LuminosoUI.val('lum_bilongo_pos'),
      cruz_w: LuminosoUI.num('lum_cruz_w'),
      cruz_h: LuminosoUI.num('lum_cruz_h'),
      bilongo_qtd: LuminosoUI.num('lum_bilongo_qtd'),
      bilongo_dist: LuminosoUI.num('lum_bilongo_dist'),
      bilongo_alt: LuminosoUI.num('lum_bilongo_alt'),
      braco: LuminosoUI.chk('lum_braco'),
      braco_lado: LuminosoUI.val('lum_braco_lado'),
      braco_duplo: LuminosoUI.chk('lum_braco_duplo'),
      braco_dist: LuminosoUI.num('lum_braco_dist'),
      chapa_modo: LuminosoUI.val('lum_chapa_modo'),
      braco_ext: LuminosoUI.num('lum_braco_ext'),
      metalon: LuminosoUI.num('lum_metalon'),
      folga_furo: LuminosoUI.num('lum_folga_furo'),
      cint_larg: LuminosoUI.num('lum_cint_larg'),
      cint_esp: LuminosoUI.num('lum_cint_esp'),
      cint_comp: LuminosoUI.num('lum_cint_comp'),
      cext_larg: LuminosoUI.num('lum_cext_larg'),
      cext_alt: LuminosoUI.num('lum_cext_alt'),
      cext_esp: LuminosoUI.num('lum_cext_esp'),
      pb_qtd: LuminosoUI.num('lum_pb_qtd'),
      pce_qtd: LuminosoUI.num('lum_pce_qtd'),
      pci_qtd: LuminosoUI.num('lum_pci_qtd'),
      paraf_d_borda: LuminosoUI.num('lum_paraf_d_borda'),
      paraf_d_chapa: LuminosoUI.num('lum_paraf_d_chapa'),
      paraf_dist_lat: LuminosoUI.num('lum_paraf_dist_lat'),
      paraf_dist_tb: LuminosoUI.num('lum_paraf_dist_tb'),
      paraf_orient: LuminosoUI.val('lum_paraf_orient')
    };
  },

  aplicarParams(p) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
    const setc = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    set('lum_formato', p.formato); set('lum_larg', p.larg); set('lum_alt', p.alt); set('lum_raio', p.raio);
    set('lum_acm', p.acm); set('lum_arco_larg', p.arco_larg); set('lum_emendas', p.emendas);
    set('lum_borda_face', p.borda_face); set('lum_borda_ext', p.borda_ext); set('lum_folga_tampa', p.folga_tampa);
    setc('lum_dupla', p.dupla); set('lum_acr_esp', p.acr_esp); set('lum_acr_tipo', p.acr_tipo);
    setc('lum_suporte', p.suporte !== false);   // compat: luminosos antigos não têm o campo → ligado
    set('lum_fundo_tipo', p.fundo_tipo || 'tampa'); set('lum_fundo_folga', p.fundo_folga); set('lum_fundo_esp', p.fundo_esp);
    setc('lum_bilongo_on', p.bilongo_on); set('lum_bilongo_tipo', p.bilongo_tipo || 'normal');
    set('lum_bilongo_furo', p.bilongo_furo); set('lum_bilongo_comp', p.bilongo_comp); set('lum_bilongo_larg', p.bilongo_larg);
    set('lum_bilongo_pos', p.bilongo_pos || 'superior'); set('lum_cruz_w', p.cruz_w); set('lum_cruz_h', p.cruz_h);
    set('lum_bilongo_qtd', p.bilongo_qtd); set('lum_bilongo_dist', p.bilongo_dist); set('lum_bilongo_alt', p.bilongo_alt);
    setc('lum_braco', p.braco); set('lum_braco_lado', p.braco_lado); set('lum_braco_ext', p.braco_ext);
    setc('lum_braco_duplo', p.braco_duplo); set('lum_braco_dist', p.braco_dist); set('lum_chapa_modo', p.chapa_modo);
    LuminosoUI.refreshBracoDuplo();
    LuminosoUI.refreshSuporte();
    LuminosoUI.refreshFundo();
    set('lum_metalon', p.metalon); set('lum_folga_furo', p.folga_furo);
    set('lum_cint_larg', p.cint_larg); set('lum_cint_esp', p.cint_esp); set('lum_cint_comp', p.cint_comp);
    set('lum_cext_larg', p.cext_larg); set('lum_cext_alt', p.cext_alt); set('lum_cext_esp', p.cext_esp);
    set('lum_pb_qtd', p.pb_qtd); set('lum_pce_qtd', p.pce_qtd); set('lum_pci_qtd', p.pci_qtd);
    // compat: luminosos antigos têm só paraf_d — vale pros dois campos
    set('lum_paraf_d_borda', p.paraf_d_borda !== undefined ? p.paraf_d_borda : p.paraf_d);
    set('lum_paraf_d_chapa', p.paraf_d_chapa !== undefined ? p.paraf_d_chapa : p.paraf_d);
    set('lum_paraf_dist_lat', p.paraf_dist_lat); set('lum_paraf_dist_tb', p.paraf_dist_tb);
    set('lum_paraf_orient', p.paraf_orient);
    LuminosoUI.renderDiagrams();
    if (p.cor_arco_nome)  LuminosoUI.selecionarCor('arco',  p.cor_arco_nome);
    if (p.cor_borda_nome) LuminosoUI.selecionarCor('borda', p.cor_borda_nome);
    LuminosoUI.refreshFormato();
  },

  // ── Ações ─────────────────────────────────────────────────────────────────
  async handleGerar() {
    const btn = document.getElementById('lum_btn_gerar');
    btn.disabled = true;
    LuminosoUI.setMsg('…', null);
    try {
      const r = await Bridge.call('luminoso_gerar', {
        params: LuminosoUI.coletarParams(),
        entity_id: LuminosoUI.state.editingId || 0
      });
      if (r.ok) {
        LuminosoUI.setEditing(r.entity_id);
        LuminosoUI.setMsg(LuminosoUI.t(r.novo ? 'msgOk' : 'msgRegen'), 'ok');
      } else if (r.blocked) {
        // mostra o MOTIVO REAL do bloqueio (sessão/relógio/rede/licença) —
        // o texto genérico escondia a causa e dificultava o suporte
        LuminosoUI.setMsg((r.error || LuminosoUI.t('msgBlocked')) + (r.code ? ' [' + r.code + ']' : ''), 'error');
      } else {
        LuminosoUI.setMsg(LuminosoUI.t('msgError') + (r.error || r.code || '?'), 'error');
      }
    } catch (e) {
      LuminosoUI.setMsg(LuminosoUI.t('msgError') + e.message, 'error');
    }
    btn.disabled = false;
  },

  async handleCarregar() {
    try {
      const r = await Bridge.call('luminoso_carregar');
      if (r.ok) {
        LuminosoUI.aplicarParams(r.params || {});
        LuminosoUI.setEditing(r.entity_id);
        LuminosoUI.setMsg(LuminosoUI.t('msgCarregado'), 'ok');
      } else {
        LuminosoUI.setMsg(LuminosoUI.t('msgNadaSel'), 'error');
      }
    } catch (e) {
      LuminosoUI.setMsg(LuminosoUI.t('msgError') + e.message, 'error');
    }
  },

  handleNovo() {
    LuminosoUI.setEditing(null);
    LuminosoUI.setMsg('', null);
  },

  setEditing(id) {
    LuminosoUI.state.editingId = id;
    const badge = document.getElementById('lum_editing');
    const btn   = document.getElementById('lum_btn_gerar');
    if (id) {
      badge.hidden = false;
      document.getElementById('lum_editing_txt').textContent = LuminosoUI.t('editando') + id;
      btn.textContent = LuminosoUI.t('regerar');
    } else {
      badge.hidden = true;
      btn.textContent = LuminosoUI.t('gerar');
    }
  },

  setMsg(text, kind) {
    const el = document.getElementById('lum_msg');
    el.textContent = text;
    el.className = 'lum__msg' + (kind ? ' lum__msg--' + kind : '');
  }
};

window.LuminosoUI = LuminosoUI;
document.addEventListener('DOMContentLoaded', LuminosoUI.init);
