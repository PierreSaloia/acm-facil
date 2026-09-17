/* ══════════════════════════════════════════════════════════════════════════
   PLANIFICA — planificação + plano de corte (nesting) de móveis MDF
   ══════════════════════════════════════════════════════════════════════════ */

const _ov1d = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/* MaxRects — mantém retângulos livres e encaixa cada peça onde melhor servir.
   heuristic: 'bssf' (sobra menos no lado curto) ou 'contact' (encosta mais nas
   vizinhas/bordas → preenche vãos, menos buracos). */
class MaxRectsBin {
  constructor(w, h) { this.W = w; this.H = h; this.free = [{ x: 0, y: 0, w: w, h: h }]; this.placed = []; }
  _contact(x, y, w, h) {
    let c = 0;
    if (x <= 1e-6) c += h; if (x + w >= this.W - 1e-6) c += h;
    if (y <= 1e-6) c += w; if (y + h >= this.H - 1e-6) c += w;
    for (const r of this.placed) {
      if (Math.abs(r.x + r.w - x) < 1e-6 || Math.abs(x + w - r.x) < 1e-6) c += _ov1d(y, y + h, r.y, r.y + r.h);
      if (Math.abs(r.y + r.h - y) < 1e-6 || Math.abs(y + h - r.y) < 1e-6) c += _ov1d(x, x + w, r.x, r.x + r.w);
    }
    return c;
  }
  findNode(w, h, allowRot, heuristic) {
    let best = null;
    const E = 1e-6;
    for (const fr of this.free) {
      if (w <= fr.w + E && h <= fr.h + E) {
        const score = (heuristic === 'contact') ? -this._contact(fr.x, fr.y, w, h) : Math.min(fr.w - w, fr.h - h);
        if (!best || score < best.score) best = { x: fr.x, y: fr.y, w, h, rot: false, score };
      }
      if (allowRot && h <= fr.w + E && w <= fr.h + E) {
        const score = (heuristic === 'contact') ? -this._contact(fr.x, fr.y, h, w) : Math.min(fr.w - h, fr.h - w);
        if (!best || score < best.score) best = { x: fr.x, y: fr.y, w: h, h: w, rot: true, score };
      }
    }
    return best;
  }
  place(node) {
    const out = [];
    for (const fr of this.free) {
      if (this._overlap(fr, node)) out.push(...this._split(fr, node));
      else out.push(fr);
    }
    this.free = out;
    this._prune();
    this.placed.push({ x: node.x, y: node.y, w: node.w, h: node.h });
  }
  _overlap(a, b) { return !(b.x >= a.x + a.w || b.x + b.w <= a.x || b.y >= a.y + a.h || b.y + b.h <= a.y); }
  _split(fr, n) {
    const r = [];
    if (n.x < fr.x + fr.w && n.x + n.w > fr.x) {
      if (n.y > fr.y) r.push({ x: fr.x, y: fr.y, w: fr.w, h: n.y - fr.y });
      if (n.y + n.h < fr.y + fr.h) r.push({ x: fr.x, y: n.y + n.h, w: fr.w, h: fr.y + fr.h - (n.y + n.h) });
    }
    if (n.y < fr.y + fr.h && n.y + n.h > fr.y) {
      if (n.x > fr.x) r.push({ x: fr.x, y: fr.y, w: n.x - fr.x, h: fr.h });
      if (n.x + n.w < fr.x + fr.w) r.push({ x: n.x + n.w, y: fr.y, w: fr.x + fr.w - (n.x + n.w), h: fr.h });
    }
    return r.filter(f => f.w > 0.5 && f.h > 0.5);
  }
  _prune() {
    for (let i = 0; i < this.free.length; i++)
      for (let j = i + 1; j < this.free.length; j++) {
        if (this._contains(this.free[j], this.free[i])) { this.free.splice(i, 1); i--; break; }
        if (this._contains(this.free[i], this.free[j])) { this.free.splice(j, 1); j--; }
      }
  }
  _contains(a, b) { return a.x <= b.x + 1e-6 && a.y <= b.y + 1e-6 && a.x + a.w >= b.x + b.w - 1e-6 && a.y + a.h >= b.y + b.h - 1e-6; }
}

/* Guillotine — split de ponta a ponta (corte de serra). SAS+BAF. */
class GuillotineBin {
  constructor(w, h) { this.W = w; this.H = h; this.free = [{ x: 0, y: 0, w: w, h: h }]; }
  findNode(w, h, allowRot) {
    let best = null;
    this.free.forEach((fr, i) => {
      if (w <= fr.w + 1e-6 && h <= fr.h + 1e-6) { const s = fr.w * fr.h - w * h; if (!best || s < best.score) best = { i, x: fr.x, y: fr.y, w, h, rot: false, score: s }; }
      if (allowRot && h <= fr.w + 1e-6 && w <= fr.h + 1e-6) { const s = fr.w * fr.h - w * h; if (!best || s < best.score) best = { i, x: fr.x, y: fr.y, w: h, h: w, rot: true, score: s }; }
    });
    return best;
  }
  place(node) {
    const fr = this.free[node.i];
    this.free.splice(node.i, 1);
    const lw = fr.w - node.w, lh = fr.h - node.h;
    let r1, r2;
    if (lw < lh) { r1 = { x: fr.x + node.w, y: fr.y, w: lw, h: node.h }; r2 = { x: fr.x, y: fr.y + node.h, w: fr.w, h: lh }; }
    else { r1 = { x: fr.x + node.w, y: fr.y, w: lw, h: fr.h }; r2 = { x: fr.x, y: fr.y + node.h, w: node.w, h: lh }; }
    if (r1.w > 0.5 && r1.h > 0.5) this.free.push(r1);
    if (r2.w > 0.5 && r2.h > 0.5) this.free.push(r2);
  }
}

