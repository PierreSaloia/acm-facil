/* ══════════════════════════════════════════════════════════════════════════
   CORTE & ENCAIXE — finger joints + plano de corte SVG (laser / CNC router)

   Fluxo: capturar (Ruby detecta as chapas do objeto montado, com contorno e
   frame 3D de cada face) → detectar JUNTAS (bordas de uma peça em contato com
   o corpo de outra peça perpendicular) → gerar os DENTES (finger joint) nas
   duas peças de cada junta, com compensação de kerf/folga e alívio dogbone
   (router) → montar o plano de corte 2D numerado → exportar SVG.
   ══════════════════════════════════════════════════════════════════════════ */

/* Paleta de cores por peça (mesma cor no plano, na tabela, no isométrico e
   no overlay do SketchUp) — cores distintas, cicla se passar de 12 peças. */
const CEJ_PALETTE = [
  [37, 99, 235], [5, 150, 105], [217, 119, 6], [220, 38, 38],
  [147, 51, 234], [8, 145, 178], [101, 163, 13], [219, 39, 119],
  [79, 70, 229], [13, 148, 136], [180, 83, 9], [190, 24, 93]
];

window.CorteEncaixe = {
  state: {
    paineis:   [],          // [{id, nome, esp, larg, comp, area, corners, outline, holes, o, u, v, pid}]
    espessuras:[],
    byId:      {},
    bbox:      null,
    solid:     false,       // modo sólido: chapas vindas das FACES do volume
    esp:       3,           // mm — espessura da chapa (modo sólido)
    included:  {},          // id -> bool: peça entra no plano (modo sólido)
    modo:      'laser',     // 'laser' | 'router'
    kerf:      0.15,        // mm — largura do feixe (laser)
    fresa:     3.175,       // mm — diâmetro da fresa (router, 1/8")
    comp:      'ext',       // router: 'ext' = fresa POR FORA da linha | 'none' = na linha (CAM compensa)
    dente:     15,          // mm — tamanho alvo do dente
    folga:     0.1,         // mm — folga de ajuste do encaixe
    espaco:    10,          // mm — espaço entre peças no plano
    dogbone:   true,        // alívio nos cantos internos (router)
    numeros:   true,        // numerar peças no SVG (camada de gravação)
    montagem:  true,        // etiquetas de montagem (nome do parceiro em cada junta)
    chapa:     { larg: 2750, comp: 1850 },   // mm — chapa que está cortando
    cutArea:   { larg: 1300, comp: 900 },    // mm — área de corte da máquina
    margem:    10,          // mm — margem da borda da área útil
    allowRotate: true,      // girar peças 90° no encaixe
    sheetIdx:  0,           // chapa ativa no preview
    oversized: [],          // nums das peças que não cabem na área útil
    isoRx:     -0.5,        // vista isométrica: rotação/zoom/pan
    isoRy:     0.7,
    isoZoom:   1,
    isoPanX:   0,
    isoPanY:   0,
    show3d:    true,        // pintar as peças no SketchUp (overlay colorido)
    joints:    [],          // [{pieceId, runIdx, partnerId, depth, role}]
    layout:    null,        // { sheets:[{parts:[{...pc,x,y,rot}]}], teeth, partsArea }
    selectedId: null,
    zoom2D:    1,
    panX2D:    0,
    panY2D:    0,
    dragging2D: false,
    lastX2D:   0, lastY2D: 0,
    loading:   false
  },

  _resetView2D() {
    const s = CorteEncaixe.state;
    s.zoom2D = 1; s.panX2D = 0; s.panY2D = 0;
  },

  // Tradução com substituição de {placeholders}. Fallback pro próprio texto.
  _t(key, vars) {
    let str = (window.I18n ? I18n.t(key) : key) || key;
    if (vars) Object.keys(vars).forEach(k => { str = str.split('{' + k + '}').join(vars[k]); });
    return str;
  },

  init() {
    const s = CorteEncaixe.state;
    s.paineis = []; s.espessuras = []; s.byId = {}; s.bbox = null; s.solid = false;
    s.included = {}; s.joints = []; s.layout = null; s.selectedId = null;
    CorteEncaixe._bindInputs();
    CorteEncaixe._bindCanvas();
    CorteEncaixe._bindIso();
    CorteEncaixe._updateCaptureLabel();
    CorteEncaixe._renderCaptureHint();
    CorteEncaixe._renderModoInfo();
    if (window.lucide) lucide.createIcons();
  },

  onLangChange() {
    CorteEncaixe._updateCaptureLabel();
    CorteEncaixe._renderCaptureHint();
    CorteEncaixe._renderModoInfo();
    if (CorteEncaixe.state.paineis.length || CorteEncaixe.state.solid) CorteEncaixe._rebuild();
    if (window.lucide) lucide.createIcons();
  },

  _updateCaptureLabel() {
    const btn = document.getElementById('cej_btn_capturar');
    if (!btn) return;
    const span = btn.querySelector('span');
    const has = CorteEncaixe.state.paineis.length || CorteEncaixe.state.solid;
    if (span) span.textContent = has
      ? CorteEncaixe._t('cej.capture.recapture')
      : CorteEncaixe._t('cej.capture.btn');
  },

  _renderCaptureHint() {
    const el = document.getElementById('cej_capture_hint');
    if (!el) return;
    const s = CorteEncaixe.state;
    if (s.solid) {
      el.textContent = CorteEncaixe._t('cej.capture.okbox', { n: s.paineis.length });
      el.classList.remove('cej__hint--error');
    } else if (s.paineis.length) {
      el.textContent = CorteEncaixe._t('cej.capture.ok', { n: s.paineis.length, esp: (s.espessuras || []).join(', ') });
      el.classList.remove('cej__hint--error');
    } else {
      el.textContent = CorteEncaixe._t('cej.capture.hint');
      el.classList.remove('cej__hint--error');
    }
  },

  _renderModoInfo() {
    const el = document.getElementById('cej_modo_info');
    if (el) el.textContent = CorteEncaixe._t('cej.modo.info.' + CorteEncaixe.state.modo);
  },

  // ── Inputs (recalcula ao vivo) ────────────────────────────────────────────
  _bindInputs() {
    ['cej_kerf', 'cej_fresa', 'cej_dente', 'cej_folga', 'cej_espaco', 'cej_esp',
     'cej_chapa_larg', 'cej_chapa_comp', 'cej_cut_larg', 'cej_cut_comp', 'cej_margem'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._cejBound) {
        el._cejBound = true;
        el.addEventListener('input', () => CorteEncaixe._onParamChange());
      }
    });
    ['cej_dogbone', 'cej_numeros', 'cej_montagem', 'cej_rotate', 'cej_comp'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._cejBound) {
        el._cejBound = true;
        el.addEventListener('change', () => CorteEncaixe._onParamChange());
      }
    });
    const cv = document.getElementById('cej_canvas');
    if (cv && !cv._cejResize) {
      cv._cejResize = true;
      window.addEventListener('resize', () => { CorteEncaixe._scheduleDraw(); CorteEncaixe._scheduleDrawIso(); });
    }
  },

  _num(id, fallback) {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isFinite(v) ? v : fallback;
  },

  _onParamChange() {
    const s = CorteEncaixe.state;
    s.kerf   = Math.max(0, CorteEncaixe._num('cej_kerf', 0.15));
    s.fresa  = Math.max(0.5, CorteEncaixe._num('cej_fresa', 3.175));
    s.dente  = Math.max(3, CorteEncaixe._num('cej_dente', 15));
    s.folga  = Math.max(0, CorteEncaixe._num('cej_folga', 0.1));
    s.espaco = Math.max(0, CorteEncaixe._num('cej_espaco', 10));
    const db = document.getElementById('cej_dogbone');
    s.dogbone = db ? db.checked : true;
    const cp = document.getElementById('cej_comp');
    s.comp = cp ? cp.value : 'ext';
    const nm = document.getElementById('cej_numeros');
    s.numeros = nm ? nm.checked : true;
    const mt = document.getElementById('cej_montagem');
    s.montagem = mt ? mt.checked : true;
    s.esp = Math.max(0.5, CorteEncaixe._num('cej_esp', 3));
    s.chapa.larg = Math.max(100, CorteEncaixe._num('cej_chapa_larg', 2750));
    s.chapa.comp = Math.max(100, CorteEncaixe._num('cej_chapa_comp', 1850));
    s.cutArea.larg = Math.max(50, CorteEncaixe._num('cej_cut_larg', 1300));
    s.cutArea.comp = Math.max(50, CorteEncaixe._num('cej_cut_comp', 900));
    s.margem = Math.max(0, CorteEncaixe._num('cej_margem', 10));
    const rot = document.getElementById('cej_rotate');
    s.allowRotate = rot ? rot.checked : true;
    if (s.paineis.length) CorteEncaixe._rebuild();
  },

  // Área útil de encaixe (mm): chapa limitada pela área de corte da máquina,
  // com a margem descontada dos 2 lados.
  _usableArea() {
    const s = CorteEncaixe.state;
    const baseW = Math.min(s.chapa.larg, s.cutArea.larg > 0 ? s.cutArea.larg : s.chapa.larg);
    const baseH = Math.min(s.chapa.comp, s.cutArea.comp > 0 ? s.cutArea.comp : s.chapa.comp);
    return { baseW, baseH, usableW: baseW - 2 * s.margem, usableH: baseH - 2 * s.margem };
  },

  setModo(modo) {
    const s = CorteEncaixe.state;
    s.modo = modo;
    document.querySelectorAll('.cej__seg-btn[data-modo]').forEach(b => b.classList.toggle('is-active', b.dataset.modo === modo));
    const kw = document.getElementById('cej_kerf_wrap');
    const fw = document.getElementById('cej_fresa_wrap');
    const dw = document.getElementById('cej_dogbone_wrap');
    const cw = document.getElementById('cej_comp_wrap');
    if (kw) kw.hidden = (modo !== 'laser');
    if (fw) fw.hidden = (modo !== 'router');
    if (dw) dw.hidden = (modo !== 'router');
    if (cw) cw.hidden = (modo !== 'router');
    CorteEncaixe._renderModoInfo();
    if (s.paineis.length) CorteEncaixe._rebuild();
  },

  // ── CAPTURAR ─────────────────────────────────────────────────────────────
  async capturar() {
    if (CorteEncaixe.state.loading) return;
    CorteEncaixe.state.loading = true;
    const btn = document.getElementById('cej_btn_capturar');
    if (btn) btn.disabled = true;
    try {
      const r = await Bridge.call('corte_encaixe_capturar', {});
      if (!r || !r.ok) {
        CorteEncaixe._hintError(CorteEncaixe._errMsg(r && r.code));
        return;
      }
      const s = CorteEncaixe.state;
      s.included = {};
      if (r.modo === 'solido') {
        // MODO SÓLIDO: chapas vindas das FACES reais do volume (retas ou
        // inclinadas), com adjacência + ângulo diedro por aresta.
        s.solid = true;
        s.paineis = r.paineis || [];
        s.espessuras = []; s.bbox = null;
        CorteEncaixe._nomearFaces();
        s.paineis.forEach(p => { s.included[p.id] = true; });
      } else {
        s.solid = false;
        s.paineis = r.paineis || [];
        s.espessuras = r.espessuras || [];
        s.bbox = r.bbox || null;
        s.paineis.forEach(p => { s.included[p.id] = true; });
      }
      s.selectedId = null;
      s.byId = {};
      s.paineis.forEach(p => { s.byId[p.id] = p; });
      CorteEncaixe._resetView2D();
      CorteEncaixe._renderCaptureHint();
      CorteEncaixe._updateCaptureLabel();
      CorteEncaixe._onParamChange();   // lê params + _rebuild()
      CorteEncaixe._showSections(true);
      if (window.Toast) {
        Toast.success(s.solid
          ? CorteEncaixe._t('cej.capture.okbox', { n: s.paineis.length })
          : CorteEncaixe._t('cej.capture.ok', { n: s.paineis.length, esp: (s.espessuras || []).join(', ') }));
      }
    } catch (e) {
      CorteEncaixe._hintError(CorteEncaixe._t('cej.err.comm', { e: e.message }));
    } finally {
      CorteEncaixe.state.loading = false;
      if (btn) btn.disabled = false;
    }
  },

  _errMsg(code) {
    const m = {
      'corte_encaixe.nada_selecionado': 'cej.err.nada',
      'corte_encaixe.nenhum_painel':    'cej.err.nenhum'
    };
    return CorteEncaixe._t(m[code] || 'cej.err.generic');
  },

  _hintError(msg) {
    const el = document.getElementById('cej_capture_hint');
    if (el) { el.textContent = msg; el.classList.add('cej__hint--error'); }
    if (window.Toast) Toast.error(msg);
  },

  _showSections(on) {
    ['cej_params', 'cej_stats', 'cej_preview_section', 'cej_list_section', 'cej_footer']
      .forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !on; });
  },


  // ── MODO SÓLIDO: nomes das faces por orientação (normal = u×v) ──────────
  // topo/base pelo eixo Z; frente/trás/esq/dir pelo eixo horizontal dominante.
  // Repetições ganham sufixo numérico ("Frente 2").
  _nomearFaces() {
    const s = CorteEncaixe.state;
    const used = {};
    s.paineis.forEach(p => {
      const n = CorteEncaixe._normal(p);
      let key = 'face';
      if (n) {
        const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
        if (az >= ax && az >= ay) key = n[2] >= 0 ? 'topo' : 'base';
        else if (ay >= ax) key = n[1] >= 0 ? 'tras' : 'frente';
        else key = n[0] >= 0 ? 'dir' : 'esq';
      }
      used[key] = (used[key] || 0) + 1;
      const base = key === 'face' ? p.nome : CorteEncaixe._t('cej.face.' + key);
      p.nome = used[key] > 1 ? base + ' ' + used[key] : base;
    });
  },

  // ── MODO SÓLIDO: juntas pela ADJACÊNCIA das faces (vale pra inclinadas) ──
  // Cada run cujos segmentos compartilham aresta com OUTRA face (dados do
  // Ruby: p.adj[segIdx] = { p: índice do parceiro, ang: diedro interno }) vira
  // junta. Profundidade do dente = esp / sin(diedro) — a 90° é a espessura;
  // inclinado (tronco de pirâmide) o dente aprofunda pra atravessar a chapa
  // do parceiro. Diedro < 20° ou > 160° (facetas de curva) fica liso.

  // ── Geometria auxiliar (frame 3D das peças) ──────────────────────────────
  // Ponto local (u,v) mm → mundo (mm) via frame da face (o,u,v).
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

  // AABB (mundo, mm) a partir dos 8 cantos da peça.


  // Quebra o contorno em RUNS (trechos retos) — igual ao Planifica: a cada
  // canto/curva (> 15°) começa um run novo.

  // ── DETECÇÃO DE JUNTAS ────────────────────────────────────────────────────
  // Uma borda (run reto) de p vira JUNTA quando os seus pontos, no mundo,
  // caem dentro do volume (AABB) de OUTRA peça cuja face é perpendicular à
  // de p. O papel (macho/fêmea) sai da ordem dos ids — determinístico, então
  // os dois lados da mesma junta sempre se complementam.

  // ── GERAÇÃO DOS DENTES ────────────────────────────────────────────────────
  // Substitui cada run de junta por uma onda quadrada: macho = dente nas
  // pontas (N ímpar, i par = dente), fêmea = complementar (i par = vão).
  // O padrão é SIMÉTRICO, então independe do sentido de percurso — os dois
  // lados da junta sempre casam. Profundidade do vão = espessura do parceiro.
  // Compensação: cada vão encolhe `c` mm por lado (c = kerf/2 − folga/2 no
  // laser; c = −folga/2 no router, onde a compensação da fresa fica no CAM).

  // Gera os pontos do run dentado + dogbones. a,b = pontas (local, mm);
  // inward = unitário 2D apontando pro MIOLO da peça; depth = profundidade.

  // Remove pontos duplicados e "espetos" (ida-e-volta na mesma linha) que
  // sobram quando um vão de canto encurta a borda vizinha. A reversão remove
  // SEMPRE o vértice do espeto (o caminho segue direto a→c); se ainda sobrar
  // retraço, a próxima iteração pega. Tolerância folgada (−0.95) pra cantos
  // com compensação de kerf/arredondamento e faces inclinadas.

  // Área com sinal ×2 do polígono (positiva = anti-horário/CCW).
  _polyArea2(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a;
  },

  // OFFSET de polígono (caminho da fresa): r>0 desloca pra FORA do polígono,
  // r<0 pra dentro — independe do sentido (usa o winding). Junções em miter
  // com clamp de 3r (canto agudo não dispara).
  _offsetPoly(pts, r) {
    const n = pts.length;
    if (n < 3 || !r) return pts.slice();
    const sgn = CorteEncaixe._polyArea2(pts) > 0 ? 1 : -1;
    const edge = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = sgn * dy / L, ny = -sgn * dx / L;   // normal EXTERNA
      return { ax: a[0] + nx * r, ay: a[1] + ny * r, dx, dy };
    };
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const e1 = edge(p0, p1), e2 = edge(p1, p2);
      const den = e1.dx * e2.dy - e1.dy * e2.dx;
      let q;
      if (Math.abs(den) < 1e-9) {
        q = [e2.ax, e2.ay];   // colinear: segue a aresta deslocada
      } else {
        const t = ((e2.ax - e1.ax) * e2.dy - (e2.ay - e1.ay) * e2.dx) / den;
        q = [e1.ax + e1.dx * t, e1.ay + e1.dy * t];
        const d = Math.hypot(q[0] - p1[0], q[1] - p1[1]);
        const lim = Math.abs(r) * 3;
        if (d > lim) { const f = lim / d; q = [p1[0] + (q[0] - p1[0]) * f, p1[1] + (q[1] - p1[1]) * f]; }
      }
      out.push(q);
    }
    return out;
  },

  // Caminho de corte de uma peça: com compensação EXTERNA (router), o
  // contorno sai deslocado fresa/2 pra fora e os furos fresa/2 pra dentro —
  // a peça cortada fica no tamanho exato do desenho.
  _isExt() {
    const s = CorteEncaixe.state;
    return s.modo === 'router' && s.comp === 'ext';
  },
  _cutPoly(pc) {
    return CorteEncaixe._isExt() ? CorteEncaixe._offsetPoly(pc.poly, CorteEncaixe.state.fresa / 2) : pc.poly;
  },
  _cutHole(h) {
    return CorteEncaixe._isExt() ? CorteEncaixe._offsetPoly(h, -CorteEncaixe.state.fresa / 2) : h;
  },
  // Dogbone: na linha = círculo do diâmetro da fresa (material removido);
  // compensação externa = o caminho é do CENTRO da fresa → vira um ponto de
  // mergulho (círculo mínimo só pra marcar).
  _cutBoneR(bn) {
    return CorteEncaixe._isExt() ? 0.1 : bn.r;
  },

  // Interseção das LINHAS DE NÍVEL de duas bordas no canto: cada borda no seu
  // nível local (0 = na linha da borda; depth = fundo do vão). Fecha QUALQUER
  // combinação de canto (dente×dente, dente×vão, vão×vão) — inclusive em
  // peças inclinadas, onde o fundo do vão cruzaria a borda vizinha.

  // Reconstrói o contorno dentado de uma peça: percorre os runs em ordem e
  // troca os runs de junta pelo caminho de dentes. Devolve {poly, bones, teeth}.

  // ── REBUILD (Fase 3 anti-pirataria): o cálculo (juntas, dentes, kerf,
  // nesting) roda no SERVIDOR. Aqui só disparamos com debounce (evita 1
  // request por tecla) e desenhamos o layout que volta. Zoom/pan/seleção
  // continuam locais (só redesenham o layout já recebido).
  _rebuild() {
    const s = CorteEncaixe.state;
    if (!s.paineis.length) return;
    if (CorteEncaixe._rebuildTimer) clearTimeout(CorteEncaixe._rebuildTimer);
    CorteEncaixe._rebuildTimer = setTimeout(() => { CorteEncaixe._computeServer(); }, 400);
  },

  async _computeServer() {
    const s = CorteEncaixe.state;
    if (!s.paineis.length) return;
    // Em modo sólido a espessura vem do parâmetro (o Ruby a gravava nas peças);
    // replica no cliente pra tabela/vistas mostrarem a espessura certa.
    if (s.solid) s.paineis.forEach(p => { p.esp = s.esp; });
    const input = {
      solid: s.solid,
      paineis: s.paineis,
      included: s.included,
      params: {
        modo: s.modo, kerf: s.kerf, fresa: s.fresa, comp: s.comp, dente: s.dente,
        folga: s.folga, espaco: s.espaco, dogbone: s.dogbone, esp: s.esp,
        chapa: s.chapa, cutArea: s.cutArea, margem: s.margem, allowRotate: s.allowRotate
      }
    };
    try {
      const r = await Bridge.call('corte_encaixe_compute', input);
      if (r && r.ok && r.layout) {
        s.joints = r.joints || [];
        s.oversized = r.oversized || [];
        s.layout = r.layout;
        CorteEncaixe._builtById = {};
        s.layout.sheets.forEach(sh => sh.parts.forEach(pc => { CorteEncaixe._builtById[pc.id] = pc; }));
        if (s.sheetIdx >= s.layout.sheets.length) s.sheetIdx = Math.max(0, s.layout.sheets.length - 1);
        CorteEncaixe._updateStats();
        CorteEncaixe._renderOversize();
        CorteEncaixe._updateSheetNav();
        CorteEncaixe._renderList();
        CorteEncaixe._scheduleDraw();
        CorteEncaixe._scheduleDrawIso();
        CorteEncaixe._syncCores();
      } else if (window.Toast) {
        Toast.error((r && r.error) || 'Erro ao calcular o plano de corte.');
      }
    } catch (e) {
      if (window.Toast) Toast.error('Sem conexão com o servidor ACMFacil: ' + (e && e.message ? e.message : e));
    }
  },

  // ── REBUILD LEGADO (cálculo local, inativo na Fase 3 — mantido p/ rollback) ─

  // Ponto local da peça → coords da chapa (aplica rotação 90° e posição).
  _placePt(pc, pt) {
    return pc.rot ? [pc.x + (pc.h - pt[1]), pc.y + pt[0]] : [pc.x + pt[0], pc.y + pt[1]];
  },
  // Footprint da peça na chapa (dims trocadas se girada).
  _footprint(pc) {
    return { fw: pc.rot ? pc.h : pc.w, fh: pc.rot ? pc.w : pc.h };
  },

  _activeSheet() {
    const s = CorteEncaixe.state;
    if (!s.layout || !s.layout.sheets.length) return null;
    return s.layout.sheets[Math.min(s.sheetIdx, s.layout.sheets.length - 1)];
  },
  sheetPrev() { const s = CorteEncaixe.state; if (s.sheetIdx > 0) { s.sheetIdx--; CorteEncaixe._resetView2D(); CorteEncaixe._updateSheetNav(); CorteEncaixe._scheduleDraw(); } },
  sheetNext() { const s = CorteEncaixe.state; if (s.layout && s.sheetIdx < s.layout.sheets.length - 1) { s.sheetIdx++; CorteEncaixe._resetView2D(); CorteEncaixe._updateSheetNav(); CorteEncaixe._scheduleDraw(); } },
  _updateSheetNav() {
    const s = CorteEncaixe.state;
    const n = (s.layout && s.layout.sheets.length) || 1;
    const i = Math.min(s.sheetIdx, n - 1) + 1;
    CorteEncaixe._setText('cej_sheet_label', CorteEncaixe._t('cej.sheet.label', { i, n }));
  },

  _renderOversize() {
    const el = document.getElementById('cej_oversize_alert');
    if (!el) return;
    const s = CorteEncaixe.state;
    if (!s.oversized.length) { el.hidden = true; el.textContent = ''; return; }
    const { usableW, usableH } = CorteEncaixe._usableArea();
    el.hidden = false;
    el.textContent = CorteEncaixe._t('cej.oversize.alert', {
      n: s.oversized.length, w: Math.round(usableW), h: Math.round(usableH),
      nums: s.oversized.join(', ')
    });
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  _updateStats() {
    const s = CorteEncaixe.state;
    const nJoints = Math.round(s.joints.length / 2) || s.joints.length; // cada junta tem 2 lados
    CorteEncaixe._setText('cej_stat_pecas', s.paineis.length);
    CorteEncaixe._setText('cej_stat_juntas', nJoints);
    CorteEncaixe._setText('cej_stat_dentes', s.layout ? s.layout.teeth : 0);
    if (s.layout) {
      CorteEncaixe._setText('cej_stat_chapas', s.layout.sheets.length);
      const m2 = s.layout.partsArea / 1e6;
      CorteEncaixe._setText('cej_stat_area', m2.toFixed(2) + ' m²');
    }
  },
  _setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; },

  // ── Lista de peças ────────────────────────────────────────────────────────
  _renderList() {
    const body = document.getElementById('cej_table_body');
    if (!body) return;
    const s = CorteEncaixe.state;
    body.innerHTML = '';
    s.paineis.forEach((p, i) => {
      const inc = s.included[p.id] !== false;
      const nJ = s.joints.filter(j => j.pieceId === p.id).length;
      const tr = document.createElement('tr');
      tr.className = (p.id === s.selectedId) ? 'is-selected' : '';
      tr.style.cursor = 'pointer';
      if (!inc) tr.style.opacity = '0.45';
      // checkbox incluir (só faz sentido no modo sólido — nas chapas reais
      // todas entram)
      const chk = s.solid
        ? `<td><input type="checkbox" class="cej__inc" data-id="${p.id}" ${inc ? 'checked' : ''}></td>`
        : '';
      const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle;background:${CorteEncaixe._colorCss(i + 1)}"></span>`;
      tr.innerHTML = chk + `<td>${dot}${i + 1}</td><td>${CorteEncaixe._esc(p.nome)}</td>` +
                     `<td>${p.esp} mm</td><td>${p.larg} mm</td><td>${p.comp} mm</td><td>${nJ}</td>`;
      tr.onclick = () => CorteEncaixe.select(p.id);
      const cb = tr.querySelector('.cej__inc');
      if (cb) {
        cb.onclick = e => e.stopPropagation();
        cb.onchange = () => {
          s.included[p.id] = cb.checked;
          CorteEncaixe._rebuild();
        };
      }
      body.appendChild(tr);
    });
    // cabeçalho: coluna do checkbox só no modo sólido
    const th = document.getElementById('cej_th_inc');
    if (th) th.hidden = !s.solid;
  },

  select(id) {
    const s = CorteEncaixe.state;
    if (!id || !s.byId[id]) return;
    s.selectedId = id;
    // foca a chapa que contém a peça
    if (s.layout) {
      for (let si = 0; si < s.layout.sheets.length; si++) {
        if (s.layout.sheets[si].parts.some(pp => pp.id === id)) {
          if (s.sheetIdx !== si) { s.sheetIdx = si; CorteEncaixe._resetView2D(); CorteEncaixe._updateSheetNav(); }
          break;
        }
      }
    }
    CorteEncaixe._renderList();
    CorteEncaixe._scheduleDraw();
    CorteEncaixe._scheduleDrawIso();
    const p = s.byId[id];
    if (p && p.pid != null) {
      Bridge.call('corte_encaixe_destacar', { pid: p.pid }).catch(() => {});
    }
  },

  _esc(str) { return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); },

  // ── Cores por peça (num 1-based → paleta) ─────────────────────────────────
  _colorRgb(num) { return CEJ_PALETTE[(num - 1) % CEJ_PALETTE.length]; },
  _colorCss(num, alpha) {
    const c = CorteEncaixe._colorRgb(num);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha == null ? 1 : alpha) + ')';
  },

  // ── Overlay COLORIDO no SketchUp (uma face por peça, na cor dela) ─────────
  toggleCores() {
    const s = CorteEncaixe.state;
    s.show3d = !s.show3d;
    const btn = document.getElementById('cej_btn_cores');
    if (btn) btn.classList.toggle('is-active', s.show3d);
    if (s.show3d) CorteEncaixe._syncCores();
    else CorteEncaixe.limparCores();
  },
  limparCores() {
    if (window.Bridge) Bridge.call('corte_encaixe_limpar_pecas', {}).catch(() => {});
  },
  _syncCores() {
    const s = CorteEncaixe.state;
    if (!s.show3d) return;
    if (CorteEncaixe._coresTimer) clearTimeout(CorteEncaixe._coresTimer);
    CorteEncaixe._coresTimer = setTimeout(() => {
      const pecas = [];
      s.paineis.forEach((p, i) => {
        if (s.included[p.id] === false || !p.o || !p.u || !p.v) return;
        const n = CorteEncaixe._normal(p) || [0, 0, 1];
        const off = 0.8;   // mm pra fora, evita z-fighting com a face original
        const poly = (p.outline || []).map(pt => {
          const w = CorteEncaixe._localToWorld(p, pt[0], pt[1]);
          return [w[0] + n[0] * off, w[1] + n[1] * off, w[2] + n[2] * off];
        });
        if (poly.length >= 3) pecas.push({ num: i + 1, rgb: CorteEncaixe._colorRgb(i + 1), poly });
      });
      if (window.Bridge) Bridge.call('corte_encaixe_marcar_pecas', { pecas }).catch(() => {});
    }, 150);
  },

  // ── Canvas: plano de corte numerado (zoom scroll + pan shift) ────────────
  _bindCanvas() {
    const cv = document.getElementById('cej_canvas');
    if (!cv || cv._cejBound) return;
    cv._cejBound = true;
    const s = CorteEncaixe.state;

    cv.addEventListener('mousedown', e => {
      if (e.shiftKey || e.button === 1) {
        s.dragging2D = true; s.lastX2D = e.clientX; s.lastY2D = e.clientY;
        cv.classList.add('is-panning'); e.preventDefault();
        return;
      }
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const rects = CorteEncaixe._partRects || [];
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i];
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          CorteEncaixe.select(r.id);
          return;
        }
      }
    });
    window.addEventListener('mousemove', e => {
      if (!s.dragging2D) return;
      s.panX2D += e.clientX - s.lastX2D;
      s.panY2D += e.clientY - s.lastY2D;
      s.lastX2D = e.clientX; s.lastY2D = e.clientY;
      CorteEncaixe._scheduleDraw();
    });
    window.addEventListener('mouseup', () => {
      if (s.dragging2D) { s.dragging2D = false; cv.classList.remove('is-panning'); }
    });
    cv.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      s.zoom2D = Math.max(0.3, Math.min(10, (s.zoom2D || 1) * f));
      CorteEncaixe._scheduleDraw();
    }, { passive: false });

    if (!CorteEncaixe._shiftBound) {
      CorteEncaixe._shiftBound = true;
      const setPan = on => { const c = document.getElementById('cej_canvas'); if (c) c.classList.toggle('is-shift-pan', on); };
      document.addEventListener('keydown', e => { if (e.key === 'Shift') setPan(true); });
      document.addEventListener('keyup',   e => { if (e.key === 'Shift') setPan(false); });
      window.addEventListener('blur', () => setPan(false));
    }
  },

  _scheduleDraw() {
    if (CorteEncaixe._raf) cancelAnimationFrame(CorteEncaixe._raf);
    CorteEncaixe._raf = requestAnimationFrame(() => CorteEncaixe._draw());
  },

  _draw() {
    const c = document.getElementById('cej_canvas');
    const s = CorteEncaixe.state;
    if (!c || !s.layout) return;
    const sheet = CorteEncaixe._activeSheet();
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800, cssH = c.clientHeight || 560;
    if (c.width !== Math.round(cssW * dpr)) c.width = Math.round(cssW * dpr);
    if (c.height !== Math.round(cssH * dpr)) c.height = Math.round(cssH * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const CW = s.chapa.larg, CH = s.chapa.comp;
    const pad = 28;
    const fit = Math.min((cssW - 2 * pad) / CW, (cssH - 2 * pad) / CH);
    const sc = fit * (s.zoom2D || 1);
    const ox = (cssW - CW * sc) / 2 + (s.panX2D || 0);
    const oy = (cssH - CH * sc) / 2 + (s.panY2D || 0);
    const X = mm => ox + mm * sc;
    const Y = mm => oy + mm * sc;

    // chapa (medida cheia)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X(0), Y(0), CW * sc, CH * sc);
    ctx.strokeStyle = 'rgba(40,50,70,0.9)'; ctx.lineWidth = 1.4;
    ctx.strokeRect(X(0), Y(0), CW * sc, CH * sc);

    // área de corte da máquina (se menor que a chapa): sombreia o inalcançável
    const { baseW, baseH } = CorteEncaixe._usableArea();
    if (baseW < CW - 0.5 || baseH < CH - 0.5) {
      ctx.save();
      ctx.fillStyle = 'rgba(120,130,150,0.10)';
      if (baseW < CW) ctx.fillRect(X(baseW), Y(0), (CW - baseW) * sc, CH * sc);
      if (baseH < CH) ctx.fillRect(X(0), Y(baseH), baseW * sc, (CH - baseH) * sc);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(37,99,235,0.85)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(X(0), Y(0), baseW * sc, baseH * sc);
      ctx.restore();
      ctx.fillStyle = 'rgba(37,99,235,0.95)';
      ctx.font = '10px "Geist Mono", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(CorteEncaixe._t('cej.canvas.cutarea', { eq: s.modo, w: Math.round(baseW), h: Math.round(baseH) }), X(2), Y(baseH) + 3);
    }

    // margem (guia tracejada)
    if (s.margem > 0) {
      ctx.save();
      ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(120,130,150,0.55)'; ctx.lineWidth = 0.8;
      ctx.strokeRect(X(s.margem), Y(s.margem), (baseW - 2 * s.margem) * sc, (baseH - 2 * s.margem) * sc);
      ctx.restore();
    }

    CorteEncaixe._partRects = [];
    if (!sheet) return;
    sheet.parts.forEach(pc => {
      const sel = (pc.id === s.selectedId);
      const P = pt => CorteEncaixe._placePt(pc, pt);
      // contorno dentado
      ctx.beginPath();
      pc.poly.forEach((pt, i) => {
        const q = P(pt);
        const px = X(q[0]), py = Y(q[1]);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = sel ? 'rgba(254,243,199,0.95)' : CorteEncaixe._colorCss(pc.num, 0.10);
      ctx.fill();
      ctx.strokeStyle = sel ? 'rgba(217,119,6,0.95)' : 'rgba(220,38,38,0.9)';
      ctx.lineWidth = sel ? 1.8 : 1.1;
      ctx.stroke();
      // furos
      (pc.holes || []).forEach(h => {
        if (!h || h.length < 3) return;
        ctx.beginPath();
        h.forEach((pt, i) => {
          const q = P(pt);
          const px = X(q[0]), py = Y(q[1]);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();
      });
      // dogbones
      ctx.strokeStyle = 'rgba(220,38,38,0.75)';
      ctx.lineWidth = 0.8;
      (pc.bones || []).forEach(bn => {
        const q = P([bn.cx, bn.cy]);
        ctx.beginPath();
        ctx.arc(X(q[0]), Y(q[1]), Math.max(1, bn.r * sc), 0, Math.PI * 2);
        ctx.stroke();
      });
      // caminho da fresa (compensação EXTERNA): tracejado por fora da peça
      if (CorteEncaixe._isExt()) {
        const tp = CorteEncaixe._cutPoly(pc);
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(220,38,38,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        tp.forEach((pt, i) => {
          const q = P(pt);
          i === 0 ? ctx.moveTo(X(q[0]), Y(q[1])) : ctx.lineTo(X(q[0]), Y(q[1]));
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      // número (disco preto + branco, como no plano de referência)
      const { fw, fh } = CorteEncaixe._footprint(pc);
      const ccx = X(pc.x + fw / 2), ccy = Y(pc.y + fh / 2);
      const rr = Math.max(9, Math.min(18, Math.min(fw, fh) * sc * 0.16));
      ctx.beginPath();
      ctx.arc(ccx, ccy, rr, 0, Math.PI * 2);
      ctx.fillStyle = CorteEncaixe._colorCss(pc.num, 0.92);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 ' + Math.round(rr * 1.05) + 'px "Geist", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(pc.num), ccx, ccy);
      // dimensões (abaixo do disco) — sempre larg×comp originais
      ctx.fillStyle = 'rgba(115,115,115,0.9)';
      ctx.font = '10px "Geist Mono", monospace';
      ctx.fillText(Math.round(pc.w) + '×' + Math.round(pc.h), ccx, ccy + rr + 10);
      // hit-test
      CorteEncaixe._partRects.push({ id: pc.id, x: X(pc.x), y: Y(pc.y), w: fw * sc, h: fh * sc });
    });
  },

  // ── VISTA ISOMÉTRICA: montagem 3D já com os dentes ───────────────────────
  // Cada peça incluída vira um polígono 3D (contorno DENTADO mapeado pro
  // mundo via frame o/u/v da face). Arraste = orbitar · scroll = zoom ·
  // shift+arrastar = pan · clique = selecionar peça.
  _bindIso() {
    const iso = document.getElementById('cej_iso');
    if (!iso || iso._cejBound) return;
    iso._cejBound = true;
    const s = CorteEncaixe.state;
    let dragging = false, panning = false, lx = 0, ly = 0, moved = false;
    iso.addEventListener('mousedown', e => {
      panning = (e.shiftKey || e.button === 1);
      dragging = true; moved = false; lx = e.clientX; ly = e.clientY;
      if (panning) { iso.classList.add('is-panning'); e.preventDefault(); }
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (panning) { s.isoPanX += dx; s.isoPanY += dy; }
      else { s.isoRy += dx * 0.01; s.isoRx += dy * 0.01; }
      CorteEncaixe._scheduleDrawIso();
    });
    window.addEventListener('mouseup', e => {
      if (dragging && !moved && !panning) CorteEncaixe._isoClick(e);
      dragging = false; panning = false; iso.classList.remove('is-panning');
    });
    iso.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    iso.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      s.isoZoom = Math.max(0.2, Math.min(12, (s.isoZoom || 1) * f));
      CorteEncaixe._scheduleDrawIso();
    }, { passive: false });
  },

  _scheduleDrawIso() {
    if (CorteEncaixe._rafIso) cancelAnimationFrame(CorteEncaixe._rafIso);
    CorteEncaixe._rafIso = requestAnimationFrame(() => CorteEncaixe._drawIso());
  },

  // Coleta os polígonos 3D (mundo, mm) das peças incluídas — contorno dentado.
  _isoPolys() {
    const s = CorteEncaixe.state;
    const polys = [];
    s.paineis.forEach((p, i) => {
      if (s.included[p.id] === false || !p.o || !p.u || !p.v) return;
      const pc = CorteEncaixe._builtById && CorteEncaixe._builtById[p.id];
      if (!pc || !pc.poly || pc.poly.length < 3) return;
      const pts = pc.poly.map(pt => CorteEncaixe._localToWorld(p, pt[0], pt[1]));
      if (pts.some(w => !w)) return;
      polys.push({ id: p.id, num: i + 1, pts });
    });
    return polys;
  },

  _drawIso() {
    const c = document.getElementById('cej_iso');
    const s = CorteEncaixe.state;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800, cssH = c.clientHeight || 320;
    if (c.width !== Math.round(cssW * dpr)) c.width = Math.round(cssW * dpr);
    if (c.height !== Math.round(cssH * dpr)) c.height = Math.round(cssH * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const polys = CorteEncaixe._isoPolys();
    if (!polys.length) return;

    // centro do conjunto
    let cx = 0, cy = 0, cz = 0, n = 0;
    polys.forEach(pl => pl.pts.forEach(w => { cx += w[0]; cy += w[1]; cz += w[2]; n++; }));
    cx /= n; cy /= n; cz /= n;

    const cosY = Math.cos(s.isoRy), sinY = Math.sin(s.isoRy);
    const cosX = Math.cos(s.isoRx), sinX = Math.sin(s.isoRx);
    const proj = w => {
      const x = w[0] - cx, y = w[1] - cy, z = w[2] - cz;
      const x1 = x * cosY - y * sinY;
      const y1 = x * sinY + y * cosY;
      const y2 = y1 * cosX - z * sinX;
      const z2 = y1 * sinX + z * cosX;
      return { sx: x1, sy: -z2, d: y2 };
    };

    // escala pra caber
    let mnx = 1e12, mny = 1e12, mxx = -1e12, mxy = -1e12;
    const ppolys = polys.map(pl => {
      const pp = pl.pts.map(proj);
      pp.forEach(q => {
        if (q.sx < mnx) mnx = q.sx; if (q.sx > mxx) mxx = q.sx;
        if (q.sy < mny) mny = q.sy; if (q.sy > mxy) mxy = q.sy;
      });
      return { id: pl.id, num: pl.num, pp };
    });
    const pad = 30;
    const fit = Math.min((cssW - 2 * pad) / Math.max(1, mxx - mnx), (cssH - 2 * pad) / Math.max(1, mxy - mny));
    const sc = fit * (s.isoZoom || 1);
    const ox = cssW / 2 - ((mnx + mxx) / 2) * sc + (s.isoPanX || 0);
    const oy = cssH / 2 - ((mny + mxy) / 2) * sc + (s.isoPanY || 0);

    // painter: desenha do fundo pra frente
    ppolys.sort((a, b) => {
      const da = a.pp.reduce((t2, q) => t2 + q.d, 0) / a.pp.length;
      const db = b.pp.reduce((t2, q) => t2 + q.d, 0) / b.pp.length;
      return db - da;
    });

    CorteEncaixe._isoHit = [];
    ppolys.forEach(pl => {
      const sel = (pl.id === s.selectedId);
      ctx.beginPath();
      const scr = pl.pp.map(q => [ox + q.sx * sc, oy + q.sy * sc]);
      scr.forEach((q, i) => { i === 0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); });
      ctx.closePath();
      ctx.fillStyle = sel ? 'rgba(254,243,199,0.92)' : CorteEncaixe._colorCss(pl.num, 0.30);
      ctx.fill();
      ctx.strokeStyle = sel ? 'rgba(217,119,6,0.95)' : CorteEncaixe._colorCss(pl.num, 0.9);
      ctx.lineWidth = sel ? 1.6 : 1;
      ctx.stroke();
      CorteEncaixe._isoHit.push({ id: pl.id, scr });
    });
  },

  // Clique na vista iso: peça cujo polígono projetado contém o ponto
  // (varre de cima — última desenhada — pra baixo).
  _isoClick(e) {
    const c = document.getElementById('cej_iso');
    const hits = CorteEncaixe._isoHit || [];
    if (!c || !hits.length) return;
    const rect = c.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (mx < 0 || my < 0 || mx > rect.width || my > rect.height) return;
    for (let i = hits.length - 1; i >= 0; i--) {
      if (CorteEncaixe._ptInPoly(mx, my, hits[i].scr)) {
        CorteEncaixe.select(hits[i].id);
        return;
      }
    }
  },
  _ptInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  },

  // ── MONTAGEM: cores por peça + setas + legenda ────────────────────────────
  // Mapa id → { num, rgb } (mesma paleta do preview/tabela).
  _colorMap() {
    const map = {};
    const L = CorteEncaixe.state.layout;
    if (L) L.sheets.forEach(sh => sh.parts.forEach(pc => {
      map[pc.id] = { num: pc.num, rgb: CorteEncaixe._colorRgb(pc.num) };
    }));
    return map;
  },

  // Seta de encaixe de uma junta (coords LOCAIS da peça): aponta pra FORA, na
  // borda onde a peça parceira encaixa. tail (dentro) → head (na borda) + 2
  // farpas; label = posição do número do parceiro.
  _arrowLocal(pc, j) {
    const poly = pc.poly || [];
    let cx = 0, cy = 0;
    poly.forEach(p => { cx += p[0]; cy += p[1]; });
    if (poly.length) { cx /= poly.length; cy /= poly.length; }
    let ox = j.mx - cx, oy = j.my - cy;
    const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
    const head = [j.mx - ox * 2, j.my - oy * 2];
    const tail = [j.mx - ox * 16, j.my - oy * 16];
    const px = -oy, py = ox, b = 3.5;
    const barb1 = [head[0] - ox * b + px * b, head[1] - oy * b + py * b];
    const barb2 = [head[0] - ox * b - px * b, head[1] - oy * b - py * b];
    const label = [j.mx - ox * 23, j.my - oy * 23];
    return { head, tail, barb1, barb2, label };
  },

  // Remove acentos (DXF R12 é ASCII — evita "TrÃ¡s" no visualizador).
  _asciiFold(str) {
    const m = { 'á':'a','à':'a','â':'a','ã':'a','ä':'a','é':'e','è':'e','ê':'e','í':'i','ì':'i','î':'i',
                'ó':'o','ò':'o','ô':'o','õ':'o','ö':'o','ú':'u','ù':'u','û':'u','ç':'c','ñ':'n',
                'Á':'A','À':'A','Â':'A','Ã':'A','É':'E','Ê':'E','Í':'I','Ó':'O','Ô':'O','Õ':'O','Ú':'U','Ç':'C','Ñ':'N' };
    return String(str).replace(/[^\x00-\x7F]/g, ch => m[ch] || '?');
  },

  // Cor DXF (ACI) por número de peça — cicla numa lista que casa com a paleta.
  _aciFor(num) {
    const aci = [5, 3, 1, 30, 6, 4, 2, 40, 150, 10, 250, 190];
    return aci[(num - 1) % aci.length];
  },

  // ── EXPORTAR SVG ─────────────────────────────────────────────────────────
  // Chapas empilhadas verticalmente (gap 40mm). Camadas: "guia" cinza (contorno
  // das chapas, apagar antes de cortar) · "corte" vermelho #ff0000 0.1mm ·
  // "gravacao" azul (números).
  _buildSVG() {
    const s = CorteEncaixe.state;
    const L = s.layout;
    const fm = v => (Math.round(v * 1000) / 1000);
    const CW = s.chapa.larg, CH = s.chapa.comp, GAP = 40;
    const cmap = CorteEncaixe._colorMap();
    const rgb = id => { const c = cmap[id]; return c ? 'rgb(' + c.rgb.join(',') + ')' : '#0000ff'; };
    const sheetsH = L.sheets.length * CH + (L.sheets.length - 1) * GAP;
    let guide = '', cut = '', annot = '';
    L.sheets.forEach((sheet, si) => {
      const offY = si * (CH + GAP);
      guide += '    <rect x="0" y="' + fm(offY) + '" width="' + fm(CW) + '" height="' + fm(CH) + '"/>\n';
      sheet.parts.forEach(pc => {
        const P = pt => CorteEncaixe._placePt(pc, pt);
        const path = pts => 'M ' + pts.map(pt => { const q = P(pt); return fm(q[0]) + ' ' + fm(q[1] + offY); }).join(' L ') + ' Z';
        cut += '    <path d="' + path(CorteEncaixe._cutPoly(pc)) + '"/>\n';
        (pc.holes || []).forEach(h => { if (h && h.length >= 3) cut += '    <path d="' + path(CorteEncaixe._cutHole(h)) + '"/>\n'; });
        (pc.bones || []).forEach(bn => {
          const q = P([bn.cx, bn.cy]);
          cut += '    <circle cx="' + fm(q[0]) + '" cy="' + fm(q[1] + offY) + '" r="' + fm(CorteEncaixe._cutBoneR(bn)) + '"/>\n';
        });
        const myCol = rgb(pc.id);
        if (s.numeros) {
          const { fw, fh } = CorteEncaixe._footprint(pc);
          const fs = Math.max(6, Math.min(20, Math.min(pc.w, pc.h) * 0.18));
          // quadrado colorido (canto sup-esq) + número na cor da peça
          const sw = Math.max(6, Math.min(14, Math.min(pc.w, pc.h) * 0.11));
          annot += '    <rect x="' + fm(pc.x + 4) + '" y="' + fm(pc.y + 4 + offY) + '" width="' + fm(sw) + '" height="' + fm(sw) + '" fill="' + myCol + '"/>\n';
          annot += '    <text x="' + fm(pc.x + fw / 2) + '" y="' + fm(pc.y + fh / 2 + offY) +
                   '" font-size="' + fm(fs) + '" text-anchor="middle" dominant-baseline="middle" fill="' + myCol + '" font-weight="bold">' + pc.num + '</text>\n';
        }
        if (s.montagem) {
          s.joints.forEach(j => {
            if (j.pieceId !== pc.id || j.mx == null) return;
            const pcol = cmap[j.partnerId]; if (!pcol) return;
            const col = 'rgb(' + pcol.rgb.join(',') + ')';
            const ar = CorteEncaixe._arrowLocal(pc, j);
            const T = p => { const q = P(p); return fm(q[0]) + ' ' + fm(q[1] + offY); };
            annot += '    <path d="M ' + T(ar.tail) + ' L ' + T(ar.head) + '" stroke="' + col + '" stroke-width="0.6" fill="none"/>\n';
            annot += '    <path d="M ' + T(ar.barb1) + ' L ' + T(ar.head) + ' L ' + T(ar.barb2) + '" stroke="' + col + '" stroke-width="0.6" fill="none"/>\n';
            const q = P(ar.label);
            annot += '    <text x="' + fm(q[0]) + '" y="' + fm(q[1] + offY) + '" font-size="5.5" text-anchor="middle" dominant-baseline="middle" fill="' + col + '" font-weight="bold">' + pcol.num + '</text>\n';
          });
        }
      });
    });
    // LEGENDA (abaixo das chapas): quadrado colorido + "N — Nome"
    let legend = '', legendH = 0;
    if (s.montagem || s.numeros) {
      const items = [];
      L.sheets.forEach(sh => sh.parts.forEach(pc => items.push(pc)));
      items.sort((a, b) => a.num - b.num);
      const rowH = 14, sw = 10, yTitle = sheetsH + 22, y0 = sheetsH + 34;
      legend += '    <text x="0" y="' + fm(yTitle) + '" font-size="11" fill="#000" font-weight="bold">' + CorteEncaixe._esc(CorteEncaixe._t('cej.legend.title')) + '</text>\n';
      items.forEach((pc, i) => {
        const y = y0 + i * rowH;
        legend += '    <rect x="0" y="' + fm(y) + '" width="' + sw + '" height="' + sw + '" fill="' + rgb(pc.id) + '"/>\n';
        legend += '    <text x="' + (sw + 6) + '" y="' + fm(y + sw - 1) + '" font-size="9" fill="#000">' + pc.num + ' — ' + CorteEncaixe._esc(pc.nome) + '</text>\n';
      });
      legendH = 34 + items.length * rowH + 6;
    }
    const totalW = CW, totalH = sheetsH + legendH;
    let svg = '<?xml version="1.0" encoding="UTF-8"?>\n';
    svg += '<!-- ACMFacil Corte & Encaixe — ' + s.modo + (s.modo === 'laser' ? (' kerf ' + s.kerf) : (' fresa ' + s.fresa)) +
           'mm, dente ' + s.dente + 'mm, folga ' + s.folga + 'mm, chapa ' + CW + 'x' + CH + 'mm, ' + L.sheets.length + ' chapa(s) -->\n';
    svg += '<svg xmlns="http://www.w3.org/2000/svg" width="' + fm(totalW) + 'mm" height="' + fm(totalH) +
           'mm" viewBox="0 0 ' + fm(totalW) + ' ' + fm(totalH) + '">\n';
    svg += '  <g id="guia" fill="none" stroke="#999999" stroke-width="0.1" stroke-dasharray="4 2">\n' + guide + '  </g>\n';
    svg += '  <g id="corte" fill="none" stroke="#ff0000" stroke-width="0.1">\n' + cut + '  </g>\n';
    if (annot || legend) {
      svg += '  <g id="montagem" font-family="sans-serif">\n' + annot + legend + '  </g>\n';
    }
    svg += '</svg>\n';
    return svg;
  },

  // ── EXPORTAR DXF (R12/ASCII, mm, Y pra cima) ─────────────────────────────
  // Mesmas chapas empilhadas do SVG. Camadas: GUIA (contorno das chapas),
  // CORTE (contornos + furos + dogbones), GRAVACAO (números, TEXT centrado).
  _buildDXF() {
    const s = CorteEncaixe.state;
    const L = s.layout;
    const fm = v => (Math.round(v * 1000) / 1000);
    const CW = s.chapa.larg, CH = s.chapa.comp, GAP = 40;
    const cmap = CorteEncaixe._colorMap();
    const sheetsH = L.sheets.length * CH + (L.sheets.length - 1) * GAP;
    const rows = [];
    const push = (...a) => a.forEach(x => rows.push(x));
    // itens da legenda (ordenados por número) — definem a altura total
    const items = [];
    L.sheets.forEach(sh => sh.parts.forEach(pc => items.push(pc)));
    items.sort((a, b) => a.num - b.num);
    const rowH = 14, legendH = (s.montagem || s.numeros) ? (34 + items.length * rowH + 6) : 0;
    const totalH = sheetsH + legendH;
    const Y = y => fm(totalH - y);   // DXF: eixo Y pra cima
    const poly = (pts, layer, offY, aci) => {
      push(0, 'POLYLINE', 8, layer); if (aci) push(62, aci); push(66, 1, 70, 1);
      pts.forEach(q => { push(0, 'VERTEX', 8, layer); if (aci) push(62, aci); push(10, fm(q[0]), 20, Y(q[1] + offY), 30, 0); });
      push(0, 'SEQEND');
    };
    const line = (a, b, layer, offY, aci) => {
      push(0, 'LINE', 8, layer); if (aci) push(62, aci);
      push(10, fm(a[0]), 20, Y(a[1] + offY), 30, 0, 11, fm(b[0]), 21, Y(b[1] + offY), 31, 0);
    };
    const text = (p, str, fs, layer, offY, aci) => {
      const tx = fm(p[0]), ty = Y(p[1] + offY);
      push(0, 'TEXT', 8, layer); if (aci) push(62, aci);
      push(10, tx, 20, ty, 40, fm(fs), 1, CorteEncaixe._asciiFold(str), 72, 1, 73, 2, 11, tx, 21, ty);
    };
    push(0, 'SECTION', 2, 'ENTITIES');
    L.sheets.forEach((sheet, si) => {
      const offY = si * (CH + GAP);
      poly([[0, 0], [CW, 0], [CW, CH], [0, CH]], 'GUIA', offY);
      sheet.parts.forEach(pc => {
        const P = pt => CorteEncaixe._placePt(pc, pt);
        poly(CorteEncaixe._cutPoly(pc).map(P), 'CORTE', offY);
        (pc.holes || []).forEach(h => { if (h && h.length >= 3) poly(CorteEncaixe._cutHole(h).map(P), 'CORTE', offY); });
        (pc.bones || []).forEach(bn => {
          const q = P([bn.cx, bn.cy]);
          push(0, 'CIRCLE', 8, 'CORTE', 10, fm(q[0]), 20, Y(q[1] + offY), 40, fm(CorteEncaixe._cutBoneR(bn)));
        });
        const myAci = CorteEncaixe._aciFor(pc.num);
        if (s.numeros) {
          const { fw, fh } = CorteEncaixe._footprint(pc);
          const fs = Math.max(6, Math.min(20, Math.min(pc.w, pc.h) * 0.18));
          const sw = Math.max(6, Math.min(14, Math.min(pc.w, pc.h) * 0.11));
          poly([[pc.x + 4, pc.y + 4], [pc.x + 4 + sw, pc.y + 4], [pc.x + 4 + sw, pc.y + 4 + sw], [pc.x + 4, pc.y + 4 + sw]], 'MONTAGEM', offY, myAci);
          text([pc.x + fw / 2, pc.y + fh / 2], String(pc.num), fs, 'MONTAGEM', offY, myAci);
        }
        if (s.montagem) {
          s.joints.forEach(j => {
            if (j.pieceId !== pc.id || j.mx == null) return;
            const pcol = cmap[j.partnerId]; if (!pcol) return;
            const aci = CorteEncaixe._aciFor(pcol.num);
            const ar = CorteEncaixe._arrowLocal(pc, j);
            line(P(ar.tail), P(ar.head), 'MONTAGEM', offY, aci);
            line(P(ar.barb1), P(ar.head), 'MONTAGEM', offY, aci);
            line(P(ar.barb2), P(ar.head), 'MONTAGEM', offY, aci);
            text(P(ar.label), String(pcol.num), 5.5, 'MONTAGEM', offY, aci);
          });
        }
      });
    });
    // LEGENDA (abaixo das chapas)
    if (legendH) {
      text([0, sheetsH + 22], CorteEncaixe._t('cej.legend.title'), 11, 'MONTAGEM', 0);
      const sw = 10, y0 = sheetsH + 34;
      items.forEach((pc, i) => {
        const y = y0 + i * rowH;
        const aci = CorteEncaixe._aciFor(pc.num);
        poly([[0, y], [sw, y], [sw, y + sw], [0, y + sw]], 'MONTAGEM', 0, aci);
        text([sw + 6, y + sw - 1], pc.num + ' - ' + pc.nome, 9, 'MONTAGEM', 0);
      });
    }
    push(0, 'ENDSEC', 0, 'EOF');
    return rows.join('\n') + '\n';
  },

  async exportar(fmt) {
    const s = CorteEncaixe.state;
    if (!s.layout || !s.layout.sheets.length) {
      if (window.Toast) Toast.warning(CorteEncaixe._t('cej.toast.capture_first'));
      return;
    }
    const ext = (fmt === 'dxf') ? 'dxf' : 'svg';
    const btn = document.getElementById(ext === 'dxf' ? 'cej_btn_dxf' : 'cej_btn_svg');
    if (btn) btn.disabled = true;
    try {
      const content = (ext === 'dxf') ? CorteEncaixe._buildDXF() : CorteEncaixe._buildSVG();
      const b64 = btoa(unescape(encodeURIComponent(content)));
      const r = await Bridge.call('corte_encaixe_exportar_svg', { name: 'corte_encaixe', content: b64, ext });
      if (r && r.ok) {
        if (window.Toast) Toast.success(CorteEncaixe._t('cej.svg.ok', { path: r.path || '' }));
      } else if (r && r.code === 'corte_encaixe.export_cancelado') {
        /* usuário cancelou — silencioso */
      } else {
        if (window.Toast) Toast.error(CorteEncaixe._t('cej.svg.err') + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      if (window.Toast) Toast.error(CorteEncaixe._t('cej.svg.err') + ': ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }
};
