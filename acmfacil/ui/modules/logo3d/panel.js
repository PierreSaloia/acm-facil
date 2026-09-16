/* ══════════════════════════════════════════════════════════════════════════
   LOGO 3D — controller JS
   ══════════════════════════════════════════════════════════════════════════
   Painel do módulo Logo 3D. Workflow:
     1. Usuário clica "Carregar" → Ruby abre UI.openpanel (DXF/DWG)
     2. Ruby parseia paths 2D + extrai dimensões do header
     3. JS desenha os paths no canvas e pré-preenche W/H da imagem
     4. Usuário ajusta params (dimensões, extrusão, tipo, cor, contorno)
     5. Clica "Gerar" → Ruby importa + extruda

   Canvas: só visualização (não há drag/scale aqui — o DXF é fixo)
   Suporta pan (middle-click) e zoom (scroll wheel) como o Textura Sync.
   ══════════════════════════════════════════════════════════════════════════ */

const Logo3d = {

  // ════════════════════════════════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════════════════════════════════
  state: {
    filename: null,
    path: null,
    paths_2d: [],         // [[[x,y],[x,y],...], ...] — todos os paths (raw do DXF)
    outerOnly: [],        // cache dos paths exteriores (miolos removidos)
    interiorFlags: [],    // mesma ordem de paths_2d, true = é miolo
    origDims: null,       // [w_mm, h_mm, factor]
    origAspect: 1,
    // Canvas viewport (pan/zoom)
    view: {
      offsetX: 400,
      offsetY: 240,
      scale:   1.0
    },
    panning: false,
    panStart: null,
    lockRatio: true,
    keepMiolos: true      // mostra/extruda os miolos das letras
  },

  // ════════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════════
  init() {
    Logo3d._bindButtons();
    Logo3d._bindInputs();
    Logo3d._bindCanvas();
    Logo3d._resizeCanvas();
    if (typeof ResizeObserver !== 'undefined') {
      const canvas = document.getElementById('l3_canvas');
      if (canvas) new ResizeObserver(() => Logo3d._resizeCanvas()).observe(canvas);
    }
    Logo3d._showEmpty();
  },

  _resizeCanvas() {
    const canvas = document.getElementById('l3_canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(100, Math.round(rect.width));
    const h = Math.max(100, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      Logo3d._render();
    }
  },

  // ════════════════════════════════════════════════════════════════════════
  // BINDINGS
  // ════════════════════════════════════════════════════════════════════════
  _bindButtons() {
    document.getElementById('l3_btn_carregar').addEventListener('click', Logo3d.carregar);
    document.getElementById('l3_btn_gerar').addEventListener('click', Logo3d.gerar);
    document.getElementById('l3_btn_fit').addEventListener('click', Logo3d._fitView);
  },

  _bindInputs() {
    const el = (id) => document.getElementById(id);

    // Lock ratio (padlock) toggle
    const lockBtn = el('l3_lock_ratio');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        Logo3d.state.lockRatio = !Logo3d.state.lockRatio;
        lockBtn.classList.toggle('is-locked', Logo3d.state.lockRatio);
        lockBtn.title = Logo3d.state.lockRatio
          ? 'Proporção travada (clique pra destravar)'
          : 'Proporção livre (clique pra travar)';
      });
    }

    // Width / height sync with lockRatio
    const inW = el('l3_input_largura');
    const inH = el('l3_input_altura');
    if (inW && inH) {
      inW.addEventListener('input', () => {
        if (Logo3d.state.lockRatio && Logo3d.state.origAspect > 0) {
          const w = parseFloat(inW.value) || 0;
          inH.value = Math.round(w / Logo3d.state.origAspect);
        }
        Logo3d._updateInfo();
      });
      inH.addEventListener('input', () => {
        if (Logo3d.state.lockRatio && Logo3d.state.origAspect > 0) {
          const h = parseFloat(inH.value) || 0;
          inW.value = Math.round(h * Logo3d.state.origAspect);
        }
        Logo3d._updateInfo();
      });
    }

    // Miolos toggle — re-renderiza o canvas pra mostrar/ocultar interiores
    const miolosToggle = el('l3_input_miolos');
    if (miolosToggle) {
      miolosToggle.addEventListener('change', () => {
        Logo3d.state.keepMiolos = miolosToggle.checked;
        Logo3d._render();
      });
    }
  },

  _bindCanvas() {
    const canvas = document.getElementById('l3_canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', Logo3d._onMouseDown);
    canvas.addEventListener('mousemove', Logo3d._onMouseMove);
    canvas.addEventListener('mouseup',   Logo3d._onMouseUp);
    canvas.addEventListener('mouseleave', Logo3d._onMouseUp);
    canvas.addEventListener('wheel',     Logo3d._onWheel, { passive: false });
    canvas.addEventListener('auxclick',   (e) => { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // ════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════════════════════

  async carregar() {
    try {
      const result = await Bridge.call('logo3d_carregar', {});
      if (!result || !result.ok) {
        const code = (result && result.code) || 'logo3d.error';
        // logo3d.server traz a mensagem pronta do servidor (licença/conexão)
        if (code === 'logo3d.server' && result.error) Toast.error(result.error);
        else if (code !== 'logo3d.cancelled') Toast.error(Logo3d._errorMessage(code));
        return;
      }

      // Reset: descarta tudo do arquivo anterior antes de aplicar o novo.
      Logo3d._resetState();

      const st = Logo3d.state;
      st.filename = result.filename;
      st.path     = result.path;
      st.paths_2d = result.paths_2d || [];
      st.origDims = result.dims_mm || null;
      st.origAspect = (st.origDims && st.origDims[1] > 0)
        ? st.origDims[0] / st.origDims[1]
        : 1;

      // Detecta quais paths são "miolos" (contornos internos de letras)
      st.interiorFlags = Logo3d._detectInteriorPaths(st.paths_2d);

      // Pré-preenche largura/altura com as dimensões originais
      if (st.origDims) {
        document.getElementById('l3_input_largura').value = Math.round(st.origDims[0]);
        document.getElementById('l3_input_altura').value  = Math.round(st.origDims[1]);
      }

      Logo3d._showWorkspace();
      Logo3d._updateStatus();
      Logo3d._updateInfo();
      // Espera o layout do canvas (workspace acabou de ser exibido) antes de
      // medir e ajustar — senão o fit calcula contra o tamanho antigo/minúsculo.
      requestAnimationFrame(() => {
        Logo3d._resizeCanvas();
        Logo3d._fitView();
      });
      document.getElementById('l3_btn_gerar').disabled = false;

      if (st.paths_2d.length > 0) {
        Toast.success(`"${result.filename}" carregado — ${st.paths_2d.length} path(s) detectado(s).`);
      } else if (result.is_dxf) {
        Toast.info(`"${result.filename}" carregado (DXF não pôde ser previewado — segue pra geração).`);
      } else {
        Toast.info(`"${result.filename}" carregado (DWG não tem preview 2D — mas a geração vai usar o importador nativo do SketchUp).`);
      }
    } catch (e) {
      Toast.error('Erro: ' + (e.message || '?'));
    }
  },

  async gerar() {
    const el = (id) => document.getElementById(id);
    const getNum = (id) => Number(el(id).value) || 0;

    const largura  = getNum('l3_input_largura');
    const altura   = getNum('l3_input_altura');
    const extrusao = getNum('l3_input_extrusao');
    if (largura <= 0 || altura <= 0 || extrusao <= 0) {
      return Toast.error('Dimensões e extrusão devem ser maiores que zero.');
    }

    // Cor principal (hex → rgb)
    const corHex = el('l3_input_cor').value || '#b4b4b4';
    const corRgb = Logo3d._hexToRgb(corHex);
    const corNome = el('l3_input_cor_nome').value.trim() || 'Logo3D';

    const payload = {
      largura, altura, extrusao,
      cor_nome: corNome,
      cor_r: corRgb.r, cor_g: corRgb.g, cor_b: corRgb.b,
      keep_miolos: Logo3d.state.keepMiolos
    };

    try {
      const btn = el('l3_btn_gerar');
      btn.disabled = true;
      const result = await Bridge.call('logo3d_gerar', payload);
      btn.disabled = false;

      if (!result || !result.ok) {
        const code = (result && result.code) || 'logo3d.error';
        Toast.error(Logo3d._errorMessage(code));
        return;
      }

      Toast.success(`Logo 3D gerado! ${result.n_faces} forma(s) extrudada(s).`, { duration: 4000 });
    } catch (e) {
      Toast.error('Erro: ' + (e.message || '?'));
      document.getElementById('l3_btn_gerar').disabled = false;
    }
  },

  // ════════════════════════════════════════════════════════════════════════
  // CANVAS PAN / ZOOM
  // ════════════════════════════════════════════════════════════════════════
  _worldToCanvas(wx, wy) {
    const v = Logo3d.state.view;
    return {
      x: v.offsetX + wx * v.scale,
      y: v.offsetY - wy * v.scale
    };
  },
  _canvasToWorld(cx, cy) {
    const v = Logo3d.state.view;
    return {
      x: (cx - v.offsetX) / v.scale,
      y: (v.offsetY - cy) / v.scale
    };
  },

  _onMouseDown(e) {
    if (e.button !== 1) return;
    e.preventDefault();
    Logo3d.state.panning = true;
    Logo3d.state.panStart = {
      mx: e.offsetX,
      my: e.offsetY,
      offsetX: Logo3d.state.view.offsetX,
      offsetY: Logo3d.state.view.offsetY,
      shift: e.shiftKey
    };
    e.currentTarget.style.cursor = e.shiftKey ? 'all-scroll' : 'grabbing';
  },

  _onMouseMove(e) {
    const st = Logo3d.state;
    if (!st.panning) return;
    const ps = st.panStart;
    const factor = ps.shift ? 0.2 : 1.0;
    st.view.offsetX = ps.offsetX + (e.offsetX - ps.mx) * factor;
    st.view.offsetY = ps.offsetY + (e.offsetY - ps.my) * factor;
    Logo3d._render();
  },

  _onMouseUp(e) {
    if (Logo3d.state.panning) {
      Logo3d.state.panning = false;
      Logo3d.state.panStart = null;
      if (e.currentTarget) e.currentTarget.style.cursor = 'default';
    }
  },

  _onWheel(e) {
    e.preventDefault();
    const v = Logo3d.state.view;
    const worldBefore = Logo3d._canvasToWorld(e.offsetX, e.offsetY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    v.scale = Math.max(0.001, Math.min(100, v.scale * factor));
    const worldAfter = Logo3d._canvasToWorld(e.offsetX, e.offsetY);
    v.offsetX += (worldAfter.x - worldBefore.x) * v.scale;
    v.offsetY -= (worldAfter.y - worldBefore.y) * v.scale;
    Logo3d._render();
  },

  _fitView() {
    const canvas = document.getElementById('l3_canvas');
    const st = Logo3d.state;
    if (!canvas || !st.paths_2d.length) return;

    let minX =  Infinity, maxX = -Infinity;
    let minY =  Infinity, maxY = -Infinity;
    st.paths_2d.forEach(pth => {
      pth.forEach(pt => {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      });
    });

    const cw = (maxX - minX) || 100;
    const ch = (maxY - minY) || 100;
    const padding = 40;
    const sx = (canvas.width  - padding * 2) / cw;
    const sy = (canvas.height - padding * 2) / ch;
    st.view.scale = Math.min(sx, sy) * 0.95;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    st.view.offsetX = canvas.width  / 2 - cx * st.view.scale;
    st.view.offsetY = canvas.height / 2 + cy * st.view.scale;
    Logo3d._render();
  },

  // ════════════════════════════════════════════════════════════════════════
  // DETECÇÃO DE MIOLOS (contornos internos)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Para cada path, decide se é um "miolo" (furo) usando EVEN-ODD — igual ao
   * fill-rule do SVG e à lógica da geração. Um subpath é furo quando está
   * aninhado um número ÍMPAR de vezes dentro de outros subpaths.
   * Usa um ponto garantidamente interno (scanline), não o centroide — o
   * centroide do contorno externo de letras como A/R cai dentro do próprio
   * furo e dava falso-positivo.
   * Retorna array de booleans (mesma ordem de paths).
   */
  _detectInteriorPaths(paths) {
    const n = paths.length;
    const flags = new Array(n).fill(false);
    if (n < 2) return flags;

    const innerPts = paths.map(pth => Logo3d._interiorPoint(pth));

    for (let i = 0; i < n; i++) {
      const p = innerPts[i];
      if (!p) continue;
      let depth = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (paths[j].length < 3) continue;
        if (Logo3d._pointInPolygon(p, paths[j])) depth++;
      }
      flags[i] = (depth % 2) === 1;
    }
    return flags;
  },

  /** Ponto garantidamente dentro de um polígono simples (scanline na altura do centroide) */
  _interiorPoint(poly) {
    if (!poly || poly.length < 3) return null;
    let cy = 0;
    poly.forEach(pt => { cy += pt[1]; });
    cy /= poly.length;
    const xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i][1], yj = poly[j][1];
      const xi = poly[i][0], xj = poly[j][0];
      if ((yi > cy) !== (yj > cy)) {
        xs.push(xi + (cy - yi) / ((yj - yi) || 1e-12) * (xj - xi));
      }
    }
    if (xs.length >= 2) {
      xs.sort((a, b) => a - b);
      return [(xs[0] + xs[1]) / 2, cy];
    }
    let cx = 0;
    poly.forEach(pt => { cx += pt[0]; });
    return [cx / poly.length, cy];
  },

  /** Ray-casting ponto-em-polígono (2D) */
  _pointInPolygon(pt, polygon) {
    const x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  _render() {
    const canvas = document.getElementById('l3_canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const st = Logo3d.state;
    if (!st.paths_2d.length) return;

    const isClosed = (pth) => {
      if (pth.length < 3) return false;
      const a = pth[0], b = pth[pth.length - 1];
      return Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
    };
    const trace = (pth) => {
      pth.forEach((pt, i) => {
        const c = Logo3d._worldToCanvas(pt[0], pt[1]);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.closePath();
    };

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#d4af37';
    ctx.fillStyle = 'rgba(212, 175, 55, 0.18)';

    const closed = st.paths_2d.filter(isClosed);
    const open = st.paths_2d.filter(p => p.length >= 2 && !isClosed(p));

    if (st.keepMiolos) {
      // Even-odd: os furos (miolos) ficam vazios — igual ao fill-rule do SVG
      // e ao resultado da geração.
      ctx.beginPath();
      closed.forEach(trace);
      ctx.fill('evenodd');
      ctx.stroke();
    } else {
      // Sem miolos: cada contorno preenchido sólido → o furo some (letra cheia).
      closed.forEach(pth => {
        ctx.beginPath();
        trace(pth);
        ctx.fill();
        ctx.stroke();
      });
    }

    // Paths abertos (linhas soltas) — só traço.
    open.forEach(pth => {
      ctx.beginPath();
      pth.forEach((pt, i) => {
        const c = Logo3d._worldToCanvas(pt[0], pt[1]);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();
    });

    ctx.restore();

    // Eixos sutis
    Logo3d._drawAxes(ctx, canvas.width, canvas.height);

    // Legenda no canto indicando o modo
    Logo3d._drawLegend(ctx, canvas.width, canvas.height);
  },

  _drawLegend(ctx, W, H) {
    const st = Logo3d.state;
    const interiorCount = st.interiorFlags.filter(Boolean).length;
    if (interiorCount === 0) return;
    const msg = st.keepMiolos
      ? `${interiorCount} miolo(s) detectado(s) · MANTER`
      : `${interiorCount} miolo(s) detectado(s) · REMOVER (em vermelho)`;
    ctx.save();
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    const metrics = ctx.measureText(msg);
    const pad = 8;
    const w = metrics.width + pad * 2;
    const h = 22;
    const x = 10;
    const y = H - h - 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = st.keepMiolos ? '#d4af37' : '#dc2626';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = st.keepMiolos ? '#d4af37' : '#dc2626';
    ctx.fillText(msg, x + pad, y + 15);
    ctx.restore();
  },

  _drawAxes(ctx, W, H) {
    const origin = Logo3d._worldToCanvas(0, 0);
    if (origin.x < 0 || origin.x > W || origin.y < 0 || origin.y > H) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, origin.y); ctx.lineTo(W, origin.y);
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, H);
    ctx.stroke();
    ctx.restore();
  },

  // ════════════════════════════════════════════════════════════════════════
  // UI HELPERS
  // ════════════════════════════════════════════════════════════════════════

  // Limpa o estado de um arquivo anterior (mantém as preferências do usuário:
  // proporção, miolos, tipo, cor, contorno). Chamado a cada novo carregamento
  // pra não arrastar dados/preview do arquivo gerado anteriormente.
  _resetState() {
    const st = Logo3d.state;
    st.filename = null;
    st.path = null;
    st.paths_2d = [];
    st.outerOnly = [];
    st.interiorFlags = [];
    st.origDims = null;
    st.origAspect = 1;
    st.view = { offsetX: 400, offsetY: 240, scale: 1.0 };
    st.panning = false;
    st.panStart = null;
    const canvas = document.getElementById('l3_canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  },

  _showEmpty() {
    document.getElementById('l3_empty').hidden = false;
    document.getElementById('l3_workspace').hidden = true;
    document.getElementById('l3_status').hidden = true;
  },

  _showWorkspace() {
    document.getElementById('l3_empty').hidden = true;
    document.getElementById('l3_workspace').hidden = false;
  },

  _updateStatus() {
    const st = Logo3d.state;
    document.getElementById('l3_status').hidden = false;
    document.getElementById('l3_status_file').textContent = st.filename || '—';
    document.getElementById('l3_status_paths').textContent = st.paths_2d.length;
    if (st.origDims) {
      const w = Math.round(st.origDims[0]);
      const h = Math.round(st.origDims[1]);
      document.getElementById('l3_status_dims').textContent = `${w} × ${h} mm`;
    } else {
      document.getElementById('l3_status_dims').textContent = '—';
    }
  },

  _updateInfo() {
    const st = Logo3d.state;
    const w = Number(document.getElementById('l3_input_largura').value) || 0;
    const h = Number(document.getElementById('l3_input_altura').value) || 0;
    document.getElementById('l3_info_orig_dims').textContent =
      st.origDims ? `${Math.round(st.origDims[0])} × ${Math.round(st.origDims[1])} mm` : '—';
    if (w > 0 && h > 0) {
      const ratio = (w / h).toFixed(2);
      document.getElementById('l3_info_aspect').textContent = `${ratio} : 1`;
    } else {
      document.getElementById('l3_info_aspect').textContent = '—';
    }
  },

  _hexToRgb(hex) {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return { r: 180, g: 180, b: 180 };
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  },

  _errorMessage(code) {
    const map = {
      'logo3d.cancelled':        'Seleção cancelada.',
      'logo3d.invalid_file':     'Arquivo inválido.',
      'logo3d.invalid_ext':      'Formato não suportado. Use DXF, DWG ou SVG.',
      'logo3d.no_file':          'Carregue um arquivo primeiro.',
      'logo3d.invalid_size':     'Dimensões inválidas.',
      'logo3d.import_failed':    'Falha ao importar o arquivo. Verifique se é DXF/DWG válido.',
      'logo3d.no_geometry':      'O arquivo importado não tem geometria.',
      'logo3d.no_faces_created': 'Nenhuma face criada. Verifique se o arquivo tem contornos fechados.',
      'logo3d.extrusion_failed': 'Falha ao extrudar as faces.',
      'logo3d.exception':        'Erro inesperado no plugin.'
    };
    return map[code] || ('Erro: ' + code);
  }
};

window.Logo3d = Logo3d;