window.Planifica = {
  state: {
    paineis:   [],          // [{id, nome, esp, larg, comp, area, corners:[8×xyz], pid}]
    espessuras:[],          // lista de espessuras detectadas (pra re-render do hint)
    byId:      {},          // id -> painel
    bbox:      null,        // { min:[x,y,z], max:[x,y,z] } do móvel (mm)
    chapa:     { larg: 2750, comp: 1850 },
    cutArea:   { larg: 2500, comp: 1300 },   // área de corte do equipamento (router/laser)
    modo:      'serra',     // 'serra' | 'router' | 'laser'
    algo:      'auto',      // 'auto' | 'maxrects' | 'contact' | 'skyline' | 'guillotine'
    bestAlgo:  null,
    margem:    10,
    espaco:    5,
    allowRotate: true,
    layout:    null,        // { espList:[], byEsp:{ esp:[ {parts:[{x,y,w,h,nome,id}]} ] } }
    activeEsp: null,
    sheetIdx:  0,
    selectedId: null,       // peça destacada
    banding:   null,        // { edges: { 'id:lado': {on,len,wa,wb,quad} } } — fita de borda
    tool:      null,        // ferramenta de fita ativa: null | 'cut' | 'add'
    show3d:    false,        // marcar fitas no SketchUp (3D) ao vivo
    fitaWidth: 0,           // largura da fita (mm); 0 = auto (usa a espessura da peça)
    oversized: [],          // ids de peças que não cabem na área útil
    isoRx:     -0.5,        // rotação da vista isométrica
    isoRy:     0.7,
    isoZoom:   1,           // zoom da vista isométrica (scroll)
    isoPanX:   0,           // pan da vista isométrica (shift+drag)
    isoPanY:   0,
    zoom2D:    1,           // zoom da chapa (scroll)
    panX2D:    0,           // pan da chapa (shift+drag)
    panY2D:    0,
    dragging2D: false,
    lastX2D:   0, lastY2D: 0,
    loading:   false
  },

  _resetView2D() {
    const s = Planifica.state;
    s.zoom2D = 1; s.panX2D = 0; s.panY2D = 0;
  },

  _resetViewIso() {
    const s = Planifica.state;
    s.isoZoom = 1; s.isoPanX = 0; s.isoPanY = 0;
  },

  // Tradução com substituição de {placeholders}. Fallback pro próprio texto.
  _t(key, vars) {
    let str = (window.I18n ? I18n.t(key) : key) || key;
    if (vars) Object.keys(vars).forEach(k => { str = str.split('{' + k + '}').join(vars[k]); });
    return str;
  },

  init() {
    const s = Planifica.state;
    s.paineis = []; s.espessuras = []; s.byId = {}; s.bbox = null; s.layout = null;
    s.activeEsp = null; s.sheetIdx = 0; s.selectedId = null; s.banding = null; s.tool = null;
    Planifica._bindInputs();
    Planifica._bindCanvases();
    Planifica._updateCaptureLabel();
    Planifica._renderCaptureHint();
    if (window.lucide) lucide.createIcons();
  },

  // ── TELA INICIAL: Capturar × Bloco de Móveis ──────────────────────────────
  escolherFluxo(f) {
    const el = id => document.getElementById(id);
    if (el('plf_start')) el('plf_start').hidden = true;
    if (el('plf_capture')) el('plf_capture').hidden = (f !== 'capturar');
    if (el('plf_biblio')) el('plf_biblio').hidden = (f !== 'biblio');
    if (f === 'biblio') {
      Planifica.atualizarCorDot();
      Planifica._bindWiz();
      Planifica.wizGo(Planifica.state.wizStep || 1);
    }
    if (window.lucide) lucide.createIcons();
  },

  // ── ASSISTENTE PAGINADO da biblioteca (5 páginas com desenhos cotados) ───
  wizGo(n) {
    const s = Planifica.state;
    s.wizStep = Math.min(5, Math.max(1, n | 0));
    document.querySelectorAll('.plf__wiz-page').forEach(p => {
      p.hidden = (parseInt(p.dataset.page, 10) !== s.wizStep);
    });
    document.querySelectorAll('.plf__wiz-tab').forEach(t => {
      t.classList.toggle('is-active', parseInt(t.dataset.step, 10) === s.wizStep);
    });
    const prev = document.getElementById('plf_wiz_prev');
    const next = document.getElementById('plf_wiz_next');
    if (prev) prev.disabled = (s.wizStep === 1);
    if (next) next.disabled = (s.wizStep === 5);
    if (window.lucide) lucide.createIcons();
  },

  // liga os inputs aos textos de cota dos desenhos (uma vez só)
  _bindWiz() {
    const s = Planifica.state;
    if (s._wizBound) { Planifica._wizRefresh(); return; }
    s._wizBound = true;
    ['plf_mv_larg', 'plf_mv_prof', 'plf_mv_alt', 'plf_mv_raio', 'plf_mv_tampo',
     'plf_mv_balanco', 'plf_mv_perfil', 'plf_mv_gavlarg'].forEach(id => {
      const inp = document.getElementById(id);
      if (inp) inp.addEventListener('input', Planifica._wizRefresh);
    });
    Planifica._wizRefresh();
  },

  _wizRefresh() {
    const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
    const put = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
    put('plf_svg_L', v('plf_mv_larg'));
    put('plf_svg_A', v('plf_mv_alt'));
    put('plf_svg_P', v('plf_mv_prof'));
    put('plf_svg_raio', 'R ' + (v('plf_mv_raio') || 0));
    put('plf_svg_te', v('plf_mv_tampo'));
    put('plf_svg_bal', Planifica._t('plf.biblio.svgBal') + ' ' + (v('plf_mv_balanco') || 0));
    put('plf_svg_perfil', (v('plf_mv_perfil') || '30x20').replace('x', ' × '));
    put('plf_svg_gavlarg', v('plf_mv_gavlarg'));
    const rect = document.getElementById('plf_svg_tampo_rect');
    if (rect) rect.setAttribute('rx', Math.min(40, (parseFloat(v('plf_mv_raio')) || 0) * 0.35 + 2));
  },

  voltarInicio() {
    const el = id => document.getElementById(id);
    if (el('plf_start')) el('plf_start').hidden = false;
    if (el('plf_capture')) el('plf_capture').hidden = true;
    if (el('plf_biblio')) el('plf_biblio').hidden = true;
    Planifica._showSections(false);
    const alerta = el('plf_oversize_alert');
    if (alerta) alerta.hidden = true;
    if (window.lucide) lucide.createIcons();
  },

  // ── BLOCO DE MÓVEIS: gera a bancada no servidor e planifica em seguida ────
  async gerarMovel() {
    const s = Planifica.state;
    if (s.loading) return;
    const el = id => document.getElementById(id);
    const num = (id, def) => { const v = parseFloat(el(id) && el(id).value); return isFinite(v) ? v : def; };
    const perfil = ((el('plf_mv_perfil') && el('plf_mv_perfil').value) || '30x20').split('x');
    const params = {
      movel: 'bancada_gaveteiro',
      larg: num('plf_mv_larg', 1500),
      prof: num('plf_mv_prof', 700),
      alt: num('plf_mv_alt', 735),
      metalon_a: parseFloat(perfil[0]) || 30,
      metalon_b: parseFloat(perfil[1]) || 20,
      metalon_parede: num('plf_mv_parede', 1.25),
      mdf_esp: num('plf_mv_mdf', 15),
      tampo_esp: num('plf_mv_tampo', 15),
      tampo_balanco: num('plf_mv_balanco', 50),
      gav_n: num('plf_mv_gavn', 2),
      gav_mod_larg: num('plf_mv_gavlarg', 460),
      corredica_comp: num('plf_mv_corredica', 400),
      puxador_comp: num('plf_mv_puxador', 170),
      vao_max: num('plf_mv_vao', 1100),
      folga_encaixe: num('plf_mv_folga_enc', 2),
      tampo_raio: num('plf_mv_raio', 0),
      gav_dois_lados: !!(el('plf_mv_gav2') && el('plf_mv_gav2').checked),
      prateleira: !!(el('plf_mv_prat') && el('plf_mv_prat').checked),
      chapa_larg: s.chapa.larg,
      chapa_comp: s.chapa.comp
    };
    // cor do MDF (paleta): "r,g,b|Nome"
    const corSel = ((el('plf_mv_cor') && el('plf_mv_cor').value) || '193,154,107|Carvalho_Mel').split('|');
    params.cor_rgb = corSel[0].split(',').map(v => parseInt(v, 10));
    params.cor_nome = corSel[1] || 'Carvalho';
    params.cor_tex = corSel[2] || '';   // textura real (render Enscape) — vazio = cor lisa
    params.fita_cor = (el('plf_mv_fita') && el('plf_mv_fita').value) || 'mdf';

    const btn = el('plf_btn_gerar_movel');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    try {
      const r = await Bridge.call('planifica_gerar_movel', { params });
      if (!r || !r.ok) {
        const msg = (r && r.blocked)
          ? ((r.error || Planifica._t('plf.biblio.blocked')) + (r.code ? ' [' + r.code + ']' : ''))
          : ((r && r.error) || Planifica._t('plf.biblio.erro'));
        if (window.Toast) Toast.error(msg);
        return;
      }
      Planifica._renderMovelResult(r);
      // reseta os controles de interação do móvel novo
      Planifica.state.gavCount = 0;
      Planifica.state.gavTotal = params.gav_n * (params.gav_dois_lados ? 2 : 1);
      Planifica.state.cotasVis = true;
      const ct = el('plf_mv_btn_cotas_txt');
      if (ct) ct.textContent = Planifica._t('plf.biblio.cotasOcultar');
      const sl = el('plf_mv_explode');
      if (sl) sl.value = 0;
      const bt = el('plf_mv_btn_gav_txt');
      if (bt) bt.textContent = Planifica._t('plf.biblio.gavAbrir');
      // NÃO planifica automático: o usuário ajusta/regenera à vontade e
      // clica "Planificar agora" quando o móvel estiver do jeito dele
    } catch (e) {
      if (window.Toast) Toast.error('Erro: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    }
  },

  _renderMovelResult(r) {
    const el = id => document.getElementById(id);
    const wrap = el('plf_mv_result');
    if (!wrap) return;
    wrap.hidden = false;
    const p = r.pesos || {};
    el('plf_mv_stats').innerHTML =
      '<span>' + Planifica._t('plf.biblio.res.pecas', { n: r.n }) + '</span>' +
      '<span>' + Planifica._t('plf.biblio.res.quadros', { n: r.quadros_n }) + '</span>' +
      '<span>' + Planifica._t('plf.biblio.res.metalon', { m: p.metalon_m, kg: p.metalon_kg }) + '</span>' +
      '<span>' + Planifica._t('plf.biblio.res.mdf', { kg: p.mdf_kg }) + '</span>' +
      '<span><b>' + Planifica._t('plf.biblio.res.total', { kg: p.total_kg }) + '</b></span>';
    const sug = el('plf_mv_sugestao');
    if (r.sugestao && r.sugestao.texto) {
      sug.hidden = false;
      sug.innerHTML = '<b>' + Planifica._t('plf.biblio.sugestao') + '</b> ' + r.sugestao.texto +
        ' <button type="button" class="btn btn--sm btn--secondary" onclick="Planifica.aplicarSugestao(' +
        r.sugestao.larg_sug + ')">' + Planifica._t('plf.biblio.aplicar') + '</button>';
    } else {
      sug.hidden = true;
    }
    const av = el('plf_mv_avisos');
    if (r.avisos && r.avisos.length) {
      av.hidden = false;
      av.innerHTML = r.avisos.map(a => '⚠ ' + a).join('<br>');
    } else {
      av.hidden = true;
    }
  },

  aplicarSugestao(v) {
    const inp = document.getElementById('plf_mv_larg');
    if (inp) inp.value = v;
    Planifica.gerarMovel();
  },

  // Mostrar/ocultar a tag "MOV - Cotas" no SketchUp
  async toggleCotas() {
    const s = Planifica.state;
    s.cotasVis = !s.cotasVis;
    const txt = document.getElementById('plf_mv_btn_cotas_txt');
    if (txt) txt.textContent = Planifica._t(s.cotasVis ? 'plf.biblio.cotasOcultar' : 'plf.biblio.cotasMostrar');
    try { await Bridge.call('planifica_movel_transformar', { cotas: s.cotasVis }); } catch (e) { }
  },

  // Botão "Planificar agora": garante a seleção do móvel gerado e captura
  async planificarMovel() {
    try { await Bridge.call('planifica_movel_selecionar', {}); } catch (e) { }
    await Planifica.capturar();
  },

  atualizarCorDot() {
    const sel = document.getElementById('plf_mv_cor');
    const dot = document.getElementById('plf_mv_cor_dot');
    if (sel && dot) dot.style.background = 'rgb(' + sel.value.split('|')[0] + ')';
  },

  // ── interação com o móvel gerado: gavetas em SEQUÊNCIA + explodir ────────
  // cada clique abre a próxima gaveta; com todas abertas, o clique fecha todas
  async toggleGavetas() {
    const s = Planifica.state;
    const total = s.gavTotal || 0;
    s.gavCount = (s.gavCount || 0) < total ? (s.gavCount || 0) + 1 : 0;
    const txt = document.getElementById('plf_mv_btn_gav_txt');
    if (txt) {
      txt.textContent = (s.gavCount >= total && total > 0)
        ? Planifica._t('plf.biblio.gavFechar')
        : Planifica._t('plf.biblio.gavAbrir') + (total > 1 ? ' (' + s.gavCount + '/' + total + ')' : '');
    }
    try {
      const r = await Bridge.call('planifica_movel_transformar', { gavetas: s.gavCount });
      if (r && !r.ok && r.code === 'planifica.movel_nao_gerado' && window.Toast) {
        Toast.warning(Planifica._t('plf.biblio.gereAntes'));
      }
    } catch (e) { /* silencioso — interação visual */ }
  },

  // slider 0..100 → fator 0..1; THROTTLE pra não afogar o Ruby no arrasto
  explodirMovel(valor) {
    const s = Planifica.state;
    s._explodeAlvo = parseFloat(valor) / 100;
    if (s._explodeBusy) return;
    s._explodeBusy = true;
    const envia = async () => {
      const f = s._explodeAlvo;
      try { await Bridge.call('planifica_movel_transformar', { explode: f }); } catch (e) { }
      if (s._explodeAlvo !== f) { envia(); } else { s._explodeBusy = false; }
    };
    envia();
  },

  // Troca o idioma SEM perder a captura: re-aplica os textos dinâmicos
  // (gerados por JS) e redesenha. Os estáticos já foram tratados pelo
  // I18n.applyToDOM() chamado no setLang antes deste hook.
  onLangChange() {
    Planifica._updateCaptureLabel();
    Planifica._renderCaptureHint();
    Planifica._renderAlgoInfo();
    if (Planifica.state.paineis.length) Planifica._afterNest();
    if (window.lucide) lucide.createIcons();
  },

  // Rótulo do botão de captura: "Capturar" na 1ª vez, "Recapturar" depois.
  _updateCaptureLabel() {
    const btn = document.getElementById('plf_btn_capturar');
    if (!btn) return;
    const span = btn.querySelector('span');
    if (span) span.textContent = Planifica.state.paineis.length
      ? Planifica._t('plf.capture.recapture')
      : Planifica._t('plf.capture.btn');
  },

  // Texto de apoio abaixo do botão: resumo da captura (se houver) ou hint.
  _renderCaptureHint() {
    const el = document.getElementById('plf_capture_hint');
    if (!el) return;
    const s = Planifica.state;
    if (s.paineis.length) {
      el.textContent = Planifica._t('plf.capture.ok', { n: s.paineis.length, esp: (s.espessuras || []).join(', ') });
      el.classList.remove('plf__hint--error');
    } else {
      el.textContent = Planifica._t('plf.capture.hint');
      el.classList.remove('plf__hint--error');
    }
  },

  // ── Inputs (live re-nest) ──────────────────────────────────────────────
  _bindInputs() {
    const ids = ['plf_chapa_larg', 'plf_chapa_comp', 'plf_cut_larg', 'plf_cut_comp', 'plf_margem', 'plf_espaco'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._plfBound) {
        el._plfBound = true;
        el.addEventListener('input', () => Planifica._onParamChange());
      }
    });
    const rot = document.getElementById('plf_rotate');
    if (rot && !rot._plfBound) {
      rot._plfBound = true;
      rot.addEventListener('change', () => Planifica._onParamChange());
    }
    const algo = document.getElementById('plf_algo');
    if (algo && !algo._plfBound) {
      algo._plfBound = true;
      algo.addEventListener('change', () => Planifica.setAlgo(algo.value));
    }
    const fw = document.getElementById('plf_fita_w');
    if (fw && !fw._plfBound) {
      fw._plfBound = true;
      fw.addEventListener('input', () => Planifica.setFitaWidth());
    }
    Planifica._renderAlgoInfo();
    const cv = document.getElementById('plf_canvas');
    if (cv && !cv._plfBound) {
      cv._plfBound = true;
      window.addEventListener('resize', () => Planifica._scheduleDraw());
    }
  },

  _num(id, fallback) {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isFinite(v) ? v : fallback;
  },

  _onParamChange() {
    const s = Planifica.state;
    s.chapa.larg = Math.max(100, Planifica._num('plf_chapa_larg', 2750));
    s.chapa.comp = Math.max(100, Planifica._num('plf_chapa_comp', 1850));
    s.cutArea.larg = Math.max(50, Planifica._num('plf_cut_larg', 2500));
    s.cutArea.comp = Math.max(50, Planifica._num('plf_cut_comp', 1300));
    s.margem     = Math.max(0, Planifica._num('plf_margem', 10));
    s.espaco     = Math.max(0, Planifica._num('plf_espaco', 5));
    const rot = document.getElementById('plf_rotate');
    s.allowRotate = rot ? rot.checked : true;
    if (s.paineis.length) { Planifica._nest(); Planifica._afterNest(); }
  },

  // Troca o modo de equipamento (serra/router/laser) → mostra/esconde a área
  // de corte e re-encaixa.
  setModo(modo) {
    const s = Planifica.state;
    s.modo = modo;
    document.querySelectorAll('.plf__seg-btn[data-modo]').forEach(b => b.classList.toggle('is-active', b.dataset.modo === modo));
    const cutWrap = document.getElementById('plf_cut_wrap');
    if (cutWrap) cutWrap.hidden = (modo === 'serra');
    if (s.paineis.length) { Planifica._resetView2D(); Planifica._nest(); Planifica._afterNest(); }
  },

  // Troca o algoritmo escolhido + atualiza a explicação. Reseta o "melhor"
  // e re-encaixa na hora com o novo estilo (cada algoritmo é diferente).
  setAlgo(algo) {
    const s = Planifica.state;
    s.algo = algo;
    s.bestScore = null;
    s.bestAlgo = null;
    Planifica._renderAlgoInfo();
    if (s.paineis.length) {
      Planifica._resetView2D();
      Planifica._nest();
      Planifica._afterNest();
    }
  },

  _renderAlgoInfo() {
    const el = document.getElementById('plf_algo_info');
    if (!el) return;
    el.textContent = Planifica._t('plf.algo.info.' + Planifica.state.algo);
  },

  // ── CAPTURAR — detecta os painéis do móvel selecionado ──────────────────
  async capturar() {
    if (Planifica.state.loading) return;
    Planifica.state.loading = true;
    const btn = document.getElementById('plf_btn_capturar');
    if (btn) btn.disabled = true;
    try {
      const r = await Bridge.call('planifica_capturar', {});
      if (!r || !r.ok) {
        Planifica._hintError(Planifica._errMsg(r && r.code));
        return;
      }
      const s = Planifica.state;
      s.paineis = r.paineis || [];
      s.espessuras = r.espessuras || [];
      s.bbox = r.bbox || null;
      s.selectedId = null;
      s.byId = {};
      s.paineis.forEach(p => { s.byId[p.id] = p; });
      Planifica._computeEdgeBanding();
      Planifica._resetView2D();
      Planifica._resetViewIso();
      Planifica._renderCaptureHint();
      Planifica._updateCaptureLabel();
      Planifica._onParamChange();       // lê params atuais + nesta
      Planifica._showSections(true);
      Planifica._scheduleDrawIso();
      Planifica._syncFitas3d(true);     // atualiza marcação 3D se estiver ligada
      // Feedback explícito a cada (re)captura — deixa claro que recapturou.
      if (window.Toast) Toast.success(Planifica._t('plf.capture.ok', { n: s.paineis.length, esp: (s.espessuras || []).join(', ') }));
    } catch (e) {
      Planifica._hintError(Planifica._t('plf.err.comm', { e: e.message }));
    } finally {
      Planifica.state.loading = false;
      if (btn) btn.disabled = false;
    }
  },

  _errMsg(code) {
    const m = {
      'planifica.nada_selecionado': 'plf.err.nada',
      'planifica.nenhum_painel':    'plf.err.nenhum'
    };
    return Planifica._t(m[code] || 'plf.err.generic');
  },

  _hintError(msg) {
    const el = document.getElementById('plf_capture_hint');
    if (el) { el.textContent = msg; el.classList.add('plf__hint--error'); }
    if (window.Toast) Toast.error(msg);
  },

  _showSections(on) {
    ['plf_params', 'plf_stats', 'plf_preview_section', 'plf_list_section', 'plf_footer']
      .forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !on; });
  },

  // ── NESTING (MaxRects por espessura) ────────────────────────────────────
  // Passada única (ordem por área desc) — usada na captura/mudança de params.
  // O botão "Gerar Encaixe" (gerarEncaixe) refina iterando várias estratégias.
  _nest() {
    const s = Planifica.state;
    const byEsp = Planifica._byEsp();
    const espList = Object.keys(byEsp).map(Number).sort((a, b) => a - b);
    const algo = (s.algo === 'auto') ? 'maxrects' : s.algo;   // passada rápida
    const layoutByEsp = {};
    espList.forEach(esp => {
      const arr = byEsp[esp].slice().sort((a, b) => b.larg * b.comp - a.larg * a.comp);
      layoutByEsp[esp] = Planifica._packAlgo(algo, arr);
    });
    s.layout = { espList, byEsp: layoutByEsp };
    s.bestScore = Planifica._scoreLayout(s.layout);
    if (s.activeEsp === null || espList.indexOf(s.activeEsp) < 0) s.activeEsp = espList[0];
    s.sheetIdx = 0;
  },

  _byEsp() {
    const byEsp = {};
    Planifica.state.paineis.forEach(p => { (byEsp[p.esp] = byEsp[p.esp] || []).push(p); });
    return byEsp;
  },

  // Área útil de empacotamento (mm): chapa, OU área de corte do equipamento
  // (CNC router / laser) se for menor. Margem descontada nos 2 lados.
  _usableArea() {
    const s = Planifica.state;
    let baseW = s.chapa.larg, baseH = s.chapa.comp;
    if ((s.modo === 'router' || s.modo === 'laser') && s.cutArea) {
      if (s.cutArea.larg > 0) baseW = Math.min(baseW, s.cutArea.larg);
      if (s.cutArea.comp > 0) baseH = Math.min(baseH, s.cutArea.comp);
    }
    return { baseW, baseH, usableW: baseW - 2 * s.margem, usableH: baseH - 2 * s.margem };
  },

  // Despacha pro algoritmo escolhido (com fallback seguro pra MaxRects).
  _packAlgo(algo, panels) {
    try {
      if (algo === 'contact')    return Planifica._packBins(panels, (w, h) => new MaxRectsBin(w, h), 'contact');
      if (algo === 'guillotine') return Planifica._packBins(panels, (w, h) => new GuillotineBin(w, h), null);
      if (algo === 'skyline')    return Planifica._packSkyline(panels);
      return Planifica._packBins(panels, (w, h) => new MaxRectsBin(w, h), 'bssf');
    } catch (e) {
      console.error('[Planifica] pack ' + algo + ' falhou:', e);
      return Planifica._packBins(panels, (w, h) => new MaxRectsBin(w, h), 'bssf');
    }
  },

  // Empacotador multi-chapa genérico (MaxRects ou Guillotine).
  _packBins(panels, makeBin, heuristic) {
    const s = Planifica.state;
    const gap = s.espaco, margin = s.margem;
    const { usableW, usableH } = Planifica._usableArea();
    const bins = [];
    panels.forEach(p => {
      const iw = p.larg + gap, ih = p.comp + gap;
      let best = null, bestBin = null;
      for (const b of bins) {
        const node = b.bin.findNode(iw, ih, s.allowRotate, heuristic);
        if (node && (!best || node.score < best.score)) { best = node; bestBin = b; }
      }
      if (!best) {
        const nb = { bin: makeBin(usableW + gap, usableH + gap), parts: [] };
        bins.push(nb);
        best = nb.bin.findNode(iw, ih, s.allowRotate, heuristic);
        bestBin = nb;
        if (!best) { nb.parts.push(Planifica._placedPart(p, margin, margin, false)); return; }
      }
      bestBin.bin.place(best);
      bestBin.parts.push(Planifica._placedPart(p, margin + best.x, margin + best.y, best.rot));
    });
    return bins.map(b => ({ parts: b.parts }));
  },

  // Skyline Bottom-Left — empurra tudo pra baixo-esquerda (compacto, poucos buracos).
  _packSkyline(panels) {
    const s = Planifica.state;
    const gap = s.espaco, margin = s.margem;
    const { usableW, usableH } = Planifica._usableArea();
    const bins = [];
    const newBin = () => { const b = { sky: [{ x: 0, w: usableW, y: 0 }], parts: [] }; bins.push(b); return b; };
    const fit = (b, w, h) => {
      let best = null;
      for (let i = 0; i < b.sky.length; i++) {
        const x = b.sky[i].x;
        if (x + w > usableW + 1e-6) continue;
        let y = 0, rem = w, j = i;
        while (rem > 1e-6 && j < b.sky.length) { y = Math.max(y, b.sky[j].y); rem -= b.sky[j].w; j++; }
        if (rem > 1e-6) continue;
        if (y + h > usableH + 1e-6) continue;
        if (!best || y < best.y || (y === best.y && x < best.x)) best = { x, y, w, h };
      }
      return best;
    };
    const raise = (b, n) => {
      const nx = n.x, nw = n.w, ny = n.y + n.h, out = [];
      let added = false;
      for (const seg of b.sky) {
        if (seg.x + seg.w <= nx + 1e-6 || seg.x >= nx + nw - 1e-6) { out.push(seg); continue; }
        if (seg.x < nx) out.push({ x: seg.x, w: nx - seg.x, y: seg.y });
        if (!added) { out.push({ x: nx, w: nw, y: ny }); added = true; }
        if (seg.x + seg.w > nx + nw) out.push({ x: nx + nw, w: seg.x + seg.w - (nx + nw), y: seg.y });
      }
      if (!added) out.push({ x: nx, w: nw, y: ny });
      out.sort((a, c) => a.x - c.x);
      const merged = [];
      for (const seg of out) { const last = merged[merged.length - 1]; if (last && Math.abs(last.y - seg.y) < 1e-6 && Math.abs(last.x + last.w - seg.x) < 1e-6) last.w += seg.w; else merged.push({ x: seg.x, w: seg.w, y: seg.y }); }
      b.sky = merged;
    };
    panels.forEach(p => {
      const cands = [{ w: p.larg + gap, h: p.comp + gap, rot: false }];
      if (s.allowRotate) cands.push({ w: p.comp + gap, h: p.larg + gap, rot: true });
      let chosen = null, chosenBin = null, chosenRot = false;
      const evalBin = b => { for (const c of cands) { const node = fit(b, c.w, c.h); if (node && (!chosen || node.y < chosen.y || (node.y === chosen.y && node.x < chosen.x))) { chosen = node; chosenBin = b; chosenRot = c.rot; } } };
      bins.forEach(evalBin);
      if (!chosen) { const b = newBin(); evalBin(b); if (!chosen) { b.parts.push(Planifica._placedPart(p, margin, margin, false)); return; } }
      raise(chosenBin, chosen);
      chosenBin.parts.push(Planifica._placedPart(p, margin + chosen.x, margin + chosen.y, chosenRot));
    });
    return bins.map(b => ({ parts: b.parts }));
  },

  // Constrói a peça posicionada (contorno + furos) em coords da chapa (mm).
  _placedPart(p, x, y, rot) {
    const larg0 = p.larg, comp0 = p.comp;
    const w = rot ? comp0 : larg0;
    const h = rot ? larg0 : comp0;
    const place = pts => pts.map(pt => {
      const u = pt[0], v = pt[1];
      return rot ? [x + (comp0 - v), y + u] : [x + u, y + v];
    });
    const poly  = (p.outline && p.outline.length >= 3) ? place(p.outline)
                                                       : [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const holes = (p.holes || []).map(place);
    // segmentos 2D (coords da chapa, mm) das bordas — um por RUN (trecho reto),
    // seguindo o contorno real — pra desenhar e clicar a fita.
    const bEdges = Planifica.state.banding && Planifica.state.banding.edges;
    const edges2d = [];
    if (bEdges) Object.keys(bEdges).forEach(key => {
      const e = bEdges[key];
      if (e.id !== p.id || !e.segsLocal) return;
      edges2d.push({ key, segs: e.segsLocal.map(([la, lb]) => place([la, lb])) });
    });
    return { x, y, w, h, rot, nome: p.nome, id: p.id, poly, holes, edges2d };
  },

  // ── FITA DE BORDA (edge banding) ────────────────────────────────────────
  // Cada peça tem 4 bordas editáveis (lados da face larg×comp): b(baixo),
  // t(cima), l(esq), r(dir). Uma borda "leva fita" (on) quando NÃO está colada
  // noutra peça. A detecção automática amostra a borda no MUNDO e marca como
  // coberta se cai dentro do volume (AABB) de outra peça. Depois o usuário
  // ajusta manualmente com as ferramentas Tesoura/Adicionar. Estado por borda
  // fica em s.banding.edges['<id>:<lado>'] = { on, len, wa, wb, quad }.

  // Quebra o CONTORNO REAL (p.outline, local u,v) em RUNS: trechos de segmentos
  // colineares. A cada CANTO/CURVA (mudança de direção acima do limiar) começa um
  // run novo. Assim "se encontrar uma curva, para" — dá pra ligar/desligar fita
  // só do trecho reto clicado, sem afetar o resto do lado. Devolve array de runs,
  // cada run = lista de segmentos [[u,v],[u,v]].
  _pieceRuns(p) {
    const larg = p.larg, comp = p.comp;
    const out = (p.outline && p.outline.length >= 3)
      ? p.outline
      : [[0, 0], [larg, 0], [larg, comp], [0, comp]];
    const n = out.length;
    if (n < 2) return [];
    const dir = [];
    for (let i = 0; i < n; i++) {
      const a = out[i], b = out[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      dir.push([dx / L, dy / L]);
    }
    const THRESH = Math.cos(15 * Math.PI / 180);   // quebra quando vira > 15°
    const isBreak = i => {
      const prev = dir[(i - 1 + n) % n];
      return (dir[i][0] * prev[0] + dir[i][1] * prev[1]) < THRESH;
    };
    // começa num ponto de quebra (pra não cortar um run no meio do wrap)
    let start = 0;
    for (let i = 0; i < n; i++) { if (isBreak(i)) { start = i; break; } }
    const runs = [];
    let cur = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (cur.length && isBreak(i)) { runs.push(cur); cur = []; }
      cur.push([out[i], out[(i + 1) % n]]);
    }
    if (cur.length) runs.push(cur);
    return runs;
  },

  // Comprimento (mm) de uma lista de segmentos locais.
  _segsLen(segs) {
    let L = 0;
    segs.forEach(s => { L += Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]); });
    return L;
  },

  // Direção do CORPO da peça no mundo (pra qual lado a espessura cresce a partir
  // do plano do contorno). = normal * sinal(centro - origem · normal).
  _bodyDir(p, n) {
    if (!n || !p.o || !p.corners || p.corners.length < 8) return null;
    let cx = 0, cy = 0, cz = 0;
    p.corners.forEach(c => { cx += c[0]; cy += c[1]; cz += c[2]; });
    cx /= 8; cy /= 8; cz /= 8;
    const dot = (cx - p.o[0]) * n[0] + (cy - p.o[1]) * n[1] + (cz - p.o[2]) * n[2];
    const s = dot >= 0 ? 1 : -1;
    return [n[0] * s, n[1] * s, n[2] * s];
  },

  // Orientação de uma borda no móvel montado: 'top'|'bottom'|'front'|'back'|
  // 'left'|'right'. Calcula a direção PRA FORA da borda no mundo (perpendicular
  // à borda, no plano da face, apontando pra longe do centro da peça) e mapeia
  // pelo eixo dominante (convenção SketchUp: Z+ cima, Y+ fundo, X+ direita).
  _edgeFaceCode(p, segs, n, wc) {
    if (!n || !wc || !segs.length) return null;
    const first = segs[0], last = segs[segs.length - 1];
    const ws = Planifica._localToWorld(p, first[0][0], first[0][1]);
    const we = Planifica._localToWorld(p, last[1][0], last[1][1]);
    if (!ws || !we) return null;
    let d = [we[0] - ws[0], we[1] - ws[1], we[2] - ws[2]];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / dl, d[1] / dl, d[2] / dl];
    // outward = d × n (perpendicular à borda, no plano)
    let o = [d[1] * n[2] - d[2] * n[1], d[2] * n[0] - d[0] * n[2], d[0] * n[1] - d[1] * n[0]];
    const ol = Math.hypot(o[0], o[1], o[2]) || 1; o = [o[0] / ol, o[1] / ol, o[2] / ol];
    const mid = [(ws[0] + we[0]) / 2, (ws[1] + we[1]) / 2, (ws[2] + we[2]) / 2];
    if (o[0] * (mid[0] - wc[0]) + o[1] * (mid[1] - wc[1]) + o[2] * (mid[2] - wc[2]) < 0) o = [-o[0], -o[1], -o[2]];
    const ax = Math.abs(o[0]), ay = Math.abs(o[1]), az = Math.abs(o[2]);
    if (az >= ax && az >= ay) return o[2] >= 0 ? 'top' : 'bottom';
    if (ay >= ax) return o[1] >= 0 ? 'back' : 'front';
    return o[0] >= 0 ? 'right' : 'left';
  },

  // Rótulo curto traduzido da orientação da borda.
  _faceLabel(code) {
    return code ? Planifica._t('plf.plano.doc.face.' + code) : '';
  },

  // Ponto local (u,v) mm → mundo (mm) via frame da face (o,u,v). nil se a peça
  // não tem frame (peça sem contorno detectado).
  _localToWorld(p, lu, lv) {
    if (!p.o || !p.u || !p.v) return null;
    return [
      p.o[0] + lu * p.u[0] + lv * p.v[0],
      p.o[1] + lu * p.u[1] + lv * p.v[1],
      p.o[2] + lu * p.u[2] + lv * p.v[2]
    ];
  },

  // Normal unitária da face (u × v) no mundo.
  _normal(p) {
    if (!p.u || !p.v) return null;
    const a = p.u, b = p.v;
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const L = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / L, n[1] / L, n[2] / L];
  },

  // Largura (mm) da fita: ajuste do usuário, ou a espessura da própria peça
  // (default = rente à espessura toda da borda).
  _fitaW(p) {
    const w = Planifica.state.fitaWidth;
    return (w && w > 0) ? w : (p.esp || 18);
  },

  // Quads (mundo, mm) da fita de um lado: para CADA segmento do contorno daquele
  // lado, uma faixa na FACE DA ESPESSURA — começa rente à borda (no plano do
  // contorno) e desce pela espessura na direção do corpo. Deslocada ~0.4mm pra
  // fora (no plano) pra não brigar com a face lateral da peça (z-fighting).
  _sideRibbonQuads(p, segs, bodyDir, W, centroid) {
    const out = [];
    segs.forEach(([la, lb]) => {
      const dx = lb[0] - la[0], dy = lb[1] - la[1], L = Math.hypot(dx, dy) || 1;
      let ox = dy / L, oy = -dx / L;                 // perpendicular no plano
      const mx = (la[0] + lb[0]) / 2, my = (la[1] + lb[1]) / 2;
      if ((mx - centroid[0]) * ox + (my - centroid[1]) * oy < 0) { ox = -ox; oy = -oy; } // pra fora
      const off = 0.4;
      const a2 = [la[0] + ox * off, la[1] + oy * off];
      const b2 = [lb[0] + ox * off, lb[1] + oy * off];
      const wa = Planifica._localToWorld(p, a2[0], a2[1]);
      const wb = Planifica._localToWorld(p, b2[0], b2[1]);
      if (!wa || !wb || !bodyDir) return;
      const wc = [wb[0] + bodyDir[0] * W, wb[1] + bodyDir[1] * W, wb[2] + bodyDir[2] * W];
      const wd = [wa[0] + bodyDir[0] * W, wa[1] + bodyDir[1] * W, wa[2] + bodyDir[2] * W];
      out.push([wa, wb, wc, wd]);
    });
    return out;
  },

  // Auto-detecção: pra cada peça e cada lado (b/t/l/r) decide se leva fita
  // (exposto) ou não (colado noutra peça), amostrando os segmentos no mundo.
  // keepManual=true preserva o on/off já escolhido manualmente.
  _computeEdgeBanding(keepManual) {
    const s = Planifica.state;
    const TOL = 1.0;        // mm — folga p/ considerar 2 peças "em contato"
    const boxes = s.paineis.map(p => Planifica._aabb(p.corners));
    const prev = (keepManual && s.banding && s.banding.edges) ? s.banding.edges : null;
    const edges = {};
    s.paineis.forEach((p, idx) => {
      const n = Planifica._normal(p);
      const bodyDir = Planifica._bodyDir(p, n);
      const W = Planifica._fitaW(p);
      const centroid = [p.larg / 2, p.comp / 2];
      // centro da peça no mundo (pra orientar cada borda: cima/baixo/frente/...)
      let wc = null;
      if (p.corners && p.corners.length >= 8) {
        let ax = 0, ay = 0, az = 0;
        p.corners.forEach(c => { ax += c[0]; ay += c[1]; az += c[2]; });
        wc = [ax / 8, ay / 8, az / 8];
      }
      const runs = Planifica._pieceRuns(p);
      runs.forEach((segs, ri) => {
        if (!segs.length) return;
        const key = p.id + ':r' + ri;
        const len = Planifica._segsLen(segs);
        // orientação 3D desta borda no móvel montado → rótulo no plano de corte
        const faceCode = Planifica._edgeFaceCode(p, segs, n, wc);
        // amostra cada segmento no plano do contorno → mundo
        let on = true;
        if (p.o && boxes[idx]) {
          let free = 0, tot = 0;
          segs.forEach(([la, lb]) => {
            const wa = Planifica._localToWorld(p, la[0], la[1]);
            const wb = Planifica._localToWorld(p, lb[0], lb[1]);
            if (!wa || !wb) return;
            const N = Math.max(2, Math.round(Math.hypot(lb[0] - la[0], lb[1] - la[1]) / 25));
            for (let i = 0; i < N; i++) {
              const tt = (i + 0.5) / N;
              const pt = [wa[0] + (wb[0] - wa[0]) * tt, wa[1] + (wb[1] - wa[1]) * tt, wa[2] + (wb[2] - wa[2]) * tt];
              tot++;
              if (!Planifica._ptCoveredByOther(pt, boxes, idx, TOL)) free++;
            }
          });
          if (tot) on = (free / tot) >= 0.5;
        }
        if (prev && prev[key]) on = prev[key].on;   // mantém escolha manual
        edges[key] = {
          id: p.id, len, on, faceCode,
          segsLocal: segs,
          quads: Planifica._sideRibbonQuads(p, segs, bodyDir, W, centroid)
        };
      });
    });
    s.banding = { edges };
  },

  // AABB (mundo, mm) a partir dos 8 cantos da peça.
  _aabb(corners) {
    if (!corners || corners.length < 8) return null;
    const mn = [1e12, 1e12, 1e12], mx = [-1e12, -1e12, -1e12];
    corners.forEach(c => {
      for (let a = 0; a < 3; a++) { if (c[a] < mn[a]) mn[a] = c[a]; if (c[a] > mx[a]) mx[a] = c[a]; }
    });
    return { min: mn, max: mx };
  },

  // O ponto cai dentro (com folga tol) da AABB de alguma OUTRA peça?
  _ptCoveredByOther(pt, boxes, selfIdx, tol) {
    for (let j = 0; j < boxes.length; j++) {
      if (j === selfIdx) continue;
      const b = boxes[j];
      if (!b) continue;
      if (pt[0] >= b.min[0] - tol && pt[0] <= b.max[0] + tol &&
          pt[1] >= b.min[1] - tol && pt[1] <= b.max[1] + tol &&
          pt[2] >= b.min[2] - tol && pt[2] <= b.max[2] + tol) return true;
    }
    return false;
  },

  _bandingTotalMm() {
    const b = Planifica.state.banding;
    if (!b || !b.edges) return 0;
    let mm = 0;
    Object.keys(b.edges).forEach(k => { if (b.edges[k].on) mm += b.edges[k].len; });
    return mm;
  },
  // Total de fita em metros (string com 2 casas).
  _bandingTotalM() { return (Planifica._bandingTotalMm() / 1000).toFixed(2); },
  // Fita de uma peça em metros (string com 2 casas).
  _bandingPieceM(id) {
    const b = Planifica.state.banding;
    if (!b || !b.edges) return '0.00';
    let mm = 0;
    Object.keys(b.edges).forEach(k => { const e = b.edges[k]; if (e.id === id && e.on) mm += e.len; });
    return (mm / 1000).toFixed(2);
  },

  // ── Ferramentas de edição da fita (Tesoura/Adicionar) ──
  setTool(tool) {
    const s = Planifica.state;
    s.tool = (s.tool === tool) ? null : tool;     // clicar de novo desativa
    document.querySelectorAll('.plf__tool[data-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.tool === s.tool));
    const cv = document.getElementById('plf_canvas');
    if (cv) cv.classList.toggle('is-editing', !!s.tool);
  },

  // Aplica a ferramenta ativa na borda clicada (cut → tira fita, add → põe).
  _applyTool(key) {
    const s = Planifica.state;
    const e = s.banding && s.banding.edges && s.banding.edges[key];
    if (!e) return;
    e.on = (s.tool === 'add');
    Planifica._updateStats();
    Planifica._scheduleDraw();
    Planifica._syncFitas3d();
  },

  // Borda mais próxima do clique (px) dentro de um limiar.
  _hitEdge(mx, my) {
    const hits = Planifica._edgeHits || [];
    let best = null, bestD = 10;
    hits.forEach(h => {
      const d = Planifica._distToSeg(mx, my, h.x1, h.y1, h.x2, h.y2);
      if (d < bestD) { bestD = d; best = h; }
    });
    return best;
  },
  _distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / L;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  },

  // ── Marcação 3D no SketchUp (fitinhas vermelhas) ──
  toggle3d() {
    const s = Planifica.state;
    s.show3d = !s.show3d;
    const btn = document.getElementById('plf_btn_3d');
    if (btn) btn.classList.toggle('is-active', s.show3d);
    if (s.show3d) Planifica._syncFitas3d(true);
    else Planifica.limparFitas3d();
  },
  limparFitas3d() {
    if (window.Bridge) Bridge.call('planifica_limpar_fitas', {}).catch(() => {});
  },
  // Envia (debounced) os quads das bordas COM fita pro SketchUp desenhar.
  _syncFitas3d(immediate) {
    const s = Planifica.state;
    if (!s.show3d) return;
    if (Planifica._fitaTimer) clearTimeout(Planifica._fitaTimer);
    const push = () => {
      const quads = [];
      const b = s.banding;
      if (b && b.edges) Object.keys(b.edges).forEach(k => { const e = b.edges[k]; if (e.on && e.quads) e.quads.forEach(q => quads.push(q)); });
      if (window.Bridge) Bridge.call('planifica_marcar_fitas', { quads }).catch(() => {});
    };
    immediate ? push() : (Planifica._fitaTimer = setTimeout(push, 180));
  },

  // Ajuste da largura/espessura da fita (mm). 0/vazio = auto (espessura da peça).
  // Só afeta a geometria 3D (a metragem linear é o comprimento da borda).
  setFitaWidth() {
    const s = Planifica.state;
    const v = Planifica._num('plf_fita_w', 0);
    s.fitaWidth = (isFinite(v) && v > 0) ? v : 0;
    if (s.paineis.length) {
      Planifica._computeEdgeBanding(true);   // mantém on/off manual, recalcula quads
      Planifica._scheduleDraw();
      Planifica._syncFitas3d();
    }
  },

  // ── GERAR ENCAIXE — otimizador iterativo (guarda o melhor a cada clique) ──
  gerarEncaixe() {
    const s = Planifica.state;
    if (!s.paineis.length) { if (window.Toast) Toast.warning(Planifica._t('plf.toast.capture_first')); return; }
    const byEsp = Planifica._byEsp();
    const espList = Object.keys(byEsp).map(Number).sort((a, b) => a - b);

    const orders = [
      arr => arr.slice().sort((a, b) => b.larg * b.comp - a.larg * a.comp),                 // área desc
      arr => arr.slice().sort((a, b) => Math.max(b.larg, b.comp) - Math.max(a.larg, a.comp)), // maior lado
      arr => arr.slice().sort((a, b) => b.comp - a.comp),
      arr => arr.slice().sort((a, b) => b.larg - a.larg),
      arr => arr.slice().sort((a, b) => (b.larg + b.comp) - (a.larg + a.comp))               // perímetro
    ];
    // Algoritmos a testar: no "Automático" testa todos; senão só o escolhido.
    const algos = (s.algo === 'auto') ? ['maxrects', 'contact', 'skyline', 'guillotine'] : [s.algo];
    const EXTRA_SHUFFLES = 6;
    const total = orders.length + EXTRA_SHUFFLES;
    let improved = false;
    algos.forEach(algo => {
      for (let k = 0; k < total; k++) {
        const layoutByEsp = {};
        espList.forEach(esp => {
          let arr = byEsp[esp].slice();
          if (k < orders.length) arr = orders[k](arr);
          else { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } }
          layoutByEsp[esp] = Planifica._packAlgo(algo, arr);
        });
        const layout = { espList, byEsp: layoutByEsp };
        const score = Planifica._scoreLayout(layout);
        if (!s.bestScore || Planifica._better(score, s.bestScore)) {
          s.bestScore = score; s.layout = layout; s.bestAlgo = algo; improved = true;
        }
      }
    });
    if (s.activeEsp === null || espList.indexOf(s.activeEsp) < 0) s.activeEsp = espList[0];
    const sheets = Planifica._activeSheets();
    if (s.sheetIdx >= sheets.length) s.sheetIdx = Math.max(0, sheets.length - 1);
    Planifica._resetView2D();
    Planifica._afterNest();

    const sc = s.bestScore;
    if (window.Toast) {
      const algoNm = Planifica._algoNome(s.bestAlgo || s.algo);
      const msg = Planifica._t('plf.toast.msg', { sheets: sc.sheets, pct: sc.sheetYield.toFixed(0), algo: algoNm });
      improved ? Toast.success(Planifica._t('plf.toast.improved', { msg }))
               : Toast.info(Planifica._t('plf.toast.best', { msg }));
    }
  },

  _scoreLayout(layout) {
    const s = Planifica.state;
    let sheets = 0, partsArea = 0, boundArea = 0;
    (layout.espList || []).forEach(esp => {
      const arr = layout.byEsp[esp];
      sheets += arr.length;
      arr.forEach(sh => {
        let mnx = 1e12, mny = 1e12, mxx = -1e12, mxy = -1e12;
        sh.parts.forEach(p => {
          partsArea += p.w * p.h;
          if (p.x < mnx) mnx = p.x; if (p.y < mny) mny = p.y;
          if (p.x + p.w > mxx) mxx = p.x + p.w; if (p.y + p.h > mxy) mxy = p.y + p.h;
        });
        if (sh.parts.length) boundArea += (mxx - mnx) * (mxy - mny);
      });
    });
    const fill = boundArea > 0 ? partsArea / boundArea : 0;   // compactação (1 = sem buracos)
    const sheetArea = s.chapa.larg * s.chapa.comp;
    const { baseW, baseH } = Planifica._usableArea();
    const equipArea = baseW * baseH;
    return {
      sheets, fill,
      sheetYield: sheets > 0 ? (partsArea / (sheets * sheetArea)) * 100 : 0,
      equipYield: sheets > 0 ? (partsArea / (sheets * equipArea)) * 100 : 0
    };
  },

  // Menos chapas é melhor; depois, mais compacto (menos buracos).
  _better(a, b) {
    if (a.sheets !== b.sheets) return a.sheets < b.sheets;
    return a.fill > b.fill + 0.005;
  },

  _algoNome(a) {
    return Planifica._t('plf.algo.' + a) || a;
  },

  _afterNest() {
    Planifica._computeOversized();
    Planifica._renderEspTabs();
    Planifica._renderList();
    Planifica._updateStats();
    Planifica._renderOversize();
    Planifica._updateSheetNav();
    Planifica._scheduleDraw();
  },

  // ── Peças que NÃO cabem na área útil (chapa ou área de corte) ────────────
  // Uma peça cabe se entra na área útil na orientação normal OU girada (se
  // permitido). As que não cabem ficam marcadas (alerta + vermelho no preview
  // e na lista) — senão o nesting as empilha sobrepostas na origem.
  _computeOversized() {
    const s = Planifica.state;
    const { usableW, usableH } = Planifica._usableArea();
    const E = 1e-6;
    s.oversized = s.paineis.filter(p => {
      const fitsN = (p.larg <= usableW + E && p.comp <= usableH + E);
      const fitsR = s.allowRotate && (p.comp <= usableW + E && p.larg <= usableH + E);
      return !fitsN && !fitsR;
    }).map(p => p.id);
  },

  _isOversized(id) { return Planifica.state.oversized.indexOf(id) >= 0; },

  _renderOversize() {
    const el = document.getElementById('plf_oversize_alert');
    if (!el) return;
    const s = Planifica.state;
    if (!s.oversized.length) { el.hidden = true; el.textContent = ''; return; }
    const { usableW, usableH } = Planifica._usableArea();
    const names = s.oversized.map(id => (s.byId[id] && s.byId[id].nome) || id).join(', ');
    el.hidden = false;
    el.innerHTML = '';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'alert-triangle');
    icon.className = 'icon';
    const span = document.createElement('span');
    span.textContent = Planifica._t('plf.oversize.alert', {
      n: s.oversized.length, w: Math.round(usableW), h: Math.round(usableH), names
    });
    el.appendChild(icon);
    el.appendChild(span);
    if (window.lucide) lucide.createIcons();
  },

  // ── Stats ───────────────────────────────────────────────────────────────
  _updateStats() {
    const s = Planifica.state;
    const sc = Planifica._scoreLayout(s.layout);
    Planifica._setText('plf_stat_pecas', s.paineis.length);
    Planifica._setText('plf_stat_chapas', sc.sheets);
    Planifica._setText('plf_stat_aprov', sc.sheetYield.toFixed(0) + '%');
    Planifica._setText('plf_stat_fita', Planifica._bandingTotalM() + ' m');
    // aproveitamento da área do equipamento (só faz sentido em router/laser)
    const equipStat = document.getElementById('plf_stat_equip_wrap');
    const isMachine = (s.modo === 'router' || s.modo === 'laser');
    if (equipStat) equipStat.hidden = !isMachine;
    if (isMachine) Planifica._setText('plf_stat_equip', sc.equipYield.toFixed(0) + '%');
  },
  _setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; },

  // ── Tabs por espessura ────────────────────────────────────────────────
  _renderEspTabs() {
    const s = Planifica.state;
    const wrap = document.getElementById('plf_esp_tabs');
    if (!wrap) return;
    wrap.innerHTML = '';
    (s.layout.espList || []).forEach(esp => {
      const b = document.createElement('button');
      b.className = 'plf__esp-tab' + (esp === s.activeEsp ? ' is-active' : '');
      const n = s.layout.byEsp[esp].length;
      b.textContent = Planifica._t('plf.esp.tab', { esp, n, unit: Planifica._t(n > 1 ? 'plf.unit.sheetN' : 'plf.unit.sheet1') });
      b.onclick = () => { s.activeEsp = esp; s.sheetIdx = 0; Planifica._resetView2D(); Planifica._renderEspTabs(); Planifica._updateSheetNav(); Planifica._scheduleDraw(); };
      wrap.appendChild(b);
    });
  },

  _activeSheets() {
    const s = Planifica.state;
    if (!s.layout || s.activeEsp === null) return [];
    return s.layout.byEsp[s.activeEsp] || [];
  },
  sheetPrev() { const s = Planifica.state; if (s.sheetIdx > 0) { s.sheetIdx--; Planifica._resetView2D(); Planifica._updateSheetNav(); Planifica._scheduleDraw(); } },
  sheetNext() { const s = Planifica.state; if (s.sheetIdx < Planifica._activeSheets().length - 1) { s.sheetIdx++; Planifica._resetView2D(); Planifica._updateSheetNav(); Planifica._scheduleDraw(); } },
  _updateSheetNav() {
    const sheets = Planifica._activeSheets();
    const n = sheets.length || 1;
    const i = Math.min(Planifica.state.sheetIdx, n - 1) + 1;
    Planifica._setText('plf_sheet_label', Planifica._t('plf.sheet.label', { i, n }));
  },

  // ── Lista de peças ──────────────────────────────────────────────────────
  _renderList() {
    const body = document.getElementById('plf_table_body');
    if (!body) return;
    const selId = Planifica.state.selectedId;
    body.innerHTML = '';
    Planifica.state.paineis.forEach((p, i) => {
      const tr = document.createElement('tr');
      const over = Planifica._isOversized(p.id);
      tr.className = [(p.id === selId) ? 'is-selected' : '', over ? 'is-oversize' : ''].filter(Boolean).join(' ');
      tr.style.cursor = 'pointer';
      const flag = over ? ` <span class="plf__over-badge">${Planifica._esc(Planifica._t('plf.oversize.badge'))}</span>` : '';
      tr.innerHTML = `<td>${i + 1}</td><td>${Planifica._esc(p.nome)}${flag}</td>` +
                     `<td>${p.esp} mm</td><td>${p.larg} mm</td><td>${p.comp} mm</td>`;
      tr.onclick = () => Planifica.select(p.id, true);
      body.appendChild(tr);
    });
  },

  // ── SELEÇÃO de peça (2D, lista ou iso) ────────────────────────────────
  select(id, focusPlan) {
    const s = Planifica.state;
    if (!id || !s.byId[id]) return;
    s.selectedId = id;
    if (focusPlan) { Planifica._focusPieceInPlan(id); Planifica._resetView2D(); }   // mostra a chapa certa
    Planifica._renderEspTabs();
    Planifica._renderList();
    Planifica._updateSheetNav();
    Planifica._scheduleDraw();
    Planifica._scheduleDrawIso();
    // Destaca/zoom no SketchUp (bônus — silencioso se falhar)
    const p = s.byId[id];
    if (p && p.pid != null) {
      Bridge.call('planifica_destacar', { pid: p.pid }).catch(() => {});
    }
  },

  // Acha a espessura+chapa que contém a peça e troca a vista do plano pra ela.
  _focusPieceInPlan(id) {
    const s = Planifica.state;
    if (!s.layout) return;
    for (const esp of s.layout.espList) {
      const sheets = s.layout.byEsp[esp];
      for (let si = 0; si < sheets.length; si++) {
        if (sheets[si].parts.some(pp => pp.id === id)) {
          s.activeEsp = esp; s.sheetIdx = si; return;
        }
      }
    }
  },

  // ── Bind: clique no plano 2D (hit-test) + orbit na vista isométrica ──
  _bindCanvases() {
    const c2d = document.getElementById('plf_canvas');
    if (c2d && !c2d._plfClick) {
      c2d._plfClick = true;
      const s = Planifica.state;

      c2d.addEventListener('mousedown', e => {
        // SHIFT (ou botão do meio) = navegar/pan pela chapa
        if (e.shiftKey || e.button === 1) {
          s.dragging2D = true; s.lastX2D = e.clientX; s.lastY2D = e.clientY;
          c2d.classList.add('is-panning'); e.preventDefault();
          return;
        }
        const rect = c2d.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        // Ferramenta de fita ativa = clicar numa borda corta/adiciona fita.
        if (s.tool) {
          const hit = Planifica._hitEdge(mx, my);
          if (hit) Planifica._applyTool(hit.key);
          return;
        }
        // Clique normal = seleciona peça (hit-test)
        const rects = Planifica._partRects || [];
        for (let i = rects.length - 1; i >= 0; i--) {
          const r = rects[i];
          if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
            Planifica.select(r.id, false);
            return;
          }
        }
      });

      window.addEventListener('mousemove', e => {
        if (!s.dragging2D) return;
        s.panX2D += e.clientX - s.lastX2D;
        s.panY2D += e.clientY - s.lastY2D;
        s.lastX2D = e.clientX; s.lastY2D = e.clientY;
        Planifica._scheduleDraw();
      });
      window.addEventListener('mouseup', () => {
        if (s.dragging2D) { s.dragging2D = false; c2d.classList.remove('is-panning'); }
      });
      c2d.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });

      // SCROLL = zoom na chapa
      c2d.addEventListener('wheel', e => {
        e.preventDefault();
        const f = e.deltaY < 0 ? 1.1 : 0.9;
        s.zoom2D = Math.max(0.3, Math.min(8, (s.zoom2D || 1) * f));
        Planifica._scheduleDraw();
      }, { passive: false });

      // SHIFT segurado = cursor de "mover" (pan) no plano 2D
      if (!Planifica._shiftBound) {
        Planifica._shiftBound = true;
        const setPan = on => { const cv = document.getElementById('plf_canvas'); if (cv) cv.classList.toggle('is-shift-pan', on); };
        document.addEventListener('keydown', e => { if (e.key === 'Shift') setPan(true); });
        document.addEventListener('keyup',   e => { if (e.key === 'Shift') setPan(false); });
        window.addEventListener('blur', () => setPan(false));
      }
    }

    const iso = document.getElementById('plf_iso');
    if (iso && !iso._plfBound) {
      iso._plfBound = true;
      const s = Planifica.state;
      let dragging = false, panning = false, lx = 0, ly = 0, moved = false;
      iso.addEventListener('mousedown', e => {
        // SHIFT (ou botão do meio) = pan; clique normal = orbit/seleção
        panning = (e.shiftKey || e.button === 1);
        dragging = true; moved = false; lx = e.clientX; ly = e.clientY;
        if (panning) { iso.classList.add('is-panning'); e.preventDefault(); }
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        if (panning) {
          s.isoPanX += dx; s.isoPanY += dy;
        } else {
          s.isoRy += dx * 0.01;
          s.isoRx += dy * 0.01;
        }
        Planifica._scheduleDrawIso();
      });
      window.addEventListener('mouseup', e => {
        if (dragging && !moved && !panning) Planifica._isoClick(e);   // clique = seleciona peça
        dragging = false; panning = false; iso.classList.remove('is-panning');
      });
      iso.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
      // SCROLL = zoom na vista isométrica
      iso.addEventListener('wheel', e => {
        e.preventDefault();
        const f = e.deltaY < 0 ? 1.1 : 0.9;
        s.isoZoom = Math.max(0.3, Math.min(8, (s.isoZoom || 1) * f));
        Planifica._scheduleDrawIso();
      }, { passive: false });
    }
  },
  _esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },

  // ── Preview 2D ──────────────────────────────────────────────────────────
  _scheduleDraw() {
    if (Planifica._raf) cancelAnimationFrame(Planifica._raf);
    Planifica._raf = requestAnimationFrame(() => Planifica._draw());
  },

  _draw() {
    const c = document.getElementById('plf_canvas');
    if (!c) return;
    const sheets = Planifica._activeSheets();
    const sheet = sheets[Math.min(Planifica.state.sheetIdx, sheets.length - 1)];
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800, cssH = c.clientHeight || 460;
    if (c.width !== Math.round(cssW * dpr)) c.width = Math.round(cssW * dpr);
    if (c.height !== Math.round(cssH * dpr)) c.height = Math.round(cssH * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const s = Planifica.state;
    const CW = s.chapa.larg, CH = s.chapa.comp;
    const pad = 28;
    const fit = Math.min((cssW - 2 * pad) / CW, (cssH - 2 * pad) / CH);
    const sc = fit * (s.zoom2D || 1);              // zoom via scroll
    const ox = (cssW - CW * sc) / 2 + (s.panX2D || 0);   // pan via shift+drag
    const oy = (cssH - CH * sc) / 2 + (s.panY2D || 0);
    const X = mm => ox + mm * sc;
    const Y = mm => oy + (CH - mm) * sc;   // y pra cima (origem embaixo-esq)

    // chapa (medida cheia)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X(0), Y(CH), CW * sc, CH * sc);
    ctx.strokeStyle = 'rgba(40,50,70,0.9)'; ctx.lineWidth = 1.4;
    ctx.strokeRect(X(0), Y(CH), CW * sc, CH * sc);

    // Área de trabalho do encaixe = chapa OU área de corte do equipamento.
    const { baseW, baseH } = Planifica._usableArea();
    const machineLimited = (s.modo === 'router' || s.modo === 'laser') &&
                           (baseW < CW - 0.5 || baseH < CH - 0.5);
    if (machineLimited) {
      // sombreia o que está FORA da área de corte (inalcançável pelo equipamento)
      ctx.save();
      ctx.fillStyle = 'rgba(120,130,150,0.10)';
      ctx.fillRect(X(baseW), Y(CH), (CW - baseW) * sc, CH * sc);
      ctx.fillRect(X(0), Y(CH), baseW * sc, (CH - baseH) * sc);
      // contorno pontilhado da área de corte
      ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(37,99,235,0.85)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(X(0), Y(baseH), baseW * sc, baseH * sc);
      ctx.restore();
      // legenda
      ctx.fillStyle = 'rgba(37,99,235,0.95)';
      ctx.font = '10px "Geist Mono", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(Planifica._t('plf.canvas.cutarea', { eq: (s.modo === 'laser' ? 'laser' : 'router'), w: Math.round(baseW), h: Math.round(baseH) }), X(2), Y(baseH) - 3);
    }

    // margem (guia tracejada) — dentro da área de trabalho
    if (s.margem > 0) {
      ctx.save();
      ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(120,130,150,0.55)'; ctx.lineWidth = 0.8;
      ctx.strokeRect(X(s.margem), Y(baseH - s.margem), (baseW - 2 * s.margem) * sc, (baseH - 2 * s.margem) * sc);
      ctx.restore();
    }

    Planifica._partRects = [];
    Planifica._edgeHits = [];
    if (!sheet) return;

    const fills = ['#dbeafe', '#dcfce7', '#fef3c7', '#f3e8ff', '#fee2e2', '#e0f2fe', '#fae8ff'];
    const strokes = ['#2563eb', '#059669', '#d97706', '#9333ea', '#dc2626', '#0284c7', '#c026d3'];
    const selId = Planifica.state.selectedId;

    const tracePath = (pts) => {
      ctx.beginPath();
      pts.forEach((pt, k) => { const sx = X(pt[0]), sy = Y(pt[1]); k ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.closePath();
    };

    sheet.parts.forEach((p, i) => {
      const px = X(p.x), py = Y(p.y + p.h);   // bbox (pra hit-test + rótulo)
      const pw = p.w * sc, ph = p.h * sc;
      Planifica._partRects.push({ x: px, y: py, w: pw, h: ph, id: p.id });
      const sel = (p.id && p.id === selId);
      const over = Planifica._isOversized(p.id);
      const poly = p.poly || [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]];

      // contorno real (com recortes)
      tracePath(poly);
      ctx.fillStyle = over ? 'rgba(220,38,38,0.16)' : (sel ? '#fde68a' : fills[i % fills.length]);
      ctx.fill();
      ctx.strokeStyle = over ? '#dc2626' : (sel ? '#b45309' : strokes[i % strokes.length]);
      ctx.lineWidth = over ? 2 : (sel ? 2.5 : 1);
      if (over) ctx.setLineDash([6, 3]);
      ctx.stroke();
      if (over) ctx.setLineDash([]);

      // furos / recortes internos
      (p.holes || []).forEach(h => {
        if (!h || h.length < 3) return;
        tracePath(h);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.strokeStyle = sel ? '#b45309' : strokes[i % strokes.length];
        ctx.lineWidth = sel ? 1.6 : 0.8; ctx.stroke();
      });

      // rótulo no centro do bbox (se couber)
      if (pw > 38 && ph > 18) {
        ctx.fillStyle = 'rgba(23,37,84,0.9)';
        ctx.font = '10px "Geist Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${p.w}×${p.h}`, px + pw / 2, py + ph / 2);
        if (ph > 30 && p.nome) {
          ctx.fillStyle = 'rgba(23,37,84,0.6)';
          ctx.fillText(Planifica._truncate(p.nome, Math.floor(pw / 6)), px + pw / 2, py + ph / 2 - 12);
        }
      }

      // FITA DE BORDA: vermelho (leva fita) / tracejado cinza (sem fita).
      // Cada lado é uma polilinha que acompanha o contorno real (curvas inclusas).
      const bEdges = Planifica.state.banding && Planifica.state.banding.edges;
      (p.edges2d || []).forEach(e => {
        const st = bEdges ? bEdges[e.key] : null;
        const on = st ? st.on : false;
        if (on) { ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3.2; ctx.setLineDash([]); }
        else    { ctx.strokeStyle = 'rgba(120,130,150,0.55)'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]); }
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        (e.segs || []).forEach(seg => {
          const ax = X(seg[0][0]), ay = Y(seg[0][1]), bx = X(seg[1][0]), by = Y(seg[1][1]);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          Planifica._edgeHits.push({ key: e.key, x1: ax, y1: ay, x2: bx, y2: by });
        });
        ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      });
    });

    // legenda chapa (medida)
    ctx.fillStyle = 'rgba(75,85,99,0.7)';
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${CW} × ${CH} mm  ·  ${s.activeEsp}mm`, ox, oy - 16);
  },

  _truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; },

  // ── Vista isométrica do móvel (destaca a peça selecionada) ──────────────
  _FACEIDX: [[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]],

  _isoProj(x, y, z, st) {
    const s = Planifica.state;
    x -= st.cx; y -= st.cy; z -= st.cz;
    const cyr = Math.cos(s.isoRy), syr = Math.sin(s.isoRy);
    const x1 = x * cyr - y * syr;
    const y1 = x * syr + y * cyr;
    const cxr = Math.cos(s.isoRx), sxr = Math.sin(s.isoRx);
    const y2 = y1 * cxr - z * sxr;
    const z2 = y1 * sxr + z * cxr;
    return { x: st.ox + x1 * st.s, y: st.oy - z2 * st.s, d: y2 };
  },

  _scheduleDrawIso() {
    if (Planifica._rafIso) cancelAnimationFrame(Planifica._rafIso);
    Planifica._rafIso = requestAnimationFrame(() => Planifica._drawIso());
  },

  _drawIso() {
    const c = document.getElementById('plf_iso');
    if (!c) return;
    const s = Planifica.state;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 400, cssH = c.clientHeight || 460;
    if (c.width !== Math.round(cssW * dpr)) c.width = Math.round(cssW * dpr);
    if (c.height !== Math.round(cssH * dpr)) c.height = Math.round(cssH * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!s.bbox || !s.paineis.length) return;

    const mn = s.bbox.min, mx = s.bbox.max;
    const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
    const maxDim = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1);
    const sc = Math.min(cssW, cssH) * 0.58 / maxDim * (s.isoZoom || 1);   // zoom (scroll)
    const st = { cx, cy, cz, ox: cssW / 2 + (s.isoPanX || 0), oy: cssH / 2 + 8 + (s.isoPanY || 0), s: sc };  // pan (shift+drag)

    const faces = [], selFaces = [], hit = [];
    s.paineis.forEach(p => {
      if (!p.corners || p.corners.length < 8) return;
      const proj = p.corners.map(v => Planifica._isoProj(v[0], v[1], v[2], st));
      const sel = (p.id === s.selectedId);
      const polys = [];
      Planifica._FACEIDX.forEach(fi => {
        const pts = fi.map(k => proj[k]);
        const depth = (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4;
        (sel ? selFaces : faces).push({ pts, depth });
        polys.push(pts);
      });
      hit.push({ id: p.id, polys, minD: Math.min.apply(null, proj.map(q => q.d)) });
    });

    const drawFace = (f, fill, stroke, lw) => {
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
    };

    // móvel inteiro (translúcido), painter's
    faces.sort((a, b) => b.depth - a.depth);
    faces.forEach(f => drawFace(f, 'rgba(176,186,201,0.30)', 'rgba(90,100,120,0.45)', 0.6));
    // peça selecionada por cima (âmbar opaco)
    selFaces.sort((a, b) => b.depth - a.depth);
    selFaces.forEach(f => drawFace(f, 'rgba(251,191,36,0.95)', 'rgba(180,83,9,1)', 1.6));

    Planifica._isoHit = hit;
  },

  _isoClick(e) {
    const c = document.getElementById('plf_iso');
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = Planifica._isoHit || [];
    let best = null;
    hit.forEach(h => {
      const inside = h.polys.some(poly => Planifica._pointInPoly(mx, my, poly));
      if (inside && (!best || h.minD < best.minD)) best = h;
    });
    if (best) Planifica.select(best.id, true);
  },

  _pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
    }
    return inside;
  },

  // ── EXPORTAR EPS ──────────────────────────────────────────────────────────
  async exportarEPS() {
    const s = Planifica.state;
    if (!s.layout || !(s.layout.espList || []).length) {
      if (window.Toast) Toast.warning(Planifica._t('plf.toast.capture_first'));
      return;
    }
    // flatten: todas as chapas de todas as espessuras
    const chapas = [];
    s.layout.espList.forEach(esp => {
      s.layout.byEsp[esp].forEach((sh, i) => {
        chapas.push({
          esp, idx: i,
          parts: sh.parts.map(p => ({
            poly: p.poly, holes: p.holes || [],
            cx: p.x + p.w / 2, cy: p.y + p.h / 2,
            w: p.w, h: p.h, nome: p.nome
          }))
        });
      });
    });
    const layout = { chapa: { larg: s.chapa.larg, comp: s.chapa.comp }, chapas };
    const btn = document.getElementById('plf_btn_eps');
    if (btn) btn.disabled = true;
    try {
      const r = await Bridge.call('planifica_exportar_eps', { layout });
      if (r && r.ok) {
        if (window.Toast) Toast.success(Planifica._t('plf.eps.ok', { n: r.n_chapas }));
      } else if (r && r.code === 'planifica.export_cancelado') {
        /* usuário cancelou — silencioso */
      } else {
        if (window.Toast) Toast.error(Planifica._t('plf.eps.err') + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      if (window.Toast) Toast.error(Planifica._t('plf.eps.err') + ': ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ── EXPORTAR PLANO DE CORTE (HTML completo: corte + montagem) ──────────────
  async exportarPlano() {
    const s = Planifica.state;
    if (!s.layout || !(s.layout.espList || []).length) {
      if (window.Toast) Toast.warning(Planifica._t('plf.toast.capture_first'));
      return;
    }
    const btn = document.getElementById('plf_btn_plano');
    if (btn) btn.disabled = true;
    try {
      const empresa = await Planifica._fetchEmpresa();
      const html = Planifica._buildPlanoHtml(empresa);
      const name = await Planifica._askPlanoFileName();
      if (name === null) return;        // cancelou
      const b64 = btoa(unescape(encodeURIComponent(html)));
      const r = await Bridge.call('planifica_salvar_plano', { name, content: b64 });
      if (r && r.ok) {
        if (window.Toast) Toast.success(Planifica._t('plf.plano.ok', { path: r.path || '' }));
      } else if (r && r.code === 'user_cancelled') {
        /* silencioso */
      } else {
        if (window.Toast) Toast.error(Planifica._t('plf.plano.err') + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      if (window.Toast) Toast.error(Planifica._t('plf.plano.err') + ': ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async _askPlanoFileName() {
    const sugerido = 'plano_corte';
    let raw = sugerido;
    if (window.Modal && typeof Modal.prompt === 'function') {
      raw = await Modal.prompt(
        Planifica._t('plf.plano.filename.title'),
        Planifica._t('plf.plano.filename.msg'),
        sugerido
      );
      if (raw === null) return null;
    }
    let name = String(raw || '').trim().replace(/\.html?$/i, '');
    name = name.replace(/[^a-z0-9_\-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (!name) name = sugerido;
    return name.slice(0, 80);
  },

  // ── Empresa (logo + dados) — mesmo cadastro do Auto-ACM (callback genérico) ──
  async _fetchEmpresa() {
    try {
      const r = await Bridge.call('empresa_get');
      return (r && r.ok && r.empresa) ? r.empresa : {};
    } catch (e) { return {}; }
  },
  _escE(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  },
  _hasEmpresa(e) {
    return !!(e && (e.nome || e.logo || e.doc || e.endereco || e.fone || e.email || e.repr));
  },
  // Faixa fina no topo de cada página interna (logo + nome + rótulo da página).
  _brandStrip(empresa, label) {
    if (!Planifica._hasEmpresa(empresa)) return '';
    const E = Planifica._escE;
    const logo = empresa.logo
      ? `<img class="brand-strip__logo" src="${empresa.logo}" alt="logo">`
      : `<span class="brand-strip__logo brand-strip__logo--placeholder"></span>`;
    return `<div class="brand-strip">${logo}<span class="brand-strip__name">${E(empresa.nome || '')}</span><span class="brand-strip__sep"></span><span class="brand-strip__label">${E(label || '')}</span></div>`;
  },

  // Monta o documento HTML completo do plano (auto-contido, abre no navegador).
  // Estrutura: capa (empresa) → vistas+montagem+quantitativo → mapa de corte →
  // lista de peças. Visual alinhado ao relatório do Auto-ACM.
  _buildPlanoHtml(empresa) {
    const s = Planifica.state;
    const esc = Planifica._esc;
    const t = (k, v) => esc(Planifica._t(k, v));

    // Numeração estável: nº da peça = posição na lista (1-based).
    const numMap = {};
    s.paineis.forEach((p, i) => { numMap[p.id] = i + 1; });

    // Índice: peça → onde está (espessura + nº da chapa) e a peça posicionada.
    const placedById = {};
    s.paineis.forEach(p => { placedById[p.id] = null; });
    (s.layout.espList || []).forEach(esp => {
      s.layout.byEsp[esp].forEach((sh, si) => {
        sh.parts.forEach(pp => { placedById[pp.id] = { pp, esp, si }; });
      });
    });

    const sc = Planifica._scoreLayout(s.layout);
    const modoLabel = Planifica._t('plf.modo.' + s.modo);
    const algoLabel = Planifica._algoNome(s.bestAlgo || s.algo);
    const dateStr = (() => { try { return new Date().toLocaleDateString(); } catch (e) { return ''; } })();
    let dims = null;
    if (s.bbox) {
      const mn = s.bbox.min, mx = s.bbox.max;
      dims = { w: Math.round(mx[0] - mn[0]), d: Math.round(mx[1] - mn[1]), h: Math.round(mx[2] - mn[2]) };
    }
    const ctx = { sc, modoLabel, algoLabel, dateStr, dims, placedById };

    // ── Capa ──
    const capa = Planifica._planoCapa(empresa, ctx);

    // ── Aviso de peças que não cabem ──
    let oversizeWarn = '';
    if (s.oversized.length) {
      const { usableW, usableH } = Planifica._usableArea();
      const names = s.oversized.map(id => esc((s.byId[id] && s.byId[id].nome) || id)).join(', ');
      oversizeWarn = `<div class="warn">${t('plf.plano.doc.oversize_warn', { n: s.oversized.length, w: Math.round(usableW), h: Math.round(usableH), names })}</div>`;
    }

    // ── Lista de peças ──
    let rows = '';
    s.paineis.forEach(p => {
      const loc = placedById[p.id];
      const sheetTxt = loc ? `${loc.esp}mm #${loc.si + 1}` : '—';
      const rot = (loc && loc.pp && loc.pp.rot) ? t('plf.plano.doc.yes') : '—';
      const over = Planifica._isOversized(p.id);
      rows += `<tr class="${over ? 'over' : ''}"><td class="c">${numMap[p.id]}</td><td>${esc(p.nome)}</td>` +
              `<td class="c">${p.esp} mm</td><td class="c">${p.larg} mm</td><td class="c">${p.comp} mm</td>` +
              `<td class="c">${rot}</td><td class="c">${esc(sheetTxt)}</td><td class="c">${Planifica._bandingPieceM(p.id)}</td></tr>`;
    });
    const partsTable = `<table class="parts"><thead><tr>
      <th>${t('plf.plano.doc.col.num')}</th><th>${t('plf.plano.doc.col.name')}</th>
      <th>${t('plf.plano.doc.col.thick')}</th><th>${t('plf.plano.doc.col.w')}</th>
      <th>${t('plf.plano.doc.col.h')}</th><th>${t('plf.plano.doc.col.rot')}</th>
      <th>${t('plf.plano.doc.col.sheet')}</th><th>${t('plf.plano.doc.col.band')}</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="c" colspan="7">${t('plf.plano.doc.banding')}</td><td class="c">${Planifica._bandingTotalM()}</td></tr></tfoot></table>`;

    // ── Mapas de corte ──
    let cutMaps = '';
    (s.layout.espList || []).forEach(esp => {
      s.layout.byEsp[esp].forEach((sh, si) => {
        cutMaps += `<div class="sheet"><h3>${t('plf.plano.doc.sheet', { i: si + 1, esp })}</h3>${Planifica._planoCutSvg(sh, esp, numMap)}</div>`;
      });
    });

    // ── Vistas + quantitativo + dimensões ──
    const quant = Planifica._planoQuantTable(ctx);
    const labels = Planifica._planoLabels(numMap);
    const dimsBlock = dims ? `<div class="dims"><span class="dims__lbl">${t('plf.plano.doc.dims')}</span><span class="dims__v">${dims.w} <em>${t('plf.plano.doc.dim.w')}</em> × ${dims.h} <em>${t('plf.plano.doc.dim.h')}</em> × ${dims.d} <em>${t('plf.plano.doc.dim.d')}</em> <em>mm</em></span></div>` : '';
    const views = Planifica._planoViews(numMap);

    return `<!DOCTYPE html><html lang="${(window.I18n && I18n.lang) || 'pt'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('plf.plano.doc.title')}</title><style>${Planifica._planoCss()}</style></head><body>
${capa}
<section class="page">${Planifica._brandStrip(empresa, Planifica._t('plf.plano.doc.views_title'))}
  <div class="page-body">
    ${oversizeWarn}
    <h2>${t('plf.plano.doc.quant')}</h2>
    ${quant}
    ${dimsBlock}
    <h2>${t('plf.plano.doc.views_title')}</h2>
    ${views}
  </div>
</section>
<section class="page">${Planifica._brandStrip(empresa, Planifica._t('plf.plano.doc.cutmap'))}
  <div class="page-body"><h2>${t('plf.plano.doc.cutmap')}</h2><p class="hint">${t('plf.plano.doc.cutmap_hint')}</p><div class="sheets">${cutMaps}</div></div>
</section>
<section class="page">${Planifica._brandStrip(empresa, Planifica._t('plf.plano.doc.partslist'))}
  <div class="page-body"><h2>${t('plf.plano.doc.partslist')}</h2>${partsTable}</div>
</section>
<section class="page">${Planifica._brandStrip(empresa, Planifica._t('plf.plano.doc.labels'))}
  <div class="page-body"><h2>${t('plf.plano.doc.labels')}</h2><p class="hint">${t('plf.plano.doc.labels_hint')}</p>${labels}</div>
</section>
<footer class="doc-foot">${t('plf.plano.doc.gen')} · ${esc(dateStr)}</footer>
</body></html>`;
  },

  // ── Capa do plano (logo + dados da empresa + resumo executivo) ──
  _planoCapa(empresa, ctx) {
    const s = Planifica.state;
    const E = Planifica._escE;
    const t = (k, v) => Planifica._esc(Planifica._t(k, v));
    const m = Planifica._hasEmpresa(empresa) ? empresa : null;
    const docLabel = (m && m.doc_tipo === 'cpf') ? 'CPF' : 'CNPJ';
    const empresaHeader = m ? `<div class="capa-empresa">
      ${m.logo ? `<div class="capa-empresa__logo"><img src="${m.logo}" alt="${E(m.nome || 'logo')}"></div>` : ''}
      <div class="capa-empresa__info">
        ${m.nome ? `<h1 class="capa-empresa__name">${E(m.nome)}</h1>` : ''}
        <ul class="capa-empresa__list">
          ${m.doc ? `<li><span>${docLabel}</span><b>${E(m.doc)}</b></li>` : ''}
          ${m.endereco ? `<li><span>Endereço</span><b>${E(m.endereco)}</b></li>` : ''}
          ${m.fone ? `<li><span>Telefone</span><b>${E(m.fone)}</b></li>` : ''}
          ${m.email ? `<li><span>Email</span><b>${E(m.email)}</b></li>` : ''}
        </ul>
      </div></div>` : '';
    const d = ctx.dims;
    const resumo = `<div class="capa-resumo">
      <div class="capa-resumo__item"><span class="capa-resumo__lbl">${t('plf.stat.pecas')}</span><span class="capa-resumo__val">${s.paineis.length}</span></div>
      <div class="capa-resumo__item"><span class="capa-resumo__lbl">${t('plf.stat.chapas')}</span><span class="capa-resumo__val">${ctx.sc.sheets}</span></div>
      <div class="capa-resumo__item"><span class="capa-resumo__lbl">${t('plf.plano.doc.yield')}</span><span class="capa-resumo__val">${ctx.sc.sheetYield.toFixed(0)}<em>%</em></span></div>
      <div class="capa-resumo__item"><span class="capa-resumo__lbl">${t('plf.plano.doc.banding')}</span><span class="capa-resumo__val">${Planifica._bandingTotalM()}<em>m</em></span></div>
      <div class="capa-resumo__item"><span class="capa-resumo__lbl">${t('plf.plano.doc.thickness')}</span><span class="capa-resumo__val">${Planifica._esc((s.espessuras || []).join(', '))} <em>mm</em></span></div>
      ${d ? `<div class="capa-resumo__item"><span class="capa-resumo__lbl">${t('plf.plano.doc.dims')}</span><span class="capa-resumo__val" style="font-size:17px">${d.w}×${d.h}×${d.d}<em>mm</em></span></div>` : ''}
      <div class="capa-resumo__item"><span class="capa-resumo__lbl">${t('plf.plano.doc.equip')}</span><span class="capa-resumo__val" style="font-size:15px">${Planifica._esc(ctx.modoLabel)}</span></div>
    </div>`;
    const assinatura = (m && (m.repr || m.cargo)) ? `<div class="capa-assinatura"><div class="capa-assinatura__line"></div><div class="capa-assinatura__nome">${E(m.repr || '')}</div>${m.cargo ? `<div class="capa-assinatura__cargo">${E(m.cargo)}</div>` : ''}</div>` : '';
    return `<div class="capa"><div class="capa__frame">
      ${empresaHeader}
      <div class="capa__divider"></div>
      <div class="capa__title"><span class="capa-kicker">${t('plf.plano.doc.capa_kicker')}</span><h2>${t('plf.plano.doc.title')}</h2><p class="capa-sub">${t('plf.plano.doc.gen_on', { date: ctx.dateStr })}</p></div>
      ${resumo}
      ${assinatura}
      <div class="capa-footer"><span>SignEng · Planifica</span><span>${Planifica._esc(ctx.dateStr)}</span></div>
    </div></div>`;
  },

  // ── Tabela de quantitativo (por espessura + total) ──
  _planoQuantTable(ctx) {
    const s = Planifica.state;
    const t = (k, v) => Planifica._esc(Planifica._t(k, v));
    const chapaArea = s.chapa.larg * s.chapa.comp;
    let totArea = 0, rows = '';
    (s.layout.espList || []).forEach(esp => {
      const sheets = s.layout.byEsp[esp];
      let pa = 0, pc = 0;
      sheets.forEach(sh => sh.parts.forEach(p => { pa += p.w * p.h; pc++; }));
      totArea += pa;
      const yld = sheets.length > 0 ? (pa / (sheets.length * chapaArea)) * 100 : 0;
      rows += `<tr><td class="c">${esp} mm</td><td class="c">${pc}</td><td class="c">${sheets.length}</td><td class="c">${yld.toFixed(0)}%</td><td class="c">${(pa / 1e6).toFixed(2)} m²</td></tr>`;
    });
    return `<table class="quant"><thead><tr>
      <th>${t('plf.plano.doc.col.thick')}</th><th>${t('plf.stat.pecas')}</th><th>${t('plf.stat.chapas')}</th>
      <th>${t('plf.plano.doc.yield')}</th><th>${t('plf.plano.doc.area')}</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="c">Total</td><td class="c">${s.paineis.length}</td><td class="c">${ctx.sc.sheets}</td><td class="c">${ctx.sc.sheetYield.toFixed(0)}%</td><td class="c">${(totArea / 1e6).toFixed(2)} m²</td></tr></tfoot>
    </table>`;
  },

  // ── Etiquetas: 1 cartão por peça (nº + nome + medida) p/ recortar e colar ──
  _planoLabels(numMap) {
    const s = Planifica.state;
    const E = Planifica._esc;
    let cards = '';
    s.paineis.forEach(p => {
      cards += `<div class="label"><div class="label__num">${numMap[p.id]}</div>` +
               `<div class="label__body"><div class="label__name">${E(p.nome)}</div>` +
               `<div class="label__dim">${p.larg} × ${p.comp} <em>mm</em></div>` +
               `<div class="label__esp">${p.esp} mm</div></div></div>`;
    });
    return `<div class="labels-grid">${cards}</div>`;
  },

  // ── Vistas do móvel: frente/topo/lateral (com cotas) + iso + explodida ──
  _planoViews(numMap) {
    const t = (k, v) => Planifica._esc(Planifica._t(k, v));
    const card = (title, svg, full) => svg ? `<div class="view${full ? ' view--full' : ''}"><div class="view__t">${title}</div>${svg}</div>` : '';
    const grid = `<div class="views-grid">
      ${card(t('plf.plano.doc.view.front'), Planifica._planoOrthoSvg(numMap, 'front'))}
      ${card(t('plf.plano.doc.view.top'),   Planifica._planoOrthoSvg(numMap, 'top'))}
      ${card(t('plf.plano.doc.view.side'),  Planifica._planoOrthoSvg(numMap, 'side'))}
      ${card(t('plf.plano.doc.view.iso'),   Planifica._planoIso3dSvg(numMap, 0))}
    </div>`;
    const exploded = Planifica._planoIso3dSvg(numMap, 0.9);
    const expBlock = exploded ? card(t('plf.plano.doc.view.exploded'), exploded, true) + `<p class="hint">${t('plf.plano.doc.assembly_hint')}</p>` : '';
    return grid + expBlock;
  },

  // ── Vista ortográfica (frente/topo/lateral) com cotas do móvel ──
  _planoOrthoSvg(numMap, view) {
    const s = Planifica.state;
    if (!s.bbox || !s.paineis.length) return '';
    const mn = s.bbox.min, mx = s.bbox.max;
    const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
    const dimX = mx[0] - mn[0], dimY = mx[1] - mn[1], dimZ = mx[2] - mn[2];
    let proj, hExt, vExt;
    if (view === 'front')     { proj = (x, y, z) => ({ u: x - cx, v: z - cz, d: -(y - cy) }); hExt = dimX; vExt = dimZ; }
    else if (view === 'top')  { proj = (x, y, z) => ({ u: x - cx, v: -(y - cy), d: z - cz }); hExt = dimX; vExt = dimY; }
    else                      { proj = (x, y, z) => ({ u: y - cy, v: z - cz, d: -(x - cx) }); hExt = dimY; vExt = dimZ; }
    const W = 720, H = 560, pad = 70;
    const sc = Math.min((W - 2 * pad) / Math.max(hExt, 1), (H - 2 * pad) / Math.max(vExt, 1));
    const SX = u => W / 2 + u * sc, SY = v => H / 2 - v * sc;
    const FACE = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
    const faces = [];
    s.paineis.forEach(p => {
      if (!p.corners || p.corners.length < 8) return;
      const pr = p.corners.map(c => { const q = proj(c[0], c[1], c[2]); return { x: SX(q.u), y: SY(q.v), d: q.d }; });
      FACE.forEach(fi => { const pts = fi.map(k => pr[k]); faces.push({ pts, depth: (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4 }); });
    });
    faces.sort((a, b) => a.depth - b.depth);
    let svg = `<svg class="ortho" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
    faces.forEach(f => { const d = f.pts.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' '); svg += `<polygon points="${d}" fill="rgba(160,170,190,0.32)" stroke="rgba(70,80,100,0.6)" stroke-width="0.8"/>`; });
    const left = SX(-hExt / 2), right = SX(hExt / 2), topY = SY(vExt / 2), botY = SY(-vExt / 2);
    svg += Planifica._dimLine(left, botY + 34, right, botY + 34, Math.round(hExt) + ' mm', false);
    svg += Planifica._dimLine(left - 34, topY, left - 34, botY, Math.round(vExt) + ' mm', true);
    svg += `</svg>`;
    return svg;
  },

  // Linha de cota com ticks nas pontas + texto centralizado.
  _dimLine(x1, y1, x2, y2, text, vertical) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const tx = -dy / len * 5, ty = dx / len * 5;
    const f = n => n.toFixed(1);
    let s = `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="cota"/>`;
    s += `<line x1="${f(x1 - tx)}" y1="${f(y1 - ty)}" x2="${f(x1 + tx)}" y2="${f(y1 + ty)}" class="cota"/>`;
    s += `<line x1="${f(x2 - tx)}" y1="${f(y2 - ty)}" x2="${f(x2 + tx)}" y2="${f(y2 + ty)}" class="cota"/>`;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const tr = vertical ? ` transform="rotate(-90 ${f(mx)} ${f(my)})"` : '';
    s += `<text x="${f(mx)}" y="${f(my - 6)}"${tr} class="cotatxt">${text}</text>`;
    return s;
  },

  // SVG do mapa de corte de UMA chapa (coords em mm; y invertido pra topo).
  _planoCutSvg(sheet, esp, numMap) {
    const s = Planifica.state;
    const CW = s.chapa.larg, CH = s.chapa.comp;
    const numFont = Math.max(24, Math.round(CW / 38));
    const faceFont = Math.max(13, Math.round(CW / 78));
    const bEdges = s.banding && s.banding.edges;
    const tx = x => x.toFixed(1);
    const ty = y => (CH - y).toFixed(1);
    const fills = ['#dbeafe', '#dcfce7', '#fef3c7', '#f3e8ff', '#fee2e2', '#e0f2fe', '#fae8ff'];
    const strokes = ['#2563eb', '#059669', '#d97706', '#9333ea', '#dc2626', '#0284c7', '#c026d3'];
    let svg = `<svg class="cut" viewBox="-15 -15 ${CW + 30} ${CH + 30}" preserveAspectRatio="xMidYMid meet">`;
    svg += `<rect x="0" y="0" width="${CW}" height="${CH}" fill="#fff" stroke="#1f2937" stroke-width="2.2" vector-effect="non-scaling-stroke"/>`;
    const { baseW, baseH } = Planifica._usableArea();
    if ((s.modo === 'router' || s.modo === 'laser') && (baseW < CW - 0.5 || baseH < CH - 0.5)) {
      svg += `<rect x="0" y="${(CH - baseH).toFixed(1)}" width="${baseW}" height="${baseH}" fill="none" stroke="#2563eb" stroke-width="1.6" stroke-dasharray="14,8" vector-effect="non-scaling-stroke"/>`;
    }
    sheet.parts.forEach((p, i) => {
      const over = Planifica._isOversized(p.id);
      const poly = p.poly || [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]];
      const d = poly.map(pt => `${tx(pt[0])},${ty(pt[1])}`).join(' ');
      svg += `<polygon points="${d}" fill="${over ? 'rgba(220,38,38,0.14)' : fills[i % fills.length]}" stroke="${over ? '#dc2626' : strokes[i % strokes.length]}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
      (p.holes || []).forEach(h => {
        if (!h || h.length < 3) return;
        const dh = h.map(pt => `${tx(pt[0])},${ty(pt[1])}`).join(' ');
        svg += `<polygon points="${dh}" fill="#fff" stroke="${strokes[i % strokes.length]}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
      });
      const ccx = p.x + p.w / 2, ccy = p.y + p.h / 2;

      // FITA DE BORDA: traço vermelho grosso nas bordas com fita + rótulo da
      // orientação no móvel (Cima/Baixo/Frente/Fundo/Esq./Dir.).
      const halo = Math.max(3, Math.round(faceFont * 0.28));
      (p.edges2d || []).forEach(e => {
        const st = bEdges ? bEdges[e.key] : null;
        if (!st || !st.on) return;
        let sx = 0, sy = 0, cnt = 0;
        (e.segs || []).forEach(seg => {
          svg += `<line x1="${tx(seg[0][0])}" y1="${ty(seg[0][1])}" x2="${tx(seg[1][0])}" y2="${ty(seg[1][1])}" stroke="#dc2626" stroke-width="4.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
          sx += seg[0][0] + seg[1][0]; sy += seg[0][1] + seg[1][1]; cnt += 2;
        });
        if (cnt && st.faceCode) {
          let lx = sx / cnt, ly = sy / cnt;          // meio da borda
          const dx = ccx - lx, dy = ccy - ly, dl = Math.hypot(dx, dy) || 1;
          const off = Math.min(70, 0.16 * Math.min(p.w, p.h));   // empurra pra dentro
          lx += dx / dl * off; ly += dy / dl * off;
          svg += `<text x="${tx(lx)}" y="${ty(ly)}" class="cface" font-size="${faceFont}" stroke-width="${halo}">${Planifica._esc(Planifica._faceLabel(st.faceCode))}</text>`;
        }
      });

      // Só o número da peça (sem cota) — a medida vive na página de Etiquetas.
      svg += `<text x="${tx(ccx)}" y="${ty(ccy)}" class="cnum" font-size="${numFont}">${numMap[p.id]}${p.rot ? ' ↻' : ''}</text>`;
    });
    svg += `</svg>`;
    return svg;
  },

  // SVG isométrico do móvel com nº das peças. explode=0 → montado; >0 → afasta
  // cada peça do centro proporcionalmente (vista explodida). Escala POR
  // ENQUADRAMENTO (fit nos pontos projetados reais) pra preencher a folha,
  // bolinhas grandes e espalhadas (anti-sobreposição) pra ficar nítido.
  _planoIso3dSvg(numMap, explode) {
    const s = Planifica.state;
    if (!s.bbox || !s.paineis.length) return '';
    const W = 960, H = 680, PAD = 56;
    const mn = s.bbox.min, mx = s.bbox.max;
    const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
    const rx = s.isoRx, ry = s.isoRy;
    // projeção crua (sem escala/offset) — y já invertido pra tela
    const raw = (x, y, z) => {
      x -= cx; y -= cy; z -= cz;
      const cyr = Math.cos(ry), syr = Math.sin(ry);
      const x1 = x * cyr - y * syr, y1 = x * syr + y * cyr;
      const cxr = Math.cos(rx), sxr = Math.sin(rx);
      const y2 = y1 * cxr - z * sxr, z2 = y1 * sxr + z * cxr;
      return { x: x1, y: -z2, d: y2 };
    };
    const FACE = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
    // 1ª passada: pontos crus + bbox projetado
    const pieces = [];
    let minx = 1e12, maxx = -1e12, miny = 1e12, maxy = -1e12;
    s.paineis.forEach(p => {
      if (!p.corners || p.corners.length < 8) return;
      let pcx = 0, pcy = 0, pcz = 0;
      p.corners.forEach(c => { pcx += c[0]; pcy += c[1]; pcz += c[2]; });
      pcx /= 8; pcy /= 8; pcz /= 8;
      const ox = (pcx - cx) * explode, oy = (pcy - cy) * explode, oz = (pcz - cz) * explode;
      const pr = p.corners.map(v => raw(v[0] + ox, v[1] + oy, v[2] + oz));
      pr.forEach(q => { if (q.x < minx) minx = q.x; if (q.x > maxx) maxx = q.x; if (q.y < miny) miny = q.y; if (q.y > maxy) maxy = q.y; });
      pieces.push({ pr, id: p.id });
    });
    if (!pieces.length) return '';
    const spanX = Math.max(maxx - minx, 1), spanY = Math.max(maxy - miny, 1);
    const sc = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const offx = (W - spanX * sc) / 2 - minx * sc, offy = (H - spanY * sc) / 2 - miny * sc;
    const TX = x => x * sc + offx, TY = y => y * sc + offy;
    const faces = [], labels = [];
    pieces.forEach(({ pr, id }) => {
      const P = pr.map(q => ({ x: TX(q.x), y: TY(q.y), d: q.d }));
      FACE.forEach(fi => { const pts = fi.map(k => P[k]); faces.push({ pts, depth: (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4 }); });
      const lx = P.reduce((a, q) => a + q.x, 0) / 8, ly = P.reduce((a, q) => a + q.y, 0) / 8;
      labels.push({ x: lx, y: ly, ox: lx, oy: ly, n: numMap[id], minD: Math.min.apply(null, P.map(q => q.d)) });
    });
    faces.sort((a, b) => b.depth - a.depth);
    // bolinhas grandes; tamanho cai um pouco se houver muitas peças
    const R = Math.max(15, Math.min(26, Math.round(34 - labels.length * 0.35)));
    // anti-sobreposição: empurra rótulos colados pra longe um do outro
    const minDist = 2 * R + 5;
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i], b = labels[j];
          let dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
          if (dist < 1e-6) { dx = 0.5; dy = 0.5; dist = 0.7; }
          if (dist < minDist) {
            const push = (minDist - dist) / 2, ux = dx / dist, uy = dy / dist;
            a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    labels.forEach(l => { l.x = Math.max(R + 2, Math.min(W - R - 2, l.x)); l.y = Math.max(R + 2, Math.min(H - R - 2, l.y)); });

    let svg = `<svg class="iso" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
    faces.forEach(f => {
      const d = f.pts.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
      svg += `<polygon points="${d}" fill="rgba(160,170,190,0.30)" stroke="rgba(90,100,120,0.5)" stroke-width="0.8"/>`;
    });
    labels.sort((a, b) => a.minD - b.minD);   // mais à frente por cima
    // linha de chamada quando a bolinha foi afastada da peça
    labels.forEach(l => {
      if (Math.hypot(l.x - l.ox, l.y - l.oy) > R + 3)
        svg += `<line x1="${l.ox.toFixed(1)}" y1="${l.oy.toFixed(1)}" x2="${l.x.toFixed(1)}" y2="${l.y.toFixed(1)}" stroke="#9ca3af" stroke-width="1.2"/>`;
    });
    labels.forEach(l => {
      svg += `<circle cx="${l.x.toFixed(1)}" cy="${l.y.toFixed(1)}" r="${R}" fill="#171717"/>`;
      svg += `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" class="inum" font-size="${Math.round(R * 1.15)}">${l.n}</text>`;
    });
    svg += `</svg>`;
    return svg;
  },

  _planoCss() {
    return `
*{box-sizing:border-box}
body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#171717;background:#f3f4f6;font-size:14px;line-height:1.5}
h2{font-size:18px;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
h2:first-child{margin-top:6px}
h3{font-size:14px;margin:0 0 8px;color:#374151}
p.hint{color:#6b7280;margin:10px 0 0;font-size:13px}
.warn{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:12px 16px;margin:0 0 18px;font-weight:500}
/* ===== CAPA ===== */
.capa{background:#fff;max-width:900px;margin:24px auto;padding:40px}
.capa__frame{position:relative;padding:24px;border:1px solid #e5e5e5;border-radius:14px}
.capa__frame::before{content:"";position:absolute;inset:8px;border:1px solid #f5f5f5;border-radius:10px;pointer-events:none}
.capa-empresa{display:grid;grid-template-columns:140px 1fr;gap:28px;align-items:center;padding:8px 12px 24px}
.capa-empresa__logo{width:140px;height:140px;display:grid;place-items:center;background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;padding:8px}
.capa-empresa__logo img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.capa-empresa__name{font-size:32px;font-weight:700;letter-spacing:-.025em;color:#171717;margin:0 0 12px;line-height:1.1}
.capa-empresa__list{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-family:'Courier New',monospace;font-size:12px}
.capa-empresa__list li{display:flex;gap:10px;align-items:baseline}
.capa-empresa__list li span{color:#a3a3a3;text-transform:uppercase;font-size:10px;letter-spacing:.08em;font-weight:600;min-width:72px}
.capa-empresa__list li b{color:#171717;font-weight:600}
.capa__divider{height:1px;background:linear-gradient(to right,#171717 0%,#171717 80px,#e5e5e5 80px);margin:16px 0 24px}
.capa__title{padding:0 12px;margin-bottom:28px}
.capa-kicker{font-family:'Courier New',monospace;font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:.1em;font-weight:700}
.capa__title h2{font-size:38px;font-weight:600;letter-spacing:-.03em;color:#171717;margin:6px 0 8px;line-height:1.1;border:none;padding:0}
.capa-sub{color:#737373;margin:0;font-size:13px}
.capa-resumo{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 12px 28px}
.capa-resumo__item{padding:16px 14px;background:#fafafa;border:1px solid #f5f5f5;border-radius:10px;display:flex;flex-direction:column;gap:6px}
.capa-resumo__lbl{font-family:'Courier New',monospace;font-size:10px;color:#737373;text-transform:uppercase;letter-spacing:.08em;font-weight:600}
.capa-resumo__val{font-size:22px;font-weight:600;color:#171717;line-height:1.1}
.capa-resumo__val em{font-style:normal;font-size:12px;color:#737373;font-weight:500;margin-left:2px}
.capa-assinatura{margin:36px 12px 12px;max-width:320px}
.capa-assinatura__line{border-top:1px solid #171717;margin-bottom:6px}
.capa-assinatura__nome{font-size:14px;font-weight:600;color:#171717}
.capa-assinatura__cargo{font-family:'Courier New',monospace;font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
.capa-footer{display:flex;justify-content:space-between;margin-top:32px;padding-top:14px;border-top:1px solid #eee;color:#9ca3af;font-size:11px}
/* ===== PÁGINAS ===== */
.page{background:#fff;max-width:900px;margin:24px auto;border-radius:4px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.page-body{padding:24px 32px 36px}
.brand-strip{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f5f5f5;background:#fff}
.brand-strip img.brand-strip__logo,.brand-strip>.brand-strip__logo{width:24px;height:24px;max-width:24px;max-height:24px;object-fit:contain;display:block;flex-shrink:0}
.brand-strip__logo--placeholder{background:#fafafa;border:1px solid #e5e5e5;border-radius:4px}
.brand-strip__name{font-weight:700;font-size:13px;color:#171717;letter-spacing:-.01em}
.brand-strip__sep{flex:1;height:1px;background:#e5e5e5}
.brand-strip__label{font-family:'Courier New',monospace;font-size:10px;color:#737373;text-transform:uppercase;letter-spacing:.08em;font-weight:600;flex-shrink:0}
/* ===== QUANTITATIVO ===== */
table.quant{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:6px}
table.quant th{background:#f3f4f6;color:#374151;padding:8px 10px;text-align:center;font-weight:600;border:1px solid #e5e7eb}
table.quant td{padding:7px 10px;border:1px solid #eee}
table.quant td.c{text-align:center}
table.quant tfoot td{background:#171717;color:#fff;font-weight:700;border-color:#171717}
.dims{display:flex;align-items:baseline;gap:12px;margin:12px 0 2px;flex-wrap:wrap}
.dims__lbl{font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#737373;font-weight:600}
.dims__v{font-size:18px;font-weight:600}
.dims__v em{font-style:normal;font-size:11px;color:#737373;font-weight:500}
/* ===== VISTAS ===== */
.views-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.view{border:1px solid #e5e7eb;border-radius:12px;padding:10px;page-break-inside:avoid;background:#fff}
.view--full{margin-top:16px}
.view__t{font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#374151;font-weight:700;margin-bottom:6px}
svg.ortho,svg.iso{width:100%;height:auto;display:block}
svg.ortho{max-height:360px}
svg.iso{max-height:560px}
.view--full svg.iso{max-height:820px}
svg .inum{fill:#fff;font-weight:700;text-anchor:middle;dominant-baseline:central}
svg .cota{stroke:#dc2626;stroke-width:1}
svg .cotatxt{fill:#b91c1c;font-size:13px;font-weight:600;text-anchor:middle;dominant-baseline:central}
/* ===== MAPA DE CORTE ===== */
.sheets{display:flex;flex-direction:column;gap:24px}
.sheet{border:1px solid #e5e7eb;border-radius:12px;padding:16px;page-break-inside:avoid}
svg.cut{width:100%;height:auto;max-height:560px;display:block}
svg.cut .cnum{font-weight:700;fill:#111827;text-anchor:middle;dominant-baseline:central}
svg.cut .cface{font-weight:700;fill:#b91c1c;text-anchor:middle;dominant-baseline:central;stroke:#fff;paint-order:stroke;stroke-linejoin:round}
/* ===== LISTA ===== */
table.parts{width:100%;border-collapse:collapse;font-size:13px}
table.parts th{background:#171717;color:#fff;padding:8px 10px;text-align:left;font-weight:600}
table.parts td{padding:7px 10px;border-bottom:1px solid #eee}
table.parts td.c{text-align:center}
table.parts tr:nth-child(even) td{background:#fafafa}
table.parts tr.over td{background:#fef2f2;color:#b91c1c}
table.parts tfoot td{background:#f3f4f6;font-weight:700;border-top:2px solid #d1d5db}
/* ===== ETIQUETAS ===== */
.labels-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.label{display:flex;align-items:stretch;gap:0;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;page-break-inside:avoid;min-height:64px}
.label__num{flex:0 0 44px;display:grid;place-items:center;background:#171717;color:#fff;font-size:22px;font-weight:700}
.label__body{flex:1;padding:7px 10px;display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0}
.label__name{font-size:13px;font-weight:600;color:#171717;line-height:1.2;overflow-wrap:anywhere}
.label__dim{font-size:13px;font-weight:600;color:#374151}
.label__dim em,.label__esp{font-style:normal;color:#737373;font-weight:500}
.label__esp{font-family:'Courier New',monospace;font-size:11px}
.doc-foot{max-width:900px;margin:0 auto;padding:18px;color:#9ca3af;font-size:12px;text-align:center}
@media print{body{background:#fff}.capa,.page{margin:0;max-width:none;box-shadow:none;border-radius:0}.page{page-break-before:always}.capa{page-break-after:always}.view,.sheet{break-inside:avoid}}
`;
  }
};
