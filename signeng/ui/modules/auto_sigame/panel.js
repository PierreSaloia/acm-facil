/* ══════════════════════════════════════════════════════════════════════════
   AUTO SIGAM-ME — painel (Auto-ACM + follow-me)
   Controles e cores clonados do Auto-ACM. Ativa a ferramenta de desenho.
   ══════════════════════════════════════════════════════════════════════════ */

window.AutoSigame = {

  state: {
    cores: {},              // { cat: [{nome, rgb}] }
    ordemCat: [],
    activeCat: null,
    selectedColor: null,
    selectedColorRgb: [187, 187, 187],
    juntaColors: [],        // [{nome, rgb}]
    corJunta: 'Preto',
    coresLoaded: false,
    // Dados do que foi gerado (vêm do Ruby após desenhar+Enter) p/ os previews.
    gen: null,  // { points:[[x,y]mm], prof, alt, chapa, faces:{}, rgb:[r,g,b] }
    view2d: { ox: 0, oy: 0, scale: 1, fitted: false },
    view3d: { rotZ: -0.7, rotX: 1.05, scale: 1, ox: 0, oy: 0, fitted: false,
              dragging: false, lastX: 0, lastY: 0 }
  },

  _JUNTA_CORES_KEY: 'signeng_asg_junta_cores_custom',

  init() {
    AutoSigame.loadCores();
    AutoSigame._wire();
    AutoSigame._syncFaceChecks();
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
  },

  _wire() {
    // Pills: orientação / junta tipo / alinhamento emenda
    document.querySelectorAll('.asg__pill[data-val]').forEach(p => {
      p.addEventListener('click', () => AutoSigame._setPill('data-val', p.dataset.val));
    });
    document.querySelectorAll('.asg__pill[data-jt]').forEach(p => {
      p.addEventListener('click', () => {
        AutoSigame._setPill('data-jt', p.dataset.jt);
        const wrap = document.getElementById('asg_junta_mm_wrap');
        if (wrap) wrap.hidden = (p.dataset.jt !== 'dilatacao');
      });
    });
    document.querySelectorAll('.asg__pill[data-align]').forEach(p => {
      p.addEventListener('click', () => AutoSigame._setPill('data-align', p.dataset.align));
    });

    // Fita toggle
    const fita = document.getElementById('asg_fita_inc');
    if (fita) fita.addEventListener('change', () => {
      const sec = document.getElementById('asg_fita_section');
      if (sec) sec.classList.toggle('is-disabled', !fita.checked);
    });

    // Chapa preset
    const preset = document.getElementById('asg_chapa_preset');
    if (preset) preset.addEventListener('change', () => {
      const wrap = document.getElementById('asg_chapa_custom_wrap');
      if (wrap) wrap.hidden = (preset.value !== 'custom');
    });

    // Face-checks: sincroniza estado visual is-checked
    document.querySelectorAll('.asg__face-check input').forEach(inp => {
      inp.addEventListener('change', () => AutoSigame._syncFaceChecks());
    });

    // Botão desenhar
    const btn = document.getElementById('asg_btn_desenhar');
    if (btn) btn.addEventListener('click', () => AutoSigame.desenhar());

    // Preview: ajustar 2D / iso
    const fit2 = document.getElementById('asg_path_fit');
    if (fit2) fit2.addEventListener('click', () => { AutoSigame.state.view2d.fitted = false; AutoSigame._draw2D(); });
    const fit3 = document.getElementById('asg_iso_fit');
    if (fit3) fit3.addEventListener('click', () => { AutoSigame.state.view3d.fitted = false; AutoSigame._draw3D(); });

    // Zoom na planta 2D
    const cv2 = document.getElementById('asg_canvas2d');
    if (cv2) cv2.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = AutoSigame.state.view2d, r = cv2.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const wx = (mx - v.ox) / v.scale, wy = (v.oy - my) / v.scale;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      v.scale = Math.max(0.0005, Math.min(50, v.scale * f));
      v.ox = mx - wx * v.scale; v.oy = my + wy * v.scale;
      AutoSigame._draw2D();
    }, { passive: false });

    // Zoom + órbita no isométrico
    const cv3 = document.getElementById('asg_canvas3d');
    if (cv3) {
      cv3.addEventListener('wheel', (e) => {
        e.preventDefault();
        const v = AutoSigame.state.view3d;
        v.scale = Math.max(0.0005, Math.min(50, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        AutoSigame._draw3D();
      }, { passive: false });
      cv3.addEventListener('mousedown', (e) => {
        const v = AutoSigame.state.view3d; v.dragging = true; v.lastX = e.clientX; v.lastY = e.clientY;
      });
      window.addEventListener('mousemove', (e) => {
        const v = AutoSigame.state.view3d; if (!v.dragging) return;
        v.rotZ += (e.clientX - v.lastX) * 0.01;
        v.rotX += (e.clientY - v.lastY) * 0.01;
        v.rotX = Math.max(0.05, Math.min(Math.PI / 2, v.rotX));
        v.lastX = e.clientX; v.lastY = e.clientY;
        AutoSigame._draw3D();
      });
      window.addEventListener('mouseup', () => { AutoSigame.state.view3d.dragging = false; });
    }
  },

  _setPill(attr, val) {
    document.querySelectorAll(`.asg__pill[${attr}]`).forEach(p => {
      p.classList.toggle('is-active', p.getAttribute(attr) === val);
    });
  },

  _getPill(attr, fallback) {
    const el = document.querySelector(`.asg__pill[${attr}].is-active`);
    return el ? el.getAttribute(attr) : fallback;
  },

  _syncFaceChecks() {
    document.querySelectorAll('.asg__face-check').forEach(label => {
      const inp = label.querySelector('input');
      label.classList.toggle('is-checked', !!(inp && inp.checked));
    });
  },

  // ════════════════════════════════════════════════════════════════════════
  // PREVIEW — planta 2D + isométrico (alimentados pela geração no SketchUp)
  // ════════════════════════════════════════════════════════════════════════
  // Chamado pelo Ruby após desenhar o caminho + Enter + gerar.
  onGerado(data) {
    try {
      const d = (typeof data === 'string') ? JSON.parse(data) : data;
      if (!d || !d.points || d.points.length < 2) return;
      if (!d.rgb) d.rgb = AutoSigame.state.selectedColorRgb || [187, 187, 187];
      AutoSigame.state.gen = d;
      const sec = document.getElementById('asg_preview_section');
      if (sec) sec.hidden = false;
      // Plano de corte: só aparece quando a geração trouxe o quantitativo
      const ps = document.getElementById('asg_plano_section');
      if (ps) ps.hidden = !(d.quant && d.quant.chapas && d.quant.chapas.length);
      AutoSigame.state.view2d.fitted = false;
      AutoSigame.state.view3d.fitted = false;
      requestAnimationFrame(() => { AutoSigame._draw2D(); AutoSigame._draw3D(); });
    } catch (e) { console.error('[AutoSigame] onGerado erro:', e); }
  },

  // Pontos da faixa (back + front) p/ enquadrar a planta 2D
  _bandPts2d() {
    const g = AutoSigame.state.gen; if (!g) return [];
    const pts = g.points, prof = g.prof || 0, all = [];
    for (let i = 0; i < pts.length; i++) {
      all.push(pts[i]);
      if (i < pts.length - 1) {
        const f = AutoSigame._fwd2d(pts[i], pts[i + 1]);
        all.push([pts[i][0] + f[0] * prof, pts[i][1] + f[1] * prof]);
        all.push([pts[i + 1][0] + f[0] * prof, pts[i + 1][1] + f[1] * prof]);
      }
    }
    return all;
  },

  // "Forward" 2D (perpendicular ao trecho, lado da frente) = (dy,-dx) normalizado
  _fwd2d(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [dy / L, -dx / L];
  },

  _fit2d(cv) {
    const all = AutoSigame._bandPts2d(); if (!all.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    all.forEach(p => { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; });
    const w = (maxX - minX) || 1, h = (maxY - minY) || 1, pad = 30;
    const v = AutoSigame.state.view2d;
    v.scale = Math.min((cv.width - pad * 2) / w, (cv.height - pad * 2) / h);
    v.ox = cv.width / 2 - ((minX + maxX) / 2) * v.scale;
    v.oy = cv.height / 2 + ((minY + maxY) / 2) * v.scale;
    v.fitted = true;
  },

  // emendas por trecho (igual à geração: divisão central em partes ≤ chapa)
  _segEmendas(L, chapa) {
    if (L <= chapa + 1) return [];
    const n = Math.ceil(L / chapa);
    const step = L / n;
    const out = [];
    for (let k = 1; k < n; k++) out.push(k * step);
    return out;
  },

  _draw2D() {
    const cv = document.getElementById('asg_canvas2d'); if (!cv) return;
    const g = AutoSigame.state.gen; if (!g || !g.points || g.points.length < 2) return;
    const rect = cv.getBoundingClientRect();
    const W = Math.max(100, Math.round(rect.width)), H = Math.max(100, Math.round(rect.height));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; AutoSigame.state.view2d.fitted = false; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
    if (!AutoSigame.state.view2d.fitted) AutoSigame._fit2d(cv);
    const v = AutoSigame.state.view2d, T = (x, y) => [v.ox + x * v.scale, v.oy - y * v.scale];
    const pts = g.points, prof = g.prof || 0, chapa = g.chapa || 5000, rgb = g.rgb || [187, 187, 187];

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], f = AutoSigame._fwd2d(a, b);
      const A = T(a[0], a[1]), B = T(b[0], b[1]);
      const B2 = T(b[0] + f[0] * prof, b[1] + f[1] * prof), A2 = T(a[0] + f[0] * prof, a[1] + f[1] * prof);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B2[0], B2[1]); ctx.lineTo(A2[0], A2[1]); ctx.closePath();
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)];
      AutoSigame._segEmendas(L, chapa).forEach(t => {
        const p0 = [a[0] + dir[0] * t, a[1] + dir[1] * t], p1 = [p0[0] + f[0] * prof, p0[1] + f[1] * prof];
        const P0 = T(p0[0], p0[1]), P1 = T(p1[0], p1[1]);
        ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]);
        ctx.strokeStyle = 'rgba(0,210,210,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
      });
    }
    ctx.beginPath();
    pts.forEach((p, i) => { const P = T(p[0], p[1]); i === 0 ? ctx.moveTo(P[0], P[1]) : ctx.lineTo(P[0], P[1]); });
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
  },

  // ── ISOMÉTRICO 3D ──
  _proj3d(p) {
    const v = AutoSigame.state.view3d;
    const cz = Math.cos(v.rotZ), sz = Math.sin(v.rotZ);
    const x1 = p[0] * cz - p[1] * sz;
    const y1 = p[0] * sz + p[1] * cz;
    const z1 = p[2];
    const cx = Math.cos(v.rotX), sx = Math.sin(v.rotX);
    return [x1, y1 * sx + z1 * cx, y1 * cx - z1 * sx];  // [telaX, telaY, profundidade]
  },

  _bandFaces3d() {
    const g = AutoSigame.state.gen; if (!g) return [];
    const pts = g.points, prof = g.prof || 0, alt = g.alt || 0, fa = g.faces || {};
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], f = AutoSigame._fwd2d(a, b);
      const bb0 = [a[0], a[1], 0], bb1 = [b[0], b[1], 0];
      const fb0 = [a[0] + f[0] * prof, a[1] + f[1] * prof, 0], fb1 = [b[0] + f[0] * prof, b[1] + f[1] * prof, 0];
      const bt0 = [bb0[0], bb0[1], alt], bt1 = [bb1[0], bb1[1], alt];
      const ft0 = [fb0[0], fb0[1], alt], ft1 = [fb1[0], fb1[1], alt];
      if (fa.frontal  !== false) out.push({ p: [fb0, fb1, ft1, ft0], s: 0.95 });
      if (fa.topo     !== false) out.push({ p: [bt0, bt1, ft1, ft0], s: 1.0 });
      if (fa.base     !== false) out.push({ p: [bb0, bb1, fb1, fb0], s: 0.7 });
      if (fa.traseira === true)  out.push({ p: [bb0, bb1, bt1, bt0], s: 0.8 });
    }
    const n = pts.length;
    if (n >= 2 && fa.esq === true) {
      const f0 = AutoSigame._fwd2d(pts[0], pts[1]), o = pts[0];
      out.push({ p: [[o[0], o[1], 0], [o[0] + f0[0] * prof, o[1] + f0[1] * prof, 0], [o[0] + f0[0] * prof, o[1] + f0[1] * prof, alt], [o[0], o[1], alt]], s: 0.6 });
    }
    if (n >= 2 && fa.dir === true) {
      const fl = AutoSigame._fwd2d(pts[n - 2], pts[n - 1]), o = pts[n - 1];
      out.push({ p: [[o[0], o[1], 0], [o[0] + fl[0] * prof, o[1] + fl[1] * prof, 0], [o[0] + fl[0] * prof, o[1] + fl[1] * prof, alt], [o[0], o[1], alt]], s: 0.6 });
    }
    return out;
  },

  _fit3d(cv) {
    const faces = AutoSigame._bandFaces3d(); if (!faces.length) return;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    faces.forEach(fc => fc.p.forEach(p => { const q = AutoSigame._proj3d(p); if (q[0] < a) a = q[0]; if (q[0] > b) b = q[0]; if (q[1] < c) c = q[1]; if (q[1] > d) d = q[1]; }));
    const w = (b - a) || 1, h = (d - c) || 1, pad = 30;
    const v = AutoSigame.state.view3d;
    v.scale = Math.min((cv.width - pad * 2) / w, (cv.height - pad * 2) / h);
    v.ox = cv.width / 2 - ((a + b) / 2) * v.scale;
    v.oy = cv.height / 2 + ((c + d) / 2) * v.scale;
    v.fitted = true;
  },

  _draw3D() {
    const cv = document.getElementById('asg_canvas3d'); if (!cv) return;
    const g = AutoSigame.state.gen; if (!g || !g.points || g.points.length < 2) return;
    const rect = cv.getBoundingClientRect();
    const W = Math.max(100, Math.round(rect.width)), H = Math.max(100, Math.round(rect.height));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; AutoSigame.state.view3d.fitted = false; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
    if (!AutoSigame.state.view3d.fitted) AutoSigame._fit3d(cv);
    const v = AutoSigame.state.view3d, T = (q) => [v.ox + q[0] * v.scale, v.oy - q[1] * v.scale];
    const rgb = g.rgb || [187, 187, 187];
    const faces = AutoSigame._bandFaces3d().map(fc => {
      const proj = fc.p.map(p => AutoSigame._proj3d(p));
      return { proj, depth: proj.reduce((s, q) => s + q[2], 0) / proj.length, s: fc.s };
    }).sort((x, y) => y.depth - x.depth);  // painter: longe (maior prof) → perto
    faces.forEach(fc => {
      ctx.beginPath();
      fc.proj.forEach((q, i) => { const P = T(q); i === 0 ? ctx.moveTo(P[0], P[1]) : ctx.lineTo(P[0], P[1]); });
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(rgb[0] * fc.s)},${Math.round(rgb[1] * fc.s)},${Math.round(rgb[2] * fc.s)})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    });
  },

  // ── CORES ──
  async loadCores() {
    try {
      const r = await Bridge.call('autoacm_get_cores');
      if (r && r.ok) {
        AutoSigame.state.cores       = r.cores_acm   || {};
        AutoSigame.state.ordemCat    = r.ordem_cat   || Object.keys(AutoSigame.state.cores);
        AutoSigame.state.juntaColors = r.cores_junta || [];
        AutoSigame._mergeCustomJuntaCores();
        AutoSigame.state.coresLoaded = true;
        if (!AutoSigame.state.activeCat && AutoSigame.state.ordemCat.length) {
          AutoSigame.state.activeCat = AutoSigame.state.ordemCat[0];
        }
        // Default: Branco Brilho (VX103) se existir
        if (!AutoSigame.state.selectedColor) {
          for (const cat in AutoSigame.state.cores) {
            const f = AutoSigame.state.cores[cat].find(c => c.nome.indexOf('VX103') >= 0);
            if (f) { AutoSigame.selectColor(f.nome, true); break; }
          }
        }
        AutoSigame.renderColorGrid();
        AutoSigame.renderJuntaSwatches();
      }
    } catch (e) {
      console.error('[AutoSigame] loadCores erro:', e);
    }
  },

  renderColorGrid() {
    const tabsEl = document.getElementById('asg_color_tabs');
    const gridEl = document.getElementById('asg_color_grid');
    if (!tabsEl || !gridEl) return;
    if (!AutoSigame.state.activeCat && AutoSigame.state.ordemCat.length) {
      AutoSigame.state.activeCat = AutoSigame.state.ordemCat[0];
    }
    tabsEl.innerHTML = AutoSigame.state.ordemCat.map(cat => {
      const active = (cat === AutoSigame.state.activeCat);
      const label  = I18n.t('aa.cat.' + cat, cat);
      return `<button type="button" class="asg__color-tab${active ? ' is-active' : ''}" data-cat="${AutoSigame._escape(cat)}">${AutoSigame._escape(label)}</button>`;
    }).join('');
    tabsEl.querySelectorAll('.asg__color-tab').forEach(btn => {
      btn.onclick = () => { AutoSigame.state.activeCat = btn.dataset.cat; AutoSigame.renderColorGrid(); };
    });
    const colors = AutoSigame.state.cores[AutoSigame.state.activeCat] || [];
    gridEl.innerHTML = colors.map((c, i) => {
      const sel = (AutoSigame.state.selectedColor === c.nome) ? ' is-selected' : '';
      return `<div class="asg__color-swatch${sel}" style="background: rgb(${c.rgb.join(',')})" data-idx="${i}" title="${AutoSigame._escape(c.nome)}"></div>`;
    }).join('');
    gridEl.querySelectorAll('.asg__color-swatch').forEach(sw => {
      const c = colors[parseInt(sw.dataset.idx, 10)];
      if (c) sw.onclick = () => AutoSigame.selectColor(c.nome);
    });
  },

  selectColor(nome, skipRender) {
    AutoSigame.state.selectedColor = nome;
    for (const cat in AutoSigame.state.cores) {
      const f = AutoSigame.state.cores[cat].find(c => c.nome === nome);
      if (f) {
        AutoSigame.state.selectedColorRgb = f.rgb;
        if (AutoSigame.state.ordemCat.includes(cat)) AutoSigame.state.activeCat = cat;
        break;
      }
    }
    const prev = document.getElementById('asg_color_preview');
    const nm   = document.getElementById('asg_color_name');
    if (prev) prev.style.background = `rgb(${AutoSigame.state.selectedColorRgb.join(',')})`;
    if (nm) nm.textContent = nome || I18n.t('asg.acm.color.empty', 'Selecione uma cor');
    if (!skipRender) AutoSigame.renderColorGrid();
  },

  // ── COR DA JUNTA ──
  renderJuntaSwatches() {
    const el = document.getElementById('asg_junta_swatches');
    if (!el || !AutoSigame.state.juntaColors.length) return;
    const selected = AutoSigame.state.corJunta || 'Preto';
    el.innerHTML = AutoSigame.state.juntaColors.map((c, i) => {
      const isSel = (c.nome === selected) ? ' is-selected' : '';
      return `<div class="asg__junta-swatch${isSel}" data-idx="${i}" style="background: rgb(${c.rgb.join(',')})" title="${AutoSigame._escape(c.nome)}"></div>`;
    }).join('') +
      `<button type="button" class="asg__junta-swatch asg__junta-swatch--add" id="asg_junta_add" title="${AutoSigame._escape(I18n.t('aa.junta.add', 'Adicionar cor'))}">+</button>`;
    el.querySelectorAll('.asg__junta-swatch[data-idx]').forEach(sw => {
      const c = AutoSigame.state.juntaColors[parseInt(sw.dataset.idx, 10)];
      if (c) sw.onclick = () => AutoSigame._selectJunta(c.nome);
    });
    const addBtn = document.getElementById('asg_junta_add');
    if (addBtn) addBtn.onclick = () => AutoSigame.addJuntaCor();
  },

  _selectJunta(nome) {
    AutoSigame.state.corJunta = nome;
    document.querySelectorAll('.asg__junta-swatch[data-idx]').forEach((sw, i) => {
      const c = AutoSigame.state.juntaColors[i];
      if (c) sw.classList.toggle('is-selected', c.nome === nome);
    });
  },

  _mergeCustomJuntaCores() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(AutoSigame._JUNTA_CORES_KEY) || '[]'); } catch (e) {}
    list.forEach(c => {
      if (!c || !c.nome || !Array.isArray(c.rgb)) return;
      if (!AutoSigame.state.juntaColors.some(x => x.nome === c.nome)) {
        AutoSigame.state.juntaColors.push({ nome: c.nome, rgb: c.rgb });
      }
    });
  },

  _hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },

  async addJuntaCor() {
    const wrap = document.createElement('div');
    wrap.className = 'junta-pal';
    wrap.innerHTML = `
      <div class="junta-pal__custom">
        <input type="color" class="junta-pal__color" id="asg_junta_new_color" value="#888888">
        <input type="text" class="junta-pal__name field__input" id="asg_junta_new_name" placeholder="${AutoSigame._escape(I18n.t('aa.junta.add.name', 'Nome da cor'))}">
      </div>`;
    const res = await Modal.show({
      title: I18n.t('aa.junta.add.title', 'Adicionar cor de junta'),
      body: wrap,
      buttons: [
        { label: I18n.t('modal.cancel', 'Cancelar'), variant: 'secondary', value: null },
        { label: I18n.t('modal.add', 'Adicionar'), variant: 'primary',
          onClick: (bodyEl) => {
            const hex = (bodyEl.querySelector('#asg_junta_new_color') || {}).value || '#888888';
            let nome = ((bodyEl.querySelector('#asg_junta_new_name') || {}).value || '').trim();
            if (!nome) nome = hex.toUpperCase();
            return { nome, rgb: AutoSigame._hexToRgb(hex) };
          } }
      ]
    });
    if (!res || !res.rgb) return;
    const existing = AutoSigame.state.juntaColors.find(c => c.nome === res.nome);
    if (existing) existing.rgb = res.rgb;
    else AutoSigame.state.juntaColors.push({ nome: res.nome, rgb: res.rgb });
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(AutoSigame._JUNTA_CORES_KEY) || '[]'); } catch (e) {}
    saved = saved.filter(c => c && c.nome !== res.nome);
    saved.push({ nome: res.nome, rgb: res.rgb });
    localStorage.setItem(AutoSigame._JUNTA_CORES_KEY, JSON.stringify(saved));
    AutoSigame.state.corJunta = res.nome;
    AutoSigame.renderJuntaSwatches();
  },

  // ── HELPERS ──
  _num(id, fb) { const el = document.getElementById(id); const v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? fb : v; },
  _chk(id) { const el = document.getElementById(id); return !!(el && el.checked); },

  _chapaDims() {
    const preset = document.getElementById('asg_chapa_preset');
    const v = preset ? preset.value : '5000x1220';
    if (v === 'custom') {
      return { comp: AutoSigame._num('asg_chapa_comp', 5000), larg: AutoSigame._num('asg_chapa_larg', 1220) };
    }
    const m = /^(\d+)x(\d+)$/.exec(v);
    return m ? { comp: parseInt(m[1], 10), larg: parseInt(m[2], 10) } : { comp: 5000, larg: 1220 };
  },

  /** Monta os params no formato que AutoACM.extrair espera (+ altura/prof). */
  _buildParams() {
    const chapa = AutoSigame._chapaDims();
    const corJunta = AutoSigame.state.corJunta || 'Preto';
    const juntaRgb = (AutoSigame.state.juntaColors.find(c => c.nome === corJunta) || {}).rgb || null;

    return {
      altura: AutoSigame._num('asg_altura', 600),
      prof:   AutoSigame._num('asg_prof', 40),

      acm:          AutoSigame._num('asg_acm_esp', 3),
      cor_acm:      AutoSigame.state.selectedColor || '',
      chapa_larg:   chapa.larg,
      chapa_comp:   chapa.comp,
      chapa_orient: AutoSigame._getPill('data-val', 'horizontal'),

      mw: AutoSigame._num('asg_met_w', 20),
      mh: AutoSigame._num('asg_met_h', 20),
      ew: AutoSigame._num('asg_emenda_w', 30),
      eh: AutoSigame._num('asg_emenda_h', 20),
      emenda_align: AutoSigame._getPill('data-align', 'esquerda'),

      junta_tipo: AutoSigame._getPill('data-jt', 'seca'),
      junta_mm:   AutoSigame._num('asg_junta_mm', 8),
      cor_junta:  corJunta,
      cor_junta_rgb: juntaRgb,

      inc_fita: AutoSigame._chk('asg_fita_inc'),
      fl: AutoSigame._num('asg_fita_larg', 12),
      fe: AutoSigame._num('asg_fita_esp', 0.9),

      spots: false,

      enab_frontal:  AutoSigame._chk('asg_enab_frontal'),
      enab_traseira: AutoSigame._chk('asg_enab_traseira'),
      enab_topo:     AutoSigame._chk('asg_enab_topo'),
      enab_base:     AutoSigame._chk('asg_enab_base'),
      enab_esq:      AutoSigame._chk('asg_enab_esq'),
      enab_dir:      AutoSigame._chk('asg_enab_dir'),

      // Roles: box local X=comprimento, Y=-prof (frente), Z=altura.
      // frontal = face -Y (a face grande, projetada pra frente).
      role_ny: 'frontal',
      role_py: 'traseira',
      role_nx: 'esq',
      role_px: 'dir',
      role_pz: 'topo',
      role_nz: 'base',

      preview_em_h: '',
      preview_em_v: ''
    };
  },

  _status(msg, kind) {
    const el = document.getElementById('asg_status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'asg__status' + (kind ? ' asg__status--' + kind : '');
  },

  async desenhar() {
    const params = AutoSigame._buildParams();
    if (!params.cor_acm) {
      AutoSigame._status(I18n.t('asg.err.no_color', 'Selecione uma cor ACM.'), 'error');
      return;
    }
    if (!(params.enab_frontal || params.enab_traseira || params.enab_topo ||
          params.enab_base || params.enab_esq || params.enab_dir)) {
      AutoSigame._status(I18n.t('asg.err.no_face', 'Marque ao menos uma face a revestir.'), 'error');
      return;
    }
    const btn = document.getElementById('asg_btn_desenhar');
    if (btn) btn.classList.add('is-loading');
    AutoSigame._status(I18n.t('asg.status.activating', 'Ferramenta ativada — vá ao SketchUp e marque os pontos.'), 'info');
    try {
      const r = await Bridge.call('auto_sigame_desenhar', { params: params });
      if (!r || !r.ok) {
        const code = (r && r.code) || 'auto_sigame.desenhar_error';
        AutoSigame._status(I18n.t(code, code) + (r && r.error ? '\n' + r.error : ''), 'error');
        return;
      }
      AutoSigame._status(I18n.t('asg.status.ready', '✓ Desenhe o caminho no SketchUp. Enter gera, Esc cancela.'), 'success');
    } catch (e) {
      AutoSigame._status((I18n.t('auth.error.comm', 'Erro de comunicação') + ': ' + e.message), 'error');
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  // PLANO DE CORTE — clonado do Auto-ACM (capa com empresa + páginas com
  // as vistas + folhas de corte das chapas + lista de corte). O quantitativo
  // vem do Ruby (derivado das peças do servidor) via onGerado(data.quant).
  // Reusa as chaves i18n aa.plano.* (textos idênticos à origem).
  // ══════════════════════════════════════════════════════════════════════

  async gerarPlano() {
    const g = AutoSigame.state.gen;
    if (!g || !g.quant || !g.quant.chapas || !g.quant.chapas.length) {
      AutoSigame._showPlanoStatus(I18n.t('aa.plano.err.no_quant', 'Gere a estrutura primeiro.'), 'error');
      return;
    }
    const btn = document.getElementById('asg_btn_plano');
    if (btn) btn.classList.add('is-loading');
    AutoSigame._showPlanoStatus(I18n.t('aa.plano.loading', 'Gerando plano de corte...'), 'info');
    try {
      AutoSigame._draw2D(); AutoSigame._draw3D();
      await new Promise(r => setTimeout(r, 150));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const empresa = await AutoSigame._fetchEmpresa();
      const html = AutoSigame._buildPlanoHtml(g, empresa);
      if (!html) {
        AutoSigame._showPlanoStatus(I18n.t('aa.plano.err.build', 'Falha ao montar o plano.'), 'error');
        return;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const suggested = `Plano_AutoSigame_${dateStr}`;
      const fileName = await AutoSigame._askFileName(suggested);
      if (!fileName) { AutoSigame._hidePlanoStatus(); return; }

      await AutoSigame._enviarPlanoParaRuby(fileName, html);
    } catch (e) {
      AutoSigame._showPlanoStatus((I18n.t('auth.error.comm', 'Erro de comunicação')) + ': ' + e.message, 'error');
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  },

  async _askFileName(suggested) {
    const raw = await Modal.prompt(
      I18n.t('aa.plano.filename.title', 'Nome do arquivo'),
      I18n.t('aa.plano.filename.msg', 'Confirme ou edite o nome (apenas letras, números, _ e -):'),
      suggested
    );
    if (raw === null) return null;
    let name = String(raw).trim().replace(/\.html?$/i, '');
    name = name.replace(/[^a-z0-9_\-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (!name || name.length < 2) {
      Toast.error(I18n.t('aa.plano.filename.invalid', 'Nome inválido. Use letras, números, _ ou -.'));
      return null;
    }
    if (name.length > 80) name = name.slice(0, 80);
    return name;
  },

  async _enviarPlanoParaRuby(fileName, html) {
    const b64 = btoa(unescape(encodeURIComponent(html)));
    const r = await Bridge.call('auto_sigame_salvar_plano', { name: fileName, content: b64 });
    if (r && r.ok) {
      AutoSigame._showPlanoStatus(
        I18n.t('aa.plano.ok', '✓ Plano salvo em: {path}').replace('{path}', r.path || ''), 'success');
    } else if (r && r.code === 'user_cancelled') {
      AutoSigame._hidePlanoStatus();
    } else {
      AutoSigame._showPlanoStatus(
        I18n.t('aa.plano.err.save', 'Erro ao salvar') + ': ' + (r && r.error || '?'), 'error');
    }
  },

  _showPlanoStatus(msg, kind) {
    const el = document.getElementById('asg_plano_status');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.className = 'asg__status' + (kind ? ' asg__status--' + kind : '');
    if (kind === 'success') {
      clearTimeout(AutoSigame._planoStatusTimer);
      AutoSigame._planoStatusTimer = setTimeout(() => { el.hidden = true; }, 8000);
    }
  },
  _hidePlanoStatus() {
    const el = document.getElementById('asg_plano_status');
    if (el) el.hidden = true;
  },

  async _fetchEmpresa() {
    try {
      const r = await Bridge.call('empresa_get');
      return (r && r.ok && r.empresa) ? r.empresa : {};
    } catch (e) { return {}; }
  },

  _escEmpresa(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  },

  _hasEmpresa(empresa) {
    if (!empresa) return false;
    return !!(empresa.nome || empresa.logo || empresa.doc || empresa.endereco ||
              empresa.fone || empresa.email || empresa.repr);
  },

  _brandStripHtml(empresa, pageLabel) {
    if (!AutoSigame._hasEmpresa(empresa)) return '';
    const E = AutoSigame._escEmpresa;
    const logo = empresa.logo
      ? `<img class="brand-strip__logo" src="${empresa.logo}" alt="logo">`
      : `<span class="brand-strip__logo brand-strip__logo--placeholder"></span>`;
    return `<div class="brand-strip">
      ${logo}
      <span class="brand-strip__name">${E(empresa.nome || '')}</span>
      <span class="brand-strip__sep"></span>
      <span class="brand-strip__label">${E(pageLabel || '')}</span>
    </div>`;
  },

  /* Capa single — mesma estrutura do Auto-ACM, com o resumo da faixa. */
  _buildCapaHtml(q, empresa) {
    const E = AutoSigame._escEmpresa;
    const dt = new Date().toLocaleDateString('pt-BR');
    const m = (empresa && AutoSigame._hasEmpresa(empresa)) ? empresa : null;
    const docLabel = m && m.doc_tipo === 'cpf' ? 'CPF' : 'CNPJ';
    const empresaHeader = m ? `
      <div class="capa-empresa">
        ${m.logo ? `<div class="capa-empresa__logo"><img src="${m.logo}" alt="${E(m.nome || 'logo')}"></div>` : ''}
        <div class="capa-empresa__info">
          ${m.nome ? `<h1 class="capa-empresa__name">${E(m.nome)}</h1>` : ''}
          <ul class="capa-empresa__list">
            ${m.doc      ? `<li><span>${docLabel}</span><b>${E(m.doc)}</b></li>` : ''}
            ${m.endereco ? `<li><span>Endereço</span><b>${E(m.endereco)}</b></li>` : ''}
            ${m.fone     ? `<li><span>Telefone</span><b>${E(m.fone)}</b></li>` : ''}
            ${m.email    ? `<li><span>Email</span><b>${E(m.email)}</b></li>` : ''}
          </ul>
        </div>
      </div>` : '';
    const resumo = `
      <div class="capa-resumo">
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Faixa (C×A×P)</span>
          <span class="capa-resumo__val">${q.comp}×${q.alt}×${q.prof} <em>mm</em></span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Cor ACM</span>
          <span class="capa-resumo__val">${E(q.cor_acm || '-')}</span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Chapas (peças)</span>
          <span class="capa-resumo__val">${q.chapas.length}</span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Metalon ${q.metalon_wh}</span>
          <span class="capa-resumo__val">${q.met_barras} <em>barras 6m</em><br><small>${q.met_m} m</small></span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Emenda ${q.emenda_wh}</span>
          <span class="capa-resumo__val">${q.em_barras} <em>barras 6m</em><br><small>${q.em_m} m</small></span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Fita DF</span>
          <span class="capa-resumo__val">${q.fita_m} <em>m</em></span>
        </div>
      </div>`;
    const assinatura = (m && (m.repr || m.cargo)) ? `
      <div class="capa-assinatura">
        <div class="capa-assinatura__line"></div>
        <div class="capa-assinatura__nome">${E(m.repr || '')}</div>
        ${m.cargo ? `<div class="capa-assinatura__cargo">${E(m.cargo)}</div>` : ''}
      </div>` : '';
    return `
      <div class="capa capa--single">
        <div class="capa__frame">
          ${empresaHeader}
          <div class="capa__divider"></div>
          <div class="capa__title">
            <span class="capa-kicker">Plano de Corte · Auto Sigam-me</span>
            <h2>Plano de Corte</h2>
            <p class="capa-sub">Gerado em ${dt}</p>
          </div>
          ${resumo}
          ${assinatura}
          <div class="capa-footer">
            <span>SignEng · Plano de Corte</span>
            <span>${dt}</span>
          </div>
        </div>
      </div>`;
  },

  /* Nesting das chapas nas folhas padrão (shelf com rotação 90°).
     Peças "desenvolvidas" carregam as posições das DOBRAS (mm no eixo h). */
  _nestChapas(chapas, shW, shL) {
    const parts = chapas.map((c, i) => ({ w: c.w, h: c.h, idx: i + 1, face: c.face || '', dobras: c.dobras || null }))
      .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
    const sheets = [];
    parts.forEach(p => {
      let placed = false;
      for (const s of sheets) { if (AutoSigame._shelfPlace(s, p, shW, shL)) { placed = true; break; } }
      if (!placed) {
        const s = { shelves: [], parts: [], usedH: 0 };
        sheets.push(s);
        if (!AutoSigame._shelfPlace(s, p, shW, shL)) {
          // maior que a folha — marca em vermelho (oversize) pra revisão
          s.parts.push({ x: 0, y: 0, w: Math.min(p.w, shW), h: Math.min(p.h, shL), idx: p.idx, over: true, dobras: p.dobras });
        }
      }
    });
    return sheets;
  },
  _shelfPlace(s, p, shW, shL) {
    const orients = [[p.w, p.h], [p.h, p.w]];
    for (const sh of s.shelves) {
      for (const [w, h] of orients) {
        if (h <= sh.h + 0.01 && w <= shW - sh.x + 0.01) {
          s.parts.push({ x: sh.x, y: sh.y, w, h, idx: p.idx, rot: w !== p.w, dobras: p.dobras });
          sh.x += w;
          return true;
        }
      }
    }
    for (const [w, h] of orients) {
      if (w <= shW + 0.01 && s.usedH + h <= shL + 0.01) {
        const sh = { y: s.usedH, h, x: w };
        s.shelves.push(sh);
        s.parts.push({ x: 0, y: sh.y, w, h, idx: p.idx, rot: w !== p.w, dobras: p.dobras });
        s.usedH += h;
        return true;
      }
    }
    return false;
  },

  /* Canvas de UMA folha de corte (mesmo formato 1600×1000 do Auto-ACM). */
  _drawPlanoSheet(sheet, shW, shL, num, total) {
    const CW = 1600, CH = 1000;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d');
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, CW, CH);
    const pad = 90;
    const sc = Math.min((CW - pad * 2) / shW, (CH - pad * 2 - 40) / shL);
    const ox = (CW - shW * sc) / 2, oy = (CH - 40 - shL * sc) / 2 + 20;
    g.fillStyle = '#ffffff'; g.strokeStyle = '#94a3b8'; g.lineWidth = 2;
    g.fillRect(ox, oy, shW * sc, shL * sc); g.strokeRect(ox, oy, shW * sc, shL * sc);
    sheet.parts.forEach(p => {
      const x = ox + p.x * sc, y = oy + p.y * sc, w = p.w * sc, h = p.h * sc;
      g.fillStyle = p.over ? '#fee2e2' : '#e2e8f0';
      g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.strokeStyle = p.over ? '#dc2626' : '#334155'; g.lineWidth = 1.5;
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      // linhas de DOBRA (tracejadas) — no eixo transversal da peça (h antes
      // da rotação); com rotação, viram linhas verticais
      if (p.dobras && p.dobras.length) {
        g.strokeStyle = '#f59e0b'; g.lineWidth = 1.5; g.setLineDash([8, 6]);
        p.dobras.forEach(d => {
          g.beginPath();
          if (p.rot) { const lx = x + d * sc; g.moveTo(lx, y + 2); g.lineTo(lx, y + h - 2); }
          else { const ly = y + d * sc; g.moveTo(x + 2, ly); g.lineTo(x + w - 2, ly); }
          g.stroke();
        });
        g.setLineDash([]);
      }
      g.fillStyle = '#0f172a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = Math.max(11, Math.min(26, Math.min(w, h) * 0.28));
      g.font = '600 ' + fs + 'px Arial';
      g.fillText('#' + p.idx, x + w / 2, y + h / 2 - fs * 0.55);
      g.font = (fs * 0.75) + 'px Arial';
      g.fillText(Math.round(p.rot ? p.h : p.w) + '×' + Math.round(p.rot ? p.w : p.h) + (p.rot ? ' (girada)' : '') + (p.dobras && p.dobras.length ? ' · ' + p.dobras.length + ' dobra(s)' : ''), x + w / 2, y + h / 2 + fs * 0.5);
    });
    g.fillStyle = '#475569'; g.font = '600 22px Arial'; g.textAlign = 'center';
    g.fillText(Math.round(shW) + ' mm', ox + shW * sc / 2, oy - 14);
    g.save(); g.translate(ox - 18, oy + shL * sc / 2); g.rotate(-Math.PI / 2);
    g.fillText(Math.round(shL) + ' mm', 0, 0); g.restore();
    g.font = '20px Arial';
    g.fillText('Auto Sigam-me · Plano de Corte das Chapas — folha ' + num + ' de ' + total + ' · linha tracejada = DOBRA', CW / 2, CH - 12);
    return cv.toDataURL('image/png');
  },

  /* Página final: lista de corte (chapas agrupadas + metalon + emendas + fita). */
  _buildListaHtml(q, sheets) {
    const grp = {};
    q.chapas.forEach(c => {
      const nd = (c.dobras || []).length;
      const k = Math.round(c.w) + '×' + Math.round(c.h) + '|' + (c.face || '') + '|' + nd;
      (grp[k] = grp[k] || { n: 0, w: c.w, h: c.h, face: c.face || '', nd }).n++;
    });
    const chapaRows = Object.keys(grp).map(k => {
      const g0 = grp[k];
      const extra = g0.nd ? ` · ${g0.nd} dobra(s)` : '';
      return `<tr><td>${g0.n}×</td><td>${Math.round(g0.w)}×${Math.round(g0.h)} mm</td><td>${AutoSigame._escape(g0.face)}${extra}</td><td>${(g0.w * g0.h * g0.n / 1e6).toFixed(2)} m²</td></tr>`;
    }).join('');
    const areaTot = q.chapas.reduce((s, c) => s + c.w * c.h, 0) / 1e6;
    const mg = {};
    (q.met_pecas || []).forEach(b => { const k = Math.round(b.len); mg[k] = (mg[k] || 0) + 1; });
    const metRows = Object.keys(mg).sort((a, b) => b - a).map(k =>
      `<tr><td>${mg[k]}×</td><td>${k} mm</td><td>${q.metalon_wh} mm</td></tr>`).join('');
    const eg = {};
    (q.em_pecas || []).forEach(b => { const k = Math.round(b.len); eg[k] = (eg[k] || 0) + 1; });
    const emRows = Object.keys(eg).sort((a, b) => b - a).map(k =>
      `<tr><td>${eg[k]}×</td><td>${k} mm</td><td>${q.emenda_wh} mm</td></tr>`).join('');
    return `
    <div class="report-page">
      <h2 class="sgp-h2">Lista de corte — Auto Sigam-me</h2>
      <div class="sgp-cols">
        <div>
          <h3 class="sgp-h3">Chapas ACM · ${q.chapas.length} pç · ${areaTot.toFixed(2)} m² · ${sheets.length} folha(s) de ${q.chapa_comp}×${q.chapa_larg}${q.em_horiz ? ` · ${q.em_horiz} emenda(s) horizontal(is) — desenvolvimento maior que ${q.chapa_orient === 'vertical' ? q.chapa_comp : q.chapa_larg}` : ''}</h3>
          <table class="sgp-table"><thead><tr><th>Qtd</th><th>Dimensão</th><th>Peça</th><th>Área</th></tr></thead><tbody>${chapaRows}</tbody></table>
        </div>
        <div>
          <h3 class="sgp-h3">Metalon ${q.metalon_wh} · ${(q.met_pecas || []).length} pç · ${q.met_m} m · ${q.met_barras} barra(s) 6m</h3>
          <table class="sgp-table"><thead><tr><th>Qtd</th><th>Comprimento</th><th>Seção</th></tr></thead><tbody>${metRows}</tbody></table>
          ${emRows ? `<h3 class="sgp-h3">Perfil de emenda ${q.emenda_wh} · ${q.em_m} m · ${q.em_barras} barra(s) 6m</h3>
          <table class="sgp-table"><thead><tr><th>Qtd</th><th>Comprimento</th><th>Seção</th></tr></thead><tbody>${emRows}</tbody></table>` : ''}
          <h3 class="sgp-h3">Fita dupla-face</h3>
          <p class="sgp-p">${q.fita_m} m${q.juntas ? ` · Juntas de dilatação: ${q.juntas} faixa(s)` : ''}</p>
        </div>
      </div>
    </div>`;
  },

  /* ── ESTRUTURA METÁLICA no plano (padrão Auto-ACM) ────────────────────
     As barras vêm no quant com endpoints absolutos (mm); g.origin converte
     pro mesmo referencial do caminho (g.points). ── */

  /* distância acumulada ao longo do caminho pro ponto (x,y) — "desenrola" a faixa */
  _devS(x, y, pts) {
    let best = { d: Infinity, s: 0 }; let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      const vx = bx - ax, vy = by - ay; const L = Math.hypot(vx, vy) || 1;
      let t = ((x - ax) * vx + (y - ay) * vy) / (L * L); t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
      if (d < best.d) best = { d, s: acc + L * t };
      acc += L;
    }
    return best.s;
  },

  _estBeams(q, g) {
    const o = g.origin || [0, 0, 0];
    const rel = p => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    const all = [];
    (q.met_pecas || []).forEach(b => { if (b.p1) all.push({ tipo: b.tipo || 'rail', p1: rel(b.p1), p2: rel(b.p2) }); });
    (q.em_pecas || []).forEach(b => { if (b.p1) all.push({ tipo: 'emenda', p1: rel(b.p1), p2: rel(b.p2) }); });
    return all;
  },

  _ESTCOR: { rail: '#64748b', montante: '#334155', travessa: '#94a3b8', emenda: '#d97706' },

  /* Página: ELEVAÇÃO DESENVOLVIDA da estrutura (caminho esticado × altura). */
  _drawEstruturaDev(q, g) {
    const CW = 1600, CH = 1000;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, CW, CH);
    const beams = AutoSigame._estBeams(q, g);
    const pts = g.points;
    const comp = q.comp || 1, alt = q.alt || 1;
    const pad = 110;
    const sc = Math.min((CW - pad * 2) / comp, (CH - pad * 2 - 60) / alt);
    const ox = (CW - comp * sc) / 2, oy = (CH - 60 + alt * sc) / 2;
    const T = (s, z) => [ox + s * sc, oy - z * sc];
    // contorno da faixa desenvolvida
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy - alt * sc, comp * sc, alt * sc);
    // barras (travessas de profundidade colapsam num ponto na elevação — pula)
    beams.forEach(b => {
      if (b.tipo === 'travessa') return;
      const s1 = AutoSigame._devS(b.p1[0], b.p1[1], pts), z1 = b.p1[2];
      const s2 = AutoSigame._devS(b.p2[0], b.p2[1], pts), z2 = b.p2[2];
      const A = T(s1, z1), B = T(s2, z2);
      ctx.strokeStyle = AutoSigame._ESTCOR[b.tipo] || '#64748b';
      ctx.lineWidth = b.tipo === 'emenda' ? 6 : (b.tipo === 'montante' ? 4 : 3);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    });
    // cotas
    ctx.fillStyle = '#475569'; ctx.font = '600 22px Arial'; ctx.textAlign = 'center';
    ctx.fillText(Math.round(comp) + ' mm (desenvolvido)', ox + comp * sc / 2, oy + 34);
    ctx.save(); ctx.translate(ox - 20, oy - alt * sc / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(Math.round(alt) + ' mm', 0, 0); ctx.restore();
    // legenda
    const leg = [['Rails', 'rail'], ['Montantes', 'montante'], ['Perfil de emenda', 'emenda']];
    let lx = ox;
    ctx.font = '20px Arial'; ctx.textAlign = 'left';
    leg.forEach(([nm, tp]) => {
      ctx.fillStyle = AutoSigame._ESTCOR[tp]; ctx.fillRect(lx, CH - 52, 26, 8);
      ctx.fillStyle = '#334155'; ctx.fillText(nm, lx + 32, CH - 44);
      lx += ctx.measureText(nm).width + 90;
    });
    const nTv = beams.filter(b => b.tipo === 'travessa').length;
    ctx.fillStyle = '#64748b';
    ctx.fillText('Travessas de profundidade: ' + nTv + ' (ver planta) · frente e trás são espelhados', lx + 20, CH - 44);
    ctx.fillStyle = '#475569'; ctx.font = '600 22px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Auto Sigam-me · Estrutura Metálica — elevação desenvolvida', CW / 2, CH - 12);
    return cv.toDataURL('image/png');
  },

  /* Página: PLANTA da estrutura (vista de cima, rails + travessas + montantes). */
  _drawEstruturaPlanta(q, g) {
    const CW = 1600, CH = 1000;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, CW, CH);
    const beams = AutoSigame._estBeams(q, g);
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    beams.forEach(b => [b.p1, b.p2].forEach(p => {
      if (p[0] < mnX) mnX = p[0]; if (p[0] > mxX) mxX = p[0];
      if (p[1] < mnY) mnY = p[1]; if (p[1] > mxY) mxY = p[1];
    }));
    if (!isFinite(mnX)) return null;
    const w = (mxX - mnX) || 1, h = (mxY - mnY) || 1, pad = 110;
    const sc = Math.min((CW - pad * 2) / w, (CH - pad * 2 - 60) / h);
    const T = (x, y) => [(CW - w * sc) / 2 + (x - mnX) * sc, (CH - 60 + h * sc) / 2 - (y - mnY) * sc];
    beams.forEach(b => {
      const A = T(b.p1[0], b.p1[1]), B = T(b.p2[0], b.p2[1]);
      ctx.strokeStyle = AutoSigame._ESTCOR[b.tipo] || '#64748b';
      if (b.tipo === 'montante' || b.tipo === 'emenda') {
        // vertical em planta = um ponto — quadradinho
        ctx.fillStyle = AutoSigame._ESTCOR[b.tipo];
        ctx.fillRect(A[0] - 4, A[1] - 4, 8, 8);
      } else {
        ctx.lineWidth = b.tipo === 'travessa' ? 2 : 3;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
    });
    ctx.fillStyle = '#475569'; ctx.font = '600 22px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Auto Sigam-me · Estrutura Metálica — planta (rails frente/trás, travessas, montantes ▪, emendas ▪ laranja)', CW / 2, CH - 12);
    return cv.toDataURL('image/png');
  },

  /* Estilos próprios das tabelas da lista (namespaced sgp- pra não depender
     de detalhes internos do _planoCss clonado). */
  _planoCssExtra() {
    return `
.report-page { background:#fff; max-width:1123px; margin:24px auto; padding:48px; box-shadow:0 2px 12px rgba(15,23,42,.08); }
.sgp-h2 { font:700 24px/1.3 Arial,sans-serif; color:#0f172a; margin:0 0 18px; }
.sgp-h3 { font:600 15px/1.4 Arial,sans-serif; color:#334155; margin:18px 0 8px; }
.sgp-cols { display:grid; grid-template-columns:1fr 1fr; gap:32px; }
.sgp-table { width:100%; border-collapse:collapse; font:13px/1.5 Arial,sans-serif; color:#0f172a; }
.sgp-table th { text-align:left; font-weight:600; color:#64748b; border-bottom:2px solid #e2e8f0; padding:6px 8px; }
.sgp-table td { border-bottom:1px solid #f1f5f9; padding:5px 8px; }
.sgp-p { font:13px/1.5 Arial,sans-serif; color:#0f172a; margin:4px 0; }
@media print { .sgp-cols { grid-template-columns:1fr 1fr; } }`;
  },

  /* Monta o HTML completo do plano (capa + vistas + folhas + lista). */
  _buildPlanoHtml(g, empresa) {
    const q = g.quant;
    empresa = empresa || {};
    const sheets = AutoSigame._nestChapas(q.chapas, q.chapa_comp, q.chapa_larg);
    const imgs = [];
    const c2 = document.getElementById('asg_canvas2d');
    const c3 = document.getElementById('asg_canvas3d');
    try { if (c2 && c2.width > 10) imgs.push(c2.toDataURL('image/png')); } catch (e) {}
    try { if (c3 && c3.width > 10) imgs.push(c3.toDataURL('image/png')); } catch (e) {}
    // páginas da ESTRUTURA METÁLICA (padrão Auto-ACM) — só se o quant tem endpoints
    if ((q.met_pecas || []).some(b => b.p1)) {
      try {
        const dev = AutoSigame._drawEstruturaDev(q, g); if (dev) imgs.push(dev);
        const pla = AutoSigame._drawEstruturaPlanta(q, g); if (pla) imgs.push(pla);
      } catch (e) { console.error('[AutoSigame] estrutura no plano:', e); }
    }
    sheets.forEach((s, i) => imgs.push(AutoSigame._drawPlanoSheet(s, q.chapa_comp, q.chapa_larg, i + 1, sheets.length)));

    const total = imgs.length + 1;
    const imgsHtml = imgs.map((src, i) => {
      const strip = AutoSigame._brandStripHtml(empresa, `Página ${i + 1} de ${total}`);
      return `<div class="page page--framed">${strip}<div class="page__body"><img src="${src}" alt="Página ${i + 1}"></div></div>`;
    }).join('');
    const lista = AutoSigame._buildListaHtml(q, sheets);
    const capa = AutoSigame._buildCapaHtml(q, empresa);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Plano de Corte — Auto Sigam-me</title>
<style>${AutoSigame._planoCss()}${AutoSigame._planoCssExtra()}</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Imprimir / PDF</button>
  </div>
  ${capa}
  ${imgsHtml}
  ${lista}
</body>
</html>`;
  },

  _planoCss() {
    return `@page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Inter', -apple-system, sans-serif;
    color: #171717;
    background: #f5f5f5;
    padding: 24px 0;
    line-height: 1.5;
  }
  .toolbar {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 1000;
  }
  .toolbar button {
    padding: 10px 16px;
    background: #171717;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }
  .toolbar button:hover { background: #404040; }
  .page {
    max-width: 1600px;
    margin: 0 auto 24px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 20px 60px rgba(0,0,0,0.08);
    border-radius: 12px;
    overflow: hidden;
    page-break-after: always;
  }
  .page img { width: 100%; height: auto; display: block; }
  .report-page {
    max-width: 1600px;
    margin: 0 auto 24px;
    background: #fff;
    padding: 48px 60px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 20px 60px rgba(0,0,0,0.08);
    border-radius: 12px;
    page-break-after: always;
  }
  .report-page h2 {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #171717;
    margin: 32px 0 8px;
    padding-top: 24px;
    border-top: 1px solid #e5e5e5;
  }
  .report-page h2:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
  .report-page .subtitle {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #737373;
    margin-bottom: 16px;
  }
  .cut-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    margin-bottom: 8px;
  }
  .cut-table th {
    text-align: left;
    padding: 10px 12px;
    background: #f5f5f5;
    border-bottom: 1px solid #e5e5e5;
    font-weight: 600;
    color: #525252;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .cut-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #f5f5f5;
    color: #171717;
  }
  .cut-table tr.total td {
    background: #171717;
    color: #ffffff;
    font-weight: 700;
    border-bottom: 0;
  }
  .cut-table tr.totais-gerais td {
    background: #fafafa;
    font-weight: 700;
    border-top: 2px solid #171717;
  }
  .inst {
    margin-top: 32px;
    padding: 24px 28px;
    background: #fafafa;
    border-left: 4px solid #171717;
    border-radius: 8px;
  }
  .inst h3 {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    color: #171717;
  }
  .inst ol {
    margin-left: 20px;
    font-size: 13px;
    line-height: 1.7;
    color: #404040;
  }
  .inst ol li { margin-bottom: 6px; }
  .inst b { color: #171717; }

  /* === CAPA MULTI-MÓDULO === */
  .capa {
    max-width: 1600px;
    margin: 0 auto 24px;
    background: #fff;
    padding: 64px 80px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 20px 60px rgba(0,0,0,0.08);
    border-radius: 12px;
    page-break-after: always;
  }
  .capa-kicker {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #737373;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 12px;
  }
  .capa h1 {
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.035em;
    color: #171717;
    margin-bottom: 12px;
    line-height: 1.1;
  }
  .capa .capa-sub {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: #737373;
    margin-bottom: 40px;
  }
  .capa table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 40px;
  }
  .capa table th {
    text-align: left;
    padding: 12px 14px;
    background: #171717;
    color: #ffffff;
    font-weight: 600;
    font-family: 'Courier New', monospace;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .capa table td {
    padding: 10px 14px;
    border-bottom: 1px solid #f5f5f5;
    color: #171717;
    font-family: 'Courier New', monospace;
    vertical-align: middle;
  }
  .capa table tr:hover td { background: #fafafa; }
  .capa table .thumb-cell {
    padding: 8px 10px;
    width: 164px;
  }
  .capa table .thumb-cell img {
    width: 150px;
    height: auto;
    display: block;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
  }
  .capa table .num-cell {
    width: 40px;
    font-weight: 700;
    font-size: 14px;
  }
  .capa .resumo-geral {
    margin-top: 40px;
    padding: 24px 32px;
    background: #fafafa;
    border-left: 4px solid #171717;
    border-radius: 8px;
  }
  .capa .resumo-geral h3 {
    font-size: 16px;
    font-weight: 700;
    color: #171717;
    margin-bottom: 16px;
  }
  .capa .resumo-geral dl {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }
  .capa .resumo-geral dt {
    color: #737373;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
  }
  .capa .resumo-geral dd {
    color: #171717;
    margin-bottom: 8px;
    padding-left: 12px;
    line-height: 1.6;
  }
  .capa .resumo-geral dd b { color: #171717; }
  .capa .capa-footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid #e5e5e5;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: #a3a3a3;
    display: flex;
    justify-content: space-between;
  }

  /* === SEPARADOR DE MÓDULO === */
  .modsep {
    max-width: 1600px;
    margin: 40px auto 16px;
    padding: 28px 48px;
    background: #171717;
    color: #ffffff;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.12);
    page-break-before: always;
  }
  .modsep h2 {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin-bottom: 10px;
  }
  .modsep .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .modsep .chip {
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 9999px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #ffffff;
  }

  /* === CAPA — bloco de identidade da empresa === */
  .capa__frame {
    position: relative;
    padding: 24px;
    border: 1px solid #e5e5e5;
    border-radius: 14px;
  }
  .capa__frame::before {
    content: "";
    position: absolute;
    inset: 8px;
    border: 1px solid #f5f5f5;
    border-radius: 10px;
    pointer-events: none;
  }
  .capa-empresa {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 28px;
    align-items: center;
    padding: 8px 12px 24px;
  }
  .capa-empresa--band {
    grid-template-columns: 90px 1fr;
    gap: 20px;
    padding: 4px 12px 16px;
  }
  .capa-empresa__logo {
    width: 140px;
    height: 140px;
    display: grid;
    place-items: center;
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 12px;
    overflow: hidden;
    padding: 8px;
  }
  .capa-empresa--band .capa-empresa__logo {
    width: 90px;
    height: 90px;
    border-radius: 10px;
    padding: 6px;
  }
  .capa-empresa__logo img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }
  .capa-empresa__name {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: #171717;
    margin: 0 0 12px;
    line-height: 1.1;
  }
  .capa-empresa--band .capa-empresa__name {
    font-size: 22px;
    margin-bottom: 8px;
  }
  .capa-empresa__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }
  .capa-empresa__list--inline {
    grid-template-columns: 1fr 1fr;
    column-gap: 24px;
    row-gap: 4px;
  }
  .capa-empresa__list li {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .capa-empresa__list li span {
    color: #a3a3a3;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
    font-weight: 600;
    min-width: 72px;
  }
  .capa-empresa__list li b {
    color: #171717;
    font-weight: 600;
  }
  .capa__divider {
    height: 1px;
    background: linear-gradient(to right, #171717 0%, #171717 80px, #e5e5e5 80px);
    margin: 16px 0 24px;
  }
  .capa__title {
    padding: 0 12px;
    margin-bottom: 32px;
  }
  .capa__title h2 {
    font-size: 38px;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: #171717;
    margin: 6px 0 8px;
    line-height: 1.1;
  }
  .capa-resumo {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
    margin: 0 12px 32px;
  }
  .capa-resumo__item {
    padding: 16px 14px;
    background: #fafafa;
    border: 1px solid #f5f5f5;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .capa-resumo__lbl {
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: #737373;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
  .capa-resumo__val {
    font-size: 22px;
    font-weight: 600;
    color: #171717;
    line-height: 1.1;
  }
  .capa-resumo__val em {
    font-style: normal;
    font-size: 12px;
    color: #737373;
    font-weight: 500;
    margin-left: 2px;
  }
  .capa-resumo__val small {
    display: block;
    font-size: 11px;
    color: #737373;
    font-weight: 400;
    margin-top: 2px;
  }
  .capa-assinatura {
    margin: 48px 12px 24px;
    max-width: 320px;
  }
  .capa-assinatura__line {
    border-top: 1px solid #171717;
    margin-bottom: 6px;
  }
  .capa-assinatura__nome {
    font-size: 14px;
    font-weight: 600;
    color: #171717;
  }
  .capa-assinatura__cargo {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #737373;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 2px;
  }

  /* === FAIXA COM LOGO NAS PÁGINAS INTERNAS === */
  .brand-strip {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid #f5f5f5;
    background: #ffffff;
  }
  .brand-strip > .brand-strip__logo,
  .brand-strip img.brand-strip__logo {
    width: 24px;
    height: 24px;
    max-width: 24px;
    max-height: 24px;
    object-fit: contain;
    display: block;
    flex-shrink: 0;
  }
  .brand-strip__logo--placeholder {
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
  }
  .brand-strip__name {
    font-weight: 700;
    font-size: 13px;
    color: #171717;
    letter-spacing: -0.01em;
  }
  .brand-strip__sep {
    flex: 1;
    height: 1px;
    background: #e5e5e5;
  }
  .brand-strip__label {
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: #737373;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    flex-shrink: 0;
  }

  /* === BORDA DECORATIVA NAS PÁGINAS INTERNAS === */
  .page--framed {
    padding: 0;
    border: 1px solid #e5e5e5;
  }
  .page--framed .page__body {
    padding: 14px;
  }
  .page--framed .page__body img {
    border-radius: 6px;
  }
  .report-page--framed {
    padding: 0;
    border: 1px solid #e5e5e5;
  }
  .report-page--framed .report-page__body {
    padding: 36px 60px 48px;
  }

  @media print {
    body { background: #fff; padding: 0; }
    .page, .report-page, .capa, .modsep {
      margin: 0;
      box-shadow: none;
      border-radius: 0;
      max-width: none;
    }
    .toolbar { display: none !important; }
    .modsep { page-break-before: always; }
    .capa__frame { border: 1px solid #d4d4d4; }
    .capa__frame::before { border-color: #efefef; }
    .brand-strip { background: #fff; }
  }`;
  },

};
