/* ══════════════════════════════════════════════════════════════════════════
   ACMFacil — Letra 3D (diálogo da ferramenta)
   ══════════════════════════════════════════════════════════════════════════
   Fluxo: Importar SVG → configurar parâmetros → Gerar (componente com
   etiquetas por peça). Carregar selecionado → Regenerar no lugar.
   ══════════════════════════════════════════════════════════════════════════ */

const Letra3dUI = {

  state: {
    lang: 'pt',
    editingId: null,
    temArquivo: false,
    paths: null,  // subpaths 2D [[x,y],...] em mm, pro preview isométrico
    cores: {},
    ordemCat: [],
    cor: {} // { nome, rgb, cat }
  },

  i18n: {
    pt: {
      title: 'Letra 3D', subtitle: 'Letras caixa pra impressão 3D a partir de um SVG.',
      novo: 'Novo', importar: 'Importar SVG', nenhumArquivo: 'nenhum arquivo',
      carregar: 'Carregar selecionado', gerar: 'Gerar', regerar: 'Regenerar',
      editando: 'Editando letra 3D #',
      secArquivo: 'ARQUIVO (SVG)', secCorte: 'CORTE DA LETRA (ESQUEMA)',
      secPrev: 'PRÉVIA ISOMÉTRICA', prevVazio: 'Importe um SVG pra ver a prévia',
      secEscala: 'ESCALA', secParede: 'PAREDE SUPERIOR (IMPRESSA)',
      secBaseInf: 'BASE INFERIOR — ENCAIXE (IMPRESSA)',
      secFundoAcr: 'BASE ACM/PVC E ACRÍLICO', secCor: 'COR DA LETRA (IMPRESSÃO)',
      altura: 'Altura do lettering (mm)', prof: 'Profundidade (mm)',
      paredeExt: 'Espessura da parede (mm)',
      bocaEsp: 'Boca: espessura (mm)', bocaAlt: 'Boca: altura (mm)',
      folgaAcr: 'Folga acrílico×boca (mm)',
      altInt: 'Altura total (mm)', folgaInt: 'Folga p/ parede superior (mm)',
      paredeInt: 'Espessura da parede (mm)',
      abaComp: 'Aba: comprimento (mm)', abaEsp: 'Aba: espessura (mm)',
      fundoEsp: 'Base ACM/PVC (mm)', folgaFundo: 'Folga base×parede do L (mm)',
      acrEsp: 'Acrílico da face (mm)', acrTipo: 'Tipo do acrílico',
      acrLeitoso: 'Branco leitoso', acrCristal: 'Cristal (adesivo retroverso)',
      msgImportado: 'SVG importado: ', msgSoSvg: 'Este módulo aceita apenas SVG.',
      msgSemSvg: 'Importe um SVG primeiro.',
      msgOk: 'Letra 3D gerada! ', msgRegen: 'Letra 3D atualizada! ',
      msgLetras: ' letra(s)',
      msgCarregado: 'Parâmetros carregados — edite e clique Regenerar.',
      msgCarregadoSemSvg: 'Carregado, mas o SVG original não foi encontrado — importe de novo pra regenerar.',
      msgNadaSel: 'Selecione uma Letra 3D gerada pelo ACMFacil primeiro.',
      msgBlocked: 'Licença inválida. Faça login no painel do ACMFacil.',
      msgError: 'Erro: '
    },
    es: {
      title: 'Letra 3D', subtitle: 'Letras corpóreas para impresión 3D desde un SVG.',
      novo: 'Nuevo', importar: 'Importar SVG', nenhumArquivo: 'ningún archivo',
      carregar: 'Cargar seleccionado', gerar: 'Generar', regerar: 'Regenerar',
      editando: 'Editando letra 3D #',
      secArquivo: 'ARCHIVO (SVG)', secCorte: 'CORTE DE LA LETRA (ESQUEMA)',
      secPrev: 'VISTA ISOMÉTRICA', prevVazio: 'Importa un SVG para ver la vista previa',
      secEscala: 'ESCALA', secParede: 'PARED SUPERIOR (IMPRESA)',
      secBaseInf: 'BASE INFERIOR — ENCAJE (IMPRESA)',
      secFundoAcr: 'BASE ACM/PVC Y ACRÍLICO', secCor: 'COLOR DE LA LETRA (IMPRESIÓN)',
      altura: 'Alto del lettering (mm)', prof: 'Profundidad (mm)',
      paredeExt: 'Espesor de la pared (mm)',
      bocaEsp: 'Boca: espesor (mm)', bocaAlt: 'Boca: alto (mm)',
      folgaAcr: 'Holgura acrílico×boca (mm)',
      altInt: 'Alto total (mm)', folgaInt: 'Holgura c/ pared superior (mm)',
      paredeInt: 'Espesor de la pared (mm)',
      abaComp: 'Pestaña: largo (mm)', abaEsp: 'Pestaña: espesor (mm)',
      fundoEsp: 'Base ACM/PVC (mm)', folgaFundo: 'Holgura base×pared de la L (mm)',
      acrEsp: 'Acrílico de la cara (mm)', acrTipo: 'Tipo de acrílico',
      acrLeitoso: 'Blanco lechoso', acrCristal: 'Cristal (vinilo retro)',
      msgImportado: 'SVG importado: ', msgSoSvg: 'Este módulo solo acepta SVG.',
      msgSemSvg: 'Importa un SVG primero.',
      msgOk: '¡Letra 3D generada! ', msgRegen: '¡Letra 3D actualizada! ',
      msgLetras: ' letra(s)',
      msgCarregado: 'Parámetros cargados — edita y pulsa Regenerar.',
      msgCarregadoSemSvg: 'Cargado, pero el SVG original no se encontró — impórtalo de nuevo.',
      msgNadaSel: 'Selecciona primero una Letra 3D generada por ACMFacil.',
      msgBlocked: 'Licencia inválida. Inicia sesión en el panel de ACMFacil.',
      msgError: 'Error: '
    },
    en: {
      title: '3D Letter', subtitle: 'Channel letters for 3D printing from an SVG.',
      novo: 'New', importar: 'Import SVG', nenhumArquivo: 'no file',
      carregar: 'Load selected', gerar: 'Generate', regerar: 'Regenerate',
      editando: 'Editing 3D letter #',
      secArquivo: 'FILE (SVG)', secCorte: 'LETTER SECTION (SCHEME)',
      secPrev: 'ISOMETRIC PREVIEW', prevVazio: 'Import an SVG to see the preview',
      secEscala: 'SCALE', secParede: 'TOP WALL (PRINTED)',
      secBaseInf: 'BOTTOM BASE — JOINT (PRINTED)',
      secFundoAcr: 'ACM/PVC BASE & ACRYLIC', secCor: 'LETTER COLOR (PRINT)',
      altura: 'Lettering height (mm)', prof: 'Depth (mm)',
      paredeExt: 'Wall thickness (mm)',
      bocaEsp: 'Lip: thickness (mm)', bocaAlt: 'Lip: height (mm)',
      folgaAcr: 'Acrylic×lip gap (mm)',
      altInt: 'Total height (mm)', folgaInt: 'Gap to top wall (mm)',
      paredeInt: 'Wall thickness (mm)',
      abaComp: 'Tab: length (mm)', abaEsp: 'Tab: thickness (mm)',
      fundoEsp: 'ACM/PVC base (mm)', folgaFundo: 'Base×L-wall gap (mm)',
      acrEsp: 'Face acrylic (mm)', acrTipo: 'Acrylic type',
      acrLeitoso: 'Milky white', acrCristal: 'Clear (backlit vinyl)',
      msgImportado: 'SVG imported: ', msgSoSvg: 'This module only accepts SVG.',
      msgSemSvg: 'Import an SVG first.',
      msgOk: '3D letter generated! ', msgRegen: '3D letter updated! ',
      msgLetras: ' letter(s)',
      msgCarregado: 'Parameters loaded — edit and click Regenerate.',
      msgCarregadoSemSvg: 'Loaded, but the original SVG was not found — import it again.',
      msgNadaSel: 'Select an ACMFacil-generated 3D letter first.',
      msgBlocked: 'Invalid license. Log in on the ACMFacil panel.',
      msgError: 'Error: '
    }
  },

  t(key) {
    const d = Letra3dUI.i18n[Letra3dUI.state.lang] || Letra3dUI.i18n.pt;
    return d[key] || key;
  },

  // Defaults (§17 — sincronizar com extrair do Ruby e values do HTML)
  _defaultParams() {
    return {
      altura: 350, prof: 40,
      parede_ext: 3, boca_esp: 2, boca_alt: 3, folga_acr: 0,
      alt_int: 15, folga_int: 1, parede_int: 2, aba_comp: 10, aba_esp: 2,
      fundo_esp: 2, folga_fundo: 1, acr_esp: 2, acr_tipo: 'leitoso'
    };
  },

  num(id) { return parseFloat(document.getElementById(id).value) || 0; },
  val(id) { return document.getElementById(id).value; },

  // ── Prévia ISOMÉTRICA da letra (extrusão do SVG com a profundidade atual) ─
  _iso(x, y, z) {
    return [(x - y) * 0.866, (x + y) * 0.5 - z];
  },

  renderPrev() {
    const el = document.getElementById('lt3_prev');
    if (!el) return;
    const paths = Letra3dUI.state.paths;
    if (!paths || !paths.length) {
      el.innerHTML = `<div class="lt3__prev-vazio">${Letra3dUI.t('prevVazio')}</div>`;
      return;
    }
    // escala do SVG pra altura configurada
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    paths.forEach(p => p.forEach(pt => {
      minx = Math.min(minx, pt[0]); maxx = Math.max(maxx, pt[0]);
      miny = Math.min(miny, pt[1]); maxy = Math.max(maxy, pt[1]);
    }));
    const altSvg = Math.max(maxy - miny, 1);
    const esc = Letra3dUI.num('lt3_altura') / altSvg;
    const prof = Letra3dUI.num('lt3_prof');

    const topo = [], fundo = [];
    let vb = [Infinity, Infinity, -Infinity, -Infinity];
    const acum = pt => {
      vb[0] = Math.min(vb[0], pt[0]); vb[1] = Math.min(vb[1], pt[1]);
      vb[2] = Math.max(vb[2], pt[0]); vb[3] = Math.max(vb[3], pt[1]);
    };
    paths.forEach(p => {
      const t = [], f = [];
      p.forEach(pt => {
        const x = (pt[0] - minx) * esc, y = (pt[1] - miny) * esc;
        const a = Letra3dUI._iso(x, y, prof);
        const b = Letra3dUI._iso(x, y, 0);
        t.push(a); f.push(b); acum(a); acum(b);
      });
      topo.push(t); fundo.push(f);
    });

    let s = '';
    // base (contorno de trás)
    fundo.forEach(f => {
      s += `<path d="M ${f.map(p => p.join(' ')).join(' L ')} Z" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>`;
    });
    // arestas verticais (amostradas)
    topo.forEach((t, pi) => {
      const f = fundo[pi];
      const passo = Math.max(1, Math.floor(t.length / 14));
      for (let i = 0; i < t.length; i += passo) {
        s += `<line x1="${f[i][0]}" y1="${f[i][1]}" x2="${t[i][0]}" y2="${t[i][1]}" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>`;
      }
    });
    // face frontal (todos os subpaths num path só — furos por evenodd)
    const dTopo = topo.map(t => `M ${t.map(p => p.join(' ')).join(' L ')} Z`).join(' ');
    s += `<path d="${dTopo}" fill-rule="evenodd" fill="#d4af37" fill-opacity="0.4" stroke="currentColor" stroke-width="1.4"/>`;

    const mw = (vb[2] - vb[0]) * 0.06 + 4, mh = (vb[3] - vb[1]) * 0.06 + 4;
    el.innerHTML = `<svg viewBox="${vb[0] - mw} ${vb[1] - mh} ${vb[2] - vb[0] + 2 * mw} ${vb[3] - vb[1] + 2 * mh}" font-family="monospace">${s}</svg>`;
  },

  // ── Diagrama: corte esquemático da letra com cotas ao vivo ────────────────
  _txt(x, y, t, anchor) {
    return `<text x="${x}" y="${y}" fill="currentColor" stroke="none" font-size="9"${anchor ? ` text-anchor="${anchor}"` : ''}>${t}</text>`;
  },

  diag() {
    // corte de UMA parede da letra, fiel ao desenho de referência:
    // parede superior com boca fina + acrílico no degrau; L do encaixe com
    // aba no chão + base ACM/PVC sobre a aba
    const prof = Letra3dUI.num('lt3_prof');
    const pe = Letra3dUI.num('lt3_parede_ext');
    const be = Letra3dUI.num('lt3_boca_esp');
    const ba = Letra3dUI.num('lt3_boca_alt');
    const ai = Letra3dUI.num('lt3_alt_int');
    const fi = Letra3dUI.num('lt3_folga_int');
    const pi = Letra3dUI.num('lt3_parede_int');
    const ac = Letra3dUI.num('lt3_aba_comp');
    const abe = Letra3dUI.num('lt3_aba_esp');
    const fe = Letra3dUI.num('lt3_fundo_esp');
    const ff = Letra3dUI.num('lt3_folga_fundo');
    const ae = Letra3dUI.num('lt3_acr_esp');

    let s = '<svg viewBox="0 0 240 110" fill="none" stroke="currentColor" stroke-width="1.3" font-size="8">';
    const y0 = 98, ex = 1.9, ey = 84 / Math.max(prof, 1); // escalas h/v
    const X = 44; // face externa da parede
    // parede superior (corpo + boca fina)
    s += `<rect x="${X}" y="${y0 - (prof - ba) * ey}" width="${pe * ex}" height="${(prof - ba) * ey}" fill="#d4af37" fill-opacity="0.45"/>`;
    s += `<rect x="${X}" y="${y0 - prof * ey}" width="${be * ex}" height="${ba * ey}" fill="#d4af37" fill-opacity="0.45"/>`;
    // acrílico no degrau da boca
    s += `<rect x="${X + be * ex}" y="${y0 - (prof - ba) * ey - ae * ey}" width="120" height="${ae * ey}" fill="#d4af37" fill-opacity="0.2"/>`;
    // L do encaixe: aba no chão + parede sobre a aba
    const xl = X + pe * ex + fi * ex;
    s += `<rect x="${xl}" y="${y0 - abe * ey}" width="${ac * ex}" height="${abe * ey}" fill="#d4af37" fill-opacity="0.3"/>`;
    s += `<rect x="${xl}" y="${y0 - ai * ey}" width="${pi * ex}" height="${(ai - abe) * ey}" fill="#d4af37" fill-opacity="0.3"/>`;
    // base ACM/PVC sobre a aba
    s += `<rect x="${xl + pi * ex + ff * ex}" y="${y0 - abe * ey - fe * ey}" width="110" height="${fe * ey}"/>`;
    // cotas principais
    s += `<line x1="34" y1="${y0 - prof * ey}" x2="34" y2="${y0}"/><line x1="30" y1="${y0 - prof * ey}" x2="38" y2="${y0 - prof * ey}"/><line x1="30" y1="${y0}" x2="38" y2="${y0}"/>`;
    s += Letra3dUI._txt(26, y0 - prof * ey / 2 + 3, `${prof}`, 'end');
    s += Letra3dUI._txt(120, 10, `parede ${pe} · boca ${be}×${ba} · acrílico ${ae}`, 'middle');
    s += Letra3dUI._txt(120, 22, `L: ${ai} alto · parede ${pi} · aba ${ac}×${abe}`, 'middle');
    s += Letra3dUI._txt(120, 34, `folgas: sup×L ${fi} · base×L ${ff} · base ${fe}`, 'middle');
    return s + '</svg>';
  },

  renderDiag() {
    const el = document.getElementById('lt3_diag');
    if (el) el.innerHTML = Letra3dUI.diag();
  },

  // ── Cores (swatches, padrão Auto-ACM/Luminoso) ────────────────────────────
  montarCores(cores, ordem) {
    Letra3dUI.state.cores = cores || {};
    Letra3dUI.state.ordemCat = ordem || [];
    Letra3dUI.state.cor.cat = ordem[0];
    Letra3dUI.selecionarCor('VX451');
  },

  selecionarCor(trecho) {
    if (!trecho) return;
    for (const cat of Letra3dUI.state.ordemCat) {
      const found = (Letra3dUI.state.cores[cat] || []).find(c => c.nome === trecho || c.nome.includes(trecho));
      if (found) {
        Letra3dUI.state.cor = { nome: found.nome, rgb: found.rgb, cat: cat };
        break;
      }
    }
    Letra3dUI.renderCorPicker();
  },

  renderCorPicker() {
    const st = Letra3dUI.state.cor;
    const tabs = document.getElementById('lt3_cor_tabs');
    const grid = document.getElementById('lt3_cor_grid');
    if (!tabs || !grid) return;
    const cat = st.cat || Letra3dUI.state.ordemCat[0];
    tabs.innerHTML = Letra3dUI.state.ordemCat.map(c =>
      `<button type="button" class="lt3__cor-tab${c === cat ? ' is-active' : ''}" data-cat="${c}">${c}</button>`).join('');
    tabs.querySelectorAll('.lt3__cor-tab').forEach(btn => {
      btn.onclick = () => { st.cat = btn.dataset.cat; Letra3dUI.renderCorPicker(); };
    });
    const colors = Letra3dUI.state.cores[cat] || [];
    grid.innerHTML = colors.map((c, i) =>
      `<div class="lt3__cor-swatch${st.nome === c.nome ? ' is-selected' : ''}" style="background: rgb(${c.rgb.join(',')})" data-idx="${i}" title="${c.nome}"></div>`).join('');
    grid.querySelectorAll('.lt3__cor-swatch').forEach(sw => {
      const c = colors[parseInt(sw.dataset.idx, 10)];
      if (!c) return;
      sw.onclick = () => { Letra3dUI.state.cor = { nome: c.nome, rgb: c.rgb, cat: cat }; Letra3dUI.renderCorPicker(); };
    });
    const chip = document.getElementById('lt3_cor_chip');
    const nomeEl = document.getElementById('lt3_cor_nome');
    if (chip && st.rgb) chip.style.background = `rgb(${st.rgb.join(',')})`;
    if (nomeEl) nomeEl.textContent = st.nome || '—';
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    try {
      const ctx = await Bridge.call('letra3d_ctx');
      if (ctx && ctx.ok) {
        Letra3dUI.state.lang = ctx.lang || 'pt';
        document.documentElement.dataset.theme = ctx.theme || 'light';
        Letra3dUI.montarCores(ctx.cores || {}, ctx.ordem_cat || []);
      }
    } catch (e) { console.warn('letra3d_ctx falhou:', e); }
    Letra3dUI.renderTexts();
    document.getElementById('lt3_btn_importar').addEventListener('click', Letra3dUI.handleImportar);
    document.getElementById('lt3_btn_gerar').addEventListener('click', Letra3dUI.handleGerar);
    document.getElementById('lt3_btn_carregar').addEventListener('click', Letra3dUI.handleCarregar);
    document.getElementById('lt3_btn_novo').addEventListener('click', Letra3dUI.handleNovo);
    document.querySelectorAll('.lt3__scroll input, .lt3__scroll select').forEach(el => {
      el.addEventListener('input', Letra3dUI.renderTudo);
      el.addEventListener('change', Letra3dUI.renderTudo);
    });
    Letra3dUI.renderTudo();
  },

  renderTudo() {
    Letra3dUI.renderDiag();
    Letra3dUI.renderPrev();
  },

  renderTexts() {
    document.querySelectorAll('[data-key]').forEach(el => {
      el.textContent = Letra3dUI.t(el.dataset.key);
    });
  },

  coletarParams() {
    const cor = Letra3dUI.state.cor.nome ?
      Letra3dUI.state.cor : { nome: 'Verde Brilho (VX451)', rgb: [0, 153, 76] };
    return {
      altura: Letra3dUI.num('lt3_altura'),
      prof: Letra3dUI.num('lt3_prof'),
      parede_ext: Letra3dUI.num('lt3_parede_ext'),
      boca_esp: Letra3dUI.num('lt3_boca_esp'),
      boca_alt: Letra3dUI.num('lt3_boca_alt'),
      folga_acr: Letra3dUI.num('lt3_folga_acr'),
      alt_int: Letra3dUI.num('lt3_alt_int'),
      folga_int: Letra3dUI.num('lt3_folga_int'),
      parede_int: Letra3dUI.num('lt3_parede_int'),
      aba_comp: Letra3dUI.num('lt3_aba_comp'),
      aba_esp: Letra3dUI.num('lt3_aba_esp'),
      fundo_esp: Letra3dUI.num('lt3_fundo_esp'),
      folga_fundo: Letra3dUI.num('lt3_folga_fundo'),
      acr_esp: Letra3dUI.num('lt3_acr_esp'),
      acr_tipo: Letra3dUI.val('lt3_acr_tipo'),
      cor_nome: cor.nome, cor_rgb: cor.rgb
    };
  },

  aplicarParams(p) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
    set('lt3_altura', p.altura); set('lt3_prof', p.prof);
    set('lt3_parede_ext', p.parede_ext); set('lt3_boca_esp', p.boca_esp);
    set('lt3_boca_alt', p.boca_alt); set('lt3_folga_acr', p.folga_acr);
    set('lt3_alt_int', p.alt_int); set('lt3_folga_int', p.folga_int);
    set('lt3_parede_int', p.parede_int); set('lt3_aba_comp', p.aba_comp);
    set('lt3_aba_esp', p.aba_esp);
    set('lt3_fundo_esp', p.fundo_esp); set('lt3_folga_fundo', p.folga_fundo);
    set('lt3_acr_esp', p.acr_esp); set('lt3_acr_tipo', p.acr_tipo);
    if (p.cor_nome) Letra3dUI.selecionarCor(p.cor_nome);
    Letra3dUI.renderTudo();
  },

  setArquivo(nome) {
    const el = document.getElementById('lt3_file_nome');
    Letra3dUI.state.temArquivo = !!nome;
    el.textContent = nome || Letra3dUI.t('nenhumArquivo');
    el.classList.toggle('lt3__file-nome--ok', !!nome);
  },

  // ── Ações ─────────────────────────────────────────────────────────────────
  async handleImportar() {
    try {
      // 10 min: o Ruby fica no openpanel esperando o usuário escolher
      const r = await Bridge.call('letra3d_importar', {}, 600000);
      if (r.ok) {
        Letra3dUI.setArquivo(r.filename);
        Letra3dUI.state.paths = r.paths_2d || null;
        Letra3dUI.renderPrev();
        Letra3dUI.setMsg(Letra3dUI.t('msgImportado') + r.filename + ` (${r.n_paths} paths)`, 'ok');
      } else if (r.code === 'letra3d.somente_svg') {
        Letra3dUI.setMsg(Letra3dUI.t('msgSoSvg'), 'error');
      } else if (r.code !== 'logo3d.cancelled') {
        Letra3dUI.setMsg(Letra3dUI.t('msgError') + (r.error || r.code || '?'), 'error');
      }
    } catch (e) {
      Letra3dUI.setMsg(Letra3dUI.t('msgError') + e.message, 'error');
    }
  },

  async handleGerar() {
    if (!Letra3dUI.state.temArquivo && !Letra3dUI.state.editingId) {
      Letra3dUI.setMsg(Letra3dUI.t('msgSemSvg'), 'error');
      return;
    }
    const btn = document.getElementById('lt3_btn_gerar');
    btn.disabled = true;
    Letra3dUI.setMsg('…', null);
    try {
      const r = await Bridge.call('letra3d_gerar', {
        params: Letra3dUI.coletarParams(),
        entity_id: Letra3dUI.state.editingId || 0
      }, 120000);
      if (r.ok) {
        Letra3dUI.setEditing(r.entity_id);
        Letra3dUI.setMsg(Letra3dUI.t(r.novo ? 'msgOk' : 'msgRegen') + r.letras + Letra3dUI.t('msgLetras'), 'ok');
      } else if (r.blocked) {
        Letra3dUI.setMsg((r.error || Letra3dUI.t('msgBlocked')) + (r.code ? ' [' + r.code + ']' : ''), 'error');
      } else if (r.code === 'letra3d.sem_svg') {
        Letra3dUI.setMsg(Letra3dUI.t('msgSemSvg'), 'error');
      } else {
        Letra3dUI.setMsg(Letra3dUI.t('msgError') + (r.error || r.code || '?'), 'error');
      }
    } catch (e) {
      Letra3dUI.setMsg(Letra3dUI.t('msgError') + e.message, 'error');
    }
    btn.disabled = false;
  },

  async handleCarregar() {
    try {
      const r = await Bridge.call('letra3d_carregar');
      if (r.ok) {
        Letra3dUI.aplicarParams(r.params || {});
        Letra3dUI.setEditing(r.entity_id);
        if (r.svg_ok) {
          Letra3dUI.setArquivo(r.filename);
          Letra3dUI.state.paths = r.paths_2d || null;
          Letra3dUI.renderPrev();
          Letra3dUI.setMsg(Letra3dUI.t('msgCarregado'), 'ok');
        } else {
          Letra3dUI.setMsg(Letra3dUI.t('msgCarregadoSemSvg'), 'error');
        }
      } else {
        Letra3dUI.setMsg(Letra3dUI.t('msgNadaSel'), 'error');
      }
    } catch (e) {
      Letra3dUI.setMsg(Letra3dUI.t('msgError') + e.message, 'error');
    }
  },

  handleNovo() {
    Letra3dUI.setEditing(null);
    Letra3dUI.setMsg('', null);
  },

  setEditing(id) {
    Letra3dUI.state.editingId = id;
    const badge = document.getElementById('lt3_editing');
    const btn = document.getElementById('lt3_btn_gerar');
    if (id) {
      badge.hidden = false;
      document.getElementById('lt3_editing_txt').textContent = Letra3dUI.t('editando') + id;
      btn.textContent = Letra3dUI.t('regerar');
    } else {
      badge.hidden = true;
      btn.textContent = Letra3dUI.t('gerar');
    }
  },

  setMsg(text, kind) {
    const el = document.getElementById('lt3_msg');
    el.textContent = text;
    el.className = 'lt3__msg' + (kind ? ' lt3__msg--' + kind : '');
  }
};

window.Letra3dUI = Letra3dUI;
document.addEventListener('DOMContentLoaded', Letra3dUI.init);
