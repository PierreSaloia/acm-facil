/* ══════════════════════════════════════════════════════════════════════════
   TEXTURA SINCRONIZADA — controller JS
   ══════════════════════════════════════════════════════════════════════════
   Canvas 2D interativo:
     - Renderiza os polígonos das faces capturadas (branco, com buracos)
     - Desenha a imagem carregada num retângulo editável
     - Drag pra mover · 4 handles de canto pra escalar · 1 handle pro rotação
     - Inputs numéricos sincronizam com o canvas (bidirecional)
     - Scroll do mouse faz zoom do viewport (não afeta escala da textura)

   Unidades internas: TUDO em mm (igual ao Ruby backend).
   Coordenadas mundo → canvas: view transform (pan + zoom)
   ══════════════════════════════════════════════════════════════════════════ */

const TexturaSync = {

  // ════════════════════════════════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════════════════════════════════
  state: {
    // Capturado do Ruby
    captured: null,           // { plane, bbox, faces, n }
    // Imagem
    image: null,              // HTMLImageElement
    imageFilename: null,
    imageSize: { w: 0, h: 0 },
    imageDataUrl: null,
    imageAspect: 1,
    // Retângulo da textura no mundo (mm)
    tex: {
      x: 0, y: 0,             // centro em mm
      w: 1000, h: 1000,       // dimensões em mm
      rot: 0                  // graus (horário)
    },
    // Viewport (pan/zoom do canvas)
    view: {
      offsetX: 400,           // canvas center X
      offsetY: 250,           // canvas center Y
      scale:   0.1            // mm → pixel
    },
    // Interação
    dragging: null,           // null | 'move' | 'scale-nw' | 'scale-ne' | 'scale-sw' | 'scale-se' | 'rotate'
    dragStart: null,          // { mx, my, tex: {...snapshot} }
    lockRatio: true,
    // Pan da viewport (middle mouse button)
    panning: false,
    panStart: null            // { mx, my, offsetX, offsetY, shift }
  },

  // ════════════════════════════════════════════════════════════════════════
  // INIT — chamado pelo router depois do HTML/CSS ser injetado
  // ════════════════════════════════════════════════════════════════════════
  init() {
    TexturaSync._bindButtons();
    TexturaSync._bindInputs();
    TexturaSync._bindCanvas();
    TexturaSync._resizeCanvas();
    // Observa mudanças no tamanho visível do canvas (janela redimensionada)
    if (typeof ResizeObserver !== 'undefined') {
      const canvas = document.getElementById('ts_canvas');
      if (canvas) {
        const ro = new ResizeObserver(() => TexturaSync._resizeCanvas());
        ro.observe(canvas);
      }
    }
    // Primeira renderização (empty state visível)
    TexturaSync._showEmpty();
  },

  /**
   * Sincroniza o buffer interno do canvas com o tamanho de display.
   * Sem isso, o browser estica um buffer de 800×500 pra (ex) 1200×500 e
   * as coordenadas do mouse ficam DEFASADAS das coordenadas do desenho
   * (aí só a metade esquerda respondia a clicks).
   */
  _resizeCanvas() {
    const canvas = document.getElementById('ts_canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(100, Math.round(rect.width));
    const h = Math.max(100, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
      TexturaSync._render();
    }
  },

  // ════════════════════════════════════════════════════════════════════════
  // BINDINGS
  // ════════════════════════════════════════════════════════════════════════
  _bindButtons() {
    document.getElementById('ts_btn_capturar').addEventListener('click', TexturaSync.capturar);
    document.getElementById('ts_btn_carregar').addEventListener('click', TexturaSync.carregarImagem);
    document.getElementById('ts_btn_aplicar').addEventListener('click', TexturaSync.aplicar);
    document.getElementById('ts_btn_fit').addEventListener('click', TexturaSync._fitView);
    document.getElementById('ts_btn_center_texture').addEventListener('click', TexturaSync._centerTexture);
    document.getElementById('ts_btn_reset_texture').addEventListener('click', TexturaSync._resetTexture);
  },

  _bindInputs() {
    const sync = (id, key, parser = parseFloat) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = parser(el.value);
        if (!isNaN(v)) {
          TexturaSync.state.tex[key] = v;
          TexturaSync._updateInputsFromState(); // propaga (ex: manter proporção)
          TexturaSync._render();
        }
      });
    };
    sync('ts_input_x', 'x');
    sync('ts_input_y', 'y');
    sync('ts_input_w', 'w');
    sync('ts_input_h', 'h');
    sync('ts_input_rot', 'rot');

    // Slider de rotação (sincronizado com o input numérico)
    const slider = document.getElementById('ts_input_rot_slider');
    if (slider) {
      slider.addEventListener('input', () => {
        TexturaSync.state.tex.rot = parseFloat(slider.value) || 0;
        document.getElementById('ts_input_rot').value = TexturaSync.state.tex.rot;
        TexturaSync._render();
      });
    }

    // Lock ratio — botão toggle com ícone de cadeado
    const lockBtn = document.getElementById('ts_lock_ratio');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        TexturaSync.state.lockRatio = !TexturaSync.state.lockRatio;
        lockBtn.classList.toggle('is-locked', TexturaSync.state.lockRatio);
        lockBtn.title = TexturaSync.state.lockRatio
          ? 'Proporção travada (clique pra destravar)'
          : 'Proporção livre (clique pra travar na imagem)';
      });
    }
  },

  _bindCanvas() {
    const canvas = document.getElementById('ts_canvas');
    if (!canvas) return;

    // Mouse events
    canvas.addEventListener('mousedown', TexturaSync._onCanvasMouseDown);
    canvas.addEventListener('mousemove', TexturaSync._onCanvasMouseMove);
    canvas.addEventListener('mouseup',   TexturaSync._onCanvasMouseUp);
    canvas.addEventListener('mouseleave', TexturaSync._onCanvasMouseUp);
    canvas.addEventListener('wheel',     TexturaSync._onCanvasWheel, { passive: false });

    // Desabilita o auto-scroll nativo do navegador (botão do meio)
    canvas.addEventListener('auxclick',   (e) => { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // ════════════════════════════════════════════════════════════════════════
  // ACTIONS (Bridge calls)
  // ════════════════════════════════════════════════════════════════════════

  async capturar() {
    try {
      const result = await Bridge.call('texturasync_capturar', {});
      if (!result || !result.ok) {
        const code = (result && result.code) || 'texturasync.error';
        // texturasync.server traz a mensagem pronta (licença/conexão)
        if (code === 'texturasync.server' && result.error) Toast.error(result.error);
        else Toast.error(TexturaSync._errorMessage(code));
        return;
      }

      TexturaSync.state.captured = result;

      // Calcula bbox e inicializa retângulo da textura
      const [xmin, ymin, xmax, ymax] = result.bbox;
      const bw = xmax - xmin;
      const bh = ymax - ymin;
      TexturaSync.state.tex = {
        x: (xmin + xmax) / 2,
        y: (ymin + ymax) / 2,
        w: bw > 0 ? bw : 1000,
        h: bh > 0 ? bh : 1000,
        rot: 0
      };

      TexturaSync._showWorkspace();
      TexturaSync._updateStatus();
      TexturaSync._updateInputsFromState();
      TexturaSync._fitView();
      TexturaSync._render();

      // Habilita próximo passo
      document.getElementById('ts_btn_carregar').disabled = false;
      Toast.success(`${result.n} face(s) capturada(s) no plano ${result.plane.toUpperCase()}.`);
    } catch (e) {
      Toast.error('Erro: ' + (e.message || '?'));
    }
  },

  async carregarImagem() {
    try {
      const result = await Bridge.call('texturasync_carregar_imagem', {});
      if (!result || !result.ok) {
        const code = (result && result.code) || 'texturasync.error';
        if (code !== 'texturasync.cancelled') {
          Toast.error(TexturaSync._errorMessage(code));
        }
        return;
      }

      // Carrega a imagem no navegador
      const img = new Image();
      img.onload = () => {
        TexturaSync.state.image         = img;
        TexturaSync.state.imageFilename = result.filename;
        TexturaSync.state.imageSize     = { w: img.width, h: img.height };
        TexturaSync.state.imageDataUrl  = result.data_url;
        TexturaSync.state.imageAspect   = img.width / img.height;

        // Ajusta a proporção inicial da textura pra bater com a imagem
        if (TexturaSync.state.lockRatio && TexturaSync.state.tex.w > 0) {
          TexturaSync.state.tex.h = TexturaSync.state.tex.w / TexturaSync.state.imageAspect;
        }

        TexturaSync._updateStatus();
        TexturaSync._updateInputsFromState();
        TexturaSync._render();
        document.getElementById('ts_btn_aplicar').disabled = false;
        Toast.success(`Imagem "${result.filename}" carregada (${img.width}×${img.height}).`);
      };
      img.onerror = () => Toast.error('Falha ao decodificar a imagem.');
      img.src = result.data_url;
    } catch (e) {
      Toast.error('Erro: ' + (e.message || '?'));
    }
  },

  async aplicar() {
    const tex = TexturaSync.state.tex;
    if (!TexturaSync.state.captured) return Toast.error('Capture as faces primeiro.');
    if (!TexturaSync.state.image)     return Toast.error('Carregue uma imagem primeiro.');

    try {
      const result = await Bridge.call('texturasync_aplicar', {
        tx_x:   tex.x,
        tx_y:   tex.y,
        tx_w:   tex.w,
        tx_h:   tex.h,
        tx_rot: tex.rot
      });
      if (!result || !result.ok) {
        const code = (result && result.code) || 'texturasync.error';
        // texturasync.server traz a mensagem pronta (licença/conexão)
        if (code === 'texturasync.server' && result.error) Toast.error(result.error);
        else Toast.error(TexturaSync._errorMessage(code));
        return;
      }
      Toast.success(`Textura aplicada em ${result.n_faces_aplicadas} face(s)! ✓`);
    } catch (e) {
      Toast.error('Erro: ' + (e.message || '?'));
    }
  },

  // ════════════════════════════════════════════════════════════════════════
  // CANVAS INTERACTION
  // ════════════════════════════════════════════════════════════════════════

  _worldToCanvas(wx, wy) {
    const v = TexturaSync.state.view;
    return {
      x: v.offsetX + wx * v.scale,
      // Inverte Y (mundo → tela: +Y pra cima no mundo, pra baixo na tela)
      y: v.offsetY - wy * v.scale
    };
  },

  _canvasToWorld(cx, cy) {
    const v = TexturaSync.state.view;
    return {
      x: (cx - v.offsetX) / v.scale,
      y: (v.offsetY - cy) / v.scale
    };
  },

  /** Retorna os 4 cantos do retângulo de textura no mundo (ignorando rotação) */
  _texCorners() {
    const t = TexturaSync.state.tex;
    const hw = t.w / 2;
    const hh = t.h / 2;
    // Corners in "texture local" space (pré-rotação)
    const local = [
      { x: -hw, y:  hh, key: 'nw' },
      { x:  hw, y:  hh, key: 'ne' },
      { x: -hw, y: -hh, key: 'sw' },
      { x:  hw, y: -hh, key: 'se' }
    ];
    const rot = (t.rot * Math.PI) / 180;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    return local.map(p => ({
      x: t.x + p.x * ca - p.y * sa,
      y: t.y + p.x * sa + p.y * ca,
      key: p.key
    }));
  },

  /** Retorna o ponto do "rotation handle" no mundo (acima do meio do topo) */
  _texRotationHandle() {
    const t = TexturaSync.state.tex;
    const rot = (t.rot * Math.PI) / 180;
    // Ponto acima do centro, distância = h/2 + 300mm (em mundo)
    const localY = t.h / 2 + 300;
    return {
      x: t.x - localY * Math.sin(rot),
      y: t.y + localY * Math.cos(rot)
    };
  },

  /** Detecta qual handle está sob o mouse (retorna 'move' | 'scale-xx' | 'rotate' | null) */
  _hitTest(mx, my) {
    const HANDLE_PX = 10;
    const corners = TexturaSync._texCorners();
    for (const c of corners) {
      const p = TexturaSync._worldToCanvas(c.x, c.y);
      if (Math.abs(p.x - mx) <= HANDLE_PX && Math.abs(p.y - my) <= HANDLE_PX) {
        return 'scale-' + c.key;
      }
    }
    const rh = TexturaSync._texRotationHandle();
    const rp = TexturaSync._worldToCanvas(rh.x, rh.y);
    if (Math.abs(rp.x - mx) <= HANDLE_PX && Math.abs(rp.y - my) <= HANDLE_PX) {
      return 'rotate';
    }
    // Dentro do retângulo?
    if (TexturaSync._pointInRect(mx, my)) return 'move';
    return null;
  },

  _pointInRect(mx, my) {
    const world = TexturaSync._canvasToWorld(mx, my);
    const t = TexturaSync.state.tex;
    const rot = -(t.rot * Math.PI) / 180; // inverso
    const dx = world.x - t.x;
    const dy = world.y - t.y;
    const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
    const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
    return Math.abs(rx) <= t.w / 2 && Math.abs(ry) <= t.h / 2;
  },

  _onCanvasMouseDown(e) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // ── Botão do meio (scroll click) = pan da viewport ──
    //    Shift + scroll click = pan em modo lento (ajuste fino)
    if (e.button === 1) {
      e.preventDefault();
      TexturaSync.state.panning = true;
      TexturaSync.state.panStart = {
        mx, my,
        offsetX: TexturaSync.state.view.offsetX,
        offsetY: TexturaSync.state.view.offsetY,
        shift:   e.shiftKey
      };
      canvas.style.cursor = e.shiftKey ? 'all-scroll' : 'grabbing';
      return;
    }

    // ── Botão esquerdo = interação com objetos ──
    if (e.button !== 0) return;

    const mode = TexturaSync._hitTest(mx, my);
    if (!mode) return;
    TexturaSync.state.dragging = mode;
    const dragStart = {
      mx, my,
      tex: { ...TexturaSync.state.tex }
    };

    // Pra scale, pré-calcula o WORLD position do canto oposto (âncora fixa)
    if (mode.startsWith('scale-')) {
      const corner = mode.split('-')[1]; // nw/ne/sw/se
      // Oposto: troca N↔S e E↔W
      const oppN = corner[0] === 'n' ? 's' : 'n';
      const oppE = corner[1] === 'e' ? 'w' : 'e';
      const oppKey = oppN + oppE;
      // Posição local pré-rotação do canto oposto
      const t = TexturaSync.state.tex;
      const signX = oppKey[1] === 'e' ? +1 : -1;
      const signY = oppKey[0] === 'n' ? +1 : -1;
      const localX = signX * t.w / 2;
      const localY = signY * t.h / 2;
      // Roda + translada pra world
      const rot = (t.rot * Math.PI) / 180;
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      dragStart.anchorWorld = {
        x: t.x + localX * ca - localY * sa,
        y: t.y + localX * sa + localY * ca
      };
      dragStart.corner = corner;
    }

    TexturaSync.state.dragStart = dragStart;
    canvas.style.cursor =
      mode === 'rotate' ? 'crosshair' :
      mode === 'move'   ? 'move'      :
      (mode === 'scale-nw' || mode === 'scale-se') ? 'nwse-resize' :
      'nesw-resize';
  },

  _onCanvasMouseMove(e) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const st = TexturaSync.state;

    // ── Pan da viewport (middle mouse drag) ──
    if (st.panning) {
      const ps = st.panStart;
      const rawDx = mx - ps.mx;
      const rawDy = my - ps.my;
      // Shift segurado = movimento fino (1/5 da velocidade)
      const factor = ps.shift ? 0.2 : 1.0;
      st.view.offsetX = ps.offsetX + rawDx * factor;
      st.view.offsetY = ps.offsetY + rawDy * factor;
      TexturaSync._render();
      return;
    }

    if (!st.dragging) {
      // Hover: muda cursor
      const mode = TexturaSync._hitTest(mx, my);
      canvas.style.cursor = mode === 'rotate' ? 'crosshair' :
                            mode === 'move'   ? 'move'      :
                            mode && mode.startsWith('scale') ? 'nwse-resize' :
                            'default';
      return;
    }

    const start = st.dragStart;
    const world0 = TexturaSync._canvasToWorld(start.mx, start.my);
    const world1 = TexturaSync._canvasToWorld(mx, my);
    const dx = world1.x - world0.x;
    const dy = world1.y - world0.y;

    if (st.dragging === 'move') {
      st.tex.x = start.tex.x + dx;
      st.tex.y = start.tex.y + dy;
    } else if (st.dragging === 'rotate') {
      // Calcula ângulo do centro até o mouse
      const ang0 = Math.atan2(world0.y - start.tex.y, world0.x - start.tex.x);
      const ang1 = Math.atan2(world1.y - start.tex.y, world1.x - start.tex.x);
      const deltaDeg = ((ang1 - ang0) * 180) / Math.PI;
      st.tex.rot = start.tex.rot + deltaDeg;
      // Normaliza [-180, 180]
      while (st.tex.rot > 180)  st.tex.rot -= 360;
      while (st.tex.rot < -180) st.tex.rot += 360;
    } else if (st.dragging.startsWith('scale-')) {
      // ── RESIZE ANCORADO no canto oposto ──
      // O canto oposto (âncora) fica fixo no mundo; o canto arrastado
      // segue o mouse. Width/height = distância local entre eles.
      const anchorW = start.anchorWorld;
      const mouseWorld = TexturaSync._canvasToWorld(mx, my);
      // Des-rotaciona o vetor (anchor → mouse) pra espaço local
      const rot = -(start.tex.rot * Math.PI) / 180;
      const vx = mouseWorld.x - anchorW.x;
      const vy = mouseWorld.y - anchorW.y;
      const localX = vx * Math.cos(rot) - vy * Math.sin(rot);
      const localY = vx * Math.sin(rot) + vy * Math.cos(rot);

      let newW = Math.abs(localX);
      let newH = Math.abs(localY);

      // Lock ratio: força newH = newW / aspect (ou vice-versa)
      // usando o lado que teve maior deslocamento relativo como mestre
      if (st.lockRatio && st.imageAspect > 0) {
        const ar = st.imageAspect;
        // Compara "o quanto cresceu" relativamente em cada eixo
        if (newW / ar >= newH) {
          newH = newW / ar;
        } else {
          newW = newH * ar;
        }
      }

      // Clamp de mínimo (evita inverter a textura)
      newW = Math.max(10, newW);
      newH = Math.max(10, newH);

      // Direção do canto arrastado (pra saber onde está a 90° do anchor)
      const signX = Math.sign(localX) || 1;
      const signY = Math.sign(localY) || 1;

      // Novo canto arrastado em local (pré-rotação) a partir da âncora
      const newDraggedLocalX = signX * newW;
      const newDraggedLocalY = signY * newH;

      // Rotaciona de volta pro mundo e soma à âncora
      const fwd = (start.tex.rot * Math.PI) / 180;
      const ca = Math.cos(fwd);
      const sa = Math.sin(fwd);
      const newDraggedWorldX = anchorW.x + newDraggedLocalX * ca - newDraggedLocalY * sa;
      const newDraggedWorldY = anchorW.y + newDraggedLocalX * sa + newDraggedLocalY * ca;

      // Novo centro = ponto médio entre âncora e canto arrastado
      st.tex.x = (anchorW.x + newDraggedWorldX) / 2;
      st.tex.y = (anchorW.y + newDraggedWorldY) / 2;
      st.tex.w = newW;
      st.tex.h = newH;
    }

    TexturaSync._updateInputsFromState();
    TexturaSync._render();
  },

  _onCanvasMouseUp(e) {
    const st = TexturaSync.state;
    if (st.panning) {
      st.panning = false;
      st.panStart = null;
      if (e.currentTarget) e.currentTarget.style.cursor = 'default';
      return;
    }
    if (st.dragging) {
      st.dragging = null;
      st.dragStart = null;
      if (e.currentTarget) e.currentTarget.style.cursor = 'default';
    }
  },

  _onCanvasWheel(e) {
    e.preventDefault();
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = TexturaSync.state.view;

    // Pivô = mouse (pan corrige offset pra manter ponto sob o mouse)
    const worldBefore = TexturaSync._canvasToWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    v.scale = Math.max(0.001, Math.min(10, v.scale * factor));
    const worldAfter = TexturaSync._canvasToWorld(mx, my);
    v.offsetX += (worldAfter.x - worldBefore.x) * v.scale;
    v.offsetY -= (worldAfter.y - worldBefore.y) * v.scale;

    TexturaSync._render();
  },

  // ════════════════════════════════════════════════════════════════════════
  // VIEWPORT HELPERS
  // ════════════════════════════════════════════════════════════════════════

  _fitView() {
    const st = TexturaSync.state;
    if (!st.captured) return;
    const canvas = document.getElementById('ts_canvas');
    const [xmin, ymin, xmax, ymax] = st.captured.bbox;

    // Inclui o retângulo da textura no bbox de fit pra não ficar cortado
    const t = st.tex;
    const tCorners = TexturaSync._texCorners();
    const xs = [xmin, xmax, ...tCorners.map(c => c.x)];
    const ys = [ymin, ymax, ...tCorners.map(c => c.y)];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cw = maxX - minX || 1000;
    const ch = maxY - minY || 1000;

    const padding = 60;
    const sx = (canvas.width  - padding * 2) / cw;
    const sy = (canvas.height - padding * 2) / ch;
    st.view.scale = Math.min(sx, sy) * 0.95;

    // Centro do bbox no canvas
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    st.view.offsetX = canvas.width  / 2 - cx * st.view.scale;
    st.view.offsetY = canvas.height / 2 + cy * st.view.scale;
    TexturaSync._render();
  },

  _centerTexture() {
    const st = TexturaSync.state;
    if (!st.captured) return;
    const [xmin, ymin, xmax, ymax] = st.captured.bbox;
    st.tex.x = (xmin + xmax) / 2;
    st.tex.y = (ymin + ymax) / 2;
    TexturaSync._updateInputsFromState();
    TexturaSync._render();
  },

  _resetTexture() {
    const st = TexturaSync.state;
    if (!st.captured) return;
    const [xmin, ymin, xmax, ymax] = st.captured.bbox;
    const bw = xmax - xmin || 1000;
    const bh = ymax - ymin || 1000;
    st.tex = {
      x: (xmin + xmax) / 2,
      y: (ymin + ymax) / 2,
      w: bw,
      h: st.imageAspect > 0 ? bw / st.imageAspect : bh,
      rot: 0
    };
    TexturaSync._updateInputsFromState();
    TexturaSync._render();
  },

  _updateInputsFromState() {
    const t = TexturaSync.state.tex;
    const setIf = (id, val) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) {
        el.value = Number(val).toFixed(0);
      }
    };
    setIf('ts_input_x', t.x);
    setIf('ts_input_y', t.y);
    setIf('ts_input_w', t.w);
    setIf('ts_input_h', t.h);
    setIf('ts_input_rot', t.rot);
    const slider = document.getElementById('ts_input_rot_slider');
    if (slider && document.activeElement !== slider) slider.value = t.rot;
  },

  _updateStatus() {
    const st = TexturaSync.state;
    const statusBar = document.getElementById('ts_status');
    if (!st.captured) {
      if (statusBar) statusBar.hidden = true;
      return;
    }
    statusBar.hidden = false;
    document.getElementById('ts_status_faces').textContent = st.captured.n;
    document.getElementById('ts_status_plane').textContent = st.captured.plane.toUpperCase();
    const [xmin, ymin, xmax, ymax] = st.captured.bbox;
    const w = Math.round(xmax - xmin);
    const h = Math.round(ymax - ymin);
    document.getElementById('ts_status_dims').textContent = `${w} × ${h}`;
    document.getElementById('ts_status_image').textContent = st.imageFilename || '—';

    document.getElementById('ts_info_img_size').textContent =
      st.image ? `${st.imageSize.w} × ${st.imageSize.h} px` : '—';
    document.getElementById('ts_info_bbox').textContent = `${w} × ${h} mm`;
  },

  _showWorkspace() {
    document.getElementById('ts_empty').hidden = true;
    document.getElementById('ts_workspace').hidden = false;
  },

  _showEmpty() {
    document.getElementById('ts_empty').hidden = false;
    document.getElementById('ts_workspace').hidden = true;
    document.getElementById('ts_status').hidden = true;
  },

  // ════════════════════════════════════════════════════════════════════════
  // RENDER (canvas 2D)
  // ════════════════════════════════════════════════════════════════════════

  _render() {
    const canvas = document.getElementById('ts_canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const st = TexturaSync.state;
    if (!st.captured) return;

    // ── Renderiza a imagem rotacionada dentro do retângulo ──
    if (st.image) {
      const t = st.tex;
      const center = TexturaSync._worldToCanvas(t.x, t.y);
      const pw = t.w * st.view.scale;
      const ph = t.h * st.view.scale;
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(-(t.rot * Math.PI) / 180); // Y invertido no canvas, então rot invertida
      ctx.globalAlpha = 0.85;
      ctx.drawImage(st.image, -pw / 2, -ph / 2, pw, ph);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Renderiza as faces capturadas por cima (outline branco) ──
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    st.captured.faces.forEach(face => {
      // Outer loop
      ctx.beginPath();
      face.outer.forEach((p, i) => {
        const c = TexturaSync._worldToCanvas(p[0], p[1]);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner loops (buracos)
      face.inners.forEach(loop => {
        ctx.beginPath();
        loop.forEach((p, i) => {
          const c = TexturaSync._worldToCanvas(p[0], p[1]);
          if (i === 0) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
        });
        ctx.closePath();
        ctx.stroke();
      });
    });
    ctx.restore();

    // ── Renderiza o retângulo da textura (borda dourada) + handles ──
    if (st.image) TexturaSync._drawTexRect(ctx);

    // ── Renderiza régua central (eixos em dourado sutil) ──
    TexturaSync._drawAxes(ctx, W, H);
  },

  _drawTexRect(ctx) {
    const corners = TexturaSync._texCorners();
    const cornersScreen = corners.map(c => {
      const p = TexturaSync._worldToCanvas(c.x, c.y);
      return { ...p, key: c.key };
    });

    // Borda do retângulo
    ctx.save();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    // Ordem: NW → NE → SE → SW → NW
    const order = ['nw', 'ne', 'se', 'sw'];
    const byKey = Object.fromEntries(cornersScreen.map(c => [c.key, c]));
    order.forEach((k, i) => {
      const p = byKey[k];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Handles dos cantos
    const HANDLE = 10;
    ctx.fillStyle = '#d4af37';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    cornersScreen.forEach(c => {
      ctx.beginPath();
      ctx.rect(c.x - HANDLE / 2, c.y - HANDLE / 2, HANDLE, HANDLE);
      ctx.fill();
      ctx.stroke();
    });

    // Handle de rotação (círculo + linha até o centro do topo)
    const st = TexturaSync.state;
    const center = TexturaSync._worldToCanvas(st.tex.x, st.tex.y);
    const rh = TexturaSync._texRotationHandle();
    const rp = TexturaSync._worldToCanvas(rh.x, rh.y);
    // Linha do topo até o handle
    const topMid = {
      x: (byKey.nw.x + byKey.ne.x) / 2,
      y: (byKey.nw.y + byKey.ne.y) / 2
    };
    ctx.beginPath();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.5;
    ctx.moveTo(topMid.x, topMid.y);
    ctx.lineTo(rp.x, rp.y);
    ctx.stroke();

    // Círculo do handle
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crosshair no centro
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center.x - 8, center.y); ctx.lineTo(center.x + 8, center.y);
    ctx.moveTo(center.x, center.y - 8); ctx.lineTo(center.x, center.y + 8);
    ctx.stroke();
    ctx.restore();
  },

  _drawAxes(ctx, W, H) {
    const origin = TexturaSync._worldToCanvas(0, 0);
    if (origin.x < 0 || origin.x > W || origin.y < 0 || origin.y > H) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(W, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, H);
    ctx.stroke();
    ctx.restore();
  },

  // ════════════════════════════════════════════════════════════════════════
  // ERROR MESSAGES
  // ════════════════════════════════════════════════════════════════════════
  _errorMessage(code) {
    const map = {
      'texturasync.no_selection': 'Selecione faces ou grupos no SketchUp antes de capturar.',
      'texturasync.no_faces':     'Nenhuma face encontrada na seleção.',
      'texturasync.cancelled':    'Seleção de imagem cancelada.',
      'texturasync.invalid_file': 'Arquivo inválido.',
      'texturasync.invalid_ext':  'Formato não suportado. Use PNG, JPG ou BMP.',
      'texturasync.no_capture':   'Capture as faces primeiro.',
      'texturasync.no_image':     'Carregue uma imagem primeiro.',
      'texturasync.invalid_size': 'Largura/altura da textura inválidas.',
      'texturasync.apply_error':  'Erro ao aplicar a textura.',
      'texturasync.exception':    'Erro inesperado no plugin.'
    };
    return map[code] || ('Erro: ' + code);
  }
};

window.TexturaSync = TexturaSync;
