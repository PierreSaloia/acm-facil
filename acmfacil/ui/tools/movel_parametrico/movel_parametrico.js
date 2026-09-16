/* ══════════════════════════════════════════════════════════════════════════
   ACMFacil — Móvel Paramétrico (diálogo da ferramenta)
   ══════════════════════════════════════════════════════════════════════════
   Fluxo: selecionar o bloco sólido no modelo → configurar fatiamento e
   fixação → Gerar (componente com fatias etiquetadas + fixadores).
   Carregar selecionado → Regenerar no lugar (re-fatia o bloco original).
   ══════════════════════════════════════════════════════════════════════════ */

const MovelParamUI = {

  state: {
    lang: 'pt',
    editingId: null,
    cores: {},
    ordemCat: [],
    cor: {} // { nome, rgb, cat }
  },

  i18n: {
    pt: {
      title: 'Móvel Paramétrico', subtitle: 'Fatia um sólido em chapas paralelas com fixação.',
      novo: 'Novo', carregar: 'Carregar selecionado', gerar: 'Gerar', regerar: 'Regenerar',
      editando: 'Editando móvel paramétrico #',
      secBloco: 'BLOCO DE ORIGEM',
      hintBloco: 'Modele o volume como sólido(s) fechado(s) — pode ser UMA peça ou uma logo inteira com várias peças separadas (grupos/componentes). Selecione tudo e clique Gerar: as fatias saem alinhadas no conjunto. Os originais ficam ocultos e são reaproveitados ao regenerar.',
      secDiagFat: 'VISTA 2D — FATIAMENTO (COTAS)', secDiagFix: 'VISTA 2D — FIXAÇÃO (COTAS)',
      secFat: 'FATIAMENTO', secFix: 'FIXAÇÃO', secCor: 'COR / ACABAMENTO DAS FATIAS',
      chapa: 'Espessura da chapa (mm)', gap: 'Vão entre fatias (mm)', eixo: 'Direção das fatias',
      eixoX: 'Verticais na largura (eixo X)', eixoY: 'Verticais na profundidade (eixo Y)',
      eixoZ: 'Horizontais empilhadas (eixo Z)',
      fixTipo: 'Tipo de fixação', fixQtd: 'Quantidade mínima', fixDiam: 'Diâmetro (mm)',
      fixFolga: 'Folga do furo/rasgo (mm)', ripaLarg: 'Ripa: profundidade (mm)',
      ripaEsp: 'Ripa: espessura (mm)', fixLado: 'Lado da fixação', fixMargem: 'Margem da borda (mm)',
      fixBarra: 'Barra roscada + porcas', fixTubo: 'Tubo/cano metálico',
      fixCavilha: 'Cavilha de madeira', fixRipa: 'Ripa/sarrafo encaixado', fixNenhuma: 'Sem fixação',
      fixDuplo: 'Par de fixadores', duploVert: 'Duplo vertical (em cima + embaixo)', duploHoriz: 'Duplo horizontal (lado a lado)',
      ladoTras: 'Traseira', ladoFrente: 'Frente', ladoCima: 'Cima', ladoBaixo: 'Baixo', ladoCentro: 'Centro',
      dgChapa: 'chapa', dgVao: 'vão', dgFatias: 'fatias', dgMargem: 'margem', dgRipa: 'ripa',
      msgOk: 'Móvel gerado! ', msgRegen: 'Móvel atualizado! ', msgFatias: ' fatia(s)',
      msgPecas: ' peça(s)', msgIgnorados: ' — atenção: ', msgIgnorados2: ' peça(s) ignorada(s) por não serem sólidos fechados',
      msgNadaSel: 'Selecione o(s) sólido(s) da logo/móvel (grupos/componentes) primeiro.',
      msgNaoSolido: 'Tentei corrigir automaticamente, mas o bloco ainda não é um sólido fechado. Abra o grupo e feche os furos da superfície (Solid Inspector ajuda), ou selecione as peças sólidas de dentro dele.',
      msgReparados: ' peça(s) corrigida(s) automaticamente',
      msgFix: ' fixador(es)', msgSoltas: ' fatia(s) SEM fixador — nenhum ponto atravessa o material delas; ajuste margem/lado ou fixe manualmente.',
      msgSemFatias: 'Nenhuma fatia coube no bloco — reduza a espessura ou o vão.',
      msgSrcSumiu: 'O bloco original deste móvel não existe mais no modelo.',
      msgCarregado: 'Parâmetros carregados — edite e clique Regenerar.',
      msgNadaCarregar: 'Selecione um Móvel Paramétrico gerado pelo ACMFacil primeiro.',
      msgBlocked: 'Licença inválida. Faça login no painel do ACMFacil.',
      msgMuitasFatias: 'O fatiamento precisaria de {n} fatias (máximo {max}). Aumente o vão ou a espessura da chapa, ou fatie o conjunto em partes.',
      msgError: 'Erro: '
    },
    es: {
      title: 'Mueble Paramétrico', subtitle: 'Rebana un sólido en placas paralelas con fijación.',
      novo: 'Nuevo', carregar: 'Cargar seleccionado', gerar: 'Generar', regerar: 'Regenerar',
      editando: 'Editando mueble paramétrico #',
      secBloco: 'BLOQUE DE ORIGEN',
      hintBloco: 'Modela el volumen como sólido(s) cerrado(s) — puede ser UNA pieza o un logo entero con varias piezas separadas (grupos/componentes). Selecciona todo y pulsa Generar: las placas salen alineadas en el conjunto. Los originales quedan ocultos y se reutilizan al regenerar.',
      secDiagFat: 'VISTA 2D — REBANADO (COTAS)', secDiagFix: 'VISTA 2D — FIJACIÓN (COTAS)',
      secFat: 'REBANADO', secFix: 'FIJACIÓN', secCor: 'COLOR / ACABADO DE LAS PLACAS',
      chapa: 'Espesor de la placa (mm)', gap: 'Espacio entre placas (mm)', eixo: 'Dirección de las placas',
      eixoX: 'Verticales en el ancho (eje X)', eixoY: 'Verticales en la profundidad (eje Y)',
      eixoZ: 'Horizontales apiladas (eje Z)',
      fixTipo: 'Tipo de fijación', fixQtd: 'Cantidad mínima', fixDiam: 'Diámetro (mm)',
      fixFolga: 'Holgura del agujero/ranura (mm)', ripaLarg: 'Listón: profundidad (mm)',
      ripaEsp: 'Listón: espesor (mm)', fixLado: 'Lado de la fijación', fixMargem: 'Margen del borde (mm)',
      fixBarra: 'Varilla roscada + tuercas', fixTubo: 'Tubo/caño metálico',
      fixCavilha: 'Espiga de madera', fixRipa: 'Listón encajado', fixNenhuma: 'Sin fijación',
      fixDuplo: 'Par de fijadores', duploVert: 'Doble vertical (arriba + abajo)', duploHoriz: 'Doble horizontal (lado a lado)',
      ladoTras: 'Trasera', ladoFrente: 'Frente', ladoCima: 'Arriba', ladoBaixo: 'Abajo', ladoCentro: 'Centro',
      dgChapa: 'placa', dgVao: 'espacio', dgFatias: 'placas', dgMargem: 'margen', dgRipa: 'listón',
      msgOk: '¡Mueble generado! ', msgRegen: '¡Mueble actualizado! ', msgFatias: ' placa(s)',
      msgPecas: ' pieza(s)', msgIgnorados: ' — atención: ', msgIgnorados2: ' pieza(s) ignorada(s) por no ser sólidos cerrados',
      msgNadaSel: 'Selecciona primero el/los sólido(s) del logo/mueble (grupos/componentes).',
      msgNaoSolido: 'Intenté corregir automáticamente, pero el bloque aún no es un sólido cerrado. Abre el grupo y cierra los huecos de la superficie, o selecciona las piezas sólidas de adentro.',
      msgReparados: ' pieza(s) corregida(s) automáticamente',
      msgFix: ' fijador(es)', msgSoltas: ' placa(s) SIN fijador — ningún punto atraviesa su material; ajusta margen/lado o fija manualmente.',
      msgSemFatias: 'Ninguna placa cupo en el bloque — reduce el espesor o el espacio.',
      msgSrcSumiu: 'El bloque original de este mueble ya no existe en el modelo.',
      msgCarregado: 'Parámetros cargados — edita y pulsa Regenerar.',
      msgNadaCarregar: 'Selecciona primero un Mueble Paramétrico generado por ACMFacil.',
      msgBlocked: 'Licencia inválida. Inicia sesión en el panel de ACMFacil.',
      msgMuitasFatias: 'El rebanado necesitaría {n} placas (máximo {max}). Aumenta el espacio o el espesor de la placa, o rebana el conjunto por partes.',
      msgError: 'Error: '
    },
    en: {
      title: 'Parametric Furniture', subtitle: 'Slices a solid into parallel sheets with fasteners.',
      novo: 'New', carregar: 'Load selected', gerar: 'Generate', regerar: 'Regenerate',
      editando: 'Editing parametric furniture #',
      secBloco: 'SOURCE BLOCK',
      hintBloco: 'Model the volume as closed solid(s) — ONE piece or a whole logo with several separate pieces (groups/components). Select everything and click Generate: slices come out aligned across the set. Originals are hidden and reused when regenerating.',
      secDiagFat: '2D VIEW — SLICING (DIMENSIONS)', secDiagFix: '2D VIEW — FASTENING (DIMENSIONS)',
      secFat: 'SLICING', secFix: 'FASTENING', secCor: 'SHEET COLOR / FINISH',
      chapa: 'Sheet thickness (mm)', gap: 'Gap between slices (mm)', eixo: 'Slice direction',
      eixoX: 'Vertical along width (X axis)', eixoY: 'Vertical along depth (Y axis)',
      eixoZ: 'Horizontal stacked (Z axis)',
      fixTipo: 'Fastener type', fixQtd: 'Minimum quantity', fixDiam: 'Diameter (mm)',
      fixFolga: 'Hole/slot clearance (mm)', ripaLarg: 'Batten: depth (mm)',
      ripaEsp: 'Batten: thickness (mm)', fixLado: 'Fastening side', fixMargem: 'Edge margin (mm)',
      fixBarra: 'Threaded rod + nuts', fixTubo: 'Metal tube/pipe',
      fixCavilha: 'Wooden dowel', fixRipa: 'Slotted batten', fixNenhuma: 'No fastener',
      fixDuplo: 'Fastener pair', duploVert: 'Double vertical (top + bottom)', duploHoriz: 'Double horizontal (side by side)',
      ladoTras: 'Back', ladoFrente: 'Front', ladoCima: 'Top', ladoBaixo: 'Bottom', ladoCentro: 'Center',
      dgChapa: 'sheet', dgVao: 'gap', dgFatias: 'slices', dgMargem: 'margin', dgRipa: 'batten',
      msgOk: 'Furniture generated! ', msgRegen: 'Furniture updated! ', msgFatias: ' slice(s)',
      msgPecas: ' piece(s)', msgIgnorados: ' — warning: ', msgIgnorados2: ' piece(s) skipped for not being closed solids',
      msgNadaSel: 'Select the logo/furniture solid(s) (groups/components) first.',
      msgNaoSolido: 'Auto-repair was attempted, but the block is still not a closed solid. Open the group and close the surface holes, or select the solid pieces inside it.',
      msgReparados: ' piece(s) auto-repaired',
      msgFix: ' fastener(s)', msgSoltas: ' slice(s) WITHOUT fastener — no point crosses their material; adjust margin/side or fasten manually.',
      msgSemFatias: 'No slice fits the block — reduce thickness or gap.',
      msgSrcSumiu: 'The original block of this furniture no longer exists in the model.',
      msgCarregado: 'Parameters loaded — edit and click Regenerate.',
      msgNadaCarregar: 'Select an ACMFacil-generated Parametric Furniture first.',
      msgBlocked: 'Invalid license. Log in on the ACMFacil panel.',
      msgMuitasFatias: 'Slicing would need {n} slices (maximum {max}). Increase the gap or sheet thickness, or slice the set in parts.',
      msgError: 'Error: '
    }
  },

  t(key) {
    const d = MovelParamUI.i18n[MovelParamUI.state.lang] || MovelParamUI.i18n.pt;
    return d[key] || key;
  },

  // Defaults (§17 — sincronizar com extrair do Ruby e values do HTML)
  _defaultParams() {
    return {
      chapa: 15, gap: 30, eixo: 'x',
      fix_tipo: 'barra', fix_qtd: 2, fix_diam: 10, fix_folga: 0.5,
      fix_duplo: 'vertical',
      ripa_larg: 40, ripa_esp: 6, fix_lado: 'tras', fix_margem: 50
    };
  },

  num(id) { return parseFloat(document.getElementById(id).value) || 0; },
  val(id) { return document.getElementById(id).value; },

  _txt(x, y, t, anchor) {
    return `<text x="${x}" y="${y}" fill="currentColor" stroke="none" font-size="9"${anchor ? ` text-anchor="${anchor}"` : ''}>${t}</text>`;
  },

  // cota horizontal com setas (a→b na altura y, texto centralizado acima)
  _cota(a, b, y, label) {
    let s = `<line x1="${a}" y1="${y}" x2="${b}" y2="${y}"/>`;
    s += `<line x1="${a}" y1="${y - 4}" x2="${a}" y2="${y + 4}"/>`;
    s += `<line x1="${b}" y1="${y - 4}" x2="${b}" y2="${y + 4}"/>`;
    s += MovelParamUI._txt((a + b) / 2, y - 5, label, 'middle');
    return s;
  },

  // ── Diagrama 1: fatiamento (vista de topo, cotas chapa/vão ao vivo) ──────
  diagFat() {
    const chapa = MovelParamUI.num('mp_chapa');
    const gap = MovelParamUI.num('mp_gap');
    const eixo = MovelParamUI.val('mp_eixo');
    const passo = Math.max(chapa + gap, 1);
    const ex = 150 / (4 * passo);                    // 4 períodos em ~150px
    const cw = Math.max(chapa * ex, 2), gw = gap * ex;

    let s = '<svg viewBox="0 0 240 120" fill="none" stroke="currentColor" stroke-width="1.2" font-size="8">';
    // 5 fatias esquemáticas com topo ondulado (perfil orgânico)
    let x = 40;
    for (let i = 0; i < 5; i++) {
      const h = 52 + 14 * Math.sin(i * 1.2);         // altura "ondulada"
      const y0 = 100 - h;
      s += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${cw.toFixed(1)}" height="${h.toFixed(1)}" fill="#d4af37" fill-opacity="0.4"/>`;
      x += cw + gw;
    }
    // cotas: chapa (1ª fatia) e vão (entre 1ª e 2ª)
    s += MovelParamUI._cota(40, 40 + cw, 32, `${chapa}`);
    if (gw > 3) s += MovelParamUI._cota(40 + cw, 40 + cw + gw, 32, `${gap}`);
    s += MovelParamUI._txt(120, 14, `${MovelParamUI.t('dgChapa')} ${chapa} · ${MovelParamUI.t('dgVao')} ${gap} · ${MovelParamUI.t('eixo')}: ${eixo.toUpperCase()}`, 'middle');
    // seta do eixo de fatiamento
    s += `<line x1="40" y1="110" x2="200" y2="110"/><path d="M200 110 l-6 -3 v6 Z" fill="currentColor"/>`;
    s += MovelParamUI._txt(210, 113, eixo.toUpperCase());
    return s + '</svg>';
  },

  // ── Diagrama 2: fixação numa fatia (posição, lado, margem, Ø — ao vivo) ──
  diagFix() {
    const tipo = MovelParamUI.val('mp_fix_tipo');
    const qtd = Math.max(1, Math.min(30, MovelParamUI.num('mp_fix_qtd')));
    const diam = MovelParamUI.num('mp_fix_diam');
    const lado = MovelParamUI.val('mp_fix_lado');
    const margem = MovelParamUI.num('mp_fix_margem');
    const rl = MovelParamUI.num('mp_ripa_larg');
    const re = MovelParamUI.num('mp_ripa_esp');

    // fatia esquemática: 300mm de referência → margem proporcional (clamp)
    const W = 176, H = 78, X0 = 32, Y0 = 16;
    const mpx = Math.max(6, Math.min(margem / 300 * W, W * 0.42));

    let s = '<svg viewBox="0 0 240 120" fill="none" stroke="currentColor" stroke-width="1.2" font-size="8">';
    s += `<rect x="${X0}" y="${Y0}" width="${W}" height="${H}" rx="10" fill="#d4af37" fill-opacity="0.25"/>`;

    if (tipo === 'nenhuma') {
      s += MovelParamUI._txt(120, 60, MovelParamUI.t('fixNenhuma'), 'middle');
      return s + '</svg>';
    }

    // eixo do "lado": frente/trás = horizontal (esq/dir), cima/baixo = vertical
    const horizontal = (lado === 'frente' || lado === 'tras' || lado === 'centro');
    // coordenada fixa (no lado escolhido, inset pela margem)
    let fx = 0, fy = 0;
    if (lado === 'frente') fx = X0 + mpx;
    else if (lado === 'tras') fx = X0 + W - mpx;
    else if (lado === 'cima') fy = Y0 + mpx * 0.6;
    else if (lado === 'baixo') fy = Y0 + H - mpx * 0.6;
    else fx = X0 + W / 2;

    if (tipo === 'ripa') {
      // rasgo/ripa: retângulo entrando pela face do lado
      const rw = Math.max(re / 300 * W * 2.2, 4);
      const rdepth = Math.max(10, Math.min(rl / 300 * W * 1.4, 46));
      for (let i = 0; i < qtd; i++) {
        const fr = qtd === 1 ? 0.5 : i / (qtd - 1);
        if (horizontal) {
          const y = Y0 + 14 + (H - 28) * fr;
          const x = (lado === 'frente') ? X0 : X0 + W - rdepth;
          s += `<rect x="${x}" y="${(y - rw / 2).toFixed(1)}" width="${rdepth}" height="${rw.toFixed(1)}" fill="#d4af37" fill-opacity="0.7"/>`;
        } else {
          const x = X0 + 16 + (W - 32) * fr;
          const y = (lado === 'cima') ? Y0 : Y0 + H - rdepth;
          s += `<rect x="${(x - rw / 2).toFixed(1)}" y="${y}" width="${rw.toFixed(1)}" height="${rdepth}" fill="#d4af37" fill-opacity="0.7"/>`;
        }
      }
      s += MovelParamUI._txt(120, 10, `${MovelParamUI.t('dgRipa')} ${re}×${rl} · ${qtd}× · ${MovelParamUI.t('dgMargem')} ${margem}`, 'middle');
    } else {
      // furos circulares (barra/tubo/cavilha)
      const r = Math.max(2.5, Math.min(diam / 300 * W * 1.6, 9));
      for (let i = 0; i < qtd; i++) {
        const fr = qtd === 1 ? 0.5 : i / (qtd - 1);
        const cx = horizontal ? fx : X0 + 16 + (W - 32) * fr;
        const cy = horizontal ? Y0 + 14 + (H - 28) * fr : fy;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="var(--bg, #fff)"/>`;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * 0.45).toFixed(1)}"/>`;
      }
      // cota da margem (do lado escolhido até o centro do furo)
      if (lado === 'frente') s += MovelParamUI._cota(X0, fx, 108, `${margem}`);
      else if (lado === 'tras') s += MovelParamUI._cota(fx, X0 + W, 108, `${margem}`);
      s += MovelParamUI._txt(120, 10, `Ø${diam} · ${qtd}× · ${MovelParamUI.t('dgMargem')} ${margem} · ${MovelParamUI.t('lado' + lado.charAt(0).toUpperCase() + lado.slice(1))}`, 'middle');
    }
    return s + '</svg>';
  },

  renderDiag() {
    const f = document.getElementById('mp_diag_fat');
    if (f) f.innerHTML = MovelParamUI.diagFat();
    const x = document.getElementById('mp_diag_fix');
    if (x) x.innerHTML = MovelParamUI.diagFix();
  },

  // mostra/esconde campos conforme o tipo de fixação
  refreshTipo() {
    const tipo = MovelParamUI.val('mp_fix_tipo');
    document.getElementById('mp_wrap_diam').hidden = (tipo === 'ripa' || tipo === 'nenhuma');
    document.getElementById('mp_wrap_duplo').hidden = (tipo === 'ripa' || tipo === 'nenhuma');
    document.getElementById('mp_wrap_ripa_larg').hidden = (tipo !== 'ripa');
    document.getElementById('mp_wrap_ripa_esp').hidden = (tipo !== 'ripa');
  },

  // ── Cores (swatches, padrão Auto-ACM/Luminoso) ────────────────────────────
  montarCores(cores, ordem) {
    MovelParamUI.state.cores = cores || {};
    MovelParamUI.state.ordemCat = ordem || [];
    MovelParamUI.state.cor.cat = ordem[0];
    MovelParamUI.selecionarCor('VX103');
  },

  selecionarCor(trecho) {
    if (!trecho) return;
    for (const cat of MovelParamUI.state.ordemCat) {
      const found = (MovelParamUI.state.cores[cat] || []).find(c => c.nome === trecho || c.nome.includes(trecho));
      if (found) {
        MovelParamUI.state.cor = { nome: found.nome, rgb: found.rgb, cat: cat };
        break;
      }
    }
    MovelParamUI.renderCorPicker();
  },

  renderCorPicker() {
    const st = MovelParamUI.state.cor;
    const tabs = document.getElementById('mp_cor_tabs');
    const grid = document.getElementById('mp_cor_grid');
    if (!tabs || !grid) return;
    const cat = st.cat || MovelParamUI.state.ordemCat[0];
    tabs.innerHTML = MovelParamUI.state.ordemCat.map(c =>
      `<button type="button" class="mp__cor-tab${c === cat ? ' is-active' : ''}" data-cat="${c}">${c}</button>`).join('');
    tabs.querySelectorAll('.mp__cor-tab').forEach(btn => {
      btn.onclick = () => { st.cat = btn.dataset.cat; MovelParamUI.renderCorPicker(); };
    });
    const colors = MovelParamUI.state.cores[cat] || [];
    grid.innerHTML = colors.map((c, i) =>
      `<div class="mp__cor-swatch${st.nome === c.nome ? ' is-selected' : ''}" style="background: rgb(${c.rgb.join(',')})" data-idx="${i}" title="${c.nome}"></div>`).join('');
    grid.querySelectorAll('.mp__cor-swatch').forEach(sw => {
      const c = colors[parseInt(sw.dataset.idx, 10)];
      if (!c) return;
      sw.onclick = () => { MovelParamUI.state.cor = { nome: c.nome, rgb: c.rgb, cat: cat }; MovelParamUI.renderCorPicker(); };
    });
    const chip = document.getElementById('mp_cor_chip');
    const nomeEl = document.getElementById('mp_cor_nome');
    if (chip && st.rgb) chip.style.background = `rgb(${st.rgb.join(',')})`;
    if (nomeEl) nomeEl.textContent = st.nome || '—';
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    try {
      const ctx = await Bridge.call('movel_parametrico_ctx');
      if (ctx && ctx.ok) {
        MovelParamUI.state.lang = ctx.lang || 'pt';
        document.documentElement.dataset.theme = ctx.theme || 'light';
        MovelParamUI.montarCores(ctx.cores || {}, ctx.ordem_cat || []);
      }
    } catch (e) { console.warn('movel_parametrico_ctx falhou:', e); }
    MovelParamUI.renderTexts();
    document.getElementById('mp_btn_gerar').addEventListener('click', MovelParamUI.handleGerar);
    document.getElementById('mp_btn_carregar').addEventListener('click', MovelParamUI.handleCarregar);
    document.getElementById('mp_btn_novo').addEventListener('click', MovelParamUI.handleNovo);
    document.querySelectorAll('.mp__scroll input, .mp__scroll select').forEach(el => {
      el.addEventListener('input', MovelParamUI.renderTudo);
      el.addEventListener('change', MovelParamUI.renderTudo);
    });
    MovelParamUI.renderTudo();
  },

  renderTudo() {
    MovelParamUI.refreshTipo();
    MovelParamUI.renderDiag();
  },

  renderTexts() {
    document.querySelectorAll('[data-key]').forEach(el => {
      el.textContent = MovelParamUI.t(el.dataset.key);
    });
  },

  coletarParams() {
    const cor = MovelParamUI.state.cor.nome ?
      MovelParamUI.state.cor : { nome: 'Branco Brilho (VX103)', rgb: [235, 235, 235] };
    return {
      chapa: MovelParamUI.num('mp_chapa'),
      gap: MovelParamUI.num('mp_gap'),
      eixo: MovelParamUI.val('mp_eixo'),
      fix_tipo: MovelParamUI.val('mp_fix_tipo'),
      fix_qtd: MovelParamUI.num('mp_fix_qtd'),
      fix_diam: MovelParamUI.num('mp_fix_diam'),
      fix_folga: MovelParamUI.num('mp_fix_folga'),
      fix_duplo: MovelParamUI.val('mp_fix_duplo'),
      ripa_larg: MovelParamUI.num('mp_ripa_larg'),
      ripa_esp: MovelParamUI.num('mp_ripa_esp'),
      fix_lado: MovelParamUI.val('mp_fix_lado'),
      fix_margem: MovelParamUI.num('mp_fix_margem'),
      cor_nome: cor.nome, cor_rgb: cor.rgb
    };
  },

  aplicarParams(p) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
    set('mp_chapa', p.chapa); set('mp_gap', p.gap); set('mp_eixo', p.eixo);
    set('mp_fix_tipo', p.fix_tipo); set('mp_fix_qtd', p.fix_qtd);
    set('mp_fix_diam', p.fix_diam); set('mp_fix_folga', p.fix_folga);
    set('mp_fix_duplo', p.fix_duplo);
    set('mp_ripa_larg', p.ripa_larg); set('mp_ripa_esp', p.ripa_esp);
    set('mp_fix_lado', p.fix_lado); set('mp_fix_margem', p.fix_margem);
    if (p.cor_nome) MovelParamUI.selecionarCor(p.cor_nome);
    MovelParamUI.renderTudo();
  },

  // ── Ações ─────────────────────────────────────────────────────────────────
  async handleGerar() {
    const btn = document.getElementById('mp_btn_gerar');
    btn.disabled = true;
    MovelParamUI.setMsg('…', null);
    try {
      const r = await Bridge.call('movel_parametrico_gerar', {
        params: MovelParamUI.coletarParams(),
        entity_id: MovelParamUI.state.editingId || 0
      }, 300000);
      if (r.ok) {
        MovelParamUI.setEditing(r.entity_id);
        let m = MovelParamUI.t(r.novo ? 'msgOk' : 'msgRegen') + r.fatias + MovelParamUI.t('msgFatias');
        if (r.fixadores > 0) m += ` · ${r.fixadores}${MovelParamUI.t('msgFix')}`;
        if (r.pecas > 1) m += ` · ${r.pecas}${MovelParamUI.t('msgPecas')}`;
        if (r.reparados > 0) m += ` · ${r.reparados}${MovelParamUI.t('msgReparados')}`;
        if (r.soltas > 0) m += MovelParamUI.t('msgIgnorados') + r.soltas + MovelParamUI.t('msgSoltas');
        if (r.ignorados > 0) m += MovelParamUI.t('msgIgnorados') + r.ignorados + MovelParamUI.t('msgIgnorados2');
        MovelParamUI.setMsg(m, (r.ignorados > 0 || r.soltas > 0) ? 'error' : 'ok');
      } else if (r.blocked) {
        MovelParamUI.setMsg((r.error || MovelParamUI.t('msgBlocked')) + (r.code ? ' [' + r.code + ']' : ''), 'error');
      } else if (r.code === 'mp.nada_selecionado') {
        MovelParamUI.setMsg(MovelParamUI.t('msgNadaSel'), 'error');
      } else if (r.code === 'mp.nao_solido') {
        MovelParamUI.setMsg(MovelParamUI.t('msgNaoSolido'), 'error');
      } else if (r.code === 'mp.muitas_fatias') {
        MovelParamUI.setMsg(MovelParamUI.t('msgMuitasFatias').replace('{n}', r.precisa).replace('{max}', r.max), 'error');
      } else if (r.code === 'mp.sem_fatias') {
        MovelParamUI.setMsg(MovelParamUI.t('msgSemFatias'), 'error');
      } else if (r.code === 'mp.src_sumiu') {
        MovelParamUI.setMsg(MovelParamUI.t('msgSrcSumiu'), 'error');
      } else {
        MovelParamUI.setMsg(MovelParamUI.t('msgError') + (r.error || r.code || '?'), 'error');
      }
    } catch (e) {
      MovelParamUI.setMsg(MovelParamUI.t('msgError') + e.message, 'error');
    }
    btn.disabled = false;
  },

  async handleCarregar() {
    try {
      const r = await Bridge.call('movel_parametrico_carregar');
      if (r.ok) {
        MovelParamUI.aplicarParams(r.params || {});
        MovelParamUI.setEditing(r.entity_id);
        MovelParamUI.setMsg(MovelParamUI.t('msgCarregado'), 'ok');
      } else {
        MovelParamUI.setMsg(MovelParamUI.t('msgNadaCarregar'), 'error');
      }
    } catch (e) {
      MovelParamUI.setMsg(MovelParamUI.t('msgError') + e.message, 'error');
    }
  },

  handleNovo() {
    MovelParamUI.setEditing(null);
    MovelParamUI.setMsg('', null);
  },

  setEditing(id) {
    MovelParamUI.state.editingId = id;
    const badge = document.getElementById('mp_editing');
    const btn = document.getElementById('mp_btn_gerar');
    if (id) {
      badge.hidden = false;
      document.getElementById('mp_editing_txt').textContent = MovelParamUI.t('editando') + id;
      btn.textContent = MovelParamUI.t('regerar');
    } else {
      badge.hidden = true;
      btn.textContent = MovelParamUI.t('gerar');
    }
  },

  setMsg(text, kind) {
    const el = document.getElementById('mp_msg');
    el.textContent = text;
    el.className = 'mp__msg' + (kind ? ' mp__msg--' + kind : '');
  }
};

window.MovelParamUI = MovelParamUI;
document.addEventListener('DOMContentLoaded', MovelParamUI.init);
