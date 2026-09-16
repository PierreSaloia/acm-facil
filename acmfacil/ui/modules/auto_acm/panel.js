/* ══════════════════════════════════════════════════════════════════════════
   AUTO-ACM — panel.js
   Namespace: window.AutoAcm
   FASES ATIVAS: 1 (captura de faces) + 2 (form base: ACM, metalon, faces)
   ══════════════════════════════════════════════════════════════════════════ */

// Paleta de 12 cores pra identificação de módulos (espelho dos --mod-color-*)
const AA_MOD_PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#84cc16', '#10b981',
  '#06b6d4', '#6366f1', '#d946ef', '#14b8a6'
];

window.AutoAcm = {
  state: {
    modulos: [],           // [{entity_id, idx, nome, w, h, d, n_faces, roles, params}]
    faceColors: [],        // [{dir, nome, rgb}]
    activeIdx: -1,
    loading: false,

    // Cores ACM (lazy)
    cores: {},             // { brilho: [...], fosco: [...], ... }
    ordemCat: [],          // ordem das categorias p/ tabs
    coresLoaded: false,
    activeCat: null,
    selectedColor: null,   // nome da cor ACM
    selectedColorRgb: [200, 200, 200],

    // Cores de junta (lazy)
    juntaColors: [],       // [{nome, rgb}]

    // Preview 2D
    planTool:     'pan',
    planDragIdx:  -1,
    planDragKind: null,    // 'V' | 'H'
    planXform:    null,
    // Câmera 2D (Fase E)
    zoom2D:       1.0,
    panX2D:       0,
    panY2D:       0,
    panning2D:    false,
    panLastX:     0,
    panLastY:     0,

    // Preview 3D
    rx:      -0.45,        // rotação eixo X (pitch)
    ry:       0.65,        // rotação eixo Z (yaw)
    zoom3D:   1.0,
    panX3D:   0,
    panY3D:   0,
    tool3D:  'orbit',      // 'orbit'|'cut'|'moveH'|'moveV'
    sym3D:   false,
    dragging3D: false,
    lastX3D: 0,
    lastY3D: 0,
    hoverId3D: null,
    hitRects3D: [],
    lastSt3D: null
  },

  /**
   * Chamado pelo Router logo após injetar o HTML/CSS/JS.
   */
  init() {
    console.log('[AutoAcm] init');

    // Reset visual: esconde tudo o que depende de captura
    AutoAcm._hideSection('aa_tabs_wrap');
    AutoAcm._hideSection('aa_box_info');
    AutoAcm._hideSection('aa_face_map_section');
    AutoAcm._hideSection('aa_enab_section');
    AutoAcm._hideSection('aa_acm_section');
    AutoAcm._hideSection('aa_junta_section');
    AutoAcm._hideSection('aa_emenda_section');
    AutoAcm._hideSection('aa_fita_section');
    AutoAcm._hideSection('aa_metalon_section');
    AutoAcm._hideSection('aa_spots_section');
    AutoAcm._hideSection('aa_preview_section');
    AutoAcm._hideSection('aa_preview3d_section');
    AutoAcm._hideSection('aa_resumo_section');
    AutoAcm._hideSection('aa_gerar_section');
    AutoAcm._hideSection('aa_quant_section');
    AutoAcm._hideSection('aa_plano_section');

    // Carrega cores em background (se ainda não foram carregadas)
    if (!AutoAcm.state.coresLoaded) {
      AutoAcm.loadCores();
    }

    // Live save: debounce nos number inputs + flush no blur
    AutoAcm._bindLiveInputs();

    // Espessuras de fita salvas pelo usuário (localStorage)
    AutoAcm._loadCustomFitaEsp();
  },

  // ══════════════════════════════════════════════════════════════════
  // ESPESSURA DE FITA — presets + medidas custom salvas no PC
  // ══════════════════════════════════════════════════════════════════

  _FITA_ESP_KEY: 'acmfacil_fita_esp_custom',
  _FITA_ESP_PRESET: [0.5, 0.9, 1.2, 1.6],

  /** Reinsere no select as espessuras custom salvas em localStorage. */
  _loadCustomFitaEsp() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(AutoAcm._FITA_ESP_KEY) || '[]'); } catch (e) {}
    list.forEach(v => AutoAcm._ensureFitaEspOption(v));
  },

  /** Garante que o valor existe como <option> no select (insere ordenado). */
  _ensureFitaEspOption(v) {
    const sel = document.getElementById('aa_fita_esp');
    if (!sel) return false;
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return false;
    const val = String(n);
    if ([...sel.options].some(o => o.value === val)) return true;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val + ' mm';
    const after = [...sel.options].find(o => parseFloat(o.value) > n);
    sel.insertBefore(opt, after || null);
    return true;
  },

  /** Botão (+): pede uma espessura nova, salva no PC e seleciona. */
  async addFitaEsp() {
    const raw = await Modal.prompt(
      I18n.t('aa.fita.esp.add.title', 'Nova espessura de fita'),
      I18n.t('aa.fita.esp.add.msg', 'Digite a espessura em mm (ex: 1.6):'),
      ''
    );
    if (raw === null) return; // cancelou
    const n = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(n) || n <= 0) {
      Toast.error(I18n.t('aa.fita.esp.add.invalid', 'Espessura inválida.'));
      return;
    }
    const val = String(n);
    AutoAcm._ensureFitaEspOption(val);

    // Persiste só se não for um preset fixo
    if (!AutoAcm._FITA_ESP_PRESET.includes(n)) {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(AutoAcm._FITA_ESP_KEY) || '[]'); } catch (e) {}
      if (!list.map(String).includes(val)) {
        list.push(val);
        localStorage.setItem(AutoAcm._FITA_ESP_KEY, JSON.stringify(list));
      }
    }

    // Seleciona e dispara o fluxo normal de params/estrutura
    const sel = document.getElementById('aa_fita_esp');
    if (sel) {
      sel.value = val;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // LIVE SAVE (debounce + clamp + badge)
  // ══════════════════════════════════════════════════════════════════

  _liveBound: false,
  _saveTimer: null,
  _saveBadgeTimer: null,

  /**
   * Liga uma vez só os listeners de input/blur no body.
   * Captura tudo que comece com 'aa_' (number/text/select/checkbox).
   */
  _bindLiveInputs() {
    if (AutoAcm._liveBound) return;
    AutoAcm._liveBound = true;

    const isAaInput = (t) => t && t.id && t.id.indexOf('aa_') === 0
                      && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

    document.addEventListener('input', (e) => {
      if (!isAaInput(e.target)) return;
      // Só reage se já tem um módulo ativo
      if (AutoAcm.state.activeIdx < 0) return;
      AutoAcm._scheduleLiveSave();
    });

    document.addEventListener('change', (e) => {
      if (!isAaInput(e.target)) return;
      if (AutoAcm.state.activeIdx < 0) return;
      // change em select/checkbox flusha imediatamente
      if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') {
        AutoAcm._flushLiveSave();
      }
    });

    document.addEventListener('blur', (e) => {
      if (!isAaInput(e.target)) return;
      if (AutoAcm.state.activeIdx < 0) return;
      if (e.target.type === 'number') AutoAcm._clampNumberInput(e.target);
      // Flush imediato no blur
      if (AutoAcm._saveTimer) {
        clearTimeout(AutoAcm._saveTimer);
        AutoAcm._saveTimer = null;
        AutoAcm._flushLiveSave();
      }
    }, true); // capture: blur não bubbles
  },

  /**
   * Garante que o valor está dentro de [min, max] do input;
   * se vazio/NaN, restaura pro default (min ou 0).
   */
  _clampNumberInput(input) {
    let raw = input.value;
    let v = parseFloat(raw);
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' ? parseFloat(input.max) : Infinity;
    if (isNaN(v)) v = (min !== -Infinity ? min : 0);
    if (v < min) v = min;
    if (v > max) v = max;
    if (String(v) !== raw) input.value = v;
  },

  _scheduleLiveSave() {
    AutoAcm._showSaveBadge('saving');
    if (AutoAcm._saveTimer) clearTimeout(AutoAcm._saveTimer);
    AutoAcm._saveTimer = setTimeout(() => {
      AutoAcm._saveTimer = null;
      AutoAcm._flushLiveSave();
    }, 350);
  },

  _flushLiveSave() {
    AutoAcm._saveFormToState();
    AutoAcm._showSaveBadge('saved');
    // Atualiza tudo que depende dos params
    AutoAcm.scheduleRedraw();
    AutoAcm.scheduleRedraw3D();
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (m) AutoAcm.updateResumo(m);
  },

  _showSaveBadge(status) {
    const el = document.getElementById('module_save_badge');
    if (!el) return;
    const txt = el.querySelector('.save-badge__text');
    el.hidden = false;
    el.classList.remove('is-saving', 'is-saved');
    if (status === 'saving') {
      el.classList.add('is-saving');
      if (txt) txt.textContent = I18n.t('aa.save.saving', 'salvando…');
      clearTimeout(AutoAcm._saveBadgeTimer);
    } else if (status === 'saved') {
      el.classList.add('is-saved');
      if (txt) txt.textContent = I18n.t('aa.save.saved', 'salvo');
      clearTimeout(AutoAcm._saveBadgeTimer);
      AutoAcm._saveBadgeTimer = setTimeout(() => { el.hidden = true; }, 1400);
    }
  },

  /**
   * Carrega o catálogo de cores ACM do Ruby.
   */
  async loadCores() {
    try {
      const r = await Bridge.call('autoacm_get_cores');
      if (r && r.ok) {
        AutoAcm.state.cores       = r.cores_acm   || {};
        AutoAcm.state.ordemCat    = r.ordem_cat   || Object.keys(AutoAcm.state.cores);
        AutoAcm.state.juntaColors = r.cores_junta || [];
        AutoAcm._mergeCustomJuntaCores();
        AutoAcm.state.coresLoaded = true;
        if (!AutoAcm.state.activeCat && AutoAcm.state.ordemCat.length) {
          AutoAcm.state.activeCat = AutoAcm.state.ordemCat[0];
        }
        AutoAcm.renderColorGrid();
        AutoAcm.renderJuntaSwatches();
      }
    } catch (e) {
      console.error('[AutoAcm] loadCores erro:', e);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // CAPTURA DE FACES (FASE 1)
  // ══════════════════════════════════════════════════════════════════

  async capturarFaces() {
    if (AutoAcm.state.loading) return;
    AutoAcm.state.loading = true;

    const btn = document.getElementById('aa_btn_capturar');
    if (btn) btn.classList.add('is-loading');

    // ── RESET DURO antes da captura ───────────────────────────────────────
    // Garante que: (a) selectModulo(0) não dispara _saveFormToState gravando
    // valores do form antigo no módulo novo; (b) durante o loading o user não
    // vê dimensões/seções da captura anterior. Se Ruby retornar erro, a UI
    // fica limpa em vez de exibir dados velhos misturados com o erro.
    AutoAcm.state.activeIdx = -1;
    AutoAcm.state.modulos   = [];
    [
      'aa_box_info', 'aa_face_map_section', 'aa_enab_section', 'aa_acm_section',
      'aa_junta_section', 'aa_emenda_section', 'aa_fita_section', 'aa_metalon_section',
      'aa_spots_section', 'aa_preview_section', 'aa_preview3d_section',
      'aa_resumo_section', 'aa_gerar_section', 'aa_tabs_wrap'
    ].forEach(id => AutoAcm._hideSection(id));

    try {
      const r = await Bridge.call('autoacm_capturar');

      if (!r || !r.ok) {
        const code = (r && r.code) || 'autoacm.exception';
        const msg  = I18n.t(code, code);
        Toast.error(msg, { title: I18n.t('aa.capture.error_title', 'Erro na captura') });
        return;
      }

      AutoAcm.state.faceColors = r.face_colors || [];
      AutoAcm.state.modulos = (r.modulos || []).map((m, i) => ({
        entity_id: m.entity_id,
        idx:       i,
        nome:      m.nome || ('Modulo ' + (i + 1)),
        // Cor de identificação (12 cores ciclando) — Fase C
        color_idx: i % 12,
        w:         m.w,
        h:         m.h,
        d:         m.d,
        n_faces:   m.n_faces,
        // Roles padrão
        roles:     { ny: 'frontal', py: 'traseira', nx: 'esq', px: 'dir', pz: 'topo', nz: 'base' },
        // Edições 3D (cut/move) aplicadas — persistem visualmente entre redraws
        edits:     { del: {}, ofs: {} },
        // Params do formulário (inicializados com defaults do modulo)
        params:    AutoAcm._defaultParams()
      }));

      if (AutoAcm.state.modulos.length === 0) {
        Toast.warning(I18n.t('autoacm.no_valid_modules', 'Nenhum módulo válido capturado.'));
        return;
      }

      // Garante que cores estão carregadas antes de mostrar o form
      if (!AutoAcm.state.coresLoaded) {
        await AutoAcm.loadCores();
      }

      AutoAcm.renderTabs();
      AutoAcm.selectModulo(0);
    } catch (e) {
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    } finally {
      AutoAcm.state.loading = false;
      if (btn) btn.classList.remove('is-loading');
    }
  },

  /**
   * Parâmetros padrão de um módulo novo (form base).
   */
  _defaultParams() {
    return {
      // ACM
      acm_esp:       3,            // mm — default 3mm
      acm_chapa:     1220,         // mm — largura da chapa
      acm_chapa_comp: 5000,        // mm — comprimento da chapa
      acm_orient:    'horizontal',
      cor_acm:       null,         // nome

      // Estrutura
      met_w:      20,
      met_h:      20,

      // Juntas
      junta_tipo: 'seca',          // 'seca' | 'dilatacao'
      junta_mm:   8,
      cor_junta:  'Preto',         // nome

      // Emendas
      emenda_w:     30,
      emenda_h:     20,
      emenda_align: 'esquerda',    // 'esquerda'|'central'|'direita'|'simetrica'

      // Fita dupla-face
      fita_inc:  true,
      fita_larg: 12,               // mm
      fita_esp:  0.9,              // mm

      // Spots de iluminação
      spots_inc:    false,
      spots_tipo:   'circular',    // 'circular' | 'quadrado' | 'linear'
      spots_qtd:    5,
      spots_dia:    85,            // circular — diâmetro
      spots_prof_c: 30,            // circular — profundidade
      spots_lado:   85,            // quadrado — lado
      spots_prof_q: 30,            // quadrado — profundidade
      spots_comp_l: 500,           // linear   — comprimento
      spots_larg_l: 20,            // linear   — largura
      spots_prof_l: 15,            // linear   — profundidade
      spots_recuo:  800,
      spots_modo:   'ambas',       // 'ambas' | 'esquerda' | 'direita'
      spots_faces: {
        frontal:  true,
        traseira: false,
        topo:     false,
        base:     false,
        esq:      false,
        dir:      false
      },

      // Faces a revestir
      enab: {
        frontal:  true,
        traseira: false,
        topo:     true,
        base:     true,
        esq:      true,
        dir:      true
      },

      // Preview 2D — emendas customizadas (null = calcular auto)
      planEmH: null,
      planEmV: null
    };
  },

  /**
   * Achata o state do módulo no formato que o Ruby extrair() espera.
   * O Ruby do legacy usa chaves tipo `mw`, `mh`, `cor_acm`, `role_nx`, etc.
   */
  _flattenParams(m) {
    const p = m.params;
    const out = {
      // Dimensões (vêm do bounding box capturado)
      w: m.w, h: m.h, d: m.d,

      // ACM
      acm:          p.acm_esp,
      cor_acm:      p.cor_acm || '',
      cor_junta:    p.cor_junta || 'Preto',
      // RGB da cor de junta (pra cores custom funcionarem na geração Ruby)
      cor_junta_rgb: (AutoAcm.state.juntaColors.find(c => c.nome === (p.cor_junta || 'Preto')) || {}).rgb || null,
      chapa_larg:   p.acm_chapa,
      chapa_comp:   p.acm_chapa_comp || 5000,
      chapa_orient: p.acm_orient,

      // Metalon
      mw: p.met_w,
      mh: p.met_h,

      // Emendas
      ew:           p.emenda_w,
      eh:           p.emenda_h,
      emenda_align: p.emenda_align,

      // Juntas
      junta_tipo: p.junta_tipo,
      junta_mm:   p.junta_mm,

      // Fita — ligada por padrão; só desliga se explicitamente false.
      // (alinhado com o checkbox, que aparece marcado quando fita_inc é undefined,
      //  e com o Ruby extrair() que usa `!= false`). Antes era `=== true`, o que
      //  silenciosamente desligava a fita em módulos sem fita_inc definido.
      inc_fita: p.fita_inc !== false && p.fita_inc !== 'false',
      fl:       p.fita_larg,
      fe:       p.fita_esp,

      // Faces habilitadas
      enab_frontal:  !!(p.enab && p.enab.frontal),
      enab_traseira: !!(p.enab && p.enab.traseira),
      enab_topo:     !!(p.enab && p.enab.topo),
      enab_base:     !!(p.enab && p.enab.base),
      enab_esq:      !!(p.enab && p.enab.esq),
      enab_dir:      !!(p.enab && p.enab.dir),

      // Roles (dir → papel)
      role_nx: (m.roles && m.roles.nx) || 'ignorar',
      role_px: (m.roles && m.roles.px) || 'ignorar',
      role_ny: (m.roles && m.roles.ny) || 'ignorar',
      role_py: (m.roles && m.roles.py) || 'ignorar',
      role_nz: (m.roles && m.roles.nz) || 'ignorar',
      role_pz: (m.roles && m.roles.pz) || 'ignorar',

      // Spots — mapeia dims pelo tipo escolhido (Ruby espera dim1/dim2/prof)
      spots:         !!p.spots_inc,
      spots_tipo:    p.spots_tipo,
      spots_qtd:     p.spots_qtd,
      ...(function(){
        const tipo = p.spots_tipo || 'circular';
        let d1 = 85, d2 = 85, pr = 30;
        if (tipo === 'linear') {
          d1 = parseFloat(p.spots_comp_l) || 500;
          d2 = parseFloat(p.spots_larg_l) || 20;
          pr = parseFloat(p.spots_prof_l) || 15;
        } else if (tipo === 'quadrado') {
          d1 = parseFloat(p.spots_lado)   || 85;
          d2 = parseFloat(p.spots_lado)   || 85;
          pr = parseFloat(p.spots_prof_q) || 30;
        } else { // circular
          d1 = parseFloat(p.spots_dia)    || 85;
          d2 = parseFloat(p.spots_dia)    || 85;
          pr = parseFloat(p.spots_prof_c) || 30;
        }
        return { spots_dim1: d1, spots_dim2: d2, spots_prof: pr };
      })(),
      spots_recuo:   p.spots_recuo,
      spots_modo:    p.spots_modo,
      sp_f_frontal:  !!(p.spots_faces && p.spots_faces.frontal),
      sp_f_traseira: !!(p.spots_faces && p.spots_faces.traseira),
      sp_f_topo:     !!(p.spots_faces && p.spots_faces.topo),
      sp_f_base:     !!(p.spots_faces && p.spots_faces.base),
      sp_f_esq:      !!(p.spots_faces && p.spots_faces.esq),
      sp_f_dir:      !!(p.spots_faces && p.spots_faces.dir),

      // Emendas customizadas do preview 2D (se houver)
      preview_em_h: (p.planEmH !== null) ? p.planEmH.join(',') : '',
      preview_em_v: (p.planEmV !== null) ? p.planEmV.join(',') : ''
    };
    return out;
  },

  /**
   * FASE 7 — Gerar estrutura no SketchUp.
   */
  async gerar() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m) return;
    const p = m.params;

    // Validação básica
    if (!p.cor_acm) {
      AutoAcm._showGerarStatus(I18n.t('aa.gerar.err.no_color', 'Selecione uma cor ACM antes de gerar.'), 'error');
      return;
    }

    const btn = document.getElementById('aa_btn_gerar');
    if (btn) btn.classList.add('is-loading');
    AutoAcm._showGerarStatus(I18n.t('aa.gerar.loading', 'Gerando no SketchUp...'), 'info');

    try {
      const params = AutoAcm._flattenParams(m);
      const r = await Bridge.call('autoacm_gerar', {
        entity_id: m.entity_id,
        params:    params
      });

      if (!r || !r.ok) {
        const code = (r && r.code) || 'autoacm.gerar_error';
        const msg  = I18n.t(code, code);
        AutoAcm._showGerarStatus(msg + (r && r.error ? '\n' + r.error : ''), 'error');
        return;
      }

      // Salva o quantitativo no módulo — o preview 3D vai usar isso
      m.quant = r.quant || {};
      AutoAcm._showGerarStatus(I18n.t('aa.gerar.ok', '✓ Estrutura gerada com sucesso.'), 'success');
      AutoAcm.scheduleRedraw();
      AutoAcm.scheduleRedraw3D();
      AutoAcm.updateQuantitativo(m);
    } catch (e) {
      AutoAcm._showGerarStatus(I18n.t('auth.error.comm') + ': ' + e.message, 'error');
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  },

  _showGerarStatus(msg, kind) {
    const el = document.getElementById('aa_gerar_status');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.className = 'aa__gerar-status';
    if (kind === 'success') el.classList.add('aa__gerar-status--success');
    else if (kind === 'error') el.classList.add('aa__gerar-status--error');
    // Auto-hide de mensagens positivas depois de 4s
    if (kind === 'success') {
      clearTimeout(AutoAcm._gerarStatusTimer);
      AutoAcm._gerarStatusTimer = setTimeout(() => { el.hidden = true; }, 5000);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // TABS DE MÓDULOS
  // ══════════════════════════════════════════════════════════════════

  renderTabs() {
    const wrap = document.getElementById('aa_tabs_wrap');
    const row  = document.getElementById('aa_tabs');
    const btnAll = document.getElementById('aa_btn_gerar_all');
    const btnAllLabel = document.getElementById('aa_btn_gerar_all_label');
    const btnGerarLabel = document.getElementById('aa_btn_gerar_label');
    if (!wrap || !row) return;

    const n = AutoAcm.state.modulos.length;

    // Botão "Gerar todos (N)" só visível quando multi
    if (btnAll) btnAll.hidden = (n <= 1);
    if (btnAllLabel && n > 1) {
      btnAllLabel.textContent = I18n.t('aa.gerar.all', 'Gerar todos') + ' (' + n + ')';
    }
    if (btnGerarLabel) {
      btnGerarLabel.textContent = (n > 1)
        ? I18n.t('aa.gerar.this', 'Gerar este módulo')
        : I18n.t('aa.gerar.btn', 'Gerar estrutura no SketchUp');
    }

    // Tabs sempre visíveis se houver pelo menos 1 módulo
    // (necessário pra renomear/colorir/deletar mesmo no single)
    if (n === 0) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    row.innerHTML = '';

    AutoAcm.state.modulos.forEach((m, idx) => {
      const btn = document.createElement('div');
      btn.className = 'aa__tab' + (idx === AutoAcm.state.activeIdx ? ' is-active' : '');
      btn.draggable = true;
      btn.dataset.idx = idx;
      const hasQuant = !!(m.quant && m.quant.met_pecas);
      const colorIdx = (m.color_idx == null ? idx : m.color_idx) % 12;
      btn.style.setProperty('--tab-color', `var(--mod-color-${colorIdx})`);

      btn.innerHTML = `
        <span class="aa__tab-color" title="${I18n.t('aa.tab.color.tip', 'Cor do módulo (clique pra trocar)')}"></span>
        <span class="aa__tab-num">${idx + 1}.</span>
        <span class="aa__tab-name" data-idx="${idx}">${AutoAcm._escape(m.nome)}</span>
        <span class="aa__tab-dim">${m.w} × ${m.h} × ${m.d}</span>
        ${hasQuant ? '<span class="aa__tab-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}
        <button class="aa__tab-dup" title="${I18n.t('aa.tab.duplicate', 'Duplicar módulo')}" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="aa__tab-close" title="${I18n.t('aa.tab.delete', 'Deletar módulo')}" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      btn.title = I18n.t('aa.tab.tooltip2',
        'Clique = selecionar · Duplo no nome = renomear · Duplo na aba = zoom · Arraste pra reordenar');

      // ── Click select (deferred 250ms pra permitir dblclick cancelar) ──
      // Sem o defer, o click re-renderiza renderTabs() destruindo o DOM
      // antes do evento dblclick chegar, então o rename inline nunca disparava.
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.aa__tab-close')) return;
        if (e.target.closest('.aa__tab-dup')) return;
        if (e.target.closest('.aa__tab-color')) return;
        if (e.target.classList.contains('aa__tab-name-input')) return;
        if (btn._aaClickTimer) return; // já tem um pendente
        const isOnName = !!e.target.closest('.aa__tab-name');
        btn._aaClickTimer = setTimeout(() => {
          btn._aaClickTimer = null;
          AutoAcm.selectModulo(idx);
        }, 260);
        // Marca pro dblclick saber que é "no nome"
        btn._lastClickOnName = isOnName;
      });

      // ── Duplo clique: cancela o single-click pendente e age conforme alvo ──
      btn.addEventListener('dblclick', (e) => {
        if (e.target.closest('.aa__tab-close')) return;
        if (e.target.closest('.aa__tab-color')) return;
        if (btn._aaClickTimer) {
          clearTimeout(btn._aaClickTimer);
          btn._aaClickTimer = null;
        }
        if (e.target.closest('.aa__tab-name')) {
          // Garante seleção antes de renomear (sem re-render destrutivo se já é o ativo)
          if (idx !== AutoAcm.state.activeIdx) {
            // Salva form do anterior, troca activeIdx mas SEM re-render imediato
            AutoAcm._saveFormToState();
            AutoAcm.state.activeIdx = idx;
          }
          AutoAcm._beginRenameTab(btn, idx);
        } else {
          AutoAcm._zoomTo(m.entity_id);
        }
      });

      // ── Click no DOT de cor = ciclar pela paleta ──
      btn.querySelector('.aa__tab-color').addEventListener('click', (e) => {
        e.stopPropagation();
        AutoAcm._cycleTabColor(idx);
      });

      // ── Botão close ──
      btn.querySelector('.aa__tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        AutoAcm.deleteModulo(idx);
      });

      // ── Botão duplicar ──
      btn.querySelector('.aa__tab-dup').addEventListener('click', (e) => {
        e.stopPropagation();
        AutoAcm.duplicarModulo(idx);
      });

      // ── Drag-drop pra reordenar ──
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        btn.classList.add('is-dragging');
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('is-dragging');
        document.querySelectorAll('.aa__tab.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
      });
      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('is-drop-target');
      });
      btn.addEventListener('dragleave', () => {
        btn.classList.remove('is-drop-target');
      });
      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('is-drop-target');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(fromIdx) || fromIdx === idx) return;
        AutoAcm.reorderModulo(fromIdx, idx);
      });

      row.appendChild(btn);
    });

    // Botão "Aplicar config a todos" — só visível com 2+
    if (n >= 2) {
      const applyBtn = document.createElement('button');
      applyBtn.className = 'aa__tab-apply';
      applyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        <span>${I18n.t('aa.tabs.apply_all', 'Aplicar config a todos')}</span>
      `;
      applyBtn.title = I18n.t('aa.tabs.apply_all.tip', 'Copia as configurações deste módulo para os outros');
      applyBtn.onclick = () => AutoAcm.aplicarATodos();
      row.appendChild(applyBtn);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // FASE C — Renomear / Cor / Drag / Deletar
  // ══════════════════════════════════════════════════════════════════

  /**
   * Substitui o span do nome por um <input> editável.
   * Enter ou blur salvam, Esc cancela.
   */
  _beginRenameTab(tabEl, idx) {
    const m = AutoAcm.state.modulos[idx];
    if (!m) return;
    const nameEl = tabEl.querySelector('.aa__tab-name');
    if (!nameEl || nameEl.classList.contains('aa__tab-name-input')) return;

    const original = m.nome || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'aa__tab-name aa__tab-name-input';
    input.value = original;
    input.maxLength = 60;
    input.dataset.idx = String(idx);

    const finish = (commit) => {
      let val = commit ? input.value.trim() : original;
      if (!val) val = original || ('Modulo ' + (idx + 1));
      // Sanitiza minimamente — permite letras, números, espaços e símbolos comuns
      val = val.replace(/[<>"]/g, '').slice(0, 60);
      m.nome = val;
      AutoAcm.renderTabs();
      // Atualiza títulos dependentes
      AutoAcm.updateResumo(m);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  },

  /**
   * Cicla a cor do módulo pela paleta de 12.
   */
  _cycleTabColor(idx) {
    const m = AutoAcm.state.modulos[idx];
    if (!m) return;
    m.color_idx = ((m.color_idx == null ? idx : m.color_idx) + 1) % 12;
    AutoAcm.renderTabs();
    AutoAcm.updateResumo(m);
  },

  /**
   * Reordena módulos: move o item de fromIdx pra antes de toIdx.
   * Mantém o activeIdx apontando pro mesmo módulo.
   */
  reorderModulo(fromIdx, toIdx) {
    const arr = AutoAcm.state.modulos;
    if (fromIdx < 0 || fromIdx >= arr.length) return;
    if (toIdx   < 0 || toIdx   >= arr.length) return;
    if (fromIdx === toIdx) return;

    // Salva o form do ativo antes de mexer no array
    AutoAcm._saveFormToState();

    const activeId = arr[AutoAcm.state.activeIdx]
                      ? arr[AutoAcm.state.activeIdx].entity_id
                      : null;

    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);

    // Recalcula activeIdx pelo entity_id
    if (activeId != null) {
      const newActive = arr.findIndex(m => m.entity_id === activeId);
      if (newActive >= 0) AutoAcm.state.activeIdx = newActive;
    }

    AutoAcm.renderTabs();
    Toast.info(I18n.t('aa.tab.reordered', 'Módulos reordenados.'), { duration: 2000 });
  },

  /**
   * Duplica um módulo: clona o grupo no SketchUp + cria entry novo
   * com mesmas configs/cor/edits, nome com sufixo "(cópia)".
   */
  async duplicarModulo(idx) {
    const src = AutoAcm.state.modulos[idx];
    if (!src) return;

    // Salva form atual antes de qualquer coisa
    AutoAcm._saveFormToState();

    // Snapshot completo dos módulos existentes (pra restaurar após re-capture)
    const existing = AutoAcm.state.modulos.map(m => ({
      entity_id: m.entity_id,
      nome:      m.nome,
      color_idx: m.color_idx,
      params:    JSON.parse(JSON.stringify(m.params || {})),
      edits:     JSON.parse(JSON.stringify(m.edits  || { del:{}, ofs:{} })),
      roles:     JSON.parse(JSON.stringify(m.roles  || {})),
      quant:     m.quant ? JSON.parse(JSON.stringify(m.quant)) : null
    }));
    const existing_ids = existing.map(e => e.entity_id);

    try {
      const r = await Bridge.call('autoacm_duplicar_modulo', {
        entity_id:    src.entity_id,
        existing_ids: existing_ids
      });
      if (!r || !r.ok) {
        Toast.error(I18n.t('aa.tab.duplicate.error', 'Erro ao duplicar') +
          (r && r.error ? ': ' + r.error : ''));
        return;
      }

      // Re-captura tudo (módulos antigos + nova cópia)
      await AutoAcm.capturarFaces();

      // Restaura params/nome/cor dos módulos antigos pelo entity_id
      AutoAcm.state.modulos.forEach(m => {
        const old = existing.find(e => e.entity_id === m.entity_id);
        if (old) {
          m.nome      = old.nome;
          m.color_idx = old.color_idx;
          m.params    = old.params;
          m.edits     = old.edits;
          m.roles     = old.roles;
          if (old.quant) m.quant = old.quant;
        }
      });

      // Aplica config de origem + nome "(cópia)" no NOVO módulo
      const novo = AutoAcm.state.modulos.find(m => m.entity_id === r.entity_id);
      if (novo) {
        const srcSnap = existing.find(e => e.entity_id === src.entity_id);
        if (srcSnap) {
          novo.params    = JSON.parse(JSON.stringify(srcSnap.params));
          novo.color_idx = srcSnap.color_idx;
          novo.roles     = JSON.parse(JSON.stringify(srcSnap.roles));
          // edits e quant NÃO copia — geometria pode ser igual mas
          // o usuário deve gerar de novo
          novo.params.planEmH = null;
          novo.params.planEmV = null;
        }
        novo.nome = (srcSnap?.nome || src.nome || 'Módulo') +
                    ' ' + I18n.t('aa.tab.duplicate.suffix', '(cópia)');

        // Seleciona o duplicado
        const newIdx = AutoAcm.state.modulos.indexOf(novo);
        AutoAcm.selectModulo(newIdx);
      }

      AutoAcm.renderTabs();
      Toast.success(I18n.t('aa.tab.duplicate.ok',
        'Módulo duplicado. Total: {n}.').replace('{n}', AutoAcm.state.modulos.length),
        { duration: 2000 });
    } catch (e) {
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    }
  },

  /**
   * Deleta um módulo da lista (com confirmação).
   * Se restou 0, esconde o form. Se era o ativo, troca pro próximo.
   */
  async deleteModulo(idx) {
    const m = AutoAcm.state.modulos[idx];
    if (!m) return;

    const ok = await Modal.confirm(
      I18n.t('aa.tab.delete.title', 'Deletar módulo'),
      I18n.t('aa.tab.delete.msg', 'Remover "{nome}" da lista? Essa ação não apaga nada do SketchUp, só limpa do plugin.')
        .replace('{nome}', m.nome || ('Modulo ' + (idx + 1)))
    );
    if (!ok) return;

    AutoAcm.state.modulos.splice(idx, 1);
    const n = AutoAcm.state.modulos.length;

    if (n === 0) {
      AutoAcm.state.activeIdx = -1;
      // Esconde tudo que dependia de captura
      AutoAcm._hideSection('aa_tabs_wrap');
      AutoAcm._hideSection('aa_box_info');
      AutoAcm._hideSection('aa_face_map_section');
      AutoAcm._hideSection('aa_enab_section');
      AutoAcm._hideSection('aa_acm_section');
      AutoAcm._hideSection('aa_junta_section');
      AutoAcm._hideSection('aa_emenda_section');
      AutoAcm._hideSection('aa_fita_section');
      AutoAcm._hideSection('aa_metalon_section');
      AutoAcm._hideSection('aa_spots_section');
      AutoAcm._hideSection('aa_preview_section');
      AutoAcm._hideSection('aa_preview3d_section');
      AutoAcm._hideSection('aa_resumo_section');
      AutoAcm._hideSection('aa_gerar_section');
      AutoAcm._hideSection('aa_quant_section');
      AutoAcm._hideSection('aa_plano_section');
      Toast.info(I18n.t('aa.tab.delete.last', 'Lista esvaziada. Capture novos módulos pra continuar.'));
      return;
    }

    // Ajusta activeIdx
    if (AutoAcm.state.activeIdx === idx) {
      AutoAcm.state.activeIdx = -1; // força reload do form
      AutoAcm.selectModulo(Math.min(idx, n - 1));
    } else if (AutoAcm.state.activeIdx > idx) {
      AutoAcm.state.activeIdx -= 1;
      AutoAcm.renderTabs();
    } else {
      AutoAcm.renderTabs();
    }

    Toast.success(I18n.t('aa.tab.delete.ok', 'Módulo removido.'), { duration: 2000 });
  },

  /**
   * Copia todos os params do módulo ativo para os outros módulos.
   * Preserva roles e quant (cada módulo mantém os seus).
   */
  async aplicarATodos() {
    if (AutoAcm.state.modulos.length < 2) return;
    // Salva o form atual primeiro
    AutoAcm._saveFormToState();
    const src = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!src || !src.params) return;

    const ok = await Modal.confirm(
      I18n.t('aa.tabs.apply_all', 'Aplicar config a todos'),
      I18n.t('aa.tabs.apply_all.confirm',
        'Copiar as configurações deste módulo para todos os outros? (roles de face e quantitativo já gerado serão preservados)')
    );
    if (!ok) return;

    const n = AutoAcm.state.modulos.length;
    AutoAcm.state.modulos.forEach((m, i) => {
      if (i === AutoAcm.state.activeIdx) return;
      m.params = JSON.parse(JSON.stringify(src.params));
      m.params.planEmH = null;
      m.params.planEmV = null;
    });

    Toast.success(
      I18n.t('aa.tabs.apply_all.ok', 'Configurações aplicadas a {n} módulos.').replace('{n}', n - 1)
    );
    AutoAcm.renderTabs();
  },

  /**
   * Gera a estrutura em TODOS os módulos capturados, sequencialmente.
   */
  async gerarTodos() {
    if (AutoAcm.state.modulos.length < 2) return;

    // Valida: todos precisam ter cor ACM
    const sem_cor = [];
    AutoAcm.state.modulos.forEach((m, i) => {
      if (!m.params || !m.params.cor_acm) sem_cor.push(i + 1);
    });
    if (sem_cor.length > 0) {
      AutoAcm._showGerarStatus(
        I18n.t('aa.gerar.err.some_no_color', 'Módulos sem cor ACM: {ids}. Selecione cor em cada um antes.').replace('{ids}', sem_cor.join(', ')),
        'error'
      );
      return;
    }

    const btn = document.getElementById('aa_btn_gerar_all');
    if (btn) btn.classList.add('is-loading');

    const total = AutoAcm.state.modulos.length;
    let sucessos = 0;
    const erros = [];

    for (let i = 0; i < total; i++) {
      const m = AutoAcm.state.modulos[i];
      AutoAcm._showGerarStatus(
        I18n.t('aa.gerar.progress', 'Gerando {i}/{n}: {nome}')
          .replace('{i}', i + 1)
          .replace('{n}', total)
          .replace('{nome}', m.nome),
        'info'
      );

      try {
        const params = AutoAcm._flattenParams(m);
        const r = await Bridge.call('autoacm_gerar', {
          entity_id: m.entity_id,
          params:    params
        });
        if (r && r.ok) {
          m.quant = r.quant || {};
          sucessos++;
        } else {
          const code = (r && r.code) || 'autoacm.gerar_error';
          erros.push(`${m.nome}: ${I18n.t(code, code)}${r && r.error ? ' — ' + r.error : ''}`);
        }
      } catch (e) {
        erros.push(`${m.nome}: ${e.message}`);
      }
    }

    if (btn) btn.classList.remove('is-loading');

    if (erros.length === 0) {
      AutoAcm._showGerarStatus(
        I18n.t('aa.gerar.all_ok', '✓ {n} módulos gerados com sucesso.').replace('{n}', sucessos),
        'success'
      );
    } else {
      AutoAcm._showGerarStatus(
        I18n.t('aa.gerar.partial', '{ok} OK · {err} com erros:').replace('{ok}', sucessos).replace('{err}', erros.length)
          + '\n' + erros.join('\n'),
        'error'
      );
    }

    AutoAcm.scheduleRedraw();
    AutoAcm.scheduleRedraw3D();
    AutoAcm.renderTabs();
    // Atualiza quantitativo do módulo ativo
    const activeMod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (activeMod) AutoAcm.updateQuantitativo(activeMod);
  },

  selectModulo(idx) {
    if (idx < 0 || idx >= AutoAcm.state.modulos.length) return;

    // Salva o form do módulo anterior (se houver)
    if (AutoAcm.state.activeIdx >= 0 && AutoAcm.state.activeIdx !== idx) {
      AutoAcm._saveFormToState();
    }

    AutoAcm.state.activeIdx = idx;
    const m = AutoAcm.state.modulos[idx];

    // Revela todas as seções de formulário (uma vez só após captura)
    AutoAcm._showSection('aa_box_info');
    AutoAcm._showSection('aa_face_map_section');
    AutoAcm._showSection('aa_enab_section');
    AutoAcm._showSection('aa_acm_section');
    AutoAcm._showSection('aa_junta_section');
    AutoAcm._showSection('aa_emenda_section');
    AutoAcm._showSection('aa_fita_section');
    AutoAcm._showSection('aa_metalon_section');
    AutoAcm._showSection('aa_spots_section');
    AutoAcm._showSection('aa_preview_section');
    AutoAcm._showSection('aa_preview3d_section');
    AutoAcm._showSection('aa_resumo_section');
    AutoAcm._showSection('aa_gerar_section');

    // Box info
    const dim = document.getElementById('aa_dim');
    if (dim) {
      const nomePrefix = AutoAcm.state.modulos.length > 1 ? `<b>${AutoAcm._escape(m.nome)}:</b> ` : '';
      dim.innerHTML = `${nomePrefix}${m.w} × ${m.h} × ${m.d} mm <span style="color:var(--text-muted);font-family:var(--font-mono);font-size:var(--text-xs)">· ${m.n_faces} ${I18n.t('aa.faces.painted', 'faces pintadas')}</span>`;
    }

    // Face map
    AutoAcm.renderFaceMap(m);

    // Carrega valores do form no módulo ativo
    AutoAcm._loadFormFromState(m);

    // Re-render tabs pra destacar a ativa
    AutoAcm.renderTabs();

    // Notifica SketchUp (sem zoom)
    AutoAcm._highlightInSketchup(m.entity_id);

    // Re-aplica i18n pros textos que podem ter sido trocados
    if (typeof I18n !== 'undefined') I18n.applyToDOM();

    // Redraw dos previews pro módulo ativo
    AutoAcm.planBindMouse();
    AutoAcm.bind3D();
    AutoAcm.scheduleRedraw();
    AutoAcm.scheduleRedraw3D();

    // Atualiza resumo + quantitativo
    AutoAcm.updateResumo(m);
    AutoAcm.updateQuantitativo(m);
  },

  // ══════════════════════════════════════════════════════════════════
  // FORM STATE (salva/carrega no state do módulo ativo)
  // ══════════════════════════════════════════════════════════════════

  _saveFormToState() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m) return;
    const p = m.params;

    // ACM
    p.acm_esp    = parseInt(AutoAcm._val('aa_acm_esp',   3), 10);
    // Tamanho da chapa: o preset/custom mantém aa_acm_chapa (largura) e
    // aa_chapa_comp_custom (comprimento) atualizados via onChapaPresetChange().
    p.acm_chapa  = parseInt(AutoAcm._val('aa_acm_chapa', 1220), 10);
    p.acm_chapa_comp = parseInt(AutoAcm._val('aa_chapa_comp_custom', p.acm_chapa_comp || 5000), 10);
    // acm_orient já é atualizado por setOrient()
    p.cor_acm    = AutoAcm.state.selectedColor;

    // Estrutura
    p.met_w = parseInt(AutoAcm._val('aa_met_w', 20), 10);
    p.met_h = parseInt(AutoAcm._val('aa_met_h', 20), 10);

    // Juntas
    p.junta_mm = parseInt(AutoAcm._val('aa_junta_mm', 8), 10);
    // junta_tipo e cor_junta já são atualizados pelos handlers

    // Emendas
    p.emenda_w = parseInt(AutoAcm._val('aa_emenda_w', 30), 10);
    p.emenda_h = parseInt(AutoAcm._val('aa_emenda_h', 20), 10);
    // emenda_align já é atualizado por setEmendaAlign()

    // Fita
    p.fita_inc  = AutoAcm._chk('aa_fita_inc');
    p.fita_larg = parseInt(AutoAcm._val('aa_fita_larg', 12), 10);
    p.fita_esp  = parseFloat(AutoAcm._val('aa_fita_esp', 0.9));

    // Spots
    p.spots_inc    = AutoAcm._chk('aa_spots_inc');
    // Quantidade — lê do input visível conforme tipo
    const qtdId = p.spots_tipo === 'linear'   ? 'aa_spots_qtd_l'
                 : p.spots_tipo === 'quadrado' ? 'aa_spots_qtd_q'
                                                : 'aa_spots_qtd';
    p.spots_qtd    = parseInt(AutoAcm._val(qtdId, 5), 10);
    p.spots_dia    = parseInt(AutoAcm._val('aa_spots_dia',    85), 10);
    p.spots_prof_c = parseInt(AutoAcm._val('aa_spots_prof_c', 30), 10);
    p.spots_lado   = parseInt(AutoAcm._val('aa_spots_lado',   85), 10);
    p.spots_prof_q = parseInt(AutoAcm._val('aa_spots_prof_q', 30), 10);
    p.spots_comp_l = parseInt(AutoAcm._val('aa_spots_comp_l', 500), 10);
    p.spots_larg_l = parseInt(AutoAcm._val('aa_spots_larg_l', 20), 10);
    p.spots_prof_l = parseInt(AutoAcm._val('aa_spots_prof_l', 15), 10);
    p.spots_recuo  = parseInt(AutoAcm._val('aa_spots_recuo', 800), 10);
    p.spots_modo   = AutoAcm._val('aa_spots_modo', 'ambas');
    // spots_faces e spots_tipo: gerenciados pelos handlers

    // Faces
    p.enab = {
      frontal:  AutoAcm._chk('aa_enab_frontal'),
      traseira: AutoAcm._chk('aa_enab_traseira'),
      topo:     AutoAcm._chk('aa_enab_topo'),
      base:     AutoAcm._chk('aa_enab_base'),
      esq:      AutoAcm._chk('aa_enab_esq'),
      dir:      AutoAcm._chk('aa_enab_dir')
    };
  },

  _loadFormFromState(m) {
    if (!m || !m.params) return;
    const p = m.params;

    // ACM
    AutoAcm._setVal('aa_acm_esp',   p.acm_esp);
    AutoAcm._setVal('aa_acm_chapa', p.acm_chapa);
    AutoAcm._setVal('aa_chapa_comp_custom', p.acm_chapa_comp || 5000);
    AutoAcm._setVal('aa_chapa_larg_custom', p.acm_chapa || 1220);
    AutoAcm._syncChapaPreset(p.acm_chapa_comp || 5000, p.acm_chapa || 1220);
    AutoAcm.setOrient(p.acm_orient || 'horizontal', true);

    // Estrutura
    AutoAcm._setVal('aa_met_w', p.met_w);
    AutoAcm._setVal('aa_met_h', p.met_h);

    // Juntas
    AutoAcm.setJuntaTipo(p.junta_tipo || 'seca', true);
    AutoAcm._setVal('aa_junta_mm', p.junta_mm);
    AutoAcm._selectJunta(p.cor_junta || 'Preto', true);

    // Emendas
    AutoAcm._setVal('aa_emenda_w', p.emenda_w);
    AutoAcm._setVal('aa_emenda_h', p.emenda_h);
    AutoAcm.setEmendaAlign(p.emenda_align || 'esquerda', true);

    // Fita
    AutoAcm._setChk('aa_fita_inc', p.fita_inc !== false);
    AutoAcm._setVal('aa_fita_larg', p.fita_larg);
    AutoAcm._ensureFitaEspOption(p.fita_esp);
    AutoAcm._setVal('aa_fita_esp',  p.fita_esp);
    AutoAcm._refreshFitaVisual();

    // Spots
    AutoAcm._setChk('aa_spots_inc', !!p.spots_inc);
    AutoAcm.setSpotTipo(p.spots_tipo || 'circular', true);
    AutoAcm._setVal('aa_spots_qtd',    p.spots_qtd);
    AutoAcm._setVal('aa_spots_qtd_q',  p.spots_qtd);
    AutoAcm._setVal('aa_spots_qtd_l',  p.spots_qtd);
    AutoAcm._setVal('aa_spots_dia',    p.spots_dia);
    AutoAcm._setVal('aa_spots_prof_c', p.spots_prof_c);
    AutoAcm._setVal('aa_spots_lado',   p.spots_lado);
    AutoAcm._setVal('aa_spots_prof_q', p.spots_prof_q);
    AutoAcm._setVal('aa_spots_comp_l', p.spots_comp_l);
    AutoAcm._setVal('aa_spots_larg_l', p.spots_larg_l);
    AutoAcm._setVal('aa_spots_prof_l', p.spots_prof_l);
    AutoAcm._setVal('aa_spots_recuo',  p.spots_recuo);
    AutoAcm._setVal('aa_spots_modo',   p.spots_modo);
    AutoAcm._refreshSpotsVisual();
    AutoAcm._refreshSpotFacesVisual();

    // Faces
    AutoAcm._setChk('aa_enab_frontal',  !!(p.enab && p.enab.frontal));
    AutoAcm._setChk('aa_enab_traseira', !!(p.enab && p.enab.traseira));
    AutoAcm._setChk('aa_enab_topo',     !!(p.enab && p.enab.topo));
    AutoAcm._setChk('aa_enab_base',     !!(p.enab && p.enab.base));
    AutoAcm._setChk('aa_enab_esq',      !!(p.enab && p.enab.esq));
    AutoAcm._setChk('aa_enab_dir',      !!(p.enab && p.enab.dir));
    AutoAcm._bindFaceChecks();

    // Cor do ACM
    if (p.cor_acm) {
      AutoAcm.selectColor(p.cor_acm, true);
    } else {
      AutoAcm.state.selectedColor = null;
      AutoAcm.state.selectedColorRgb = [200, 200, 200];
      AutoAcm._renderColorSelected();
      AutoAcm.renderColorGrid();
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // FACE MAP (FASE 1)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Formato do m.roles: { "px": "dir", "nx": "esq", "py": "traseira", ... }
   * Chaves = direção (px/nx/py/ny/pz/nz)
   * Valores = role ("frontal" | "traseira" | "topo" | "base" | "esq" | "dir" | "ignorar")
   */
  renderFaceMap(m) {
    const box = document.getElementById('aa_face_map');
    if (!box) return;

    const roleOptions = [
      ['frontal',  I18n.t('aa.role.frontal',  'Frontal')],
      ['traseira', I18n.t('aa.role.traseira', 'Traseira')],
      ['topo',     I18n.t('aa.role.topo',     'Topo')],
      ['base',     I18n.t('aa.role.base',     'Base')],
      ['esq',      I18n.t('aa.role.esq',      'Lateral esquerda')],
      ['dir',      I18n.t('aa.role.dir',      'Lateral direita')],
      ['ignorar',  '— ' + I18n.t('aa.role.ignore', 'Ignorar') + ' —']
    ];

    box.innerHTML = '';
    AutoAcm.state.faceColors.forEach(fc => {
      const row = document.createElement('div');
      row.className = 'aa__face-row';

      const sw = document.createElement('div');
      sw.className = 'aa__face-swatch';
      sw.style.background = `rgb(${fc.rgb.join(',')})`;
      row.appendChild(sw);

      const lbl = document.createElement('div');
      lbl.className = 'aa__face-dir';
      lbl.textContent = fc.dir;
      row.appendChild(lbl);

      const sel = document.createElement('select');
      sel.className = 'aa__face-select';
      sel.dataset.dir = fc.dir;
      // ★ LOOKUP DIRETO: role = m.roles[dir]
      const currentRole = (m.roles && m.roles[fc.dir]) || 'ignorar';
      roleOptions.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt[0];
        o.textContent = opt[1];
        if (opt[0] === currentRole) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = AutoAcm._onRoleChange;
      row.appendChild(sel);

      box.appendChild(row);
    });
  },

  _onRoleChange() {
    const idx = AutoAcm.state.activeIdx;
    if (idx < 0) return;
    const m = AutoAcm.state.modulos[idx];
    // Formato dir→role (consistente com renderFaceMap)
    const newRoles = {};
    document.querySelectorAll('#aa_face_map select').forEach(s => {
      newRoles[s.dataset.dir] = s.value; // pode ser "ignorar"
    });
    m.roles = newRoles;
  },

  // ══════════════════════════════════════════════════════════════════
  // COLOR PICKER (FASE 2)
  // ══════════════════════════════════════════════════════════════════

  renderColorGrid() {
    const tabsEl = document.getElementById('aa_color_tabs');
    const gridEl = document.getElementById('aa_color_grid');
    if (!tabsEl || !gridEl) return;

    if (!AutoAcm.state.activeCat && AutoAcm.state.ordemCat.length) {
      AutoAcm.state.activeCat = AutoAcm.state.ordemCat[0];
    }

    // TABS
    tabsEl.innerHTML = AutoAcm.state.ordemCat.map(cat => {
      const active = (cat === AutoAcm.state.activeCat);
      const label  = I18n.t('aa.cat.' + cat, cat);
      return `<button type="button" class="aa__color-tab${active ? ' is-active' : ''}" data-cat="${cat}">${label}</button>`;
    }).join('');

    // Attach listeners (escapar problemas com nomes com aspas)
    tabsEl.querySelectorAll('.aa__color-tab').forEach(btn => {
      btn.onclick = () => AutoAcm.setColorCat(btn.dataset.cat);
    });

    // GRID
    const colors = AutoAcm.state.cores[AutoAcm.state.activeCat] || [];
    gridEl.innerHTML = colors.map((c, i) => {
      const selected = (AutoAcm.state.selectedColor === c.nome) ? ' is-selected' : '';
      return `<div class="aa__color-swatch${selected}" style="background: rgb(${c.rgb.join(',')})" data-idx="${i}" title="${AutoAcm._escape(c.nome)}"></div>`;
    }).join('');

    // Attach clique
    gridEl.querySelectorAll('.aa__color-swatch').forEach(sw => {
      const idx = parseInt(sw.dataset.idx, 10);
      const c   = colors[idx];
      if (!c) return;
      sw.onclick = () => AutoAcm.selectColor(c.nome);
    });
  },

  setColorCat(cat) {
    AutoAcm.state.activeCat = cat;
    AutoAcm.renderColorGrid();
  },

  selectColor(nome, skipSave) {
    AutoAcm.state.selectedColor = nome;
    // Encontra RGB
    for (const cat in AutoAcm.state.cores) {
      const found = AutoAcm.state.cores[cat].find(c => c.nome === nome);
      if (found) {
        AutoAcm.state.selectedColorRgb = found.rgb;
        if (AutoAcm.state.ordemCat.includes(cat)) {
          AutoAcm.state.activeCat = cat;
        }
        break;
      }
    }
    AutoAcm._renderColorSelected();
    AutoAcm.renderColorGrid();

    if (!skipSave) {
      // Persiste no módulo ativo
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (m && m.params) m.params.cor_acm = nome;
      AutoAcm.scheduleRedraw();
      AutoAcm.scheduleRedraw3D();
    }
  },

  _renderColorSelected() {
    const prev = document.getElementById('aa_color_preview');
    const nm   = document.getElementById('aa_color_name');
    if (prev) prev.style.background = `rgb(${AutoAcm.state.selectedColorRgb.join(',')})`;
    if (nm) {
      if (AutoAcm.state.selectedColor) {
        nm.textContent = AutoAcm.state.selectedColor;
      } else {
        nm.textContent = I18n.t('aa.acm.color.empty', 'Selecione uma cor');
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // RESUMO DOS PARÂMETROS (FASE 9)
  // ══════════════════════════════════════════════════════════════════

  updateResumo(m) {
    if (!m || !m.params) return;
    const p   = m.params;
    const off = I18n.t('aa.resumo.off', 'Desativado');
    const set = (id, val, isOff) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val || '—';
      el.classList.toggle('aa__resumo-value--off', !!isOff);
    };

    // Dimensões
    set('aa_r_dim', `${m.w} × ${m.h} × ${m.d} mm`);

    // ACM: espessura + cor
    const corAcm = p.cor_acm || I18n.t('aa.resumo.no_color', 'sem cor');
    set('aa_r_acm', `${p.acm_esp || 3} mm · ${corAcm}`, !p.cor_acm);

    // Chapa: tamanho + orientação
    const orientLabel = p.acm_orient === 'vertical'
      ? I18n.t('aa.acm.orient.v', 'Vertical')
      : I18n.t('aa.acm.orient.h', 'Horizontal');
    set('aa_r_chapa', `${p.acm_chapa_comp || 5000}×${p.acm_chapa || 1220} mm · ${orientLabel}`);

    // Metalon
    set('aa_r_metalon', `${p.met_w || 20} × ${p.met_h || 20} mm`);

    // Junta
    let juntaStr;
    if (p.junta_tipo === 'dilatacao') {
      juntaStr = `${I18n.t('aa.junta.dilatacao', 'Dilatação')} ${p.junta_mm || 8}mm · ${p.cor_junta || 'Preto'}`;
    } else {
      juntaStr = `${I18n.t('aa.junta.seca', 'Seca')} · ${p.cor_junta || 'Preto'}`;
    }
    set('aa_r_junta', juntaStr);

    // Emenda
    const alignMap = {
      esquerda:  I18n.t('aa.emenda.align.esq', 'Esq.'),
      central:   I18n.t('aa.emenda.align.cen', 'Centro'),
      direita:   I18n.t('aa.emenda.align.dir', 'Dir.'),
      simetrica: I18n.t('aa.emenda.align.sim', 'Sim.')
    };
    const alignLbl = alignMap[p.emenda_align] || p.emenda_align;
    set('aa_r_emenda', `${p.emenda_w || 30} × ${p.emenda_h || 20} mm · ${alignLbl}`);

    // Fita DF (ligada por padrão; só "off" se explicitamente false)
    if (p.fita_inc !== false) {
      set('aa_r_fita', `${p.fita_larg || 12} × ${p.fita_esp || 0.9} mm`);
    } else {
      set('aa_r_fita', off, true);
    }

    // Spots
    if (p.spots_inc) {
      const tipo = p.spots_tipo || 'circular';
      const tipoLbl = {
        circular: I18n.t('aa.spots.type.circular', 'Circular'),
        quadrado: I18n.t('aa.spots.type.quadrado', 'Quadrado'),
        linear:   I18n.t('aa.spots.type.linear',   'Linear')
      }[tipo] || tipo;
      const qtd = p.spots_qtd || 5;
      const facesOn = [];
      ['frontal', 'traseira', 'topo', 'base', 'esq', 'dir'].forEach(f => {
        if (p.spots_faces && p.spots_faces[f]) {
          facesOn.push(I18n.t('aa.role.' + f, f));
        }
      });
      const facesStr = facesOn.length ? facesOn.join(', ') : '—';
      set('aa_r_spots', `${qtd} × ${tipoLbl} · ${facesStr}`);
    } else {
      set('aa_r_spots', off, true);
    }

    // Faces revestidas
    const enabFaces = [];
    ['frontal', 'traseira', 'topo', 'base', 'esq', 'dir'].forEach(f => {
      if (p.enab && p.enab[f]) enabFaces.push(I18n.t('aa.role.' + f, f));
    });
    set('aa_r_faces', enabFaces.length ? enabFaces.join(' · ') : off, !enabFaces.length);
  },

  // ══════════════════════════════════════════════════════════════════
  // QUANTITATIVO DE MATERIAIS (FASE 9)
  // ══════════════════════════════════════════════════════════════════

  updateQuantitativo(m) {
    const sec = document.getElementById('aa_quant_section');
    const grid = document.getElementById('aa_quant_grid');
    if (!sec || !grid) return;

    // Só mostra se existe quant (i.e., foi gerado)
    const q = m && m.quant;
    if (!q || !q.met_pecas) {
      sec.hidden = true;
      AutoAcm._updatePlanoVisibility(m);
      return;
    }
    sec.hidden = false;
    AutoAcm._updatePlanoVisibility(m);

    const cards = [];

    // ACM — recalcula chapas reais (estimador Ruby diverge do layout)
    const realChapas = AutoAcm._computeChapasReal(q, m.params, m);
    if (realChapas > 0) q.acm_chapas_est = realChapas;
    const acmM2 = (q.acm_total_m2 != null) ? q.acm_total_m2 : 0;
    const acmChapas = q.acm_chapas_est != null ? q.acm_chapas_est : 0;
    cards.push({
      label: I18n.t('aa.quant.acm', 'Área total ACM'),
      value: (+acmM2).toFixed(2),
      unit:  'm²',
      sub:   `${acmChapas} ${I18n.t('aa.quant.chapas', 'chapa(s)')}` + (m.params.cor_acm ? ` · ${m.params.cor_acm}` : '')
    });

    // Metalon (estrutura)
    const metM      = (q.met_m != null) ? q.met_m : 0;
    const metBarras = (q.met_barras != null) ? q.met_barras : Math.ceil(metM / 6);
    const metWh     = q.metalon_wh || `${m.params.met_w}x${m.params.met_h}`;
    cards.push({
      label: I18n.t('aa.quant.metalon', 'Metalon (estrutura)'),
      value: (+metM).toFixed(2),
      unit:  'm',
      sub:   `${metBarras} ${I18n.t('aa.quant.barras', 'barra(s) 6m')} · ${metWh} mm`
    });

    // Emendas (se houver)
    const emM      = (q.em_m != null) ? q.em_m : 0;
    const emBarras = (q.em_barras != null) ? q.em_barras : Math.ceil(emM / 6);
    if (emM > 0.01) {
      const emWh = (q.emenda_w && q.emenda_h) ? `${q.emenda_w}x${q.emenda_h}` : `${m.params.emenda_w}x${m.params.emenda_h}`;
      cards.push({
        label: I18n.t('aa.quant.emendas', 'Emendas'),
        value: (+emM).toFixed(2),
        unit:  'm',
        sub:   `${emBarras} ${I18n.t('aa.quant.barras', 'barra(s) 6m')} · ${emWh} mm`
      });
      // Metalon TOTAL (estrutura + emendas)
      const totalM = metM + emM;
      cards.push({
        label: I18n.t('aa.quant.metalon_total', 'Metalon TOTAL'),
        value: totalM.toFixed(2),
        unit:  'm',
        sub:   `${Math.ceil(totalM / 6)} ${I18n.t('aa.quant.barras', 'barra(s) 6m')} · ${I18n.t('aa.quant.total_sub', 'estrutura + emendas')}`
      });
    }

    // Fita DF (ligada por padrão; só "off" se explicitamente false)
    if (m.params.fita_inc !== false) {
      const fitaM = (q.fita_m != null) ? q.fita_m : 0;
      cards.push({
        label: I18n.t('aa.quant.fita', 'Fita dupla-face'),
        value: (+fitaM).toFixed(2),
        unit:  'm',
        sub:   `${m.params.fita_larg} × ${m.params.fita_esp} mm`
      });
    }

    // Spots
    if (m.params.spots_inc && q.spots_pecas) {
      const spQtd = q.spots_pecas.length || (m.params.spots_qtd || 0);
      const tipoLbl = {
        circular: I18n.t('aa.spots.type.circular', 'Circular'),
        quadrado: I18n.t('aa.spots.type.quadrado', 'Quadrado'),
        linear:   I18n.t('aa.spots.type.linear',   'Linear')
      }[m.params.spots_tipo || 'circular'];
      cards.push({
        label: I18n.t('aa.quant.spots', 'Spots'),
        value: spQtd,
        unit:  I18n.t('aa.quant.un', 'un'),
        sub:   tipoLbl
      });
    }

    // Junta (só tem metros se dilatação)
    if (m.params.junta_tipo === 'dilatacao' && q.junta_m) {
      cards.push({
        label: I18n.t('aa.quant.junta', 'Juntas de dilatação'),
        value: (+q.junta_m).toFixed(2),
        unit:  'm',
        sub:   `${m.params.junta_mm} mm · ${m.params.cor_junta}`
      });
    }

    // Renderiza — estilo minimal, sem cores nem ícones
    grid.innerHTML = cards.map(c => `
      <div class="aa__quant-card">
        <div class="aa__quant-label">${c.label}</div>
        <div class="aa__quant-value">${c.value}<span class="aa__quant-unit">${c.unit}</span></div>
        <div class="aa__quant-sub">${c.sub}</div>
      </div>
    `).join('');
  },

  // ══════════════════════════════════════════════════════════════════
  // TAMANHO DA CHAPA (preset + custom)
  // ══════════════════════════════════════════════════════════════════

  /** Presets disponíveis — usados em onChapaPresetChange e _syncChapaPreset */
  _CHAPA_PRESETS: {
    '5000x1220': { comp: 5000, larg: 1220 },
    '5000x1500': { comp: 5000, larg: 1500 },
    '2440x1220': { comp: 2440, larg: 1220 },
    '3200x1500': { comp: 3200, larg: 1500 }
  },

  /** Handler do <select> de preset. */
  onChapaPresetChange() {
    const sel = document.getElementById('aa_chapa_preset');
    const wrap = document.getElementById('aa_chapa_custom_wrap');
    if (!sel) return;
    const val = sel.value;
    if (val === 'custom') {
      if (wrap) wrap.hidden = false;
      AutoAcm.onChapaCustomChange();
      return;
    }
    if (wrap) wrap.hidden = true;
    const preset = AutoAcm._CHAPA_PRESETS[val];
    if (!preset) return;
    AutoAcm._setVal('aa_acm_chapa', preset.larg);
    AutoAcm._setVal('aa_chapa_comp_custom', preset.comp);
    AutoAcm._setVal('aa_chapa_larg_custom', preset.larg);
    AutoAcm._applyChapaSize(preset.comp, preset.larg);
  },

  /** Handler dos inputs custom (comp + larg). Só dispara redraw, NÃO troca o preset. */
  onChapaCustomChange() {
    const comp = parseInt(AutoAcm._val('aa_chapa_comp_custom', 5000), 10) || 5000;
    const larg = parseInt(AutoAcm._val('aa_chapa_larg_custom', 1220), 10) || 1220;
    AutoAcm._setVal('aa_acm_chapa', larg);
    AutoAcm._applyChapaSize(comp, larg);
  },

  /** Aplica novo tamanho no state ativo, limpa cache de emendas e redesenha. */
  _applyChapaSize(comp, larg) {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (m && m.params) {
      m.params.acm_chapa      = larg;
      m.params.acm_chapa_comp = comp;
      m.params.planEmH = null;
      m.params.planEmV = null;
    }
    AutoAcm.scheduleRedraw();
    AutoAcm.scheduleRedraw3D();
  },

  /** Pega comp+larg e ajusta o <select> de preset (mostra/esconde o custom). */
  _syncChapaPreset(comp, larg) {
    const sel = document.getElementById('aa_chapa_preset');
    const wrap = document.getElementById('aa_chapa_custom_wrap');
    if (!sel) return;
    const key = comp + 'x' + larg;
    if (AutoAcm._CHAPA_PRESETS[key]) {
      sel.value = key;
      if (wrap) wrap.hidden = true;
    } else {
      sel.value = 'custom';
      if (wrap) wrap.hidden = false;
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // ORIENTAÇÃO (pill group)
  // ══════════════════════════════════════════════════════════════════

  setOrient(val, skipSave) {
    // filtra só pills com data-val (não afeta data-jt nem data-align)
    document.querySelectorAll('.aa__pill[data-val]').forEach(p => {
      p.classList.toggle('is-active', p.dataset.val === val);
    });
    if (!skipSave) {
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (m && m.params) {
        m.params.acm_orient = val;
        m.params.planEmH = null;
        m.params.planEmV = null;
      }
      AutoAcm.scheduleRedraw();
      AutoAcm.scheduleRedraw3D();
    }
  },

  /**
   * Calcula quantas chapas seriam necessárias na orientação OPOSTA
   * e mostra um hint se a outra for melhor.
   * Heurística: simula _calcEmendas pros dois eixos em cada orientação
   * e conta retângulos resultantes.
   */
  _updateOrientHint(m, unfoldedW, perimTotal, jt) {
    const el = document.getElementById('aa_orient_hint');
    if (!el || !m || !m.params) return;
    const p = m.params;
    const chapaLarg = parseInt(p.acm_chapa || 1220, 10);
    const chapaComp = parseInt(p.acm_chapa_comp || 5000, 10);
    const align = p.emenda_align || 'esquerda';

    const countChapas = (horChapa, verChapa) => {
      const emH = AutoAcm._calcEmendas(unfoldedW, horChapa, jt, align);
      const emV = AutoAcm._calcEmendas(perimTotal, verChapa, jt, align);
      return (emH.length + 1) * (emV.length + 1);
    };

    // Horizontal: chapaComp na largura unfolded, chapaLarg na altura perimetral
    const nHor = countChapas(chapaComp, chapaLarg);
    // Vertical: chapaLarg na largura, chapaComp na altura
    const nVer = countChapas(chapaLarg, chapaComp);

    const cur = (p.acm_orient === 'vertical') ? nVer : nHor;
    const oth = (p.acm_orient === 'vertical') ? nHor : nVer;
    const otherName = (p.acm_orient === 'vertical')
      ? I18n.t('aa.acm.orient.h', 'Horizontal')
      : I18n.t('aa.acm.orient.v', 'Vertical');

    if (oth < cur) {
      const saved = cur - oth;
      const pct   = Math.round((saved / cur) * 100);
      el.hidden = false;
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>` +
        ' ' + I18n.t('aa.acm.orient.hint',
          '{name} economiza {saved} chapas (~{pct}%): {oth} vs {cur}.')
          .replace('{name}', otherName)
          .replace('{saved}', String(saved))
          .replace('{pct}',   String(pct))
          .replace('{oth}',   String(oth))
          .replace('{cur}',   String(cur));
    } else if (cur === oth) {
      el.hidden = true;
    } else {
      el.hidden = false;
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` +
        ' ' + I18n.t('aa.acm.orient.optimal',
          'Orientação atual é a mais econômica ({cur} chapas).')
          .replace('{cur}', String(cur));
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // JUNTAS (FASE 3)
  // ══════════════════════════════════════════════════════════════════

  setJuntaTipo(val, skipSave) {
    document.querySelectorAll('.aa__pill[data-jt]').forEach(p => {
      p.classList.toggle('is-active', p.dataset.jt === val);
    });
    // Mostra/esconde campo de mm
    const wrap = document.getElementById('aa_junta_mm_wrap');
    if (wrap) wrap.hidden = (val !== 'dilatacao');
    // Garante swatches renderizados (cobre re-captura e reabrir plugin)
    AutoAcm.renderJuntaSwatches();
    if (!skipSave) {
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (m && m.params) m.params.junta_tipo = val;
      AutoAcm.scheduleRedraw();
      AutoAcm.scheduleRedraw3D();
    }
  },

  renderJuntaSwatches() {
    const el = document.getElementById('aa_junta_swatches');
    if (!el || !AutoAcm.state.juntaColors.length) return;
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    const selected = (m && m.params && m.params.cor_junta) || 'Preto';
    el.innerHTML = AutoAcm.state.juntaColors.map((c, i) => {
      const isSel = (c.nome === selected) ? ' is-selected' : '';
      return `<div class="aa__junta-swatch${isSel}" data-idx="${i}" style="background: rgb(${c.rgb.join(',')})" title="${AutoAcm._escape(c.nome)}"></div>`;
    }).join('') +
      `<button type="button" class="aa__junta-swatch aa__junta-swatch--add" id="aa_junta_add" title="${AutoAcm._escape(I18n.t('aa.junta.add', 'Adicionar cor'))}">+</button>`;
    el.querySelectorAll('.aa__junta-swatch[data-idx]').forEach(sw => {
      const idx = parseInt(sw.dataset.idx, 10);
      const c = AutoAcm.state.juntaColors[idx];
      if (!c) return;
      sw.onclick = () => AutoAcm._selectJunta(c.nome);
    });
    const addBtn = document.getElementById('aa_junta_add');
    if (addBtn) addBtn.onclick = () => AutoAcm.addJuntaCor();
  },

  // ══════════════════════════════════════════════════════════════════
  // CORES DE JUNTA CUSTOM — paleta + seletor livre, salvas no PC
  // ══════════════════════════════════════════════════════════════════

  _JUNTA_CORES_KEY: 'acmfacil_junta_cores_custom',

  // Paleta de cores extras prontas pra clicar no modal
  _JUNTA_PALETTE: [
    { nome: 'Vermelho',     hex: '#c0392b' }, { nome: 'Laranja',     hex: '#e67e22' },
    { nome: 'Amarelo',      hex: '#f1c40f' }, { nome: 'Verde',       hex: '#27ae60' },
    { nome: 'Verde Escuro', hex: '#145a32' }, { nome: 'Azul',        hex: '#2980b9' },
    { nome: 'Azul Escuro',  hex: '#1b2a49' }, { nome: 'Roxo',        hex: '#8e44ad' },
    { nome: 'Rosa',         hex: '#e84393' }, { nome: 'Terracota',   hex: '#b7410e' },
    { nome: 'Vinho',        hex: '#6d071a' }, { nome: 'Petróleo',    hex: '#14505c' },
    { nome: 'Turquesa',     hex: '#1abc9c' }, { nome: 'Bege',        hex: '#d2b48c' },
    { nome: 'Creme',        hex: '#f5f0e1' }, { nome: 'Areia',       hex: '#c2b280' },
    { nome: 'Dourado',      hex: '#b8860b' }, { nome: 'Bronze',      hex: '#8c7853' },
    { nome: 'Grafite',      hex: '#2c3e50' }, { nome: 'Off-white',   hex: '#f4f4f0' }
  ],

  /** Reinsere no state as cores de junta custom salvas em localStorage. */
  _mergeCustomJuntaCores() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(AutoAcm._JUNTA_CORES_KEY) || '[]'); } catch (e) {}
    list.forEach(c => {
      if (!c || !c.nome || !Array.isArray(c.rgb)) return;
      if (!AutoAcm.state.juntaColors.some(x => x.nome === c.nome)) {
        AutoAcm.state.juntaColors.push({ nome: c.nome, rgb: c.rgb });
      }
    });
  },

  _hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },

  /** Monta o corpo do modal: grade de paleta + seletor livre + nome. */
  _buildJuntaModalBody() {
    const wrap = document.createElement('div');
    wrap.className = 'junta-pal';
    const grid = AutoAcm._JUNTA_PALETTE.map(c =>
      `<button type="button" class="junta-pal__swatch" data-hex="${c.hex}" data-nome="${AutoAcm._escape(c.nome)}" style="background:${c.hex}" title="${AutoAcm._escape(c.nome)}"></button>`
    ).join('');
    wrap.innerHTML = `
      <p class="junta-pal__hint">${AutoAcm._escape(I18n.t('aa.junta.add.pick', 'Escolha uma cor pronta ou crie a sua:'))}</p>
      <div class="junta-pal__grid">${grid}</div>
      <div class="junta-pal__custom">
        <input type="color" class="junta-pal__color" id="aa_junta_new_color" value="#888888">
        <input type="text" class="junta-pal__name field__input" id="aa_junta_new_name" placeholder="${AutoAcm._escape(I18n.t('aa.junta.add.name', 'Nome da cor'))}">
      </div>
    `;
    // Clicar numa cor da paleta preenche o seletor + nome
    wrap.querySelectorAll('.junta-pal__swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        wrap.querySelectorAll('.junta-pal__swatch').forEach(s => s.classList.remove('is-selected'));
        sw.classList.add('is-selected');
        const colorEl = wrap.querySelector('#aa_junta_new_color');
        const nameEl  = wrap.querySelector('#aa_junta_new_name');
        if (colorEl) colorEl.value = sw.dataset.hex;
        if (nameEl && !nameEl.value.trim()) nameEl.value = sw.dataset.nome;
      });
    });
    return wrap;
  },

  /** Botão (+): abre o modal, adiciona a cor escolhida, salva e seleciona. */
  async addJuntaCor() {
    const body = AutoAcm._buildJuntaModalBody();
    const res = await Modal.show({
      title: I18n.t('aa.junta.add.title', 'Adicionar cor de junta'),
      body,
      buttons: [
        { label: I18n.t('modal.cancel', 'Cancelar'), variant: 'secondary', value: null },
        {
          label: I18n.t('modal.add', 'Adicionar'), variant: 'primary',
          onClick: (bodyEl) => {
            const hex = (bodyEl.querySelector('#aa_junta_new_color') || {}).value || '#888888';
            let nome = ((bodyEl.querySelector('#aa_junta_new_name') || {}).value || '').trim();
            if (!nome) nome = hex.toUpperCase();
            return { nome, rgb: AutoAcm._hexToRgb(hex) };
          }
        }
      ]
    });
    if (!res || !res.rgb) return;

    // Dedup por nome: se já existe, sobrescreve o rgb
    const existing = AutoAcm.state.juntaColors.find(c => c.nome === res.nome);
    if (existing) existing.rgb = res.rgb;
    else AutoAcm.state.juntaColors.push({ nome: res.nome, rgb: res.rgb });

    // Persiste no PC (só as custom, não as do catálogo Ruby)
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(AutoAcm._JUNTA_CORES_KEY) || '[]'); } catch (e) {}
    saved = saved.filter(c => c && c.nome !== res.nome);
    saved.push({ nome: res.nome, rgb: res.rgb });
    localStorage.setItem(AutoAcm._JUNTA_CORES_KEY, JSON.stringify(saved));

    AutoAcm._selectJunta(res.nome);
    AutoAcm.renderJuntaSwatches();
  },

  _selectJunta(nome, skipSave) {
    if (!skipSave) {
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (m && m.params) m.params.cor_junta = nome;
      AutoAcm.scheduleRedraw();
    }
    // Se DOM ainda não tem swatches (re-captura, módulo trocado),
    // re-renderiza. Caso contrário só alterna o is-selected.
    const el = document.getElementById('aa_junta_swatches');
    if (el && el.children.length === 0) {
      AutoAcm.renderJuntaSwatches();
      return;
    }
    document.querySelectorAll('.aa__junta-swatch').forEach((sw, i) => {
      const c = AutoAcm.state.juntaColors[i];
      if (c) sw.classList.toggle('is-selected', c.nome === nome);
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // EMENDAS (FASE 3)
  // ══════════════════════════════════════════════════════════════════

  setEmendaAlign(val, skipSave) {
    document.querySelectorAll('.aa__pill[data-align]').forEach(p => {
      p.classList.toggle('is-active', p.dataset.align === val);
    });
    if (!skipSave) {
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (m && m.params) {
        m.params.emenda_align = val;
        // Reset emendas customizadas — força recálculo com o novo alinhamento
        m.params.planEmH = null;
        m.params.planEmV = null;
      }
      AutoAcm.scheduleRedraw();
      AutoAcm.scheduleRedraw3D();
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // FITA DUPLA-FACE (FASE 3)
  // ══════════════════════════════════════════════════════════════════

  toggleFita() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (m && m.params) m.params.fita_inc = AutoAcm._chk('aa_fita_inc');
    AutoAcm._refreshFitaVisual();
  },

  _refreshFitaVisual() {
    const sec = document.getElementById('aa_fita_section');
    if (!sec) return;
    const on = AutoAcm._chk('aa_fita_inc');
    sec.classList.toggle('is-disabled', !on);
  },

  // ══════════════════════════════════════════════════════════════════
  // SPOTS DE ILUMINAÇÃO (FASE 4)
  // ══════════════════════════════════════════════════════════════════

  toggleSpots() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (m && m.params) m.params.spots_inc = AutoAcm._chk('aa_spots_inc');
    AutoAcm._refreshSpotsVisual();
    AutoAcm.scheduleRedraw();
    AutoAcm.scheduleRedraw3D();
  },

  _refreshSpotsVisual() {
    const cfg = document.getElementById('aa_spots_cfg');
    if (!cfg) return;
    const on = AutoAcm._chk('aa_spots_inc');
    cfg.hidden = !on;
  },

  setSpotTipo(val, skipSave) {
    // Atualiza pills
    document.querySelectorAll('.aa__pill[data-spot-type]').forEach(p => {
      p.classList.toggle('is-active', p.dataset.spotType === val);
    });
    // Mostra/esconde grids de dimensões correspondentes
    const circ = document.getElementById('aa_spots_dim_circ');
    const quad = document.getElementById('aa_spots_dim_quad');
    const lin  = document.getElementById('aa_spots_dim_lin');
    if (circ) circ.hidden = (val !== 'circular');
    if (quad) quad.hidden = (val !== 'quadrado');
    if (lin)  lin.hidden  = (val !== 'linear');

    if (!skipSave) {
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (m && m.params) m.params.spots_tipo = val;
      AutoAcm.scheduleRedraw();
      AutoAcm.scheduleRedraw3D();
    }
  },

  toggleSpotFace(face) {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.params) return;
    if (!m.params.spots_faces) m.params.spots_faces = {};
    m.params.spots_faces[face] = !m.params.spots_faces[face];
    AutoAcm._refreshSpotFacesVisual();
    AutoAcm.scheduleRedraw();
  },

  _refreshSpotFacesVisual() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    const faces = (m && m.params && m.params.spots_faces) || {};
    document.querySelectorAll('.aa__chip[data-spot-face]').forEach(chip => {
      const f = chip.dataset.spotFace;
      chip.classList.toggle('is-active', !!faces[f]);
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // PLANO DE CORTE (FASE 10)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Mostra/esconde a seção de plano de corte.
   * Só aparece depois que o módulo foi gerado.
   */
  _updatePlanoVisibility(m) {
    const sec = document.getElementById('aa_plano_section');
    if (!sec) return;
    const hasQuant = !!(m && m.quant && m.quant.met_pecas);
    sec.hidden = !hasQuant;

    // Multi-módulo: mostra botão "Plano de TODOS" se há 2+ módulos E pelo
    // menos 2 já foram gerados (senão não tem o que consolidar)
    const btnAll = document.getElementById('aa_btn_plano_all');
    const btnAllLabel = document.getElementById('aa_btn_plano_all_label');
    const btnLabel = document.getElementById('aa_btn_plano_label');
    if (btnAll) {
      const gerados = AutoAcm.state.modulos.filter(x => x && x.quant && x.quant.met_pecas);
      const isMulti = AutoAcm.state.modulos.length > 1 && gerados.length >= 2;
      btnAll.hidden = !isMulti;
      if (isMulti && btnAllLabel) {
        btnAllLabel.textContent = (I18n.t('aa.plano.all', 'Plano de todos os módulos')) + ' (' + gerados.length + ')';
      }
      // No modo multi, o primeiro botão vira "deste módulo"
      if (btnLabel) {
        btnLabel.textContent = isMulti
          ? I18n.t('aa.plano.this', 'Plano deste módulo')
          : I18n.t('aa.plano.btn', 'Exportar plano de corte');
      }
    }
  },

  /**
   * Exporta o preview 2D planificado em alta resolução como dataURL.
   */
  _exportCanvas2D() {
    const c = document.getElementById('aa_preview');
    if (!c) return null;
    if (c.width < 10 || c.height < 10) {
      console.warn('[AutoAcm] canvas 2D sem dimensões');
      return null;
    }
    try {
      const url = c.toDataURL('image/png');
      if (!url || url.length < 100 || url === 'data:,') {
        console.warn('[AutoAcm] canvas 2D retornou dataURL vazio');
        return null;
      }
      return url;
    } catch (e) {
      console.error('[AutoAcm] exportCanvas2D:', e);
      return null;
    }
  },

  _exportCanvas3D() {
    const c = document.getElementById('aa_preview3d');
    if (!c) return null;
    if (c.width < 10 || c.height < 10) {
      console.warn('[AutoAcm] canvas 3D sem dimensões');
      return null;
    }
    try {
      const url = c.toDataURL('image/png');
      if (!url || url.length < 100 || url === 'data:,') {
        console.warn('[AutoAcm] canvas 3D retornou dataURL vazio');
        return null;
      }
      return url;
    } catch (e) {
      console.error('[AutoAcm] exportCanvas3D:', e);
      return null;
    }
  },

  /**
   * Exporta o plano de corte do módulo ATIVO (modo single).
   */
  async gerarPlano() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m) return;
    if (!m.quant || !m.quant.met_pecas) {
      AutoAcm._showPlanoStatus(I18n.t('aa.plano.err.no_quant', 'Gere a estrutura primeiro.'), 'error');
      return;
    }

    const btn = document.getElementById('aa_btn_plano');
    if (btn) btn.classList.add('is-loading');
    AutoAcm._showPlanoStatus(I18n.t('aa.plano.loading', 'Gerando plano de corte...'), 'info');

    try {
      AutoAcm.draw2D();
      await new Promise(r => setTimeout(r, 150));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const empresa = await AutoAcm._fetchEmpresa();
      const html = AutoAcm._buildPlanoHtml(m, empresa);
      if (!html) {
        AutoAcm._showPlanoStatus(I18n.t('aa.plano.err.build', 'Falha ao montar o plano.'), 'error');
        return;
      }
      console.log('[AutoAcm] plano single HTML:', html.length, 'chars');

      const dateStr = new Date().toISOString().slice(0, 10);
      const nomeSafe = (m.nome || 'AutoACM').replace(/[^a-z0-9_-]/gi, '_');
      const suggested = `Plano_${nomeSafe}_${dateStr}`;
      const fileName = await AutoAcm._askFileName(suggested);
      if (!fileName) {
        AutoAcm._hidePlanoStatus();
        return;
      }

      await AutoAcm._enviarPlanoParaRuby(fileName, html);
    } catch (e) {
      AutoAcm._showPlanoStatus(I18n.t('auth.error.comm') + ': ' + e.message, 'error');
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  },

  /**
   * Exporta o plano de corte CONSOLIDADO de todos os módulos gerados
   * (modo multi-módulo). Começa com capa + tabela com miniaturas e
   * totais, depois cada módulo com suas 7 páginas + tabelas.
   */
  async gerarPlanoMulti() {
    const gerados = AutoAcm.state.modulos.filter(m => m && m.quant && m.quant.met_pecas);
    if (gerados.length === 0) {
      AutoAcm._showPlanoStatus(I18n.t('aa.plano.err.no_quant', 'Gere a estrutura primeiro.'), 'error');
      return;
    }
    if (gerados.length < 2) {
      AutoAcm._showPlanoStatus(I18n.t('aa.plano.err.multi_need2', 'Gere pelo menos 2 módulos para consolidar.'), 'error');
      return;
    }

    const btn = document.getElementById('aa_btn_plano_all');
    if (btn) btn.classList.add('is-loading');
    AutoAcm._showPlanoStatus(I18n.t('aa.plano.loading_multi', 'Gerando plano consolidado...'), 'info');

    try {
      AutoAcm.draw2D();
      await new Promise(r => setTimeout(r, 250));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const empresa = await AutoAcm._fetchEmpresa();
      const html = AutoAcm._buildPlanoHtmlMulti(gerados, empresa);
      if (!html) {
        AutoAcm._showPlanoStatus(I18n.t('aa.plano.err.build', 'Falha ao montar o plano.'), 'error');
        return;
      }
      console.log('[AutoAcm] plano multi HTML:', html.length, 'chars', 'modulos:', gerados.length);

      const dateStr = new Date().toISOString().slice(0, 10);
      const suggested = `Plano_MultiMod_${gerados.length}_${dateStr}`;
      const fileName = await AutoAcm._askFileName(suggested);
      if (!fileName) {
        AutoAcm._hidePlanoStatus();
        return;
      }

      await AutoAcm._enviarPlanoParaRuby(fileName, html);
    } catch (e) {
      AutoAcm._showPlanoStatus(I18n.t('auth.error.comm') + ': ' + e.message, 'error');
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  },

  /**
   * Abre um Modal.prompt pro usuário confirmar/editar o nome do arquivo.
   * Sanitiza, valida e devolve o nome final (ou null se cancelou).
   */
  async _askFileName(suggested) {
    const raw = await Modal.prompt(
      I18n.t('aa.plano.filename.title', 'Nome do arquivo'),
      I18n.t('aa.plano.filename.msg',
        'Confirme ou edite o nome (apenas letras, números, _ e -):'),
      suggested
    );
    if (raw === null) return null; // cancelou

    // Remove extensão se digitada, sanitiza
    let name = String(raw).trim().replace(/\.html?$/i, '');
    name = name.replace(/[^a-z0-9_\-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

    if (!name || name.length < 2) {
      Toast.error(I18n.t('aa.plano.filename.invalid',
        'Nome inválido. Use letras, números, _ ou -.'));
      return null;
    }
    if (name.length > 80) name = name.slice(0, 80);
    return name;
  },

  /**
   * Envia o HTML do plano pro Ruby salvar e abrir no browser.
   */
  async _enviarPlanoParaRuby(fileName, html) {
    const b64 = btoa(unescape(encodeURIComponent(html)));
    const r = await Bridge.call('autoacm_salvar_plano', { name: fileName, content: b64 });

    if (r && r.ok) {
      AutoAcm._showPlanoStatus(
        I18n.t('aa.plano.ok', '✓ Plano salvo em: {path}').replace('{path}', r.path || ''),
        'success'
      );
    } else if (r && r.code === 'user_cancelled') {
      AutoAcm._hidePlanoStatus();
    } else {
      AutoAcm._showPlanoStatus(
        I18n.t('aa.plano.err.save', 'Erro ao salvar') + ': ' + (r && r.error || '?'),
        'error'
      );
    }
  },

  _showPlanoStatus(msg, kind) {
    const el = document.getElementById('aa_plano_status');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.className = 'aa__gerar-status';
    if (kind === 'success') el.classList.add('aa__gerar-status--success');
    else if (kind === 'error') el.classList.add('aa__gerar-status--error');
    if (kind === 'success') {
      clearTimeout(AutoAcm._planoStatusTimer);
      AutoAcm._planoStatusTimer = setTimeout(() => { el.hidden = true; }, 8000);
    }
  },
  _hidePlanoStatus() {
    const el = document.getElementById('aa_plano_status');
    if (el) el.hidden = true;
  },

  /**
   * Gera o PACOTE de páginas de UM módulo (7 canvas + p6 HTML).
   * Retorna { imgs, p6Html, nome, dim, q, p } — o HTML final é montado
   * por _buildPlanoHtml (single) ou _buildPlanoHtmlMulti (consolidado).
   * Portado do legacy aaGerarPDFSingle, adaptado pro tema light.
   */
  _buildModuloPackage(m) {
    if (!m || !m.quant || !m.quant.met_pecas) return null;
    const q  = m.quant;
    const p  = m.params;
    const dt = new Date().toLocaleDateString('pt-BR');
    const nome = (m.nome || 'Auto-ACM').toString();
    const modTit = (m.nome && m.nome !== 'Auto-ACM') ? ' — ' + m.nome : '';

    const CW = 1600, CH = 1000;

    // Normaliza alguns campos que podem não estar no quant
    q.w = q.w || m.w;
    q.h = q.h || m.h;
    q.d = q.d || m.d;
    q.metalon_wh  = q.metalon_wh  || (p.met_w + 'x' + p.met_h);
    q.emenda_w    = q.emenda_w    || p.emenda_w;
    q.emenda_h    = q.emenda_h    || p.emenda_h;
    q.chapa_larg  = q.chapa_larg  || p.acm_chapa;
    q.chapa_comp  = q.chapa_comp  || p.acm_chapa_comp || 5000;
    q.chapa_orient= q.chapa_orient|| p.acm_orient;
    q.cor_acm     = q.cor_acm     || p.cor_acm;
    q.cor_junta   = q.cor_junta   || p.cor_junta;
    q.acm_mm      = q.acm_mm      || p.acm_esp;
    q.fita_mm     = q.fita_mm     || p.fita_esp;
    q.enab        = q.enab        || p.enab || { frontal:true, traseira:false, topo:true, base:true, esq:true, dir:true };

    // ── Recálculo do número REAL de chapas ACM (ver _computeChapasReal) ──
    const realChapas = AutoAcm._computeChapasReal(q, p, m);
    if (realChapas > 0) q.acm_chapas_est = realChapas;

    // ── Paleta light theme ──
    const COR_ACM      = '#e2e8f0';
    const COR_METALON  = '#3b82f6';
    const COR_TRAVESSA = '#2563eb';
    const COR_PERIM    = '#1d4ed8';
    const COR_EMENDA   = '#dc2626';
    const COR_FITA     = '#059669';
    const TEXT_DARK    = '#171717';
    const TEXT_MUTED   = '#737373';
    const TEXT_SUBTLE  = '#a3a3a3';
    const BORDER       = '#e5e5e5';
    const BORDER_SUB   = '#f5f5f5';

    // ── Struct bounds (bounds reais da estrutura de metalon) ──
    const SB = (() => {
      if (!q.met_pecas || q.met_pecas.length === 0) {
        return {
          minX: 0, maxX: q.w, minY: 0, maxY: q.d, minZ: 0, maxZ: q.h,
          w: q.w, d: q.d, h: q.h
        };
      }
      let miX = 1e9, maX = -1e9, miY = 1e9, maY = -1e9, miZ = 1e9, maZ = -1e9;
      q.met_pecas.forEach(pc => {
        if (pc.x < miX) miX = pc.x;
        if (pc.x + pc.w > maX) maX = pc.x + pc.w;
        if (pc.y < miY) miY = pc.y;
        if (pc.y + pc.d > maY) maY = pc.y + pc.d;
        if (pc.z < miZ) miZ = pc.z;
        if (pc.z + pc.h > maZ) maZ = pc.z + pc.h;
      });
      return {
        minX: Math.round(miX), maxX: Math.round(maX),
        minY: Math.round(miY), maxY: Math.round(maY),
        minZ: Math.round(miZ), maxZ: Math.round(maZ),
        w: Math.round(maX - miX),
        d: Math.round(maY - miY),
        h: Math.round(maZ - miZ)
      };
    })();

    // ══════════════════════════════════════════════════════════════
    // HELPERS (criam 1 canvas novo por página com todos os utilitários)
    // ══════════════════════════════════════════════════════════════
    const mkCanvas = () => {
      const c = document.createElement('canvas');
      c.width = CW; c.height = CH;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, CW, CH);
      return { c, g };
    };

    const hdr = (g, title, subtitle) => {
      // Header bar preto minimal (padrão do plugin)
      g.fillStyle = TEXT_DARK;
      g.fillRect(0, 0, CW, 46);
      g.font = 'bold 16px "Segoe UI", "Inter", sans-serif';
      g.fillStyle = '#ffffff';
      g.textAlign = 'left';
      g.fillText(title + modTit, 18, 28);
      g.font = '10px "Courier New", monospace';
      g.textAlign = 'right';
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText(dt + '  ·  ACMFacil / Auto-ACM', CW - 18, 18);
      g.fillText('Auto-ACM  ' + q.w + '×' + q.h + '×' + q.d + 'mm  ·  Met.' + q.metalon_wh + '  ·  Cor: ' + (q.cor_acm || '-'), CW - 18, 34);
      if (subtitle) {
        g.font = '11px "Segoe UI", "Inter", sans-serif';
        g.fillStyle = TEXT_MUTED;
        g.textAlign = 'left';
        g.fillText(subtitle, 18, 66);
      }
      // Footer
      g.fillStyle = '#fafafa';
      g.fillRect(0, CH - 24, CW, 24);
      g.strokeStyle = BORDER;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, CH - 24); g.lineTo(CW, CH - 24);
      g.stroke();
      g.font = '9px "Courier New", monospace';
      g.fillStyle = TEXT_SUBTLE;
      g.textAlign = 'center';
      g.fillText('Auto-ACM · Plano de Corte Detalhado' + (m.nome ? ' · ' + m.nome : ''), CW / 2, CH - 9);
    };

    const arrH = (g, x, y, d, s) => {
      g.beginPath();
      if (d > 0) { g.moveTo(x, y); g.lineTo(x - s, y - s * 0.4); g.lineTo(x - s, y + s * 0.4); }
      else       { g.moveTo(x, y); g.lineTo(x + s, y - s * 0.4); g.lineTo(x + s, y + s * 0.4); }
      g.fill();
    };
    const arrV = (g, x, y, d, s) => {
      g.beginPath();
      if (d > 0) { g.moveTo(x, y); g.lineTo(x - s * 0.4, y - s); g.lineTo(x + s * 0.4, y - s); }
      else       { g.moveTo(x, y); g.lineTo(x - s * 0.4, y + s); g.lineTo(x + s * 0.4, y + s); }
      g.fill();
    };

    const dimH = (g, x1, x2, y, off, txt, col, fs) => {
      if (Math.abs(x2 - x1) < 2) return;
      const c = col || TEXT_DARK;
      g.save();
      g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 0.8;
      const ya = y + off, e = off > 0 ? 5 : -5;
      g.setLineDash([1, 2]);
      g.beginPath(); g.moveTo(x1, y); g.lineTo(x1, ya + e); g.stroke();
      g.beginPath(); g.moveTo(x2, y); g.lineTo(x2, ya + e); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.moveTo(x1 + 5, ya); g.lineTo(x2 - 5, ya); g.stroke();
      arrH(g, x1, ya, 1, 5); arrH(g, x2, ya, -1, 5);
      g.font = 'bold ' + (fs || 10) + 'px "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = off > 0 ? 'top' : 'bottom';
      const mw = g.measureText(txt);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect((x1 + x2) / 2 - mw.width / 2 - 4, ya + (off > 0 ? 0 : -14), mw.width + 8, 14);
      g.fillStyle = c;
      g.fillText(txt, (x1 + x2) / 2, ya + (off > 0 ? 1 : -1));
      g.restore();
    };

    const dimV = (g, y1, y2, x, off, txt, col, fs) => {
      if (Math.abs(y2 - y1) < 2) return;
      const c = col || TEXT_DARK;
      g.save();
      g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 0.8;
      const xa = x + off, e = off > 0 ? 5 : -5;
      g.setLineDash([1, 2]);
      g.beginPath(); g.moveTo(x, y1); g.lineTo(xa + e, y1); g.stroke();
      g.beginPath(); g.moveTo(x, y2); g.lineTo(xa + e, y2); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.moveTo(xa, y1 + 5); g.lineTo(xa, y2 - 5); g.stroke();
      arrV(g, xa, y1, 1, 5); arrV(g, xa, y2, -1, 5);
      g.save();
      g.translate(xa + (off > 0 ? 3 : -3), (y1 + y2) / 2);
      g.rotate(-Math.PI / 2);
      g.font = 'bold ' + (fs || 10) + 'px "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = off > 0 ? 'bottom' : 'top';
      const mw = g.measureText(txt);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(-mw.width / 2 - 4, -14, mw.width + 8, 14);
      g.fillStyle = c;
      g.fillText(txt, 0, 0);
      g.restore();
      g.restore();
    };

    const rr = (g, x, y, w, h, fc, sc, lw) => {
      g.fillStyle = fc;
      g.fillRect(x, y, w, h);
      g.strokeStyle = sc || TEXT_DARK;
      g.lineWidth = lw || 0.8;
      g.strokeRect(x, y, w, h);
    };

    const drawPiece = (g, pc, plane, mxF, myF, color, stroke) => {
      let x1, y1, wv, hv;
      if (plane === 'XZ')      { x1 = mxF(pc.x);        y1 = myF(pc.z + pc.h); wv = mxF(pc.x + pc.w) - x1; hv = myF(pc.z) - y1; }
      else if (plane === 'YZ') { x1 = mxF(pc.y);        y1 = myF(pc.z + pc.h); wv = mxF(pc.y + pc.d) - x1; hv = myF(pc.z) - y1; }
      else                     { x1 = mxF(pc.x);        y1 = myF(pc.y + pc.d); wv = mxF(pc.x + pc.w) - x1; hv = myF(pc.y) - y1; }
      if (wv < 0) { x1 += wv; wv = -wv; }
      if (hv < 0) { y1 += hv; hv = -hv; }
      if (wv < 0.5) wv = 0.5;
      if (hv < 0.5) hv = 0.5;
      rr(g, x1, y1, wv, hv, color, stroke || '#0f172a', 0.6);
    };

    // Mini-legenda só de cores (compacta, usada em cantos sem sobrepor cotas)
    const drawLegendaCores = (g, x, y) => {
      g.save();
      g.fillStyle = 'rgba(250,250,250,0.92)';
      g.fillRect(x, y, 210, 78);
      g.strokeStyle = BORDER;
      g.lineWidth = 1;
      g.strokeRect(x, y, 210, 78);
      g.fillStyle = TEXT_DARK;
      g.font = 'bold 11px "Segoe UI", sans-serif';
      g.textAlign = 'left';
      g.fillText('LEGENDA', x + 12, y + 18);
      let ly = y + 38;
      const col = (cc, lbl2) => {
        g.fillStyle = cc; g.fillRect(x + 12, ly - 9, 16, 11);
        g.fillStyle = TEXT_MUTED; g.font = '11px "Segoe UI", sans-serif';
        g.fillText(lbl2, x + 34, ly);
        ly += 16;
      };
      col(COR_PERIM,    'Perímetro');
      col(COR_TRAVESSA, 'Travessa');
      col(COR_EMENDA,   'Emenda ACM');
      g.restore();
    };

    // (mantido por compatibilidade — chamadas antigas viraram no-op)
    const drawLegendaProjeto = () => {};

    // ══════════════════════════════════════════════════════════════
    // P1: VISTA ISOMÉTRICA COM TODAS AS EMENDAS
    // ══════════════════════════════════════════════════════════════
    const p1 = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'VISTA ISOMÉTRICA — DIMENSÕES GERAIS E EMENDAS', 'Projeto completo com marcação de TODAS as emendas horizontais e verticais do ACM');

      const drawX = 400, drawY = 110, drawW = CW - drawX - 80, drawH = CH - drawY - 150;
      const cx = drawX + drawW / 2, cy = drawY + drawH / 2;
      const w = q.w, h = q.h, d = q.d;
      let sc = Math.min(drawW * 0.75 / (w + d * 0.5), drawH * 0.85 / (h + d * 0.4));
      sc = Math.max(sc, 0.02);
      const dx = d * 0.5 * sc;
      const dy = d * 0.3 * sc;
      const W = w * sc, H = h * sc;

      const iso = (x, y, z) => [
        cx - W / 2 + (x / w) * W + (y / d) * dx,
        cy + H / 2 - (z / h) * H - (y / d) * dy
      ];
      const drawLine3 = (a, b) => {
        const pa = iso(a[0], a[1], a[2]);
        const pb = iso(b[0], b[1], b[2]);
        g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
      };

      const p000 = iso(0,0,0), p100 = iso(w,0,0), p101 = iso(w,0,h), p001 = iso(0,0,h);
      const p010 = iso(0,d,0), p110 = iso(w,d,0), p011 = iso(0,d,h), p111 = iso(w,d,h);

      // Frontal
      g.fillStyle = COR_ACM; g.strokeStyle = '#0f172a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p000[0], p000[1]); g.lineTo(p100[0], p100[1]); g.lineTo(p101[0], p101[1]); g.lineTo(p001[0], p001[1]); g.closePath(); g.fill(); g.stroke();
      // Topo
      g.fillStyle = '#cbd5e1';
      g.beginPath(); g.moveTo(p001[0], p001[1]); g.lineTo(p101[0], p101[1]); g.lineTo(p111[0], p111[1]); g.lineTo(p011[0], p011[1]); g.closePath(); g.fill(); g.stroke();
      // Lateral direita
      g.fillStyle = '#b4c0d0';
      g.beginPath(); g.moveTo(p100[0], p100[1]); g.lineTo(p110[0], p110[1]); g.lineTo(p111[0], p111[1]); g.lineTo(p101[0], p101[1]); g.closePath(); g.fill(); g.stroke();

      // Emendas em vermelho tracejado
      g.strokeStyle = COR_EMENDA; g.lineWidth = 2.5; g.setLineDash([6, 4]);
      (q.em_pecas || []).forEach(em => {
        const cxe = em.x + em.w / 2;
        const cye = em.y + em.d / 2;
        const cze = em.z + em.h / 2;
        const emFrontal = cye < 30;
        const emDir     = cxe > w - 30;
        const emTopo    = cze > h - 30;
        if (em.eixo === 'z') {
          if (emFrontal) drawLine3([cxe, 0, 0], [cxe, 0, h]);
          if (emDir)     drawLine3([w, cye, 0], [w, cye, h]);
        } else if (em.eixo === 'x') {
          if (emFrontal) drawLine3([0, 0, cze], [w, 0, cze]);
          if (emTopo)    drawLine3([0, cye, h], [w, cye, h]);
        } else if (em.eixo === 'y') {
          if (emDir)  drawLine3([w, 0, cze], [w, d, cze]);
          if (emTopo) drawLine3([cxe, 0, h], [cxe, d, h]);
        }
      });
      g.setLineDash([]);

      // Cotas principais
      g.fillStyle = TEXT_DARK; g.font = 'bold 12px "Segoe UI", sans-serif'; g.textAlign = 'center';
      dimH(g, p000[0], p100[0], p000[1] + 38, 0, q.w + ' mm', TEXT_DARK, 12);
      dimV(g, p001[1], p000[1], p000[0] - 38, 0, q.h + ' mm', TEXT_DARK, 12);
      g.fillStyle = TEXT_DARK; g.font = 'bold 12px "Segoe UI", sans-serif'; g.textAlign = 'left';
      g.fillText(q.d + ' mm (prof.)', p111[0] + 14, p111[1] - 5);
      g.strokeStyle = TEXT_DARK; g.lineWidth = 1;
      g.beginPath(); g.moveTo(p101[0], p101[1]); g.lineTo(p111[0], p111[1]); g.stroke();

      // Cotas de emendas em X
      const xEms = [];
      (q.em_pecas || []).forEach(em => {
        if (em.eixo === 'z' && (em.y + em.d / 2 < 30 || em.z + em.h / 2 < 30)) {
          xEms.push(Math.round(em.x + em.w / 2));
        }
      });
      const xEmsU = xEms.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
      if (xEmsU.length > 0) {
        const all = [0].concat(xEmsU).concat([q.w]);
        for (let i = 0; i < all.length - 1; i++) {
          const xa = iso(all[i], 0, 0)[0];
          const xb = iso(all[i + 1], 0, 0)[0];
          dimH(g, xa, xb, p000[1] + 72, 0, Math.round(all[i + 1] - all[i]) + 'mm', COR_EMENDA, 10);
        }
      }
      // Cotas de emendas em Z
      const zEms = [];
      (q.em_pecas || []).forEach(em => {
        if (em.eixo === 'x' && em.y + em.d / 2 < 30) {
          zEms.push(Math.round(em.z + em.h / 2));
        }
      });
      const zEmsU = zEms.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
      if (zEmsU.length > 0) {
        const allZ = [0].concat(zEmsU).concat([q.h]);
        for (let j = 0; j < allZ.length - 1; j++) {
          const za = iso(0, 0, allZ[j])[1];
          const zb = iso(0, 0, allZ[j + 1])[1];
          dimV(g, zb, za, p000[0] - 72, 0, Math.round(allZ[j + 1] - allZ[j]) + 'mm', COR_EMENDA, 10);
        }
      }

      drawLegendaProjeto(g, 60, 100);

      // Resumo
      g.fillStyle = COR_EMENDA; g.font = 'bold 12px "Segoe UI", sans-serif'; g.textAlign = 'left';
      g.fillText('Emendas ACM: ' + (q.em_qtd || 0) + ' (linhas vermelhas tracejadas)', 60, 330);
      g.fillStyle = TEXT_DARK; g.font = '11px "Segoe UI", sans-serif';
      g.fillText('Emendas verticais (X): ' + xEmsU.length, 60, 350);
      g.fillText('Emendas horizontais (Z): ' + zEmsU.length, 60, 366);
      g.fillText('Área ACM total: ' + (q.acm_total_m2 || 0).toFixed(2) + ' m²', 60, 382);
      g.fillText('Chapas estimadas: ' + (q.acm_chapas_est || 0) + ' unid.', 60, 398);
      g.fillStyle = COR_PERIM; g.font = 'bold 11px "Segoe UI", sans-serif';
      g.fillText('Dimensões ACM: ' + q.w + ' × ' + q.h + ' × ' + q.d + ' mm', 60, 424);
      g.fillStyle = COR_TRAVESSA;
      g.fillText('Dimensões Estrutura: ' + SB.w + ' × ' + SB.h + ' × ' + SB.d + ' mm', 60, 440);

      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P1.5: DADOS DO PROJETO — página dedicada (legível, sem overlap)
    // ══════════════════════════════════════════════════════════════
    const pDados = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'DADOS DO PROJETO', 'Resumo de parâmetros, materiais e quantitativos consolidados.');

      // Card principal de parâmetros
      const cx = 80, cy = 160, cw = CW - 160, ch = 480;
      g.fillStyle = '#ffffff';
      g.fillRect(cx, cy, cw, ch);
      g.strokeStyle = BORDER;
      g.lineWidth = 1.5;
      g.strokeRect(cx, cy, cw, ch);

      // Colunas: 2 colunas de dados
      const colW = (cw - 60) / 2;
      const colX1 = cx + 30;
      const colX2 = cx + 30 + colW + 30;
      let ly = cy + 50;

      g.fillStyle = TEXT_DARK;
      g.font = 'bold 18px "Segoe UI", sans-serif';
      g.textAlign = 'left';
      g.fillText('PARÂMETROS GERAIS', colX1, ly);
      ly += 18;
      g.strokeStyle = BORDER;
      g.beginPath(); g.moveTo(colX1, ly); g.lineTo(colX1 + colW, ly); g.stroke();
      ly += 26;

      const row = (lbl, val, x) => {
        g.fillStyle = TEXT_MUTED;
        g.font = '13px "Segoe UI", sans-serif';
        g.textAlign = 'left';
        g.fillText(lbl, x, ly);
        g.fillStyle = TEXT_DARK;
        g.font = 'bold 14px "Segoe UI", sans-serif';
        g.fillText(val, x + 170, ly);
        ly += 28;
      };

      row('Dimensões ACM',  q.w + ' × ' + q.h + ' × ' + q.d + ' mm', colX1);
      row('Cor ACM',        (q.cor_acm || '-').toString(),            colX1);
      row('Cor junta',      (q.cor_junta || '-').toString(),          colX1);
      row('Espessura ACM',  (q.acm_mm || '-') + ' mm',                colX1);
      row('Tipo junta',     ((m.params && m.params.junta_tipo) || 'seca') + ' (' + ((m.params && m.params.junta_mm) || 8) + ' mm)', colX1);
      row('Chapa ACM',      q.chapa_larg + '×' + (q.chapa_comp || 5000) + ' mm · ' + q.chapa_orient, colX1);

      // Coluna 2
      ly = cy + 50;
      g.fillStyle = TEXT_DARK;
      g.font = 'bold 18px "Segoe UI", sans-serif';
      g.fillText('ESTRUTURA & MATERIAIS', colX2, ly);
      ly += 18;
      g.beginPath(); g.moveTo(colX2, ly); g.lineTo(colX2 + colW, ly); g.stroke();
      ly += 26;

      row('Metalon',        q.metalon_wh + ' mm',                                        colX2);
      row('Emenda',         q.emenda_w + '×' + q.emenda_h + ' mm',                       colX2);
      row('Fita DF',        (q.fita_mm || '-') + ' mm de espessura',                     colX2);
      row('Área ACM total', (q.acm_total_m2 || 0).toFixed(2) + ' m²',                    colX2);
      row('Chapas estim.',  (q.acm_chapas_est || 0) + ' unid.',                          colX2);
      row('Emendas ACM',    (q.em_qtd || 0) + ' peças',                                  colX2);

      // Faixa de quantitativos no rodapé do card
      let qy = cy + ch - 110;
      g.strokeStyle = BORDER;
      g.beginPath(); g.moveTo(cx + 30, qy); g.lineTo(cx + cw - 30, qy); g.stroke();
      qy += 26;

      g.fillStyle = TEXT_DARK;
      g.font = 'bold 16px "Segoe UI", sans-serif';
      g.textAlign = 'left';
      g.fillText('TOTAIS', cx + 30, qy);
      qy += 26;

      const totW = (cw - 60) / 3;
      const card = (label, val, sub, idx, color) => {
        const tx = cx + 30 + idx * totW;
        g.fillStyle = color || COR_PERIM;
        g.font = 'bold 22px "Segoe UI", sans-serif';
        g.textAlign = 'left';
        g.fillText(val, tx, qy + 20);
        g.fillStyle = TEXT_MUTED;
        g.font = '11px "Segoe UI", sans-serif';
        g.fillText(label, tx, qy);
        if (sub) {
          g.fillStyle = TEXT_SUBTLE;
          g.font = '10px "Segoe UI", sans-serif';
          g.fillText(sub, tx, qy + 38);
        }
      };
      card('Metalon (estrut. + emendas)', ((q.met_m || 0) + (q.em_m || 0)).toFixed(2) + ' m',
           (q.met_barras || 0) + ' + ' + (q.em_barras || 0) + ' barras 6m', 0, COR_PERIM);
      card('Fita dupla-face',  (q.fita_m || 0).toFixed(2) + ' m',
           'rolo 12mm · 0.9mm esp.', 1, COR_FITA);
      card('Spots iluminação', (q.spots_qtd || 0) + ' unid.',
           '', 2, '#ea580c');

      // Legenda de cores abaixo do card
      drawLegendaCores(g, cx, cy + ch + 24);

      // Bloco de info dimensional estrutura
      g.fillStyle = TEXT_DARK;
      g.font = 'bold 13px "Segoe UI", sans-serif';
      g.textAlign = 'left';
      g.fillText('Estrutura interna: ' + SB.w + ' × ' + SB.h + ' × ' + SB.d + ' mm',
                 cx + 240, cy + ch + 52);
      g.font = '12px "Segoe UI", sans-serif';
      g.fillStyle = TEXT_MUTED;
      g.fillText('A estrutura é interna ao ACM e seu perímetro recua mw/mh em cada borda.',
                 cx + 240, cy + ch + 72);

      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P2: PLANTA (VISTA SUPERIOR XY)
    // ══════════════════════════════════════════════════════════════
    const p2 = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'PLANTAS — SUPERIOR + INFERIOR', 'Projeção XY. SUPERIOR (Z=' + q.h + ', face topo) em cima · INFERIOR (Z=0, face base) embaixo. Mostra APENAS pieces específicas de cada face.');

      // Layout: 2 painéis EMPILHADOS (vertical) — ACM é comprido em X, então
      // colocar lado a lado deixava cada um espremido.
      const panelH = (CH - 240) / 2;
      const vGap = 30;
      const mx = 110, my = 170;
      const availW = CW - 2 * mx - 120; // 120 reservado pras cotas Y à direita
      // O painel reserva 90px no topo (header + cotas X) e 60px embaixo
      // (cotas edge-to-edge + label). Sobra panelH - 150 pra altura do retângulo.
      const sc = Math.min(availW / q.w, (panelH - 150) / q.d);
      const realW = q.w * sc, realH = q.d * sc;

      // Layout vertical por painel:
      //   panelY + 0   : header (bold 14px)
      //   panelY + 20  : label FRENTE/TRÁS (topo)
      //   panelY + 40  : cota Estr X
      //   panelY + 64  : cota ACM X
      //   panelY + 90  : topo do retângulo (oy)
      //   ... retângulo (realH ~ 30-50px) ...
      //   oy + realH + 14  : cota X individual edge-to-edge
      //   oy + realH + 36  : label FRENTE/TRÁS (base)
      const drawPanel = (panelY, label, faceCheck, frenteEmCima) => {
        const ox = mx + (availW - realW) / 2;
        const oy = panelY + 90;
        // Vista superior: frente embaixo do papel (myF padrão)
        // Vista inferior: frente em cima do papel (myF invertido)
        const mxF = v => ox + v * sc;
        const myF = frenteEmCima
          ? v => oy + v * sc                  // Y crescente desce no papel
          : v => oy + realH - v * sc;         // Y crescente sobe no papel

        // Contorno ACM
        g.strokeStyle = TEXT_SUBTLE; g.lineWidth = 1.2; g.setLineDash([5, 4]);
        g.strokeRect(ox, oy, realW, realH);
        g.setLineDash([]);
        // Contorno estrutura
        g.strokeStyle = COR_PERIM; g.lineWidth = 2;
        const sX1 = mxF(SB.minX), sX2 = mxF(SB.maxX);
        const sY1 = frenteEmCima ? myF(SB.minY) : myF(SB.maxY);
        const sY2 = frenteEmCima ? myF(SB.maxY) : myF(SB.minY);
        g.strokeRect(Math.min(sX1, sX2), Math.min(sY1, sY2), Math.abs(sX2 - sX1), Math.abs(sY2 - sY1));

        // Pieces específicas dessa face (sem montantes que atravessam)
        const facePieces = (q.met_pecas || []).filter(faceCheck);
        facePieces.forEach(pc => {
          const color = pc.tipo === 'perim' ? COR_PERIM : (pc.tipo === 'travessa' ? COR_TRAVESSA : COR_METALON);
          const x1 = mxF(pc.x);
          const y1 = frenteEmCima ? myF(pc.y) : myF(pc.y + pc.d);
          const wv = pc.w * sc;
          const hv = pc.d * sc;
          rr(g, x1, y1, Math.max(wv, 0.5), Math.max(hv, 0.5), color, '#0f172a', 0.6);
        });

        // Emendas que também passam pela face (em.eixo correto)
        const faceEmendas = (q.em_pecas || []).filter(faceCheck);
        faceEmendas.forEach(pc => {
          const x1 = mxF(pc.x);
          const y1 = frenteEmCima ? myF(pc.y) : myF(pc.y + pc.d);
          rr(g, x1, y1, Math.max(pc.w * sc, 0.5), Math.max(pc.d * sc, 0.5),
             'rgba(220,38,38,0.5)', COR_EMENDA, 0.6);
        });

        // Header do painel (no topo do bloco)
        g.fillStyle = TEXT_DARK; g.font = 'bold 14px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillText(label, ox + realW / 2, panelY + 14);

        // Label FRENTE/TRÁS (topo) — entre header e cotas
        g.fillStyle = TEXT_MUTED; g.font = '9px "Segoe UI", sans-serif';
        g.fillText(frenteEmCima ? 'FRENTE (Y=0)' : ('TRÁS (Y=' + q.d + ')'),
                   ox + realW / 2, panelY + 30);

        // Cotas (acima do retângulo) — bem espaçadas
        dimH(g, mxF(SB.minX), mxF(SB.maxX), panelY + 44, 0, 'Estr X: ' + SB.w + ' mm', COR_TRAVESSA, 10);
        dimH(g, mxF(0),       mxF(q.w),     panelY + 66, 0, 'ACM X: '  + q.w  + ' mm', TEXT_DARK, 10);

        // Y à direita do retângulo
        dimV(g, oy, oy + realH, mxF(q.w) + 30, 0, 'ACM Y: ' + q.d, TEXT_DARK, 9);
        dimV(g, oy, oy + realH, mxF(q.w) + 65, 0, 'Estr Y: ' + SB.d, COR_TRAVESSA, 9);

        // Cotas X edge-to-edge das pieces (abaixo do retângulo)
        const xEdges = new Set([0, q.w]);
        facePieces.concat(faceEmendas).forEach(pc => {
          xEdges.add(Math.round(pc.x));
          xEdges.add(Math.round(pc.x + pc.w));
        });
        const xList = Array.from(xEdges).sort((a, b) => a - b);
        if (xList.length > 2) {
          for (let i = 0; i < xList.length - 1; i++) {
            const seg = xList[i + 1] - xList[i];
            if (seg < 3) continue;
            dimH(g, mxF(xList[i]), mxF(xList[i + 1]), oy + realH + 18, 0,
                 seg + ' mm', '#ea580c', 9);
          }
        }

        // Label FRENTE/TRÁS (base)
        g.fillStyle = TEXT_MUTED; g.font = '9px "Segoe UI", sans-serif';
        g.fillText(frenteEmCima ? ('TRÁS (Y=' + q.d + ')') : 'FRENTE (Y=0)',
                   ox + realW / 2, oy + realH + 42);
        // Nota se nenhuma peça nessa face
        if (facePieces.length === 0 && faceEmendas.length === 0) {
          g.fillStyle = TEXT_SUBTLE; g.font = 'italic 11px "Segoe UI", sans-serif';
          g.fillText('(nenhuma ferragem específica desta face)', ox + realW / 2, oy + realH / 2);
        }
      };

      const isTopo = pc => (pc.z + pc.h / 2) > SB.maxZ - 80;
      const isBase = pc => (pc.z + pc.h / 2) < SB.minZ + 80;

      drawPanel(my,                          'SUPERIOR — Z=' + q.h + ' (face topo, vista de cima)', isTopo, false);
      drawPanel(my + panelH + vGap,          'INFERIOR — Z=0 (face base, vista de baixo)',         isBase, true);

      drawLegendaCores(g, CW - 280, CH - 100);
      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P3: VISTA FRONTAL (XZ)
    // ══════════════════════════════════════════════════════════════
    const p3 = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'VISTA FRONTAL — ESTRUTURA METALON', 'Projeção XZ. Cotas estrutura (azul) + emendas (vermelho) + gaps entre travessas.');
      const mx = 110, my = 170, mmr = 120, mb = 280;
      const drawW = CW - mx - mmr, availH = CH - my - mb;
      const sc = Math.min(drawW / q.w, availH / q.h);
      const realW = q.w * sc, realH = q.h * sc;
      const oy = my + Math.max(0, (availH - realH) / 2);
      const mxF = v => mx + v * sc;
      const myF = v => oy + realH - v * sc;

      g.strokeStyle = TEXT_SUBTLE; g.lineWidth = 1.2; g.setLineDash([5, 4]);
      g.strokeRect(mxF(0), myF(q.h), realW, realH);
      g.setLineDash([]);
      g.strokeStyle = COR_PERIM; g.lineWidth = 2;
      g.strokeRect(mxF(SB.minX), myF(SB.maxZ), SB.w * sc, SB.h * sc);

      (q.met_pecas || []).forEach(pc => {
        if (pc.y + pc.d / 2 > 100) return;
        const color = pc.tipo === 'perim' ? COR_PERIM : (pc.tipo === 'travessa' ? COR_TRAVESSA : COR_METALON);
        drawPiece(g, pc, 'XZ', mxF, myF, color, '#0f172a');
      });
      (q.em_pecas || []).forEach(pc => {
        if (pc.y + pc.d / 2 > 100) return;
        drawPiece(g, pc, 'XZ', mxF, myF, 'rgba(220,38,38,0.5)', COR_EMENDA);
      });

      // Cotas externas — ACM e Estrutura, em níveis bem separados
      dimH(g, mxF(0),       mxF(q.w),     myF(q.h), -28, 'ACM X: '  + q.w  + ' mm', TEXT_DARK, 10);
      dimH(g, mxF(SB.minX), mxF(SB.maxX), myF(q.h), -52, 'Estr X: ' + SB.w + ' mm', COR_TRAVESSA, 10);
      dimV(g, myF(q.h),     myF(0),       mxF(0),   -55, 'ACM Z: '  + q.h  + ' mm', TEXT_DARK, 10);
      dimV(g, myF(SB.maxZ), myF(SB.minZ), mxF(0),   -110, 'Estr Z: ' + SB.h + ' mm', COR_TRAVESSA, 10);

      // ─── COTAS EDGE-TO-EDGE em X e em Z (pieces + emendas frontais) ───
      const isFront = pc => (pc.y + pc.d / 2) < 100;

      // Cotas X (embaixo): edges X de TODAS pieces verticais (eixo='z') frontais
      // + emendas eixo='z'
      const xEdges = new Set([0, q.w]);
      (q.met_pecas || []).forEach(pc => {
        if (!isFront(pc)) return;
        if (pc.eixo !== 'z') return;
        xEdges.add(Math.round(pc.x));
        xEdges.add(Math.round(pc.x + pc.w));
      });
      (q.em_pecas || []).forEach(pc => {
        if (!isFront(pc)) return;
        if (pc.eixo !== 'z') return;
        xEdges.add(Math.round(pc.x));
        xEdges.add(Math.round(pc.x + pc.w));
      });
      const xList = Array.from(xEdges).sort((a, b) => a - b);
      if (xList.length > 2) {
        for (let i = 0; i < xList.length - 1; i++) {
          const seg = xList[i + 1] - xList[i];
          if (seg < 3) continue;
          dimH(g, mxF(xList[i]), mxF(xList[i + 1]), myF(0), 35,
               seg + ' mm', '#ea580c', 9);
        }
      }

      // Cotas Z (à direita): edges Z de TODAS pieces horizontais (eixo='x')
      // + emendas horizontais frontais
      const zEdges = new Set([0, q.h]);
      (q.met_pecas || []).forEach(pc => {
        if (!isFront(pc)) return;
        if (pc.eixo !== 'x') return;
        zEdges.add(Math.round(pc.z));
        zEdges.add(Math.round(pc.z + pc.h));
      });
      (q.em_pecas || []).forEach(pc => {
        if (!isFront(pc)) return;
        if (pc.eixo !== 'x') return;
        zEdges.add(Math.round(pc.z));
        zEdges.add(Math.round(pc.z + pc.h));
      });
      const zList = Array.from(zEdges).sort((a, b) => a - b);
      if (zList.length > 2) {
        for (let i = 0; i < zList.length - 1; i++) {
          const seg = zList[i + 1] - zList[i];
          if (seg < 3) continue;
          dimV(g, myF(zList[i + 1]), myF(zList[i]), mxF(q.w), 35,
               seg + ' mm', '#ea580c', 9);
        }
      }

      g.fillStyle = TEXT_MUTED; g.font = 'bold 11px "Segoe UI", sans-serif'; g.textAlign = 'center';
      g.fillText('VISTA FRONTAL (Y=0)', mxF(q.w / 2), my - 10);
      drawLegendaCores(g, CW - 280, CH - 200);
      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P3b: VISTA TRASEIRA (XZ visto de y=q.d)
    // ══════════════════════════════════════════════════════════════
    const pTraseira = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'VISTA TRASEIRA — ESTRUTURA METALON', 'Projeção XZ olhando do fundo. Pieces na face traseira + montantes visíveis.');
      const mx = 110, my = 170, mmr = 120, mb = 280;
      const drawW = CW - mx - mmr, availH = CH - my - mb;
      const sc = Math.min(drawW / q.w, availH / q.h);
      const realW = q.w * sc, realH = q.h * sc;
      const oy = my + Math.max(0, (availH - realH) / 2);
      // Espelhar X (traseira é vista invertida)
      const mxF = v => mx + (q.w - v) * sc;
      const myF = v => oy + realH - v * sc;

      g.strokeStyle = TEXT_SUBTLE; g.lineWidth = 1.2; g.setLineDash([5, 4]);
      g.strokeRect(mxF(q.w), myF(q.h), realW, realH);
      g.setLineDash([]);
      g.strokeStyle = COR_PERIM; g.lineWidth = 2;
      g.strokeRect(mxF(SB.maxX), myF(SB.maxZ), SB.w * sc, SB.h * sc);

      // SOMENTE pieces específicas da face traseira (y + d/2 perto de q.d).
      const isBack = pc => (pc.y + pc.d / 2) > q.d - 100;
      const pecasTraseira = (q.met_pecas || []).filter(isBack);
      const emendasTraseira = (q.em_pecas || []).filter(isBack);

      pecasTraseira.forEach(pc => {
        const color = pc.tipo === 'perim' ? COR_PERIM : (pc.tipo === 'travessa' ? COR_TRAVESSA : COR_METALON);
        const x1 = mxF(pc.x + pc.w);
        const y1 = myF(pc.z + pc.h);
        const wv = mxF(pc.x) - x1;
        const hv = myF(pc.z) - y1;
        rr(g, x1, y1, Math.max(wv, 0.5), Math.max(hv, 0.5), color, '#0f172a', 0.6);
      });
      emendasTraseira.forEach(pc => {
        const x1 = mxF(pc.x + pc.w);
        const y1 = myF(pc.z + pc.h);
        const wv = mxF(pc.x) - x1;
        const hv = myF(pc.z) - y1;
        rr(g, x1, y1, Math.max(wv, 0.5), Math.max(hv, 0.5),
           'rgba(220,38,38,0.5)', COR_EMENDA, 0.6);
      });

      // Cotas externas (espaçadas)
      dimH(g, mxF(q.w),     mxF(0),       myF(q.h), -28, 'ACM X: '  + q.w  + ' mm', TEXT_DARK, 10);
      dimH(g, mxF(SB.maxX), mxF(SB.minX), myF(q.h), -52, 'Estr X: ' + SB.w + ' mm', COR_TRAVESSA, 10);
      dimV(g, myF(q.h),     myF(0),       mxF(q.w), -55, 'ACM Z: '  + q.h  + ' mm', TEXT_DARK, 10);
      dimV(g, myF(SB.maxZ), myF(SB.minZ), mxF(q.w), -110, 'Estr Z: ' + SB.h + ' mm', COR_TRAVESSA, 10);

      if (pecasTraseira.length === 0 && emendasTraseira.length === 0) {
        g.fillStyle = TEXT_SUBTLE; g.font = 'italic 13px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillText('Nenhuma ferragem na face traseira (sem ACM traseiro).',
                   mxF(q.w / 2), myF(q.h / 2));
      } else {
        // ─── COTAS EDGE-TO-EDGE da face traseira ───
        // X edge-to-edge (embaixo): para pieces verticais (eixo='z') na traseira
        const xEdges = new Set([0, q.w]);
        pecasTraseira.concat(emendasTraseira).forEach(pc => {
          if (pc.eixo !== 'z') return;
          xEdges.add(Math.round(pc.x));
          xEdges.add(Math.round(pc.x + pc.w));
        });
        const xList = Array.from(xEdges).sort((a, b) => a - b);
        if (xList.length > 2) {
          for (let i = 0; i < xList.length - 1; i++) {
            const seg = xList[i + 1] - xList[i];
            if (seg < 3) continue;
            // X espelhado: cota de xList[i] a xList[i+1] vira de mxF(xList[i+1]) a mxF(xList[i])
            dimH(g, mxF(xList[i + 1]), mxF(xList[i]), myF(0), 35,
                 seg + ' mm', '#ea580c', 9);
          }
        }
        // Z edge-to-edge (à esquerda, pois X está espelhado): pieces horizontais
        const zEdges = new Set([0, q.h]);
        pecasTraseira.concat(emendasTraseira).forEach(pc => {
          if (pc.eixo !== 'x') return;
          zEdges.add(Math.round(pc.z));
          zEdges.add(Math.round(pc.z + pc.h));
        });
        const zList = Array.from(zEdges).sort((a, b) => a - b);
        if (zList.length > 2) {
          for (let i = 0; i < zList.length - 1; i++) {
            const seg = zList[i + 1] - zList[i];
            if (seg < 3) continue;
            dimV(g, myF(zList[i + 1]), myF(zList[i]), mxF(0), 35,
                 seg + ' mm', '#ea580c', 9);
          }
        }
      }

      g.fillStyle = TEXT_MUTED; g.font = 'bold 11px "Segoe UI", sans-serif'; g.textAlign = 'center';
      g.fillText('VISTA TRASEIRA (Y=' + q.d + ') — vista invertida (X espelhado)', mxF(q.w / 2), my - 10);
      drawLegendaCores(g, CW - 280, CH - 200);
      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P3c: VISTA INFERIOR / BASE (XY visto de baixo)
    // ══════════════════════════════════════════════════════════════
    const pBase = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'VISTA INFERIOR — BASE', 'Projeção XY olhando de baixo. Pieces na face base + montantes visíveis.');
      const mx = 100, my = 170, mmr = 120, mb = 280;
      const drawW = CW - mx - mmr, availH = CH - my - mb;
      const sc = Math.min(drawW / q.w, availH / q.d);
      const realW = q.w * sc, realH = q.d * sc;
      const oy = my + Math.max(0, (availH - realH) / 2);
      const mxF = v => mx + v * sc;
      const myF = v => oy + v * sc; // Y flipado pra base (frente em cima do papel)

      g.strokeStyle = TEXT_SUBTLE; g.lineWidth = 1.2; g.setLineDash([5, 4]);
      g.strokeRect(mxF(0), myF(0), realW, realH);
      g.setLineDash([]);
      g.strokeStyle = COR_PERIM; g.lineWidth = 2;
      g.strokeRect(mxF(SB.minX), myF(SB.minY), SB.w * sc, SB.d * sc);

      (q.met_pecas || []).forEach(pc => {
        const czp = pc.z + pc.h / 2;
        const naBase = czp < 80;
        const isMontante = pc.eixo === 'z' && pc.h > 0.5 * SB.h;
        if (!naBase && !isMontante) return;
        const color = pc.tipo === 'perim' ? COR_PERIM : (pc.tipo === 'travessa' ? COR_TRAVESSA : COR_METALON);
        const x1 = mxF(pc.x);
        const y1 = myF(pc.y);
        const wv = mxF(pc.x + pc.w) - x1;
        const hv = myF(pc.y + pc.d) - y1;
        rr(g, x1, y1, Math.max(wv, 0.5), Math.max(hv, 0.5), color, '#0f172a', 0.6);
      });

      dimH(g, mxF(0), mxF(q.w), myF(q.d), 35, 'ACM: ' + q.w + ' mm', TEXT_DARK, 11);
      dimV(g, myF(0), myF(q.d), mxF(q.w), 48, 'ACM: ' + q.d + ' mm (prof.)', TEXT_DARK, 11);

      g.fillStyle = TEXT_MUTED; g.font = 'bold 11px "Segoe UI", sans-serif'; g.textAlign = 'center';
      g.fillText('VISTA INFERIOR (Z=0)', mxF(q.w / 2), my - 10);
      g.fillText('FRENTE (Y=0)', mxF(q.w / 2), myF(0) - 12);
      g.fillText('TRÁS (Y=' + q.d + ')', mxF(q.w / 2), myF(q.d) + 75);

      drawLegendaCores(g, CW - 280, CH - 200);
      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P4a: LATERAL COMPLETA (YZ)
    // ══════════════════════════════════════════════════════════════
    const p4a = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'VISTAS LATERAIS — ESQUERDA + DIREITA',
        'Projeções YZ. Cada painel mostra APENAS pieces específicas da sua face lateral. ' +
        'Cotas Z em laranja descrevem a posição de cada peça nessa face.');

      // Layout horizontal: cada painel tem 160px à esquerda pras cotas Z + retângulo + 90px à direita pras cotas Z individuais
      const LEFT_PAD = 160;
      const RIGHT_PAD = 100;
      const panelW = 360;          // total do painel
      const panelGap = 180;
      const totalW = panelW * 2 + panelGap;
      const startX = (CW - totalW) / 2;
      const my = 230, mb = 280;
      const availH = CH - my - mb;
      const sc = Math.min((panelW - LEFT_PAD - RIGHT_PAD) / q.d, availH / q.h);
      const realW = q.d * sc, realH = q.h * sc;

      // Mh do perim (pra usar como referência z na ausência de pieces)
      const mhPerim = parseInt((q.metalon_wh || '20x20').split('x')[1], 10) || 20;

      const drawPanel = (panelX, label, sideX) => {
        const ox = panelX + LEFT_PAD; // retângulo começa após o pad das cotas Z
        const oy = my + 40 + Math.max(0, (availH - realH) / 2);
        const mxF = v => ox + v * sc;
        const myF = v => oy + realH - v * sc;

        // Contorno ACM
        g.strokeStyle = TEXT_SUBTLE; g.lineWidth = 1.2; g.setLineDash([5, 4]);
        g.strokeRect(mxF(0), myF(q.h), realW, realH);
        g.setLineDash([]);
        // Contorno estrutura
        g.strokeStyle = COR_PERIM; g.lineWidth = 2;
        g.strokeRect(mxF(SB.minY), myF(SB.maxZ), SB.d * sc, SB.h * sc);

        // SOMENTE pieces específicas dessa face lateral:
        //   centro X dentro de [0, 80] ou [q.w - 80, q.w].
        // Filtra tanto met_pecas QUANTO em_pecas — extras "Adicionar" podem
        // ter sido criados como Metalon OU Emenda.
        const xThresh = 100;
        const sideFilter = pc => {
          const cxp = pc.x + pc.w / 2;
          return (sideX === 'esq') ? cxp < xThresh : cxp > q.w - xThresh;
        };
        const pecasFace   = (q.met_pecas || []).filter(sideFilter);
        const emendasFace = (q.em_pecas  || []).filter(sideFilter);

        pecasFace.forEach(pc => {
          const color = pc.tipo === 'perim' ? COR_PERIM : (pc.tipo === 'travessa' ? COR_TRAVESSA : COR_METALON);
          drawPiece(g, pc, 'YZ', mxF, myF, color, '#0f172a');
        });
        emendasFace.forEach(pc => {
          drawPiece(g, pc, 'YZ', mxF, myF, 'rgba(220,38,38,0.5)', COR_EMENDA);
        });

        // Cotas principais — separação maior pra labels rotacionados não colidirem
        // Y embaixo
        dimH(g, mxF(0), mxF(q.d), myF(0), 55, 'ACM Y: ' + q.d + ' mm', TEXT_DARK, 10);
        dimH(g, mxF(SB.minY), mxF(SB.maxY), myF(0), 90, 'Estr Y: ' + SB.d + ' mm', COR_TRAVESSA, 10);
        // Z à esquerda — bem espaçadas (60 e 140) pra labels verticais caberem
        dimV(g, myF(q.h), myF(0), mxF(0), -65, 'ACM Z: ' + q.h + ' mm', TEXT_DARK, 10);
        dimV(g, myF(SB.maxZ), myF(SB.minZ), mxF(0), -135, 'Estr Z: ' + SB.h + ' mm', COR_TRAVESSA, 10);

        // Cotas Z edge-to-edge (paredes externas das peças) — mais fácil de
        // medir na obra do que cota de centro. Cada cota é a distância
        // entre arestas reais de peças consecutivas.
        const zEdges = new Set([0, q.h]);
        const collectZ = pc => {
          // Pula montantes que vão de ponta a ponta — seus edges são 0 e q.h
          // (já cobertos pelos extremos)
          const isFullMontante = pc.eixo === 'z' && pc.h > 0.8 * SB.h;
          if (isFullMontante) return;
          zEdges.add(Math.round(pc.z));
          zEdges.add(Math.round(pc.z + pc.h));
        };
        pecasFace.forEach(collectZ);
        emendasFace.forEach(collectZ);
        const zList = Array.from(zEdges).sort((a, b) => a - b);
        if (zList.length > 2) {
          for (let i = 0; i < zList.length - 1; i++) {
            const z1 = zList[i], z2 = zList[i + 1];
            const seg = z2 - z1;
            if (seg < 3) continue;
            dimV(g, myF(z2), myF(z1), mxF(q.d), 28, seg + ' mm', '#ea580c', 9);
          }
        }

        // Header do painel + nota se vazio (sem perim lateral)
        g.fillStyle = TEXT_DARK; g.font = 'bold 13px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillText(label, panelX + panelW / 2, my - 5);
        g.font = '10px "Segoe UI", sans-serif';
        g.fillStyle = TEXT_MUTED;
        g.fillText('Plano X=' + (sideX === 'esq' ? '0' : q.w),
                   panelX + panelW / 2, my + 14);

        if (pecasFace.length === 0 && emendasFace.length === 0) {
          g.fillStyle = TEXT_SUBTLE; g.font = 'italic 10px "Segoe UI", sans-serif';
          g.fillText('(nenhuma ferragem específica desta face)',
                     panelX + panelW / 2, oy + realH / 2);
        }

        // Labels FRENTE/TRÁS embaixo do desenho
        g.fillStyle = TEXT_MUTED; g.font = '9px "Segoe UI", sans-serif';
        g.textAlign = 'left';
        g.fillText('FRENTE', mxF(0) - 4, myF(0) + 95);
        g.textAlign = 'right';
        g.fillText('TRÁS', mxF(q.d) + 4, myF(0) + 95);
      };

      drawPanel(startX,                            'LATERAL ESQUERDA',           'esq');
      drawPanel(startX + panelW + panelGap,        'LATERAL DIREITA',            'dir');

      drawLegendaCores(g, CW - 280, CH - 180);
      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P4b: ZOOM do canto superior-frontal da lateral
    // ══════════════════════════════════════════════════════════════
    const p4b = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'VISTA LATERAL — DETALHE (ZOOM CANTO)', 'Detalhe do encontro ACM × Metalon × Fita DF. Ampliação aproximada.');
      const mx = 200, my = 170, mmr = 200, mb = 300;
      const drawW = CW - mx - mmr, availH = CH - my - mb;
      const zw = Math.min(q.d, q.h) * 0.4;
      const zh = zw;
      const sc = Math.min(drawW / zw, availH / zh);
      const realW = zw * sc, realH = zh * sc;
      const ox = mx + Math.max(0, (drawW - realW) / 2);
      const oy = my + Math.max(0, (availH - realH) / 2);
      const zmF = v => ox + v * sc;
      const znF = v => oy + (q.h - v) * sc;

      g.strokeStyle = TEXT_SUBTLE; g.lineWidth = 1.2; g.setLineDash([5, 4]);
      g.strokeRect(zmF(0), znF(q.h), zw * sc, zh * sc);
      g.setLineDash([]);
      g.strokeStyle = COR_PERIM; g.lineWidth = 2;
      if (SB.minY < zw && SB.maxZ > q.h - zh) {
        const xs = Math.max(0, SB.minY);
        const xe = Math.min(zw, SB.maxY);
        const zs = Math.max(q.h - zh, SB.minZ);
        const ze = Math.min(q.h, SB.maxZ);
        g.strokeRect(zmF(xs), znF(ze), (xe - xs) * sc, (ze - zs) * sc);
      }

      (q.met_pecas || []).forEach(pc => {
        if (pc.y > zw || pc.z + pc.h < q.h - zh) return;
        const color = pc.tipo === 'perim' ? COR_PERIM : (pc.tipo === 'travessa' ? COR_TRAVESSA : COR_METALON);
        const y1 = zmF(Math.max(pc.y, 0));
        const y2 = zmF(Math.min(pc.y + pc.d, zw));
        const z1 = znF(Math.min(pc.z + pc.h, q.h));
        const z2 = znF(Math.max(pc.z, q.h - zh));
        rr(g, y1, z1, y2 - y1, z2 - z1, color, '#0f172a', 0.8);
      });
      (q.fita_pecas || []).forEach(pc => {
        if (pc.y > zw || pc.z + pc.h < q.h - zh) return;
        const y1 = zmF(Math.max(pc.y, 0));
        const y2 = zmF(Math.min(pc.y + pc.d, zw));
        const z1 = znF(Math.min(pc.z + pc.h, q.h));
        const z2 = znF(Math.max(pc.z, q.h - zh));
        rr(g, y1, z1, y2 - y1, z2 - z1, 'rgba(5,150,105,0.5)', COR_FITA, 0.8);
      });

      dimH(g, zmF(0), zmF(zw), znF(q.h - zh), 35, 'ACM: ' + Math.round(zw) + ' mm', TEXT_DARK, 11);
      dimH(g, zmF(SB.minY), zmF(Math.min(SB.maxY, zw)), znF(q.h - zh), 60, 'Estrutura', COR_TRAVESSA, 11);
      dimV(g, znF(q.h), znF(q.h - zh), zmF(0), -60, 'ACM: ' + Math.round(zh) + ' mm', TEXT_DARK, 11);

      // Legenda de camadas
      g.fillStyle = TEXT_DARK; g.font = 'bold 12px "Segoe UI", sans-serif'; g.textAlign = 'left';
      g.fillText('Camadas visíveis neste detalhe:', 60, 260);
      g.font = '11px "Segoe UI", sans-serif'; g.fillStyle = TEXT_DARK;
      let ly = 282;
      g.fillStyle = '#94a3b8'; g.fillRect(60, ly - 10, 14, 10);
      g.fillStyle = TEXT_DARK; g.fillText('Casca ACM (' + (q.acm_mm || 3) + ' mm)', 80, ly); ly += 16;
      g.fillStyle = COR_FITA; g.fillRect(60, ly - 10, 14, 10);
      g.fillStyle = TEXT_DARK; g.fillText('Fita dupla-face (' + (q.fita_mm || 0.9) + ' mm)', 80, ly); ly += 16;
      g.fillStyle = COR_METALON; g.fillRect(60, ly - 10, 14, 10);
      g.fillStyle = TEXT_DARK; g.fillText('Metalon ' + q.metalon_wh + ' mm', 80, ly); ly += 16;
      g.fillStyle = TEXT_MUTED; g.font = 'italic 10px "Segoe UI", sans-serif';
      g.fillText('Obs: Estrutura recua (ACM esp. + fita) em cada face do ACM', 60, ly + 6);

      drawLegendaProjeto(g, CW - 360, CH - 280);
      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P5: LAYOUT 2D DAS CHAPAS ACM POR FACE
    // ══════════════════════════════════════════════════════════════
    const p5 = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'LAYOUT 2D — CHAPAS ACM POR FACE', 'Faces separadas respeitando o PERÍMETRO VERTICAL — chapas que cruzam dobras aparecem nas duas faces.');

      const jt = (p.junta_tipo === 'seca') ? 0 : (parseInt(p.junta_mm || 8, 10));
      const chapaL = q.chapa_larg || 1220;
      const chapaC = q.chapa_comp || p.acm_chapa_comp || 5000;
      const horChapa = (q.chapa_orient === 'vertical') ? chapaL : chapaC;
      const verChapa = (q.chapa_orient === 'vertical') ? chapaC : chapaL;
      const align = p.emenda_align || 'esquerda';

      const calcEmendas = (dim, chapaMax) => AutoAcm._calcEmendas(dim, chapaMax, jt, align);

      const perimFaces = [];
      if (q.enab.base)     perimFaces.push({ key:'base',     label:'BASE (Z=0)',       h:q.d, invertY:true  });
      if (q.enab.frontal)  perimFaces.push({ key:'frontal',  label:'FRONTAL (Y=0)',    h:q.h, invertY:false });
      if (q.enab.topo)     perimFaces.push({ key:'topo',     label:'TOPO (Z='+q.h+')', h:q.d, invertY:false });
      if (q.enab.traseira) perimFaces.push({ key:'traseira', label:'TRASEIRA (Y='+q.d+')', h:q.h, invertY:true });

      let perimTotal = 0;
      perimFaces.forEach(f => { f.perimStart = perimTotal; f.perimEnd = perimTotal + f.h; perimTotal += f.h; });

      const emH = calcEmendas(q.w, horChapa);
      const emV = perimTotal > 0 ? calcEmendas(perimTotal, verChapa) : [];
      const ptsH = [0].concat(emH).concat([q.w]);
      const ptsV = [0].concat(emV).concat([perimTotal]);

      const cells = [];
      let cellId = 0;
      for (let hi = 0; hi < ptsH.length - 1; hi++) {
        for (let vi = 0; vi < ptsV.length - 1; vi++) {
          cellId++;
          const rawW = ptsH[hi + 1] - ptsH[hi];
          const rawH = ptsV[vi + 1] - ptsV[vi];
          const isLE = (hi === 0), isRE = (hi === ptsH.length - 2);
          let netW = rawW; if (!isLE) netW -= jt / 2; if (!isRE) netW -= jt / 2;
          const isB = (vi === 0), isT = (vi === ptsV.length - 2);
          let netH = rawH; if (!isB) netH -= jt / 2; if (!isT) netH -= jt / 2;
          const shW = Math.round(netW), shH = Math.round(netH);
          const isFull = (Math.abs(shW - horChapa) < 10) && (Math.abs(shH - verChapa) < 10);
          cells.push({ id: cellId, xstart: ptsH[hi], xend: ptsH[hi + 1], vstart: ptsV[vi], vend: ptsV[vi + 1], shW, shH, isFull });
        }
      }

      const lateralFaces = [];
      if (q.enab.esq) lateralFaces.push({ key:'esq', label:'ESQUERDA (X=0)',     W:q.d, H:q.h });
      if (q.enab.dir) lateralFaces.push({ key:'dir', label:'DIREITA (X='+q.w+')', W:q.d, H:q.h });

      if (perimFaces.length + lateralFaces.length === 0) {
        g.fillStyle = TEXT_MUTED; g.font = '14px "Segoe UI", sans-serif'; g.textAlign = 'center';
        g.fillText('Nenhuma face habilitada.', CW / 2, CH / 2);
        return c.toDataURL();
      }

      const topY = 90, botY = CH - 80, availH = botY - topY;
      const nPerim = perimFaces.length, nLat = lateralFaces.length;
      const col1 = Math.min(3, nPerim || 1);
      const nRows1 = Math.ceil(nPerim / col1);
      const rowH1 = nPerim > 0 ? (availH * (nLat > 0 ? 0.62 : 1.0) / Math.max(nRows1, 1)) : 0;
      const rowH2 = nLat > 0 ? (availH * 0.38) : 0;
      const cellW1 = (CW - 80) / col1;

      // Perim faces
      perimFaces.forEach((face, i) => {
        const col = i % col1;
        const row = Math.floor(i / col1);
        const x0 = 40 + col * cellW1 + 20;
        const y0 = topY + row * rowH1 + 20;
        const boxW = cellW1 - 40;
        const boxH = rowH1 - 60;
        const sc2 = Math.min(boxW / q.w, boxH / face.h);
        const RW = q.w * sc2, RH = face.h * sc2;
        const fx = x0 + (boxW - RW) / 2;
        const fy = y0 + (boxH - RH) / 2;

        g.fillStyle = '#fafafa'; g.strokeStyle = COR_PERIM; g.lineWidth = 1.5;
        g.fillRect(fx, fy, RW, RH);
        g.strokeRect(fx, fy, RW, RH);
        g.fillStyle = TEXT_DARK; g.font = 'bold 12px "Segoe UI", sans-serif'; g.textAlign = 'center';
        g.fillText(face.label, fx + RW / 2, y0 + 12);

        cells.forEach(cell => {
          const vs = Math.max(cell.vstart, face.perimStart);
          const ve = Math.min(cell.vend,   face.perimEnd);
          if (ve <= vs) return;
          let localVStart, localVEnd;
          if (face.invertY) {
            localVStart = face.h - (ve - face.perimStart);
            localVEnd   = face.h - (vs - face.perimStart);
          } else {
            localVStart = vs - face.perimStart;
            localVEnd   = ve - face.perimStart;
          }
          const cx0 = fx + cell.xstart * sc2;
          const cx1 = fx + cell.xend   * sc2;
          const cy0 = fy + (face.h - localVEnd)   * sc2;
          const cy1 = fy + (face.h - localVStart) * sc2;
          const cw = cx1 - cx0, ch = cy1 - cy0;
          if (cell.isFull) {
            g.fillStyle = 'rgba(16, 185, 129, 0.22)';
            g.strokeStyle = 'rgba(4, 120, 87, 0.85)';
          } else {
            g.fillStyle = 'rgba(245, 158, 11, 0.22)';
            g.strokeStyle = 'rgba(180, 83, 9, 0.85)';
          }
          g.lineWidth = 1.2;
          g.fillRect(cx0, cy0, cw, ch);
          g.strokeRect(cx0 + 0.5, cy0 + 0.5, cw - 1, ch - 1);
          if (cw > 45 && ch > 14) {
            g.fillStyle = TEXT_DARK; g.font = 'bold 9px "Courier New", monospace';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(cell.shW + ' × ' + cell.shH, cx0 + cw / 2, cy0 + ch / 2 - 4);
            g.font = '8px "Courier New", monospace';
            g.fillStyle = TEXT_MUTED;
            g.fillText((cell.isFull ? 'inteira' : 'retalho') + ' #' + cell.id, cx0 + cw / 2, cy0 + ch / 2 + 7);
          }
        });
        g.textBaseline = 'alphabetic';

        // Dobras
        cells.forEach(cell => {
          const crossStart = (cell.vstart < face.perimStart && cell.vend > face.perimStart);
          const crossEnd   = (cell.vstart < face.perimEnd   && cell.vend > face.perimEnd);
          if (crossStart || crossEnd) {
            const cx0 = fx + cell.xstart * sc2;
            const cx1 = fx + cell.xend   * sc2;
            g.strokeStyle = '#ec4899'; g.lineWidth = 1.5; g.setLineDash([6, 4]);
            if (crossStart) {
              const y = face.invertY ? fy : (fy + RH);
              g.beginPath(); g.moveTo(cx0, y); g.lineTo(cx1, y); g.stroke();
            }
            if (crossEnd) {
              const y = face.invertY ? (fy + RH) : fy;
              g.beginPath(); g.moveTo(cx0, y); g.lineTo(cx1, y); g.stroke();
            }
            g.setLineDash([]);
          }
        });

        // Emendas verticais
        g.strokeStyle = COR_EMENDA; g.lineWidth = 1.2; g.setLineDash([4, 3]);
        emH.forEach(ep => {
          const ex = fx + ep * sc2;
          g.beginPath(); g.moveTo(ex, fy); g.lineTo(ex, fy + RH); g.stroke();
        });
        g.setLineDash([]);

        g.fillStyle = TEXT_MUTED; g.font = '11px "Courier New", monospace'; g.textAlign = 'center';
        g.fillText(q.w + ' × ' + face.h + ' mm', fx + RW / 2, fy + RH + 16);
      });

      // Laterais
      const col2 = Math.min(3, nLat || 1);
      const cellW2 = (CW - 80) / col2;
      const y2start = topY + (nPerim > 0 ? (nRows1 * rowH1 + 10) : 0);

      lateralFaces.forEach((face, i) => {
        const col = i % col2;
        const x0 = 40 + col * cellW2 + 20;
        const y0 = y2start + 10;
        const boxW = cellW2 - 40;
        const boxH = rowH2 - 50;
        const sc2 = Math.min(boxW / face.W, boxH / face.H);
        const RW = face.W * sc2, RH = face.H * sc2;
        const fx = x0 + (boxW - RW) / 2;
        const fy = y0 + (boxH - RH) / 2;

        g.fillStyle = '#fafafa'; g.strokeStyle = COR_PERIM; g.lineWidth = 1.5;
        g.fillRect(fx, fy, RW, RH); g.strokeRect(fx, fy, RW, RH);
        g.fillStyle = TEXT_DARK; g.font = 'bold 12px "Segoe UI", sans-serif'; g.textAlign = 'center';
        g.fillText(face.label, fx + RW / 2, y0 + 2);

        const latEmH = calcEmendas(face.W, horChapa);
        const latEmV = calcEmendas(face.H, verChapa);
        const lph = [0].concat(latEmH).concat([face.W]);
        const lpv = [0].concat(latEmV).concat([face.H]);
        for (let hi = 0; hi < lph.length - 1; hi++) {
          for (let vi = 0; vi < lpv.length - 1; vi++) {
            const rawW = lph[hi + 1] - lph[hi];
            const rawH = lpv[vi + 1] - lpv[vi];
            const isLE = (hi === 0), isRE = (hi === lph.length - 2);
            let netW = rawW; if (!isLE) netW -= jt / 2; if (!isRE) netW -= jt / 2;
            const isB = (vi === 0), isT = (vi === lpv.length - 2);
            let netH = rawH; if (!isB) netH -= jt / 2; if (!isT) netH -= jt / 2;
            const shW = Math.round(netW), shH = Math.round(netH);
            const isFull = (Math.abs(shW - horChapa) < 10) && (Math.abs(shH - verChapa) < 10);
            if (isFull) {
              g.fillStyle = 'rgba(16, 185, 129, 0.22)';
              g.strokeStyle = 'rgba(4, 120, 87, 0.85)';
            } else {
              g.fillStyle = 'rgba(245, 158, 11, 0.22)';
              g.strokeStyle = 'rgba(180, 83, 9, 0.85)';
            }
            g.lineWidth = 1.2;
            const cx0 = fx + lph[hi] * sc2;
            const cy0 = fy + lpv[vi] * sc2;
            const cw  = rawW * sc2, ch = rawH * sc2;
            g.fillRect(cx0, cy0, cw, ch);
            g.strokeRect(cx0 + 0.5, cy0 + 0.5, cw - 1, ch - 1);
            if (cw > 45 && ch > 14) {
              g.fillStyle = TEXT_DARK; g.font = 'bold 9px "Courier New", monospace';
              g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText(shW + ' × ' + shH, cx0 + cw / 2, cy0 + ch / 2 - 4);
              g.font = '8px "Courier New", monospace';
              g.fillStyle = TEXT_MUTED;
              g.fillText(isFull ? 'inteira' : 'retalho', cx0 + cw / 2, cy0 + ch / 2 + 7);
            }
          }
        }
        g.textBaseline = 'alphabetic';

        g.strokeStyle = COR_EMENDA; g.lineWidth = 1.2; g.setLineDash([4, 3]);
        latEmH.forEach(ep => {
          const ex = fx + ep * sc2;
          g.beginPath(); g.moveTo(ex, fy); g.lineTo(ex, fy + RH); g.stroke();
        });
        latEmV.forEach(ep => {
          const ey = fy + ep * sc2;
          g.beginPath(); g.moveTo(fx, ey); g.lineTo(fx + RW, ey); g.stroke();
        });
        g.setLineDash([]);
        g.fillStyle = TEXT_MUTED; g.font = '11px "Courier New", monospace'; g.textAlign = 'center';
        g.fillText(face.W + ' × ' + face.H + ' mm', fx + RW / 2, fy + RH + 16);
      });

      // Legenda
      g.fillStyle = 'rgba(16, 185, 129, 0.4)'; g.fillRect(60, CH - 50, 20, 12);
      g.fillStyle = TEXT_DARK; g.font = '11px "Courier New", monospace'; g.textAlign = 'left';
      g.fillText('= Chapa inteira (' + horChapa + ' × ' + verChapa + ' mm)', 86, CH - 40);
      g.fillStyle = 'rgba(245, 158, 11, 0.4)'; g.fillRect(360, CH - 50, 20, 12);
      g.fillStyle = TEXT_DARK; g.fillText('= Retalho', 386, CH - 40);
      g.fillStyle = COR_EMENDA; g.fillRect(490, CH - 50, 20, 12);
      g.fillStyle = TEXT_DARK; g.fillText('= Emenda vertical', 516, CH - 40);
      g.strokeStyle = '#ec4899'; g.lineWidth = 2; g.setLineDash([5, 3]);
      g.beginPath(); g.moveTo(700, CH - 44); g.lineTo(720, CH - 44); g.stroke();
      g.setLineDash([]);
      g.fillStyle = TEXT_DARK; g.fillText('= Dobra (chapa continua)', 726, CH - 40);
      g.fillStyle = TEXT_MUTED; g.font = 'italic 10px "Courier New", monospace';
      g.fillText('Alinhamento: ' + align + '  ·  Junta: ' + jt + 'mm  ·  Chapa: ' + q.chapa_orient, 60, CH - 22);

      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P5b: Desdobramento em cruz (captura o aa_preview existente)
    // ══════════════════════════════════════════════════════════════
    const p5b = () => {
      const { c, g } = mkCanvas();
      hdr(g, 'LAYOUT 2D — DESDOBRAMENTO PLANIFICADO', 'Todas as faces desdobradas (base→frontal→topo→traseira + laterais) com emendas calculadas.');

      try { AutoAcm.draw2D(); } catch (e) {}
      const src = document.getElementById('aa_preview');
      if (!src) {
        g.fillStyle = TEXT_MUTED; g.font = '14px "Segoe UI", sans-serif'; g.textAlign = 'center';
        g.fillText('Preview 2D não disponível.', CW / 2, CH / 2);
        return c.toDataURL();
      }
      const srcW = src.width || src.offsetWidth || 520;
      const srcH = src.height || src.offsetHeight || 420;
      const boxX = 60, boxY = 100, boxW = CW - 440, boxH = CH - 220;
      const sc2 = Math.min(boxW / srcW, boxH / srcH);
      const finalW = srcW * sc2, finalH = srcH * sc2;
      const fx = boxX + (boxW - finalW) / 2;
      const fy = boxY + (boxH - finalH) / 2;

      g.fillStyle = '#f8fafc';
      g.fillRect(fx - 8, fy - 8, finalW + 16, finalH + 16);
      g.strokeStyle = BORDER; g.lineWidth = 1.5;
      g.strokeRect(fx - 8, fy - 8, finalW + 16, finalH + 16);
      try { g.drawImage(src, fx, fy, finalW, finalH); }
      catch (e) {
        g.fillStyle = COR_EMENDA; g.font = '12px "Segoe UI", sans-serif'; g.textAlign = 'center';
        g.fillText('Erro ao copiar preview: ' + e.message, CW / 2, fy + finalH / 2);
      }

      drawLegendaProjeto(g, CW - 360, 100);
      g.fillStyle = TEXT_DARK; g.font = 'bold 11px "Segoe UI", sans-serif'; g.textAlign = 'left';
      g.fillText('Como interpretar:', CW - 360, 320);
      g.font = '10px "Courier New", monospace'; g.fillStyle = TEXT_MUTED;
      let ly = 340;
      ['• Retângulos = chapas ACM',
       '• Linhas vermelhas = emendas V',
       '• Linhas laranja = emendas H',
       '• Verde = fita dupla-face',
       '• Sequência perímetro:',
       '  base → frontal → topo → traseira',
       '  (laterais esq/dir separadas)'].forEach(l => { g.fillText(l, CW - 360, ly); ly += 14; });
      ly += 8;
      g.fillStyle = COR_EMENDA; g.font = 'bold 10px "Courier New", monospace';
      g.fillText('Emendas calculadas pelo alinhamento', CW - 360, ly);
      g.fillText('e largura da chapa.', CW - 360, ly + 14);
      return c.toDataURL();
    };

    // ══════════════════════════════════════════════════════════════
    // P6 HTML: Tabelas de lista de corte + instruções
    // ══════════════════════════════════════════════════════════════
    const p6HTML = () => {
      const buckets = {};
      (q.met_pecas || []).forEach(pc => {
        const key = (pc.tipo || '?') + '|' + Math.round(pc.comp || 0);
        if (!buckets[key]) buckets[key] = { tipo: pc.tipo, comp: Math.round(pc.comp || 0), qtd: 0, perfil: q.metalon_wh };
        buckets[key].qtd++;
      });
      const rows = Object.keys(buckets).map(k => buckets[k])
        .sort((a, b) => {
          if (a.tipo !== b.tipo) return (a.tipo || '').localeCompare(b.tipo || '');
          return b.comp - a.comp;
        });

      const eb = {};
      (q.em_pecas || []).forEach(pc => {
        const k = Math.round(pc.comp || 0);
        if (!eb[k]) eb[k] = { comp: k, qtd: 0, perfil: q.emenda_w + '×' + q.emenda_h };
        eb[k].qtd++;
      });
      const emRows = Object.keys(eb).map(k => eb[k]).sort((a, b) => b.comp - a.comp);

      const totalMet = (q.met_m || 0).toFixed(2);
      const totalEm  = (q.em_m || 0).toFixed(2);
      const totalFita= (q.fita_m || 0).toFixed(2);

      let html = '<div class="report-page">';
      html += '<h2>LISTA DE CORTE · METALON ESTRUTURA</h2>';
      html += '<p class="subtitle">Perfil: Metalon ' + q.metalon_wh + ' mm  ·  Total: ' + totalMet + ' m (' + (q.met_barras || 0) + ' barras de 6m)</p>';
      html += '<table class="cut-table"><thead><tr><th>#</th><th>Tipo</th><th>Perfil</th><th>Comprimento</th><th>Qtd</th><th>Total (m)</th></tr></thead><tbody>';
      let idx = 1, totalLin = 0;
      rows.forEach(r => {
        const tot = (r.comp * r.qtd / 1000);
        totalLin += tot;
        const tipoLabel = r.tipo === 'perim' ? 'Perím. (aresta)' : (r.tipo === 'travessa' ? 'Travessa' : 'Longarina');
        html += '<tr><td>' + idx + '</td><td>' + tipoLabel + '</td><td>' + r.perfil + ' mm</td><td>' + r.comp + ' mm</td><td>' + r.qtd + '</td><td>' + tot.toFixed(2) + '</td></tr>';
        idx++;
      });
      html += '<tr class="total"><td colspan="5">TOTAL METALON</td><td>' + totalLin.toFixed(2) + ' m</td></tr>';
      html += '</tbody></table>';

      if (emRows.length > 0) {
        html += '<h2>LISTA DE CORTE · EMENDAS ACM</h2>';
        html += '<p class="subtitle">Perfil: ' + q.emenda_w + '×' + q.emenda_h + ' mm  ·  Total: ' + totalEm + ' m (' + (q.em_barras || 0) + ' barras de 6m)</p>';
        html += '<table class="cut-table"><thead><tr><th>#</th><th>Perfil</th><th>Comprimento</th><th>Qtd</th><th>Total (m)</th></tr></thead><tbody>';
        let idx2 = 1, emLin = 0;
        emRows.forEach(r => {
          const tot = (r.comp * r.qtd / 1000);
          emLin += tot;
          html += '<tr><td>' + idx2 + '</td><td>' + r.perfil + ' mm</td><td>' + r.comp + ' mm</td><td>' + r.qtd + '</td><td>' + tot.toFixed(2) + '</td></tr>';
          idx2++;
        });
        html += '<tr class="total"><td colspan="4">TOTAL EMENDAS</td><td>' + emLin.toFixed(2) + ' m</td></tr>';
        html += '</tbody></table>';
      }

      html += '<h2>RESUMO DE COMPRAS</h2>';
      html += '<table class="cut-table"><tbody>';
      html += '<tr><td><b>ACM ' + (q.cor_acm || '-') + '</b></td><td>' + (q.acm_chapas_est || 0) + ' chapa(s) ' + q.chapa_larg + '×' + (q.chapa_comp || 5000) + ' mm</td><td>' + (q.acm_total_m2 || 0).toFixed(2) + ' m²</td></tr>';
      html += '<tr><td><b>Metalon ' + q.metalon_wh + '</b></td><td>' + (q.met_barras || 0) + ' barra(s) 6m</td><td>' + totalMet + ' m</td></tr>';
      html += '<tr><td><b>Emendas ' + q.emenda_w + '×' + q.emenda_h + '</b></td><td>' + (q.em_barras || 0) + ' barra(s) 6m</td><td>' + totalEm + ' m</td></tr>';
      html += '<tr><td><b>Fita dupla-face</b></td><td>-</td><td>' + totalFita + ' m</td></tr>';
      html += '</tbody></table>';

      html += '<div class="inst"><h3>INSTRUÇÕES DE MONTAGEM</h3><ol>';
      html += '<li><b>Cortes:</b> Cortar todas as peças de metalon conforme tabela acima. Peças tipo "Perím" são as 12 arestas da caixa. "Longarina" são bordas internas. "Travessa" são divisões.</li>';
      html += '<li><b>Estrutura principal:</b> Soldar primeiro os 4 quadros (frontal, traseiro, esq, dir) e depois uni-los pelos topos/bases. Verificar esquadro.</li>';
      html += '<li><b>Travessas:</b> Posicionar conforme vistas frontal/lateral/planta. Distâncias nas cotas.</li>';
      html += '<li><b>Emendas:</b> As peças ' + q.emenda_w + '×' + q.emenda_h + ' mm unem duas chapas de ACM consecutivas. Soldar após posicionar as travessas.</li>';
      html += '<li><b>Fita dupla-face:</b> Aplicar apenas depois da estrutura montada e pintada. Total ' + totalFita + ' m.</li>';
      html += '<li><b>Fixação do ACM:</b> ' + (q.acm_chapas_est || 0) + ' chapas de ACM ' + (q.cor_acm || '-') + '. Ver layout 2D para identificar cada chapa.</li>';
      html += '<li><b>Conferir esquadro e níveis após cada quadro montado.</b></li>';
      html += '</ol></div>';
      html += '</div>';
      return html;
    };

    // ══════════════════════════════════════════════════════════════
    // GERA TODAS AS PÁGINAS E RETORNA O PACOTE DO MÓDULO
    // (o HTML final é montado por _buildPlanoHtml ou _buildPlanoHtmlMulti)
    // ══════════════════════════════════════════════════════════════
    const imgs = [];
    try { imgs.push(p1()); }        catch (e) { console.error('p1:',  e); }
    try { imgs.push(pDados()); }    catch (e) { console.error('pDados:', e); }
    try { imgs.push(p2()); }        catch (e) { console.error('p2 (sup+inf):',  e); }
    try { imgs.push(p3()); }        catch (e) { console.error('p3 (front):',  e); }
    try { imgs.push(pTraseira()); } catch (e) { console.error('pTraseira:', e); }
    try { imgs.push(p4a()); }       catch (e) { console.error('p4a (laterais):', e); }
    try { imgs.push(p4b()); }       catch (e) { console.error('p4b:', e); }
    try { imgs.push(p5()); }        catch (e) { console.error('p5:',  e); }
    try { imgs.push(p5b()); }       catch (e) { console.error('p5b:', e); }
    const p6 = p6HTML();

    const colorIdx = (m.color_idx == null ? 0 : m.color_idx) % 12;
    return {
      imgs:    imgs,
      p6Html:  p6,
      nome:    nome,
      dim:     q.w + 'x' + q.h + 'x' + q.d,
      q:       q,
      p:       p,
      color:   AA_MOD_PALETTE[colorIdx],
      colorIdx: colorIdx
    };
  },

  /**
   * CSS compartilhado entre single e multi — um único lugar pra ajustar estilo.
   */
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

  /**
   * Busca o cadastro da empresa do disco (via Bridge → Ruby).
   * Retorna {} se não houver dados ou em caso de erro — o relatório
   * funciona normalmente sem cadastro.
   */
  async _fetchEmpresa() {
    try {
      const r = await Bridge.call('empresa_get');
      return (r && r.ok && r.empresa) ? r.empresa : {};
    } catch (e) {
      console.warn('[AutoAcm] empresa_get falhou:', e);
      return {};
    }
  },

  /**
   * Escapa HTML em valores que vêm do cadastro da empresa.
   * (Mesma rotina do _esc do app, repetida aqui pra não criar dependência.)
   */
  _escEmpresa(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  },

  /**
   * Verdadeiro se o cadastro da empresa tem pelo menos algum dado útil.
   */
  _hasEmpresa(empresa) {
    if (!empresa) return false;
    return !!(empresa.nome || empresa.logo || empresa.doc || empresa.endereco ||
              empresa.fone || empresa.email || empresa.repr);
  },

  /**
   * Faixa fina no topo de cada página interna com logo + nome + label da página.
   * Aparece só se empresa estiver cadastrada.
   */
  _brandStripHtml(empresa, pageLabel) {
    if (!AutoAcm._hasEmpresa(empresa)) return '';
    const E = AutoAcm._escEmpresa;
    const logo = empresa.logo
      ? `<img class="brand-strip__logo" src="${empresa.logo}" alt="logo">`
      : `<span class="brand-strip__logo brand-strip__logo--placeholder"></span>`;
    const nome = E(empresa.nome || '');
    const label = E(pageLabel || '');
    return `<div class="brand-strip">
      ${logo}
      <span class="brand-strip__name">${nome}</span>
      <span class="brand-strip__sep"></span>
      <span class="brand-strip__label">${label}</span>
    </div>`;
  },

  /**
   * Capa "impactante" para o modo single — full-page com:
   * logo grande + razão social + dados de contato + título do plano +
   * resumo executivo + assinatura do representante.
   */
  _buildCapaSingleHtml(pkg, empresa) {
    const E = AutoAcm._escEmpresa;
    const dt = new Date().toLocaleDateString('pt-BR');
    const q = pkg.q || {};
    const m = (empresa && AutoAcm._hasEmpresa(empresa)) ? empresa : null;

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
      </div>
    ` : '';

    const totMet = (q.met_m || 0).toFixed(2);
    const totEm  = (q.em_m  || 0).toFixed(2);
    const totFita= (q.fita_m|| 0).toFixed(2);
    const metBarras = (q.met_barras != null) ? q.met_barras : Math.ceil((q.met_m || 0) / 6);
    const emBarras  = (q.em_barras  != null) ? q.em_barras  : Math.ceil((q.em_m  || 0) / 6);
    const metWh = q.metalon_wh || '20x20';
    const emWh  = (q.emenda_w && q.emenda_h) ? `${q.emenda_w}x${q.emenda_h}` : '30x20';

    const resumo = `
      <div class="capa-resumo">
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Dimensões</span>
          <span class="capa-resumo__val">${q.w}×${q.h}×${q.d} <em>mm</em></span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Cor ACM</span>
          <span class="capa-resumo__val">${E(q.cor_acm || '-')}</span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Chapas ACM</span>
          <span class="capa-resumo__val">${q.acm_chapas_est || 0}</span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Metalon ${metWh}</span>
          <span class="capa-resumo__val">${metBarras} <em>barras 6m</em><br><small>${totMet} m</small></span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Emenda ${emWh}</span>
          <span class="capa-resumo__val">${emBarras} <em>barras 6m</em><br><small>${totEm} m</small></span>
        </div>
        <div class="capa-resumo__item">
          <span class="capa-resumo__lbl">Fita DF</span>
          <span class="capa-resumo__val">${totFita} <em>m</em></span>
        </div>
      </div>
    `;

    const assinatura = (m && (m.repr || m.cargo)) ? `
      <div class="capa-assinatura">
        <div class="capa-assinatura__line"></div>
        <div class="capa-assinatura__nome">${E(m.repr || '')}</div>
        ${m.cargo ? `<div class="capa-assinatura__cargo">${E(m.cargo)}</div>` : ''}
      </div>
    ` : '';

    return `
      <div class="capa capa--single">
        <div class="capa__frame">
          ${empresaHeader}
          <div class="capa__divider"></div>
          <div class="capa__title">
            <span class="capa-kicker">Plano de Corte · Auto-ACM</span>
            <h2>${E(pkg.nome || 'Plano de Corte')}</h2>
            <p class="capa-sub">Gerado em ${dt}</p>
          </div>
          ${resumo}
          ${assinatura}
          <div class="capa-footer">
            <span>ACMFacil · Plano de Corte</span>
            <span>${dt}</span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Bloco da empresa pra colar no topo da capa multi.
   * (Diferente da capa single — aqui é só um header band.)
   */
  _buildEmpresaBandMulti(empresa) {
    if (!AutoAcm._hasEmpresa(empresa)) return '';
    const E = AutoAcm._escEmpresa;
    const m = empresa;
    const docLabel = m.doc_tipo === 'cpf' ? 'CPF' : 'CNPJ';
    return `
      <div class="capa-empresa capa-empresa--band">
        ${m.logo ? `<div class="capa-empresa__logo"><img src="${m.logo}" alt="${E(m.nome || 'logo')}"></div>` : ''}
        <div class="capa-empresa__info">
          ${m.nome ? `<h1 class="capa-empresa__name">${E(m.nome)}</h1>` : ''}
          <ul class="capa-empresa__list capa-empresa__list--inline">
            ${m.doc      ? `<li><span>${docLabel}</span><b>${E(m.doc)}</b></li>` : ''}
            ${m.fone     ? `<li><span>Telefone</span><b>${E(m.fone)}</b></li>` : ''}
            ${m.email    ? `<li><span>Email</span><b>${E(m.email)}</b></li>` : ''}
            ${m.endereco ? `<li><span>Endereço</span><b>${E(m.endereco)}</b></li>` : ''}
          </ul>
        </div>
      </div>
      <div class="capa__divider"></div>
    `;
  },

  /**
   * Monta o HTML completo do plano de UM módulo só (modo single).
   * Capa impactante + páginas com brand strip + lista de corte (p6).
   */
  _buildPlanoHtml(m, empresa) {
    const pkg = AutoAcm._buildModuloPackage(m);
    if (!pkg) return '';
    empresa = empresa || {};

    const total = (pkg.imgs ? pkg.imgs.length : 0) + 1; // +1 = lista de corte
    const imgsHtml = pkg.imgs.map((src, i) => {
      const strip = AutoAcm._brandStripHtml(empresa, `Página ${i+1} de ${total}`);
      return `<div class="page page--framed">${strip}<div class="page__body"><img src="${src}" alt="Página ${i+1}"></div></div>`;
    }).join('');

    // Anexa brand strip na p6 (lista de corte) também
    const stripP6 = AutoAcm._brandStripHtml(empresa, `Página ${total} de ${total}`);
    const p6Wrapped = stripP6
      ? pkg.p6Html.replace('<div class="report-page">', `<div class="report-page report-page--framed">${stripP6}<div class="report-page__body">`).replace(/<\/div>\s*$/, '</div></div>')
      : pkg.p6Html;

    const capa = AutoAcm._buildCapaSingleHtml(pkg, empresa);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Plano de Corte — ${AutoAcm._escEmpresa(pkg.nome)}</title>
<style>${AutoAcm._planoCss()}</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Imprimir / PDF</button>
  </div>
  ${capa}
  ${imgsHtml}
  ${p6Wrapped}
</body>
</html>`;
  },

  /**
   * Monta o HTML completo do plano MULTI-MÓDULO:
   * capa com resumão → para cada módulo: separador → 7 páginas → p6.
   */
  _buildPlanoHtmlMulti(modulos, empresa) {
    empresa = empresa || {};
    const pkgs = [];
    modulos.forEach((m, idx) => {
      try {
        const pkg = AutoAcm._buildModuloPackage(m);
        if (pkg) pkgs.push(pkg);
      } catch (e) {
        console.error('[AutoAcm] Erro ao gerar pacote do módulo', idx + 1, e);
      }
    });
    if (pkgs.length === 0) return '';

    const dt = new Date().toLocaleDateString('pt-BR');
    const totalMod = pkgs.length;

    // Consolida totais e agrupa metalon por perfil (estrutura + emendas)
    const metByType = {};
    let totAcm = 0, totMet = 0, totEm = 0, totFita = 0, totChapas = 0;
    pkgs.forEach(pkg => {
      const q = pkg.q;
      totAcm    += (q.acm_total_m2 || 0);
      totMet    += (q.met_m || 0);
      totEm     += (q.em_m || 0);
      totFita   += (q.fita_m || 0);
      totChapas += (q.acm_chapas_est || 0);
      const tipoEst = q.metalon_wh || '-';
      if (!metByType[tipoEst]) metByType[tipoEst] = { m: 0 };
      metByType[tipoEst].m += (q.met_m || 0);
      if ((q.em_m || 0) > 0) {
        const tipoEm = (q.emenda_w && q.emenda_h) ? (q.emenda_w + 'x' + q.emenda_h) : tipoEst;
        if (!metByType[tipoEm]) metByType[tipoEm] = { m: 0 };
        metByType[tipoEm].m += (q.em_m || 0);
      }
    });
    const totMetEm = totMet + totEm;
    let totBarras6m = 0;
    Object.keys(metByType).forEach(k => {
      metByType[k].barras = Math.ceil(metByType[k].m / 6);
      totBarras6m += metByType[k].barras;
    });

    // ═════════ CAPA ═════════
    let capaTable = '<table><thead><tr>';
    capaTable += '<th>#</th><th>Miniatura</th><th>Módulo</th><th>Dimensões</th>';
    capaTable += '<th>Perfis</th><th>Chapas ACM</th><th>Metalon (est+em)</th><th>Barras 6m</th><th>Fita DF</th>';
    capaTable += '</tr></thead><tbody>';
    pkgs.forEach((pkg, i) => {
      const q = pkg.q;
      const thumb = (pkg.imgs && pkg.imgs[0]) ? pkg.imgs[0] : '';
      const modMetM = (q.met_m || 0) + (q.em_m || 0);
      const modBarras = Math.ceil(modMetM / 6);
      const perfilEst = q.metalon_wh || '-';
      const perfilEm  = (q.emenda_w && q.emenda_h) ? (q.emenda_w + 'x' + q.emenda_h) : perfilEst;
      const perfisTxt = (perfilEst === perfilEm) ? (perfilEst + ' mm')
                                                 : (perfilEst + ' / ' + perfilEm + ' mm');
      capaTable += '<tr style="border-left:4px solid ' + (pkg.color || '#3b82f6') + '">';
      capaTable += '<td class="num-cell"><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (pkg.color || '#3b82f6') + ';border:1px solid rgba(0,0,0,0.15)"></span>' + (i + 1) + '</span></td>';
      capaTable += '<td class="thumb-cell">';
      if (thumb) {
        capaTable += '<img src="' + thumb + '" alt="Módulo ' + (i + 1) + '">';
      } else {
        capaTable += '<div style="width:150px;height:90px;background:#f5f5f5;display:grid;place-items:center;color:#a3a3a3;font-size:10px;border-radius:6px">sem preview</div>';
      }
      capaTable += '</td>';
      capaTable += '<td><b>' + (pkg.nome || ('Módulo ' + (i + 1))) + '</b></td>';
      capaTable += '<td>' + q.w + ' × ' + q.h + ' × ' + q.d + ' mm</td>';
      capaTable += '<td>' + perfisTxt + '</td>';
      capaTable += '<td>' + (q.acm_chapas_est || 0) + '</td>';
      capaTable += '<td>' + (q.met_m || 0).toFixed(2) + ' + ' + (q.em_m || 0).toFixed(2) + ' = <b>' + modMetM.toFixed(2) + ' m</b></td>';
      capaTable += '<td><b>' + modBarras + '</b></td>';
      capaTable += '<td>' + (q.fita_m || 0).toFixed(2) + ' m</td>';
      capaTable += '</tr>';
    });
    // Linha de totais
    capaTable += '<tr class="totais-gerais">';
    capaTable += '<td colspan="5"><b>TOTAIS GERAIS</b></td>';
    capaTable += '<td><b>' + totChapas + '</b></td>';
    capaTable += '<td><b>' + totMetEm.toFixed(2) + ' m</b></td>';
    capaTable += '<td><b>' + totBarras6m + '</b></td>';
    capaTable += '<td><b>' + totFita.toFixed(2) + ' m</b></td>';
    capaTable += '</tr>';
    capaTable += '</tbody></table>';

    // Resumo geral de materiais
    let resumoHtml = '<div class="resumo-geral">';
    resumoHtml += '<h3>Resumo Geral de Materiais</h3>';
    resumoHtml += '<dl>';
    resumoHtml += '<dt>Metalon por perfil (estrutura + emendas)</dt>';
    const tipos = Object.keys(metByType).sort();
    tipos.forEach(tipo => {
      const t = metByType[tipo];
      resumoHtml += '<dd>• Metalon <b>' + tipo + ' mm</b>: ' + t.m.toFixed(2) + ' m — <b>' + t.barras + ' barra(s) 6m</b></dd>';
    });
    resumoHtml += '<dd style="border-top:1px solid #e5e5e5;padding-top:8px;margin-top:8px"><b>Metalon TOTAL GERAL:</b> ' + totMetEm.toFixed(2) + ' m — <b>' + totBarras6m + ' barra(s) 6m</b><br>';
    resumoHtml += '<span style="color:#737373;font-size:11px">(estrutura ' + totMet.toFixed(2) + ' m + emendas ' + totEm.toFixed(2) + ' m)</span></dd>';
    resumoHtml += '<dt style="margin-top:12px">Outros materiais</dt>';
    resumoHtml += '<dd>• <b>Fita dupla-face TOTAL:</b> ' + totFita.toFixed(2) + ' m</dd>';
    resumoHtml += '<dd>• <b>Área total ACM:</b> ' + totAcm.toFixed(2) + ' m² — <b>' + totChapas + ' chapa(s)</b></dd>';
    resumoHtml += '</dl>';
    resumoHtml += '</div>';

    const empresaBand = AutoAcm._buildEmpresaBandMulti(empresa);
    const capa = `
<div class="capa">
  <div class="capa__frame">
    ${empresaBand}
    <div class="capa-kicker">ACMFacil · Auto-ACM</div>
    <h1>Plano de Corte de Fachada</h1>
    <div class="capa-sub">Projeto multi-módulo · ${totalMod} módulos · Gerado em ${dt}</div>
    ${capaTable}
    ${resumoHtml}
    <div class="capa-footer">
      <span>ACMFacil · Plano de Corte Consolidado</span>
      <span>${dt}</span>
    </div>
  </div>
</div>`;

    // ═════════ SEPARADORES + PÁGINAS POR MÓDULO ═════════
    const body = pkgs.map((pkg, idx) => {
      const q = pkg.q;
      const _mm = (q.met_m || 0) + (q.em_m || 0);
      let chips = '';
      chips += `<span class="chip">Dimensões: ${q.w}×${q.h}×${q.d} mm</span>`;
      chips += `<span class="chip">Cor: ${q.cor_acm || '-'}</span>`;
      chips += `<span class="chip">Metalon: ${q.metalon_wh || '-'}</span>`;
      chips += `<span class="chip">Metalon total: ${_mm.toFixed(2)} m (${Math.ceil(_mm / 6)} barras 6m)</span>`;
      if ((q.em_m || 0) > 0) {
        chips += `<span class="chip">Emendas: ${q.emenda_w || '-'}×${q.emenda_h || '-'} mm — ${(q.em_m || 0).toFixed(2)} m</span>`;
      }
      chips += `<span class="chip">ACM: ${q.acm_chapas_est || 0} chapas</span>`;
      chips += `<span class="chip">Fita DF: ${(q.fita_m || 0).toFixed(2)} m</span>`;

      const modColor = pkg.color || '#3b82f6';
      const sep = `
<div class="modsep" style="border-left:6px solid ${modColor};padding-left:14px">
  <h2 style="display:flex;align-items:center;gap:10px">
    <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${modColor};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.15)"></span>
    Módulo ${idx + 1}/${totalMod} — ${pkg.nome || ('Módulo ' + (idx + 1))}
  </h2>
  <div class="chips">${chips}</div>
</div>`;

      const imgsHtml = pkg.imgs.map((src, i) => {
        const lbl = `Módulo ${idx+1}/${totalMod} · Pág ${i+1}/${pkg.imgs.length+1}`;
        const strip = AutoAcm._brandStripHtml(empresa, lbl);
        return `<div class="page page--framed">${strip}<div class="page__body"><img src="${src}" alt="Módulo ${idx+1} — Página ${i+1}"></div></div>`;
      }).join('');

      const stripP6 = AutoAcm._brandStripHtml(empresa,
        `Módulo ${idx+1}/${totalMod} · Lista de Corte`);
      const p6Wrapped = stripP6
        ? pkg.p6Html.replace('<div class="report-page">', `<div class="report-page report-page--framed">${stripP6}<div class="report-page__body">`).replace(/<\/div>\s*$/, '</div></div>')
        : pkg.p6Html;

      return sep + imgsHtml + p6Wrapped;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Plano de Corte Consolidado — ${totalMod} módulos</title>
<style>${AutoAcm._planoCss()}</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Imprimir / PDF</button>
  </div>
  ${capa}
  ${body}
</body>
</html>`;
  },

  // ══════════════════════════════════════════════════════════════════
  // PREVIEW 2D PLANIFICADO (FASE 5)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Agenda um redraw no próximo frame (debounce natural).
   * Usa DOUBLE rAF pra garantir que mudanças de layout (section toggle,
   * hidden -> visible) tenham completado antes de ler clientWidth.
   * Também atualiza o resumo já que mudanças de params pedem update.
   */
  scheduleRedraw() {
    if (AutoAcm._redrawScheduled) return;
    AutoAcm._redrawScheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        AutoAcm._redrawScheduled = false;
        try { AutoAcm.draw2D(); } catch (e) { console.error('[AutoAcm] draw2D erro:', e); }
        // Atualiza o resumo também — cobre 99% das mudanças de param
        try {
          const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
          if (m) AutoAcm.updateResumo(m);
        } catch (e) {}
      });
    });
  },

  /**
   * Instala um ResizeObserver no canvas pra redesenhar quando o tamanho
   * do container mudar (colapso/expansão de seções acima). Idempotente.
   */
  _installResizeObserver() {
    if (AutoAcm._resizeObserverInstalled) return;
    const c = document.getElementById('aa_preview');
    if (!c) return;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { AutoAcm.scheduleRedraw(); });
    ro.observe(c);
    AutoAcm._resizeObserverInstalled = true;
  },

  setPlanTool(t) {
    AutoAcm.state.planTool = t;
    document.querySelectorAll('.aa__tool[data-plan-tool]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.planTool === t);
    });
    const c = document.getElementById('aa_preview');
    if (!c) return;
    c.classList.remove('is-moving', 'is-moving-v', 'is-cutting');
    if (t === 'moveH') c.classList.add('is-moving');
    else if (t === 'moveV') c.classList.add('is-moving-v');
    else if (t === 'cutV' || t === 'cutH') c.classList.add('is-cutting');
  },

  planReset() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.params) return;
    m.params.planEmH = null;
    m.params.planEmV = null;
    AutoAcm.scheduleRedraw();
  },

  /**
   * Compartilhamento via WhatsApp.
   * Monta uma mensagem com resumo dos módulos gerados e abre wa.me.
   * Adicionalmente, abre o explorador de arquivos no diretório onde o
   * último plano foi salvo (se houver) pra facilitar arrastar pro chat.
   */
  async compartilharWhatsApp() {
    const gerados = AutoAcm.state.modulos.filter(m => m && m.quant && m.quant.met_pecas);
    if (gerados.length === 0) {
      Toast.warning(I18n.t('aa.plano.share.no_quant',
        'Gere a estrutura de pelo menos 1 módulo antes de compartilhar.'));
      return;
    }

    // Monta resumo curto
    let totAcm = 0, totMet = 0, totEm = 0, totFita = 0, totChapas = 0;
    gerados.forEach(m => {
      const q = m.quant;
      totAcm    += (q.acm_total_m2 || 0);
      totMet    += (q.met_m || 0);
      totEm     += (q.em_m || 0);
      totFita   += (q.fita_m || 0);
      totChapas += (q.acm_chapas_est || 0);
    });
    const totMetEm = totMet + totEm;
    const totBarras = Math.ceil(totMetEm / 6);

    const lines = [];
    lines.push('*ACMFacil — Resumo de Materiais*');
    lines.push('');
    lines.push(`📦 Módulos: ${gerados.length}`);
    gerados.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${m.nome} — ${m.w}×${m.h}×${m.d} mm`);
    });
    lines.push('');
    lines.push('*Totais:*');
    lines.push(`• ACM: ${totAcm.toFixed(2)} m² · ${totChapas} chapas`);
    lines.push(`• Metalon: ${totMetEm.toFixed(2)} m · ${totBarras} barras 6m`);
    lines.push(`• Fita dupla-face: ${totFita.toFixed(2)} m`);
    lines.push('');
    lines.push('_Gerado pelo ACMFacil_');

    const message = lines.join('\n');
    const url = 'https://wa.me/?text=' + encodeURIComponent(message);

    try {
      const r = await Bridge.call('app_open_url', { url: url });
      if (r && r.ok) {
        Toast.success(I18n.t('aa.plano.share.ok',
          'WhatsApp aberto. Anexe o plano salvo no chat.'),
          { duration: 3500 });
      } else {
        Toast.error(I18n.t('aa.plano.share.error',
          'Não foi possível abrir o WhatsApp.'));
      }
    } catch (e) {
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    }
  },

  /** Reseta apenas a câmera 2D (zoom + pan), mantendo emendas. */
  planResetView() {
    AutoAcm.state.zoom2D = 1.0;
    AutoAcm.state.panX2D = 0;
    AutoAcm.state.panY2D = 0;
    AutoAcm.scheduleRedraw();
  },

  /**
   * Calcula o número REAL de chapas ACM necessárias.
   *
   * Filosofia: o ACM vem em chapas de chapaL × chapaC mm (configurável). Uma única chapa
   * pode ser CORTADA em vários pedaços (cells do layout). Então a contagem
   * correta NÃO é "uma chapa por cell" — é a área desdobrada total dividida
   * pela área da chapa, arredondado pra cima.
   *
   * Soma as áreas de cada face HABILITADA (frontal, traseira, topo, base,
   * esq, dir) e divide pela área de uma chapa.
   */
  _computeChapasReal(q, p, m) {
    // Conta o número de chapas ACM com APROVEITAMENTO DE RETALHO:
    //  - Perímetro vertical desdobrado (base+frontal+topo+traseira habilitadas)
    //    forma uma tira W × perimTotal. _calcEmendas corta em painéis. Cada
    //    painel é alocado em uma chapa nova; as sobras (direita + topo) viram
    //    retalhos disponíveis.
    //  - Faces laterais (esq, dir): tenta encaixar em retalho existente antes
    //    de alocar chapa nova. SEM rotação — peça mantém sua orientação natural
    //    (W ou D no eixo de 5mm, H/altura no eixo de 1220mm). Isso respeita
    //    a regra "aproveitamento sempre na mesma direção da chapa".

    const W = q.w || q.w_mm || (m && m.w) || 0;
    const H = q.h || q.h_mm || (m && m.h) || 0;
    const D = q.d || q.d_mm || (m && m.d) || 0;
    if (W < 1 || H < 1 || D < 1) return 0;

    const chapaL = q.chapa_larg || (p && p.acm_chapa) || 1220;
    const chapaC = q.chapa_comp || (p && p.acm_chapa_comp) || 5000;
    const orient = (p && p.acm_orient) || q.chapa_orient || 'horizontal';
    const horChapa = (orient === 'vertical') ? chapaL : chapaC;
    const verChapa = (orient === 'vertical') ? chapaC : chapaL;
    const jt    = (p && p.junta_tipo === 'seca') ? 0 : parseInt((p && p.junta_mm) || 8, 10);
    const align = (p && p.emenda_align) || 'esquerda';

    let enab = q.enab || (p && p.enab);
    if (!enab) {
      enab = {
        frontal:  !!q.enab_frontal,
        traseira: !!q.enab_traseira,
        topo:     !!q.enab_topo,
        base:     !!q.enab_base,
        esq:      !!q.enab_esq,
        dir:      !!q.enab_dir
      };
      const any = enab.frontal || enab.traseira || enab.topo || enab.base || enab.esq || enab.dir;
      if (!any) enab.frontal = true;
    }

    // Helpers locais
    const sliceDims = (total, ems) => {
      const out = []; let prev = 0;
      for (const e of ems) { out.push(e - prev); prev = e; }
      out.push(total - prev);
      return out;
    };
    const retalhos = []; // [{w, h}]
    // Aloca uma chapa pra um painel pw × ph e empurra os retalhos resultantes
    const allocPanel = (pw, ph) => {
      const rightW = horChapa - pw;
      const topH   = verChapa - ph;
      if (rightW > 1) retalhos.push({ w: rightW, h: ph });
      if (topH   > 1) retalhos.push({ w: horChapa, h: topH });
    };
    // Tenta encaixar pw × ph num retalho (best-fit por área). Retorna true se coube.
    const placeInRetalho = (pw, ph) => {
      let bestIdx = -1, bestWaste = Infinity;
      for (let i = 0; i < retalhos.length; i++) {
        const r = retalhos[i];
        if (pw <= r.w + 0.5 && ph <= r.h + 0.5) {
          const waste = (r.w * r.h) - (pw * ph);
          if (waste < bestWaste) { bestWaste = waste; bestIdx = i; }
        }
      }
      if (bestIdx < 0) return false;
      const r = retalhos[bestIdx];
      retalhos.splice(bestIdx, 1);
      // guillotine: corta vertical primeiro (faixa direita), depois horizontal (faixa topo)
      if (r.w - pw > 1) retalhos.push({ w: r.w - pw, h: r.h });
      if (r.h - ph > 1) retalhos.push({ w: pw,         h: r.h - ph });
      return true;
    };

    let chapasCount = 0;

    // ── Junta TODOS os painéis necessários (perímetro + laterais) numa lista,
    // ordena do maior pro menor (First-Fit Decreasing) e encaixa cada um:
    // primeiro tentando retalho de chapa já alocada, depois chapa nova.
    const panels = [];

    // 1) Perímetro desdobrado V (base→frontal→topo→traseira habilitadas)
    let perimTotal = 0;
    if (enab.base)     perimTotal += D;
    if (enab.frontal)  perimTotal += H;
    if (enab.topo)     perimTotal += D;
    if (enab.traseira) perimTotal += H;
    if (perimTotal > 0) {
      const emH = (p && p.planEmH != null) ? p.planEmH.slice()
                                           : AutoAcm._calcEmendas(W, horChapa, jt, align);
      const emV = (p && p.planEmV != null) ? p.planEmV.slice()
                                           : AutoAcm._calcEmendas(perimTotal, verChapa, jt, align);
      const widths  = sliceDims(W,          emH);
      const heights = sliceDims(perimTotal, emV);
      for (const ph of heights) {
        for (const pw of widths) {
          panels.push({ pw, ph });
        }
      }
    }

    // 2) Faces laterais — cada lateral vira grid de painéis menores
    const addSide = (sw, sh) => {
      if (sw < 1 || sh < 1) return;
      const emH = AutoAcm._calcEmendas(sw, horChapa, jt, align);
      const emV = AutoAcm._calcEmendas(sh, verChapa, jt, align);
      const widths  = sliceDims(sw, emH);
      const heights = sliceDims(sh, emV);
      for (const ph of heights) {
        for (const pw of widths) {
          panels.push({ pw, ph });
        }
      }
    };
    if (enab.esq) addSide(D, H);
    if (enab.dir) addSide(D, H);

    // FFD: maiores primeiro pra maximizar chance de aproveitar retalho
    panels.sort((a, b) => (b.pw * b.ph) - (a.pw * a.ph));
    for (const pan of panels) {
      if (placeInRetalho(pan.pw, pan.ph)) continue;
      chapasCount += 1;
      allocPanel(pan.pw, pan.ph);
    }

    return chapasCount;
  },

  /**
   * Calcula posições de emendas ao longo de uma dimensão.
   * @param {number} dim — dimensão total (mm)
   * @param {number} chapaMax — tamanho máximo de 1 chapa nessa direção
   * @param {number} jt — folga da junta (mm)
   * @param {string} align — 'esquerda'|'central'|'direita'|'simetrica'
   */
  _calcEmendas(dim, chapaMax, jt, align) {
    if (dim <= chapaMax + 1) return [];
    if (align === 'simetrica') {
      let n = Math.ceil((dim + jt) / (chapaMax + jt));
      if (n < 2) n = 2;
      const pw = (dim - (n - 1) * jt) / n;
      const ems = [];
      let cur = 0;
      for (let i = 1; i < n; i++) { cur += pw; ems.push(cur); cur += jt; }
      return ems;
    }
    let nf = Math.floor((dim + jt) / (chapaMax + jt));
    if (nf < 1) nf = 1;
    let sw = [];
    if (align === 'esquerda') {
      const tf = nf * chapaMax + (nf - 1) * jt;
      const side = dim - tf - jt;
      if (side > 1) { sw = [side]; for (let i = 0; i < nf; i++) sw.push(chapaMax); }
      else { for (let i = 0; i < nf; i++) sw.push(chapaMax); }
    } else if (align === 'central') {
      const ij = (nf > 1) ? (nf - 1) * jt : 0;
      const sj = (nf > 0) ? 2 * jt : 0;
      const side = (dim - nf * chapaMax - ij - sj) / 2;
      if (side > 1) { sw = [side]; for (let i = 0; i < nf; i++) sw.push(chapaMax); sw.push(side); }
      else { for (let i = 0; i < nf; i++) sw.push(chapaMax); }
    } else if (align === 'direita') {
      const tf = nf * chapaMax + (nf - 1) * jt;
      const side = dim - tf - jt;
      if (side > 1) { for (let i = 0; i < nf; i++) sw.push(chapaMax); sw.push(side); }
      else { for (let i = 0; i < nf; i++) sw.push(chapaMax); }
    } else {
      for (let i = 0; i < nf; i++) sw.push(chapaMax);
    }
    const ems = [];
    let cur = 0;
    for (let i = 0; i < sw.length - 1; i++) { cur += sw[i]; ems.push(cur); cur += jt; }
    return ems;
  },

  /**
   * Desenha o preview 2D planificado no canvas #aa_preview.
   */
  draw2D() {
    const c = document.getElementById('aa_preview');
    if (!c) return;
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.params) return;
    const p = m.params;

    // Se canvas ainda não tem dimensões reais (layout ainda reflowando),
    // adia o desenho pra próxima frame até o layout estabilizar.
    if (c.offsetParent === null || c.clientWidth < 50) {
      requestAnimationFrame(() => AutoAcm.draw2D());
      return;
    }

    // Instala ResizeObserver na primeira chamada válida
    AutoAcm._installResizeObserver();

    // HiDPI + responsivo
    const dpr  = window.devicePixelRatio || 1;
    let cssW   = c.clientWidth  || 800;
    let cssH   = c.clientHeight || 480;
    if (cssW < 100) cssW = 800;
    if (cssH < 100) cssH = 480;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    // Só muda .width/.height se realmente mudou — evita clear desnecessário
    if (c.width  !== targetW) c.width  = targetW;
    if (c.height !== targetH) c.height = targetH;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = cssW, H = cssH;

    const bw = m.w, bh = m.h, bd = m.d;
    const en = p.enab || {};
    const chapaComp   = parseInt(p.acm_chapa_comp || 5000, 10);
    const chapaLarg   = parseInt(p.acm_chapa || 1220, 10);
    const chapaOrient = p.acm_orient || 'horizontal';
    const jt          = (p.junta_tipo === 'seca') ? 0 : (parseInt(p.junta_mm || 8, 10));
    const align       = p.emenda_align || 'esquerda';

    // Cor ACM e junta
    let acmColor = '#cc2020';
    if (p.cor_acm) {
      for (const cat in AutoAcm.state.cores) {
        const found = AutoAcm.state.cores[cat].find(x => x.nome === p.cor_acm);
        if (found) { acmColor = 'rgb(' + found.rgb.join(',') + ')'; break; }
      }
    }
    let juntaColor = '#222';
    const jfc = AutoAcm.state.juntaColors.find(x => x.nome === (p.cor_junta || 'Preto'));
    if (jfc) juntaColor = 'rgb(' + jfc.rgb.join(',') + ')';

    // Perímetro vertical desdobrado: base + frontal + topo + traseira
    // Cores light theme — translúcidas mas saturadas o suficiente
    const sections = [];
    if (en.base)     sections.push({ role: 'base',     label: 'BASE',     h: bd, color: 'rgba(217, 119, 6, 0.10)',  strokeColor: '#b45309' });
    if (en.frontal)  sections.push({ role: 'frontal',  label: 'FRONTAL',  h: bh, color: 'rgba(37, 99, 235, 0.10)',  strokeColor: '#1d4ed8' });
    if (en.topo)     sections.push({ role: 'topo',     label: 'TOPO',     h: bd, color: 'rgba(8, 145, 178, 0.10)',  strokeColor: '#0e7490' });
    if (en.traseira) sections.push({ role: 'traseira', label: 'TRASEIRA', h: bh, color: 'rgba(147, 51, 234, 0.10)', strokeColor: '#7e22ce' });

    // Background light
    const grad2 = ctx.createLinearGradient(0, 0, 0, H);
    grad2.addColorStop(0, '#ffffff');
    grad2.addColorStop(1, '#f4f6f9');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, W, H);

    if (sections.length === 0) {
      ctx.fillStyle = 'rgba(107, 114, 128, 0.6)';
      ctx.font = '12px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(I18n.t('aa.preview.empty', 'Habilite ao menos uma face para ver o preview'), W/2, H/2);
      return;
    }

    // Header — light theme
    ctx.fillStyle = 'rgba(23, 23, 23, 0.85)';
    ctx.font = 'bold 13px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PLANIFICADO  ' + bw + ' × ' + bh + ' × ' + bd + ' mm', 12, 18);
    ctx.fillStyle = 'rgba(107, 114, 128, 0.85)';
    ctx.font = '10px "Geist Mono", monospace';
    ctx.fillText('Chapa ' + chapaLarg + ' × ' + chapaComp + ' · ' + chapaOrient + ' · ' + align, 12, 32);

    // Perímetro total vertical
    let perimTotal = 0;
    sections.forEach(s => { perimTotal += s.h; });
    const unfoldedW = bw;

    const horChapa = (chapaOrient === 'vertical') ? chapaLarg : chapaComp;
    const verChapa = (chapaOrient === 'vertical') ? chapaComp : chapaLarg;

    // Emendas — customizadas se existirem, senão calcula
    const emH = (p.planEmH !== null && p.planEmH !== undefined) ? p.planEmH.slice()
                                                                 : AutoAcm._calcEmendas(unfoldedW, horChapa, jt, align);
    const emV = (p.planEmV !== null && p.planEmV !== undefined) ? p.planEmV.slice()
                                                                 : AutoAcm._calcEmendas(perimTotal, verChapa, jt, align);

    // Margens + escala (com zoom/pan da Fase E aplicados)
    const ml = 80, mr = 80, mt = 46, mb = 40;
    const aw = W - ml - mr, ah = H - mt - mb;
    // Ancora pra dobras laterais — frontal preferido, depois traseira
    let foldRefRole = null, foldRefYStart = -1, foldRefYEnd = -1;
    {
      let c0 = 0;
      for (const s of sections) {
        if (s.role === 'frontal') { foldRefRole = 'frontal'; foldRefYStart = c0; foldRefYEnd = c0 + s.h; break; }
        c0 += s.h;
      }
      if (foldRefRole == null) {
        c0 = 0;
        for (const s of sections) {
          if (s.role === 'traseira') { foldRefRole = 'traseira'; foldRefYStart = c0; foldRefYEnd = c0 + s.h; break; }
          c0 += s.h;
        }
      }
    }
    const showEsq = en.esq && foldRefRole != null;
    const showDir = en.dir && foldRefRole != null;
    const leftExt  = showEsq ? bd : 0;
    const rightExt = showDir ? bd : 0;
    const totalDrawW = leftExt + unfoldedW + rightExt;
    const scBase = Math.min(aw / totalDrawW, ah / perimTotal);
    if (scBase < 0.01) return;
    const Z = AutoAcm.state.zoom2D || 1;
    const sc = scBase * Z;
    // Centraliza no espaço fit, aplica pan. ox referencia o início do PERÍMETRO
    // (não do desenho total): tx(0) ainda é a borda esquerda do frontal/perim,
    // e laterais ficam em tx(-bd) / tx(unfoldedW+bd). Mantém todo o resto
    // (grid de chapas, emendas, dobras horizontais) intacto.
    const ox = ml + (aw - totalDrawW * sc) / 2 + leftExt * sc + (AutoAcm.state.panX2D || 0);
    const oy = mt + (ah - perimTotal * sc) / 2 + (AutoAcm.state.panY2D || 0);
    const tx = mm => ox + mm * sc;
    const ty = mm => oy + (perimTotal - mm) * sc;  // Y invertido
    const tw = mm => mm * sc;

    // Guarda transform pra hit testing
    AutoAcm.state.planXform = {
      ox, oy, sc,
      perimTotal, unfoldedW,
      emH, emV
    };

    // Background sections (cores por face)
    let cumH = 0;
    sections.forEach(s => {
      ctx.fillStyle = s.color;
      ctx.fillRect(tx(0), ty(cumH + s.h), tw(unfoldedW), tw(s.h));
      cumH += s.h;
    });

    // Chapas — retângulos com label + ID sequencial (Fase F)
    const ptsH = [0].concat(emH).concat([unfoldedW]);
    const ptsV = [0].concat(emV).concat([perimTotal]);
    const chapasList = []; // pra reports / numeração estável
    let chapaSeq = 0;
    // Ordem de cima→baixo, esquerda→direita (vi vai de top pra bottom; ptsV é bottom-up)
    for (let vi = ptsV.length - 2; vi >= 0; vi--) {
      for (let hi = 0; hi < ptsH.length - 1; hi++) {
        const x0 = tx(ptsH[hi]), x1 = tx(ptsH[hi+1]);
        const y0 = ty(ptsV[vi+1]), y1 = ty(ptsV[vi]);
        const rawW = ptsH[hi+1] - ptsH[hi];
        const rawH = ptsV[vi+1] - ptsV[vi];
        const isLE = (hi === 0), isRE = (hi === ptsH.length - 2);
        let netW = rawW;
        if (!isLE) netW -= jt/2;
        if (!isRE) netW -= jt/2;
        const isB = (vi === 0), isT = (vi === ptsV.length - 2);
        let netH = rawH;
        if (!isB) netH -= jt/2;
        if (!isT) netH -= jt/2;
        const shW = Math.round(netW), shH = Math.round(netH);
        const isFullH = Math.abs(shH - verChapa) < 10;
        const isFullW = Math.abs(shW - horChapa) < 10;

        chapaSeq++;
        const chapaId = 'A' + chapaSeq;
        chapasList.push({
          id: chapaId, w: shW, h: shH,
          kind: (isFullH && isFullW) ? 'inteira' : 'retalho'
        });

        if (isFullH && isFullW) {
          // Inteira — emerald
          ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
          ctx.strokeStyle = 'rgba(4, 120, 87, 0.85)';
        } else {
          // Retalho — amber
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.strokeStyle = 'rgba(180, 83, 9, 0.85)';
        }
        ctx.lineWidth = 1.5;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);

        // ID badge no canto superior esquerdo
        if ((x1 - x0) > 32 && (y1 - y0) > 18) {
          const padX = 4, padY = 3;
          ctx.font = 'bold 9px "Geist Mono", monospace';
          const tw1 = ctx.measureText(chapaId).width;
          ctx.fillStyle = 'rgba(23, 23, 23, 0.85)';
          ctx.fillRect(x0 + 2, y0 + 2, tw1 + padX * 2, 13);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(chapaId, x0 + 2 + padX, y0 + 2 + 6.5);
        }

        // Label central
        const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
        if ((x1 - x0) > 50 && (y1 - y0) > 22) {
          ctx.fillStyle = 'rgba(23, 23, 23, 0.85)';
          ctx.font = 'bold 10px "Geist Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(shW + ' × ' + shH, cxm, cym - 5);
          ctx.font = '9px "Geist Mono", monospace';
          ctx.fillStyle = 'rgba(107, 114, 128, 0.80)';
          ctx.fillText(isFullH && isFullW ? 'inteira' : 'retalho', cxm, cym + 8);
        }
      }
    }
    ctx.textBaseline = 'alphabetic';

    // Guarda a lista de chapas em planXform pra reports
    AutoAcm.state.planXform.chapas = chapasList;

    // Atualiza hint de orientação inteligente
    AutoAcm._updateOrientHint(m, unfoldedW, perimTotal, jt);

    // ── Laterais esq/dir (desenhadas como retângulos próprios, FORA do grid
    // do perímetro — não afetam contagem de chapas nem emendas da tira) ──
    // Cor indigo translucida pra DESTACAR visualmente do amber (retalho).
    const drawLateral = (xMmStart, xMmEnd, labelRole) => {
      const x0 = tx(xMmStart), x1 = tx(xMmEnd);
      const y0 = ty(foldRefYEnd),   y1 = ty(foldRefYStart);
      const w0 = x1 - x0, h0 = y1 - y0;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
      ctx.fillRect(x0, y0, w0, h0);
      ctx.strokeStyle = 'rgba(67, 56, 202, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, w0 - 1, h0 - 1);
      // Header — tag superior dentro do rect
      if (w0 > 28 && h0 > 30) {
        ctx.fillStyle = 'rgba(67, 56, 202, 0.92)';
        ctx.fillRect(x0 + 2, y0 + 2, Math.min(w0 - 4, 48), 13);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px "Geist Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelRole.toUpperCase(), x0 + 6, y0 + 2 + 6.5);
      }
      // Conteúdo central (vertical: dims + role) — só se couber
      if (w0 > 36 && h0 > 50) {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        ctx.fillStyle = 'rgba(23, 23, 23, 0.85)';
        ctx.font = 'bold 10px "Geist Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bd + ' × ' + bh, cx, cy - 6);
        ctx.font = '9px "Geist Mono", monospace';
        ctx.fillStyle = 'rgba(107, 114, 128, 0.85)';
        ctx.fillText('lateral', cx, cy + 7);
      }
      ctx.textBaseline = 'alphabetic';
    };
    if (showEsq) drawLateral(-bd, 0, 'esq');
    if (showDir) drawLateral(unfoldedW, unfoldedW + bd, 'dir');

    // Dobras VERTICAIS (frontal/esq e frontal/dir) — pink/rose tracejada SEM
    // texto inline (legenda já tem "dobra"). Posicionamento da lateral + linha
    // tracejada deixa claro qual dobra é qual.
    if (showEsq || showDir) {
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.9)';
      if (showEsq) {
        ctx.beginPath();
        ctx.moveTo(tx(0), ty(foldRefYEnd));
        ctx.lineTo(tx(0), ty(foldRefYStart));
        ctx.stroke();
      }
      if (showDir) {
        ctx.beginPath();
        ctx.moveTo(tx(unfoldedW), ty(foldRefYEnd));
        ctx.lineTo(tx(unfoldedW), ty(foldRefYStart));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Dobras (linha tracejada entre faces) — pink/rose
    cumH = 0;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < sections.length; i++) {
      cumH += sections[i].h;
      if (i < sections.length - 1) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.9)';
        ctx.beginPath();
        ctx.moveTo(tx(0), ty(cumH));
        ctx.lineTo(tx(unfoldedW), ty(cumH));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(190, 24, 93, 0.95)';
        ctx.font = 'bold 9px "Geist Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('dobra ' + sections[i].role + '/' + sections[i+1].role, tx(unfoldedW) + 6, ty(cumH) + 3);
      }
    }
    ctx.setLineDash([]);

    // Emendas H (cortes verticais ao longo de W)
    ctx.lineWidth = Math.max(2, jt > 0 ? jt * sc : 2);
    emH.forEach((ep, i) => {
      const ex = tx(ep);
      ctx.strokeStyle = juntaColor;
      ctx.beginPath();
      ctx.moveTo(ex, ty(perimTotal));
      ctx.lineTo(ex, ty(0));
      ctx.stroke();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.95)';
      ctx.font = 'bold 9px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EMV' + (i+1), ex, ty(perimTotal) - 6);
    });

    // Emendas V (cortes horizontais ao longo do perimetro)
    ctx.lineWidth = Math.max(2, jt > 0 ? jt * sc : 2);
    emV.forEach((ep, i) => {
      const ey = ty(ep);
      ctx.strokeStyle = juntaColor;
      ctx.beginPath();
      ctx.moveTo(tx(0), ey);
      ctx.lineTo(tx(unfoldedW), ey);
      ctx.stroke();
      ctx.fillStyle = 'rgba(217, 119, 6, 0.95)';
      ctx.font = 'bold 9px "Geist Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('EMH' + (i+1), tx(0) - 6, ey + 3);
    });

    // SPOTS (amarelos)
    if (p.spots_inc) {
      const spFaces = [];
      Object.keys(p.spots_faces || {}).forEach(f => {
        if (p.spots_faces[f]) spFaces.push(f);
      });
      const spN     = parseInt(p.spots_qtd || 5, 10);
      const spRecuo = parseFloat(p.spots_recuo || 800);
      const spModo  = p.spots_modo || 'ambas';
      const spTipo  = p.spots_tipo || 'circular';
      let spDim1, spDim2;
      if (spTipo === 'linear') {
        spDim1 = parseFloat(p.spots_comp_l || 500);
        spDim2 = parseFloat(p.spots_larg_l || 20);
      } else if (spTipo === 'quadrado') {
        spDim1 = parseFloat(p.spots_lado || 85);
        spDim2 = spDim1;
      } else {
        spDim1 = parseFloat(p.spots_dia || 85);
        spDim2 = spDim1;
      }

      const calcSpotPositions = (uW, n, recuo, modo) => {
        const pos = [];
        if (n === 1) {
          if (modo === 'esquerda') pos.push(recuo);
          else if (modo === 'direita') pos.push(uW - recuo);
          else pos.push(uW / 2);
          return pos;
        }
        let u0, u1;
        if (modo === 'ambas')        { u0 = recuo;    u1 = uW - recuo; }
        else if (modo === 'esquerda'){ u0 = recuo;    u1 = uW - 50; }
        else                         { u0 = 50;       u1 = uW - recuo; }
        if (u1 <= u0) return pos;
        const gap = (u1 - u0) / (n - 1);
        for (let i = 0; i < n; i++) pos.push(u0 + i * gap);
        return pos;
      };

      let cumH2 = 0;
      sections.forEach(s => {
        if (spFaces.indexOf(s.role) >= 0) {
          const positions = calcSpotPositions(unfoldedW, spN, spRecuo, spModo);
          const vyMid = cumH2 + s.h / 2;
          positions.forEach(u => {
            if (u < 0 || u > unfoldedW) return;
            const px = tx(u), py = ty(vyMid);
            const w2 = tw(spDim1) / 2;
            const h2 = tw(spDim2) / 2;
            ctx.fillStyle   = 'rgba(255, 220, 80, 0.90)';
            ctx.strokeStyle = 'rgba(255, 255, 180, 1.0)';
            ctx.lineWidth = 1.2;
            if (spTipo === 'circular') {
              const r = Math.max(3, Math.min(w2, h2));
              ctx.beginPath();
              ctx.arc(px, py, r, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            } else {
              const ww = Math.max(3, w2 * 2);
              const hh = Math.max(3, h2 * 2);
              ctx.fillRect(px - ww/2, py - hh/2, ww, hh);
              ctx.strokeRect(px - ww/2, py - hh/2, ww, hh);
            }
          });
        }
        cumH2 += s.h;
      });
    }

    // Borda externa — light
    ctx.strokeStyle = 'rgba(23, 23, 23, 0.20)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx(0), ty(perimTotal), tw(unfoldedW), tw(perimTotal));

    // Labels das seções (à esquerda) — shifta pra fora da lateral esq se houver
    const labelLeftX = tx(showEsq ? -bd : 0) - 10;
    cumH = 0;
    sections.forEach(s => {
      const yc = (ty(cumH + s.h) + ty(cumH)) / 2;
      ctx.fillStyle = s.strokeColor;
      ctx.font = 'bold 11px "Geist Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(s.label, labelLeftX, yc + 4);
      ctx.fillStyle = 'rgba(107, 114, 128, 0.85)';
      ctx.font = '9px "Geist Mono", monospace';
      ctx.fillText(s.h + ' mm', labelLeftX, yc + 17);
      cumH += s.h;
    });

    // Cotas totais — dark text
    ctx.fillStyle = 'rgba(23, 23, 23, 0.80)';
    ctx.font = 'bold 11px "Geist Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(unfoldedW + ' mm', tx(unfoldedW / 2), ty(0) + 22);
    ctx.save();
    // Shifta cota vertical pra fora da lateral dir se houver
    ctx.translate(tx(showDir ? unfoldedW + bd : unfoldedW) + 56, (ty(0) + ty(perimTotal)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(perimTotal + ' mm', 0, 0);
    ctx.restore();

    // Legenda — light theme
    const lgY = H - 14;
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.85)'; ctx.fillRect(12, lgY - 8, 11, 9);
    ctx.fillStyle = 'rgba(75, 85, 99, 0.9)'; ctx.fillText('inteira', 28, lgY);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)'; ctx.fillRect(80, lgY - 8, 11, 9);
    ctx.fillStyle = 'rgba(75, 85, 99, 0.9)'; ctx.fillText('retalho', 96, lgY);
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.9)'; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(148, lgY - 4); ctx.lineTo(168, lgY - 4); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(75, 85, 99, 0.9)'; ctx.fillText('dobra', 173, lgY);
    ctx.strokeStyle = juntaColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(215, lgY - 4); ctx.lineTo(235, lgY - 4); ctx.stroke();
    ctx.fillStyle = 'rgba(75, 85, 99, 0.9)'; ctx.fillText('emenda', 240, lgY);
    if (p.spots_inc) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.95)';
      ctx.beginPath(); ctx.arc(292, lgY - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(75, 85, 99, 0.9)'; ctx.fillText('spot', 302, lgY);
    }
  },

  // ── Interação do preview (pan, move, cut) ───────────────────────────

  _planGetMouseMM(ev) {
    const c  = document.getElementById('aa_preview');
    const xf = AutoAcm.state.planXform;
    if (!c || !xf) return null;
    const rect = c.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const mmX = (px - xf.ox) / xf.sc;
    const mmY = xf.perimTotal - (py - xf.oy) / xf.sc;
    return { px, py, mmX, mmY };
  },

  _planFindNearestEm(p) {
    const xf = AutoAcm.state.planXform;
    if (!xf || !p) return null;
    let best = null;
    xf.emH.forEach((ep, i) => {
      const px = xf.ox + ep * xf.sc;
      const d  = Math.abs(p.px - px);
      if (d < 12 && (!best || d < best.dist)) best = { kind: 'H', idx: i, dist: d };
    });
    xf.emV.forEach((ep, i) => {
      const py = xf.oy + (xf.perimTotal - ep) * xf.sc;
      const d  = Math.abs(p.py - py);
      if (d < 12 && (!best || d < best.dist)) best = { kind: 'V', idx: i, dist: d };
    });
    return best;
  },

  planBindMouse() {
    const c = document.getElementById('aa_preview');
    if (!c || c._aaBound) return;
    c._aaBound = true;

    // ── Wheel zoom (centrado no mouse) ──────────────────────────────
    c.addEventListener('wheel', ev => {
      ev.preventDefault();
      const xf = AutoAcm.state.planXform;
      if (!xf) return;
      const rect = c.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const oldZ = AutoAcm.state.zoom2D || 1;
      const factor = ev.deltaY < 0 ? 1.15 : 0.87;
      let newZ = oldZ * factor;
      newZ = Math.max(0.3, Math.min(8.0, newZ));
      // Mantém o ponto sob o cursor estável: calcula offset extra a aplicar no pan
      const k = (newZ / oldZ) - 1;
      AutoAcm.state.panX2D = (AutoAcm.state.panX2D || 0) - (mx - xf.ox - (xf.unfoldedW * xf.sc) / 2) * k;
      AutoAcm.state.panY2D = (AutoAcm.state.panY2D || 0) - (my - xf.oy - (xf.perimTotal * xf.sc) / 2) * k;
      AutoAcm.state.zoom2D = newZ;
      AutoAcm.scheduleRedraw();
    }, { passive: false });

    // ── Right-click numa emenda = prompt numérico ───────────────────
    c.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      const p   = AutoAcm._planGetMouseMM(ev);
      const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      const xf  = AutoAcm.state.planXform;
      if (!p || !mod || !xf) return;
      const hit = AutoAcm._planFindNearestEm(p);
      if (!hit) {
        Toast.info(I18n.t('aa.preview.numeric.miss',
          'Clique direito sobre uma emenda pra digitar valor exato.'),
          { duration: 2500 });
        return;
      }
      AutoAcm._promptEmendaNumeric(hit);
    });

    c.addEventListener('mousedown', ev => {
      // Botão do meio OU Shift+esquerdo = pan
      if (ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
        ev.preventDefault();
        AutoAcm.state.panning2D = true;
        AutoAcm.state.panLastX = ev.clientX;
        AutoAcm.state.panLastY = ev.clientY;
        c.classList.add('is-panning');
        return;
      }

      const p   = AutoAcm._planGetMouseMM(ev);
      const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (!p || !mod) return;
      const xf = AutoAcm.state.planXform;
      if (!xf) return;

      const tool = AutoAcm.state.planTool;
      if (tool === 'moveH' || tool === 'moveV') {
        const hit = AutoAcm._planFindNearestEm(p);
        if (hit) {
          if (mod.params.planEmH === null) mod.params.planEmH = xf.emH.slice();
          if (mod.params.planEmV === null) mod.params.planEmV = xf.emV.slice();
          AutoAcm.state.planDragKind = hit.kind;
          AutoAcm.state.planDragIdx  = hit.idx;
        }
      } else if (tool === 'cutV') {
        // Adiciona emenda H (corte vertical na tela)
        if (p.mmX > 20 && p.mmX < xf.unfoldedW - 20) {
          if (mod.params.planEmH === null) mod.params.planEmH = xf.emH.slice();
          mod.params.planEmH.push(Math.round(p.mmX));
          mod.params.planEmH.sort((a, b) => a - b);
          AutoAcm.scheduleRedraw();
        }
      } else if (tool === 'cutH') {
        // Adiciona emenda V (corte horizontal na tela)
        if (p.mmY > 20 && p.mmY < xf.perimTotal - 20) {
          if (mod.params.planEmV === null) mod.params.planEmV = xf.emV.slice();
          mod.params.planEmV.push(Math.round(p.mmY));
          mod.params.planEmV.sort((a, b) => a - b);
          AutoAcm.scheduleRedraw();
        }
      }
    });

    c.addEventListener('mousemove', ev => {
      // Pan ativo
      if (AutoAcm.state.panning2D) {
        const dx = ev.clientX - AutoAcm.state.panLastX;
        const dy = ev.clientY - AutoAcm.state.panLastY;
        AutoAcm.state.panLastX = ev.clientX;
        AutoAcm.state.panLastY = ev.clientY;
        AutoAcm.state.panX2D = (AutoAcm.state.panX2D || 0) + dx;
        AutoAcm.state.panY2D = (AutoAcm.state.panY2D || 0) + dy;
        AutoAcm.scheduleRedraw();
        return;
      }

      if (AutoAcm.state.planDragIdx < 0) return;
      const p   = AutoAcm._planGetMouseMM(ev);
      const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (!p || !mod) return;
      const xf = AutoAcm.state.planXform;
      if (!xf) return;

      // Tooltip live com o valor mm da emenda sendo arrastada
      const valMm = (AutoAcm.state.planDragKind === 'H')
        ? Math.round(p.mmX)
        : Math.round(p.mmY);
      AutoAcm._showPlanTooltip(ev, valMm);

      const jt       = (mod.params.junta_tipo === 'seca') ? 0 : parseInt(mod.params.junta_mm || 8, 10);
      const chapaLarg = parseInt(mod.params.acm_chapa || 1220, 10);
      const chapaComp = parseInt(mod.params.acm_chapa_comp || 5000, 10);
      const chapaOr   = mod.params.acm_orient || 'horizontal';
      const horChapa  = (chapaOr === 'vertical') ? chapaLarg : chapaComp;
      const verChapa  = (chapaOr === 'vertical') ? chapaComp : chapaLarg;

      if (AutoAcm.state.planDragKind === 'H') {
        const x = Math.max(20, Math.min(xf.unfoldedW - 20, Math.round(p.mmX)));
        const str = horChapa + jt;
        const cuts = [x];
        let rt = x + str;
        while (rt < xf.unfoldedW - 1) { cuts.push(Math.round(rt)); rt += str; }
        let lt = x - str;
        while (lt > 1) { cuts.push(Math.round(lt)); lt -= str; }
        mod.params.planEmH = cuts.filter(v => v > 1 && v < xf.unfoldedW - 1).sort((a, b) => a - b);
        AutoAcm.state.planDragIdx = mod.params.planEmH.indexOf(x);
        if (AutoAcm.state.planDragIdx < 0) {
          let bd = 9999;
          for (let i = 0; i < mod.params.planEmH.length; i++) {
            if (Math.abs(mod.params.planEmH[i] - x) < bd) { bd = Math.abs(mod.params.planEmH[i] - x); AutoAcm.state.planDragIdx = i; }
          }
        }
      } else if (AutoAcm.state.planDragKind === 'V') {
        const y = Math.max(20, Math.min(xf.perimTotal - 20, Math.round(p.mmY)));
        const str = verChapa + jt;
        const cuts = [y];
        let up = y + str;
        while (up < xf.perimTotal - 1) { cuts.push(Math.round(up)); up += str; }
        let dn = y - str;
        while (dn > 1) { cuts.push(Math.round(dn)); dn -= str; }
        mod.params.planEmV = cuts.filter(v => v > 1 && v < xf.perimTotal - 1).sort((a, b) => a - b);
        AutoAcm.state.planDragIdx = mod.params.planEmV.indexOf(y);
        if (AutoAcm.state.planDragIdx < 0) {
          let bd = 9999;
          for (let i = 0; i < mod.params.planEmV.length; i++) {
            if (Math.abs(mod.params.planEmV[i] - y) < bd) { bd = Math.abs(mod.params.planEmV[i] - y); AutoAcm.state.planDragIdx = i; }
          }
        }
      }
      AutoAcm.scheduleRedraw();
    });

    const endDrag = () => {
      AutoAcm.state.planDragIdx  = -1;
      AutoAcm.state.planDragKind = null;
      AutoAcm.state.panning2D    = false;
      c.classList.remove('is-panning');
      AutoAcm._hidePlanTooltip();
    };
    c.addEventListener('mouseup',    endDrag);
    c.addEventListener('mouseleave', endDrag);
  },

  // ── Plan tooltip + numeric prompt ───────────────────────────────────

  _showPlanTooltip(ev, valMm) {
    let tip = document.getElementById('aa_plan_tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'aa_plan_tooltip';
      tip.className = 'aa__plan-tooltip';
      document.body.appendChild(tip);
    }
    tip.textContent = valMm + ' mm';
    tip.style.left = (ev.clientX + 14) + 'px';
    tip.style.top  = (ev.clientY - 26) + 'px';
    tip.hidden = false;
  },

  _hidePlanTooltip() {
    const tip = document.getElementById('aa_plan_tooltip');
    if (tip) tip.hidden = true;
  },

  /** Modal.prompt pra digitar valor exato de uma emenda. */
  async _promptEmendaNumeric(hit) {
    const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    const xf  = AutoAcm.state.planXform;
    if (!mod || !xf) return;

    const arr = (hit.kind === 'H') ? xf.emH : xf.emV;
    const cur = arr[hit.idx];
    const max = (hit.kind === 'H') ? xf.unfoldedW : xf.perimTotal;

    const raw = await Modal.prompt(
      I18n.t('aa.preview.numeric.title', 'Posição da emenda (mm)'),
      I18n.t('aa.preview.numeric.msg',
        'Eixo {kind} · range 20 — {max} · atual {cur}')
        .replace('{kind}', hit.kind)
        .replace('{max}', String(max - 20))
        .replace('{cur}', String(cur)),
      String(cur)
    );
    if (raw === null) return;

    let v = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(v) || v < 20 || v > max - 20) {
      Toast.error(I18n.t('aa.preview.numeric.invalid',
        'Valor inválido. Use mm entre 20 e {max}.').replace('{max}', String(max - 20)));
      return;
    }
    v = Math.round(v);

    if (hit.kind === 'H') {
      if (mod.params.planEmH === null || mod.params.planEmH === undefined) {
        mod.params.planEmH = xf.emH.slice();
      }
      mod.params.planEmH[hit.idx] = v;
      mod.params.planEmH.sort((a, b) => a - b);
    } else {
      if (mod.params.planEmV === null || mod.params.planEmV === undefined) {
        mod.params.planEmV = xf.emV.slice();
      }
      mod.params.planEmV[hit.idx] = v;
      mod.params.planEmV.sort((a, b) => a - b);
    }
    AutoAcm.scheduleRedraw();
    Toast.success(I18n.t('aa.preview.numeric.ok',
      'Emenda movida pra {v} mm.').replace('{v}', String(v)), { duration: 1800 });
  },

  // ══════════════════════════════════════════════════════════════════
  // PREVIEW 3D ISOMÉTRICO (FASE 6)
  // ══════════════════════════════════════════════════════════════════

  scheduleRedraw3D() {
    if (AutoAcm._redraw3DScheduled) return;
    AutoAcm._redraw3DScheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        AutoAcm._redraw3DScheduled = false;
        try { AutoAcm.draw3D(); } catch (e) { console.error('[AutoAcm] draw3D erro:', e); }
      });
    });
  },

  /**
   * Projeção isométrica (padrão marquise).
   * @param {number} x,y,z — coord do ponto em mm
   * @param {object} st — {cx,cy,cz, ox,oy, s}
   */
  _proj3D(x, y, z, st) {
    x -= st.cx; y -= st.cy; z -= st.cz;
    const cosY = Math.cos(AutoAcm.state.ry), sinY = Math.sin(AutoAcm.state.ry);
    const x1 = x * cosY - y * sinY;
    const y1 = x * sinY + y * cosY;
    const cosX = Math.cos(AutoAcm.state.rx), sinX = Math.sin(AutoAcm.state.rx);
    const y2 = y1 * cosX - z * sinX;
    const z2 = y1 * sinX + z * cosX;
    return {
      x: st.ox + AutoAcm.state.panX3D + x1 * st.s * AutoAcm.state.zoom3D,
      y: st.oy + AutoAcm.state.panY3D - z2 * st.s * AutoAcm.state.zoom3D,
      d: y2
    };
  },

  /**
   * Componente Y da normal rotacionada (pra back-face culling).
   */
  _normalY3D(nx, ny, nz) {
    const cosY = Math.cos(AutoAcm.state.ry), sinY = Math.sin(AutoAcm.state.ry);
    const ny1 = nx * sinY + ny * cosY;
    const cosX = Math.cos(AutoAcm.state.rx), sinX = Math.sin(AutoAcm.state.rx);
    return ny1 * cosX - nz * sinX;
  },

  /**
   * Constrói lista de boxes a renderizar.
   * Se m.quant existe (pós-GERAR), usa as peças reais.
   * Senão, renderiza wireframe simples de 12 arestas.
   */
  _buildBoxes3D(m) {
    const boxes = [];
    const p = m.params;
    const bw = m.w, bd = m.d, bh = m.h;
    const mw = parseInt(p.met_w || 20, 10);
    const mh = parseInt(p.met_h || 20, 10);

    // Se já gerou, usa as peças reais do quantitativo
    const q = m.quant;
    if (q && q.met_pecas && q.met_pecas.length > 0) {
      const edits = m.edits || { del: {}, ofs: {} };

      // Aplica offset visual baseado no modo (H ou V) + eixo da peça
      const applyOfs = (bx, pc, ofsObj) => {
        if (!ofsObj || typeof ofsObj !== 'object') return;
        const d = parseFloat(ofsObj.delta || 0);
        if (!d) return;
        if (ofsObj.mode === 'V') {
          bx.z += d;
        } else {
          // Modo H — perpendicular ao comprimento
          if (pc.eixo === 'x')      bx.y += d;
          else if (pc.eixo === 'y') bx.x += d;
          else                      bx.x += d;
        }
      };

      (q.met_pecas || []).forEach((pc, i) => {
        const id = 'met_' + i;
        if (edits.del[id]) return;
        const bx = { x: pc.x, y: pc.y, z: pc.z, w: pc.w, d: pc.d, h: pc.h };
        if (!isFinite(bx.x + bx.y + bx.z + bx.w + bx.d + bx.h)) return;   // peça corrompida não derruba o preview
        applyOfs(bx, pc, edits.ofs[id]);
        boxes.push({
          x: bx.x, y: bx.y, z: bx.z, w: bx.w, d: bx.d, h: bx.h,
          ly: pc.tipo || 'metalon',
          id, eixo: pc.eixo, cat: 'met', origBox: pc
        });
      });
      (q.em_pecas || []).forEach((pc, i) => {
        const id = 'em_' + i;
        if (edits.del[id]) return;
        const bx = { x: pc.x, y: pc.y, z: pc.z, w: pc.w, d: pc.d, h: pc.h };
        if (!isFinite(bx.x + bx.y + bx.z + bx.w + bx.d + bx.h)) return;   // peça corrompida não derruba o preview
        applyOfs(bx, pc, edits.ofs[id]);
        boxes.push({
          x: bx.x, y: bx.y, z: bx.z, w: bx.w, d: bx.d, h: bx.h,
          ly: 'emenda',
          id, eixo: pc.eixo, cat: 'em', origBox: pc
        });
      });
      (q.fita_pecas || []).forEach((pc, i) => {
        const id = 'fita_' + i;
        if (edits.del[id]) return;
        const bx = { x: pc.x, y: pc.y, z: pc.z, w: pc.w, d: pc.d, h: pc.h };
        if (!isFinite(bx.x + bx.y + bx.z + bx.w + bx.d + bx.h)) return;   // peça corrompida não derruba o preview
        applyOfs(bx, pc, edits.ofs[id]);
        boxes.push({
          x: bx.x, y: bx.y, z: bx.z, w: bx.w, d: bx.d, h: bx.h,
          ly: 'fita',
          id, eixo: pc.eixo || 'x', cat: 'fita', origBox: pc
        });
      });
      (q.spots_pecas || []).forEach((pc, i) => {
        const id = 'spots_' + i;
        if (edits.del[id]) return;
        const bx = { x: pc.x, y: pc.y, z: pc.z, w: pc.w, d: pc.d, h: pc.h };
        if (!isFinite(bx.x + bx.y + bx.z + bx.w + bx.d + bx.h)) return;   // peça corrompida não derruba o preview
        applyOfs(bx, pc, edits.ofs[id]);
        boxes.push({
          x: bx.x, y: bx.y, z: bx.z, w: bx.w, d: bx.d, h: bx.h,
          ly: 'spot',
          id, eixo: pc.eixo || 'x', cat: 'spots', origBox: pc
        });
      });
      return boxes;
    }

    // Sem quantitativo ainda: wireframe simples (12 arestas perimetrais)

    // 4 arestas verticais (ao longo de Z)
    const edgesV = [
      [0, 0, 0],
      [bw - mw, 0, 0],
      [0, bd - mw, 0],
      [bw - mw, bd - mw, 0]
    ];
    edgesV.forEach((pt, i) => {
      boxes.push({ x: pt[0], y: pt[1], z: pt[2], w: mw, d: mw, h: bh, ly: 'perim', id: 'pv_' + i, eixo: 'z' });
    });

    // 4 arestas em X (longarinas frontal/traseira, topo/base)
    const edgesX = [
      [0, 0,       0],
      [0, bd - mw, 0],
      [0, 0,       bh - mh],
      [0, bd - mw, bh - mh]
    ];
    edgesX.forEach((pt, i) => {
      boxes.push({ x: pt[0], y: pt[1], z: pt[2], w: bw, d: mw, h: mh, ly: 'perim', id: 'px_' + i, eixo: 'x' });
    });

    // 4 arestas em Y (laterais)
    const edgesY = [
      [0,         0, 0],
      [bw - mw,   0, 0],
      [0,         0, bh - mh],
      [bw - mw,   0, bh - mh]
    ];
    edgesY.forEach((pt, i) => {
      boxes.push({ x: pt[0], y: pt[1], z: pt[2], w: mw, d: bd, h: mh, ly: 'perim', id: 'py_' + i, eixo: 'y' });
    });

    return boxes;
  },

  _layerColor3D(ly, acmRgb) {
    if (ly === 'acm') {
      return {
        fill: `rgba(${acmRgb[0]},${acmRgb[1]},${acmRgb[2]},0.55)`,
        stroke: 'rgba(23,23,23,0.55)',
        w: 1
      };
    }
    // Paleta light theme — tons mais escuros pra contraste com fundo claro
    const map = {
      perim:     { fill: 'rgba(55, 75, 120, 0.75)',  stroke: 'rgba(23, 37, 84, 1.0)',  w: 0.9 },
      travessa:  { fill: 'rgba(66, 96, 160, 0.75)',  stroke: 'rgba(30, 58, 138, 1.0)', w: 0.9 },
      metalon:   { fill: 'rgba(55, 75, 120, 0.75)',  stroke: 'rgba(23, 37, 84, 1.0)',  w: 0.9 },
      emenda:    { fill: 'rgba(220, 38, 38, 0.82)',  stroke: 'rgba(153, 27, 27, 1.0)', w: 1.0 },
      fita:      { fill: 'rgba(5, 150, 105, 0.72)',  stroke: 'rgba(4, 120, 87, 1.0)',  w: 0.8 },
      spot:      { fill: 'rgba(245, 158, 11, 0.92)', stroke: 'rgba(180, 83, 9, 1.0)',  w: 1.0 }
    };
    return map[ly] || map.metalon;
  },

  /**
   * Função principal de render 3D. Painter's algorithm global.
   */
  draw3D() {
    const c = document.getElementById('aa_preview3d');
    if (!c) return;
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.params) return;
    const p = m.params;

    if (c.offsetParent === null || c.clientWidth < 50) {
      requestAnimationFrame(() => AutoAcm.draw3D());
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    let cssW = c.clientWidth  || 800;
    let cssH = c.clientHeight || 520;
    if (cssW < 100) cssW = 800;
    if (cssH < 100) cssH = 520;
    const targetW3 = Math.round(cssW * dpr);
    const targetH3 = Math.round(cssH * dpr);
    if (c.width  !== targetW3) c.width  = targetW3;
    if (c.height !== targetH3) c.height = targetH3;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = cssW, H = cssH;

    // Fundo light gradient matching plugin
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#eef1f5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const bw = m.w, bh = m.h, bd = m.d;
    const maxDim = Math.max(bw, bh, bd);
    const sc = (Math.min(W, H) * 0.60) / maxDim;
    const st = {
      cx: bw / 2, cy: bd / 2, cz: bh / 2,
      ox: W / 2, oy: H / 2 + 10,
      s:  sc < 0.001 ? 0.001 : sc
    };
    AutoAcm.state.lastSt3D = st;
    AutoAcm.state.hitRects3D = [];

    // Layer visibility
    const acmVisible  = AutoAcm._chk('aa3d_acm');
    const metVisible  = AutoAcm._chk('aa3d_met');
    const emVisible   = AutoAcm._chk('aa3d_em');
    const fitaVisible = AutoAcm._chk('aa3d_fita');
    const spotVisible = AutoAcm._chk('aa3d_spot');

    // RGB da cor ACM
    let acmRgb = [200, 200, 200];
    if (p.cor_acm) {
      for (const cat in AutoAcm.state.cores) {
        const found = AutoAcm.state.cores[cat].find(x => x.nome === p.cor_acm);
        if (found) { acmRgb = found.rgb; break; }
      }
    }

    const enabMap = p.enab || {};

    // Lista global de faces a desenhar
    const allF = [];

    // 1) Faces da caixa ACM externa
    if (acmVisible) {
      const acmCorners = [
        [0,0,0],[bw,0,0],[bw,bd,0],[0,bd,0],
        [0,0,bh],[bw,0,bh],[bw,bd,bh],[0,bd,bh]
      ];
      const acmV = acmCorners.map(cc => AutoAcm._proj3D(cc[0], cc[1], cc[2], st));
      const acmFaces = [
        { vi: [0,3,2,1], nx:0,  ny:0,  nz:-1, dir: 'base' },
        { vi: [4,5,6,7], nx:0,  ny:0,  nz:1,  dir: 'topo' },
        { vi: [0,1,5,4], nx:0,  ny:-1, nz:0,  dir: 'frontal' },
        { vi: [2,3,7,6], nx:0,  ny:1,  nz:0,  dir: 'traseira' },
        { vi: [0,4,7,3], nx:-1, ny:0,  nz:0,  dir: 'esq' },
        { vi: [1,2,6,5], nx:1,  ny:0,  nz:0,  dir: 'dir' }
      ];
      acmFaces.forEach(f => {
        const ny2 = AutoAcm._normalY3D(f.nx, f.ny, f.nz);
        if (ny2 > 0.05) return; // back-face cull
        const enab = !!enabMap[f.dir];
        const pts = f.vi.map(i => acmV[i]);
        const depth = (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4;
        const shade = Math.abs(ny2) * 0.4 + 0.5;
        allF.push({
          pts, depth, shade, kind: 'acm',
          fill: `rgba(${Math.round(acmRgb[0]*shade)},${Math.round(acmRgb[1]*shade)},${Math.round(acmRgb[2]*shade)},${enab ? 0.55 : 0})`,
          stroke: enab ? 'rgba(0,0,0,0.5)' : 'rgba(100,160,220,0.55)',
          lw: 1,
          dashed: !enab
        });
      });
    } else {
      // Wireframe tracejado quando ACM invisível
      const cornersW = [
        [0,0,0],[bw,0,0],[bw,bd,0],[0,bd,0],
        [0,0,bh],[bw,0,bh],[bw,bd,bh],[0,bd,bh]
      ];
      const ptsW = cornersW.map(cc => AutoAcm._proj3D(cc[0], cc[1], cc[2], st));
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      ctx.strokeStyle = 'rgba(60, 80, 120, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4,3]);
      edges.forEach(e => {
        ctx.beginPath();
        ctx.moveTo(ptsW[e[0]].x, ptsW[e[0]].y);
        ctx.lineTo(ptsW[e[1]].x, ptsW[e[1]].y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // 2) Boxes internos (metalon/emendas/fita/spots)
    const boxes = AutoAcm._buildBoxes3D(m);
    boxes.forEach(b => {
      const ly = b.ly;
      if (ly === 'emenda' && !emVisible) return;
      if (ly === 'fita'   && !fitaVisible) return;
      if (ly === 'spot'   && !spotVisible) return;
      if (ly !== 'emenda' && ly !== 'fita' && ly !== 'spot' && !metVisible) return;

      const colors = AutoAcm._layerColor3D(ly, acmRgb);
      const x = b.x, y = b.y, z = b.z, w = b.w, d = b.d, h = b.h;
      const v = [
        AutoAcm._proj3D(x,   y,   z,   st),
        AutoAcm._proj3D(x+w, y,   z,   st),
        AutoAcm._proj3D(x+w, y+d, z,   st),
        AutoAcm._proj3D(x,   y+d, z,   st),
        AutoAcm._proj3D(x,   y,   z+h, st),
        AutoAcm._proj3D(x+w, y,   z+h, st),
        AutoAcm._proj3D(x+w, y+d, z+h, st),
        AutoAcm._proj3D(x,   y+d, z+h, st)
      ];
      const fi = [
        { vi: [0,3,2,1], nx:0,  ny:0,  nz:-1 },
        { vi: [4,5,6,7], nx:0,  ny:0,  nz:1  },
        { vi: [0,1,5,4], nx:0,  ny:-1, nz:0  },
        { vi: [2,3,7,6], nx:0,  ny:1,  nz:0  },
        { vi: [0,4,7,3], nx:-1, ny:0,  nz:0  },
        { vi: [1,2,6,5], nx:1,  ny:0,  nz:0  }
      ];
      fi.forEach(f => {
        const ny2 = AutoAcm._normalY3D(f.nx, f.ny, f.nz);
        if (ny2 > 0.05) return;
        const pts = f.vi.map(i => v[i]);
        const depth = (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4;
        const shade = Math.abs(ny2) * 0.4 + 0.6;
        const isHover = AutoAcm.state.hoverId3D === b.id;
        let fill = colors.fill, stroke = colors.stroke;
        if (isHover) {
          const isMv = AutoAcm._isMoveTool3D();
          fill = (AutoAcm.state.tool3D === 'cut' || AutoAcm.state.tool3D === 'cutauto') ? 'rgba(255,80,80,0.9)' : (isMv ? 'rgba(255,220,80,0.9)' : colors.fill);
          stroke = AutoAcm.state.tool3D === 'cut' ? '#ff2020' : (isMv ? '#ffdd00' : colors.stroke);
        }
        allF.push({ pts, depth, shade, fill, stroke, lw: colors.w || 0.8 });

        // Hit rect
        let fx1 = 1e9, fx2 = -1e9, fy1 = 1e9, fy2 = -1e9;
        pts.forEach(pp => {
          if (pp.x < fx1) fx1 = pp.x;
          if (pp.x > fx2) fx2 = pp.x;
          if (pp.y < fy1) fy1 = pp.y;
          if (pp.y > fy2) fy2 = pp.y;
        });
        const PAD = 3;
        if (fx2 - fx1 < PAD*2) { const fcx = (fx1+fx2)/2; fx1 = fcx-PAD; fx2 = fcx+PAD; }
        if (fy2 - fy1 < PAD*2) { const fcy = (fy1+fy2)/2; fy1 = fcy-PAD; fy2 = fcy+PAD; }
        AutoAcm.state.hitRects3D.push({
          id: b.id,
          eixo: b.eixo,
          cat: b.cat,
          // Posição EFETIVA (com offset de edição aplicado) pra drag 1:1
          box: { x: b.x, y: b.y, z: b.z, w: b.w, d: b.d, h: b.h },
          // Peça ORIGINAL do quantitativo (pra simétrico + sync com Ruby)
          origBox: b.origBox,
          minX: fx1, maxX: fx2, minY: fy1, maxY: fy2,
          poly: pts, zdepth: depth
        });
      });
    });

    // Painter's: ordena por depth descendente (mais longe primeiro)
    allF.sort((a, b) => b.depth - a.depth);

    // Desenha
    allF.forEach(f => {
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
      ctx.closePath();
      if (f.fill) { ctx.fillStyle = f.fill; ctx.fill(); }
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = f.lw || 1;
      if (f.dashed) ctx.setLineDash([4, 3]);
      ctx.stroke();
      if (f.dashed) ctx.setLineDash([]);
    });

    // Fantasma (ghost) da ferramenta Adicionar
    if (AutoAcm.state.tool3D === 'add' && AutoAcm._addState.ghost) {
      const ghosts = [AutoAcm._addState.ghost];
      // Espelho: usa pré-computado se houver; senão tenta calcular agora
      if (AutoAcm.state.sym3D) {
        let mir = AutoAcm._addState.ghostMirror;
        if (!mir) mir = AutoAcm._mirrorBox(m, AutoAcm._addState.ghost);
        if (mir) ghosts.push(mir);
      }
      const cat = AutoAcm._addState.cat || 'met';
      let accent = (cat === 'em') ? 'rgba(217,119,6,0.95)' : 'rgba(37,99,235,0.95)';
      let fillC  = (cat === 'em') ? 'rgba(217,119,6,0.18)' : 'rgba(37,99,235,0.18)';
      // Quando o ímã agarrou, mostra em verde
      if (AutoAcm._addState.ghost.snapped) {
        accent = 'rgba(5,150,105,0.95)';
        fillC  = 'rgba(5,150,105,0.22)';
      }

      ghosts.forEach(g => {
        const gx = g.x, gy = g.y, gz = g.z, gw = g.w, gd = g.d, gh = g.h;
        const gv = [
          AutoAcm._proj3D(gx,    gy,    gz,    st),
          AutoAcm._proj3D(gx+gw, gy,    gz,    st),
          AutoAcm._proj3D(gx+gw, gy+gd, gz,    st),
          AutoAcm._proj3D(gx,    gy+gd, gz,    st),
          AutoAcm._proj3D(gx,    gy,    gz+gh, st),
          AutoAcm._proj3D(gx+gw, gy,    gz+gh, st),
          AutoAcm._proj3D(gx+gw, gy+gd, gz+gh, st),
          AutoAcm._proj3D(gx,    gy+gd, gz+gh, st)
        ];
        const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
        const fi = [
          { vi: [0,3,2,1], nx:0,  ny:0,  nz:-1 },
          { vi: [4,5,6,7], nx:0,  ny:0,  nz:1  },
          { vi: [0,1,5,4], nx:0,  ny:-1, nz:0  },
          { vi: [2,3,7,6], nx:0,  ny:1,  nz:0  },
          { vi: [0,4,7,3], nx:-1, ny:0,  nz:0  },
          { vi: [1,2,6,5], nx:1,  ny:0,  nz:0  }
        ];
        fi.forEach(f => {
          const ny2 = AutoAcm._normalY3D(f.nx, f.ny, f.nz);
          if (ny2 > 0.05) return;
          const pts = f.vi.map(i => gv[i]);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fillStyle = fillC;
          ctx.fill();
        });
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        edges.forEach(e => {
          ctx.beginPath();
          ctx.moveTo(gv[e[0]].x, gv[e[0]].y);
          ctx.lineTo(gv[e[1]].x, gv[e[1]].y);
          ctx.stroke();
        });
        ctx.setLineDash([]);
      });
    }

    // HUD — light theme
    ctx.fillStyle = 'rgba(75, 85, 99, 0.70)';  // slate-600
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    const degX = Math.round(AutoAcm.state.rx * 180 / Math.PI);
    const degY = Math.round(AutoAcm.state.ry * 180 / Math.PI);
    ctx.fillText(`rotX=${degX}°  rotY=${degY}°  zoom=${AutoAcm.state.zoom3D.toFixed(2)}x`, 12, 16);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(23, 23, 23, 0.75)';
    ctx.font = 'bold 11px "Geist Mono", monospace';
    ctx.fillText(`${bw} × ${bh} × ${bd} mm`, W - 12, 16);

    // Rodapé com info de ferramenta — pill escura
    const toolLabels = { orbit: 'Orbitar', cut: 'Tesoura', moveH: 'Mover H', moveV: 'Mover V', add: 'Adicionar' };
    let info = (I18n.t('aa.preview3d.current_tool', 'Ferramenta') + ': ' + (toolLabels[AutoAcm.state.tool3D] || AutoAcm.state.tool3D));
    if (AutoAcm.state.sym3D) info += ' · ' + I18n.t('aa.preview3d.sym_on', 'Simétrico ON');
    ctx.font = 'bold 11px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    const infoW = ctx.measureText(info).width;
    // Pill background
    ctx.fillStyle = 'rgba(23, 23, 23, 0.88)';
    AutoAcm._roundRect(ctx, 12, H - 28, infoW + 20, 22, 11);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillText(info, 22, H - 13);

    // Mensagem "gerar pra ver mais" — só se ainda não gerou
    if (!m.quant || !m.quant.met_pecas) {
      ctx.fillStyle = 'rgba(75, 85, 99, 0.7)';
      ctx.font = 'italic 11px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(I18n.t('aa.preview3d.hint_gen', 'Prévia das arestas. Clique GERAR para ver travessas + emendas.'), W/2, H - 48);
    }
  },

  /**
   * Helper pra desenhar retângulos arredondados (usado em pills/badges).
   */
  _roundRect(ctx, x, y, w, h, r) {
    if (r > w/2) r = w/2;
    if (r > h/2) r = h/2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // ── Câmera 3D ────────────────────────────────────────────────────

  rot3D(dxDeg, dyDeg) {
    AutoAcm.state.ry += (dxDeg || 0) * Math.PI / 180;
    AutoAcm.state.rx += (dyDeg || 0) * Math.PI / 180;
    AutoAcm.scheduleRedraw3D();
  },

  zoom3D(f) {
    AutoAcm.state.zoom3D *= f;
    AutoAcm.state.zoom3D = Math.max(0.05, Math.min(50.0, AutoAcm.state.zoom3D));
    AutoAcm.scheduleRedraw3D();
  },

  reset3D() {
    AutoAcm.state.rx = -0.45;
    AutoAcm.state.ry = 0.65;
    AutoAcm.state.zoom3D = 1.0;
    AutoAcm.state.panX3D = 0;
    AutoAcm.state.panY3D = 0;
    AutoAcm._setActiveView('iso');
    AutoAcm.scheduleRedraw3D();
  },

  /**
   * Vistas pré-definidas. Reseta zoom/pan e ajusta rx/ry.
   * 'fit' apenas reseta zoom/pan mantendo a rotação atual.
   */
  setView3D(view) {
    const s = AutoAcm.state;
    if (view === 'front') {
      // Olhando direto na face frontal (ny negativo)
      s.rx = 0;
      s.ry = 0;
    } else if (view === 'side') {
      // Lateral direita
      s.rx = 0;
      s.ry = -Math.PI / 2;
    } else if (view === 'top') {
      // Topo (planta)
      s.rx = -Math.PI / 2;
      s.ry = 0;
    } else if (view === 'iso') {
      s.rx = -0.45;
      s.ry = 0.65;
    } else if (view === 'fit') {
      // Mantém rotação, só ajusta zoom/pan
    }
    s.zoom3D = 1.0;
    s.panX3D = 0;
    s.panY3D = 0;
    AutoAcm._setActiveView(view);
    AutoAcm.scheduleRedraw3D();
  },

  _setActiveView(view) {
    document.querySelectorAll('.aa__view-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
  },

  /**
   * Modal.prompt pedindo o offset em mm pra mover uma peça por valor exato.
   * Aplica como `mod.edits.ofs[hit.id]` igualzinho ao drag.
   */
  async _promptMoveNumeric(hit, tool) {
    const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!mod) return;
    if (!mod.edits) mod.edits = { del: {}, ofs: {} };

    const mode = (tool === 'moveV') ? 'V' : 'H';
    const existing = mod.edits.ofs[hit.id];
    const cur = (existing && existing.mode === mode) ? (existing.delta || 0) : 0;

    const raw = await Modal.prompt(
      I18n.t('aa.move.numeric.title', 'Mover por valor (mm)'),
      I18n.t('aa.move.numeric.msg',
        'Offset {mode} em mm (positivo ou negativo). Atual: {cur} mm')
        .replace('{mode}', mode)
        .replace('{cur}', cur.toFixed(0)),
      String(Math.round(cur))
    );
    if (raw === null) return;

    const v = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(v)) {
      Toast.error(I18n.t('aa.move.numeric.invalid', 'Valor inválido. Use um número em mm.'));
      return;
    }

    mod.edits.ofs[hit.id] = { mode: mode, delta: v };

    if (AutoAcm.state.sym3D && mod.quant) {
      const symId = AutoAcm._findSymmetric(hit, mod.quant);
      if (symId) mod.edits.ofs[symId] = { mode: mode, delta: -v };
    }

    AutoAcm.scheduleRedraw3D();
    Toast.success(I18n.t('aa.move.numeric.ok', 'Peça movida {v} mm.').replace('{v}', v.toFixed(0)),
      { duration: 1800 });
  },

  // ══════════════════════════════════════════════════════════════════
  // PRESETS (snapshots de m.params nomeados)
  // ══════════════════════════════════════════════════════════════════

  /** Abre o menu de presets (lista, salvar, carregar, deletar). */
  async openPresetsMenu() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    const hasModule = !!(m && m.params);

    // Carrega lista de presets do Ruby
    let presets = [];
    try {
      const r = await Bridge.call('presets_get', { kind: 'autoacm' });
      if (r && r.ok && Array.isArray(r.presets)) presets = r.presets;
    } catch (e) {
      console.error('[AutoAcm] presets_get erro:', e);
    }

    const wrap = document.createElement('div');
    wrap.className = 'aa-presets';
    wrap.innerHTML = `
      <div class="aa-presets__list" id="aa_presets_list"></div>
      <div class="aa-presets__divider"></div>
      <div class="aa-presets__save">
        <div class="aa-presets__save-row">
          <input type="text" id="aa_preset_name" placeholder="${AutoAcm._escape(I18n.t('aa.preset.name.ph', 'Nome do preset…'))}" maxlength="40">
          <input type="text" id="aa_preset_folder" list="aa_preset_folders" placeholder="${AutoAcm._escape(I18n.t('aa.preset.folder.ph', 'Pasta (opcional)'))}" maxlength="30">
          <datalist id="aa_preset_folders"></datalist>
        </div>
        <button type="button" class="btn btn--primary btn--sm" id="aa_preset_save_btn">
          ${AutoAcm._escape(I18n.t('aa.preset.save', 'Salvar atual'))}
        </button>
      </div>
    `;

    const escape = AutoAcm._escape;

    const renderList = () => {
      const list = wrap.querySelector('#aa_presets_list');
      const dl   = wrap.querySelector('#aa_preset_folders');

      // Atualiza o datalist com pastas existentes
      const folders = Array.from(new Set(presets.map(p => (p.folder || '').trim()).filter(Boolean))).sort();
      dl.innerHTML = folders.map(f => `<option value="${escape(f)}">`).join('');

      if (!presets.length) {
        list.innerHTML = `<div class="aa-presets__empty">${escape(I18n.t('aa.preset.empty', 'Nenhum preset salvo ainda.'))}</div>`;
        return;
      }

      // Agrupa por pasta. Pasta vazia vira "Geral"
      const groups = {};
      presets.forEach((p, i) => {
        const f = (p.folder || '').trim() || I18n.t('aa.preset.folder.none', 'Geral');
        if (!groups[f]) groups[f] = [];
        groups[f].push({ p, i });
      });

      // Ordena as pastas alfabeticamente, "Geral" sempre por último
      const generalLabel = I18n.t('aa.preset.folder.none', 'Geral');
      const groupNames = Object.keys(groups).sort((a, b) => {
        if (a === generalLabel) return 1;
        if (b === generalLabel) return -1;
        return a.localeCompare(b);
      });

      list.innerHTML = groupNames.map(g => `
        <div class="aa-preset-group">
          <div class="aa-preset-group__header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>${escape(g)}</span>
            <span class="aa-preset-group__count">${groups[g].length}</span>
          </div>
          ${groups[g].map(({ p, i }) => `
            <div class="aa-preset-item" data-i="${i}">
              <div class="aa-preset-item__info">
                <div class="aa-preset-item__name">${escape(p.name || '?')}</div>
                <div class="aa-preset-item__date">${escape(p.ts || '')}</div>
              </div>
              <div class="aa-preset-item__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-act="load" data-i="${i}">
                  ${escape(I18n.t('aa.preset.load', 'Carregar'))}
                </button>
                <button type="button" class="aa-preset-item__del" data-act="del" data-i="${i}" title="${escape(I18n.t('aa.preset.delete', 'Apagar'))}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('');

      // Wire up actions
      list.querySelectorAll('button[data-act]').forEach(b => {
        b.addEventListener('click', async (e) => {
          e.stopPropagation();
          const i = parseInt(b.dataset.i, 10);
          const act = b.dataset.act;
          if (act === 'load') {
            await AutoAcm._loadPresetFull(presets[i]);
            // Fecha o modal
            document.querySelector('.modal-backdrop')?.querySelector('.modal__footer .btn--primary')?.click();
          } else if (act === 'del') {
            const ok = await Modal.confirm(
              I18n.t('aa.preset.delete', 'Apagar preset'),
              I18n.t('aa.preset.delete.msg', 'Apagar "{n}"? Essa ação não pode ser desfeita.').replace('{n}', presets[i].name)
            );
            if (!ok) return;
            presets.splice(i, 1);
            await Bridge.call('presets_save', { kind: 'autoacm', presets: presets });
            renderList();
            Toast.info(I18n.t('aa.preset.delete.ok', 'Preset apagado.'), { duration: 1500 });
          }
        });
      });
    };

    // Wire save button
    wrap.querySelector('#aa_preset_save_btn').addEventListener('click', async () => {
      if (!hasModule) {
        Toast.warning(I18n.t('aa.preset.no_active', 'Nenhum módulo ativo pra salvar.'));
        return;
      }
      const inp    = wrap.querySelector('#aa_preset_name');
      const inpFol = wrap.querySelector('#aa_preset_folder');
      const name   = String(inp.value || '').trim().slice(0, 40);
      const folder = String(inpFol.value || '').trim().slice(0, 30);
      if (!name) {
        Toast.error(I18n.t('aa.preset.name.required', 'Digite um nome pro preset.'));
        inp.focus();
        return;
      }
      // Salva os valores atuais do form antes
      AutoAcm._saveFormToState();

      // Substitui se já existe um com mesmo nome+pasta
      const existing = presets.findIndex(p => p.name === name && (p.folder || '') === folder);
      const snapshot = {
        name:   name,
        folder: folder,
        ts:     new Date().toISOString().slice(0, 10),
        params: JSON.parse(JSON.stringify(m.params)),
        // ── Geometria do módulo (permite recriar a caixa no load) ──
        dims:  { w: m.w, h: m.h, d: m.d },
        roles: m.roles ? JSON.parse(JSON.stringify(m.roles)) : null
      };
      // Remove campos voláteis
      delete snapshot.params.planEmH;
      delete snapshot.params.planEmV;

      if (existing >= 0) {
        presets[existing] = snapshot;
      } else {
        presets.push(snapshot);
      }

      try {
        const r = await Bridge.call('presets_save', { kind: 'autoacm', presets: presets });
        if (!r || !r.ok) {
          Toast.error(I18n.t('aa.preset.save.error', 'Erro ao salvar preset')
            + (r && r.error ? ': ' + r.error : ''));
          return;
        }
        Toast.success(I18n.t('aa.preset.save.ok', 'Preset "{n}" salvo.').replace('{n}', name));
        inp.value = '';
        // Mantém a pasta digitada pra facilitar salvar vários na mesma
        renderList();
      } catch (e) {
        Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
      }
    });

    // Enter nos inputs dispara save
    ['#aa_preset_name', '#aa_preset_folder'].forEach(sel => {
      wrap.querySelector(sel).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          wrap.querySelector('#aa_preset_save_btn').click();
        }
      });
    });

    renderList();

    Modal.show({
      title: I18n.t('aa.preset.title', 'Presets de configuração'),
      body:  wrap,
      buttons: [
        { label: I18n.t('modal.ok', 'Fechar'), variant: 'primary', value: true }
      ]
    });
  },

  /**
   * Carrega um preset de forma completa:
   *   - Se o preset tem dims + não há módulo ativo, cria uma caixa nova
   *     com essas dimensões e a captura como novo módulo.
   *   - Aplica params do preset no módulo (novo ou ativo).
   *   - Dispara "gerar" pra produzir a geometria ACM real exatamente
   *     como foi salva.
   */
  async _loadPresetFull(preset) {
    if (!preset || !preset.params) {
      Toast.error(I18n.t('aa.preset.invalid', 'Preset inválido.'));
      return;
    }

    let m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    const hasActive = !!m;
    const dims = preset.dims;

    // Se NÃO tem módulo ativo mas o preset tem dimensões → cria a caixa
    if (!hasActive) {
      if (!dims || !dims.w || !dims.h || !dims.d) {
        Toast.error(I18n.t('aa.preset.no_dims',
          'Preset antigo sem dimensões. Capture um módulo primeiro e depois carregue.'),
          { duration: 5000 });
        return;
      }

      Toast.info(I18n.t('aa.preset.creating_box',
        'Criando caixa {w}×{h}×{d} mm…'
        .replace('{w}', dims.w).replace('{h}', dims.h).replace('{d}', dims.d)),
        { duration: 2500 });

      try {
        const existing = AutoAcm.state.modulos.map(mm => ({
          entity_id: mm.entity_id,
          nome:      mm.nome,
          color_idx: mm.color_idx,
          params:    JSON.parse(JSON.stringify(mm.params || {})),
          edits:     JSON.parse(JSON.stringify(mm.edits  || { del:{}, ofs:{} })),
          roles:     JSON.parse(JSON.stringify(mm.roles  || {})),
          quant:     mm.quant ? JSON.parse(JSON.stringify(mm.quant)) : null
        }));
        const existing_ids = existing.map(e => e.entity_id);

        const r = await Bridge.call('autoacm_criar_caixa', {
          w: dims.w, h: dims.h, d: dims.d,
          existing_ids: existing_ids
        });
        if (!r || !r.ok) {
          Toast.error(I18n.t('aa.box.error', 'Erro ao criar caixa') +
            (r && r.error ? ': ' + r.error : ''));
          return;
        }

        // Re-captura tudo
        await AutoAcm.capturarFaces();

        // Restaura params dos módulos antigos
        AutoAcm.state.modulos.forEach(mm => {
          const old = existing.find(e => e.entity_id === mm.entity_id);
          if (old) {
            mm.nome      = old.nome;
            mm.color_idx = old.color_idx;
            mm.params    = old.params;
            mm.edits     = old.edits;
            mm.roles     = old.roles;
            if (old.quant) mm.quant = old.quant;
          }
        });

        // Seleciona o módulo recém-criado
        const newIdx = AutoAcm.state.modulos.findIndex(x => x.entity_id === r.entity_id);
        if (newIdx >= 0) {
          AutoAcm.selectModulo(newIdx);
          m = AutoAcm.state.modulos[newIdx];
        } else {
          Toast.error(I18n.t('aa.preset.create_failed', 'Falha ao localizar o novo módulo.'));
          return;
        }
      } catch (e) {
        Toast.error(I18n.t('aa.preset.create_failed', 'Erro criando caixa') + ': ' + e.message);
        return;
      }
    }

    // Agora m existe (novo ou pré-existente) — aplica params + roles do preset
    m.params = JSON.parse(JSON.stringify(preset.params));
    m.params.planEmH = null;
    m.params.planEmV = null;
    if (preset.roles) {
      m.roles = JSON.parse(JSON.stringify(preset.roles));
    }

    AutoAcm._loadFormFromState(m);
    AutoAcm.scheduleRedraw();
    AutoAcm.scheduleRedraw3D();
    AutoAcm.updateResumo(m);
    AutoAcm.renderTabs();

    Toast.success(I18n.t('aa.preset.load.ok', 'Preset "{n}" carregado.')
      .replace('{n}', preset.name), { duration: 2000 });

    // Auto-gerar a geometria 3D com a configuração do preset
    try {
      await AutoAcm.gerar();
    } catch (e) {
      console.warn('[AutoAcm] auto-gerar após preset falhou:', e);
    }
  },

  /**
   * Cria uma caixa paramétrica no SketchUp (Group) com W × H × D (mm)
   * e captura automaticamente. Bom pra começar do zero sem ter que
   * desenhar manualmente.
   */
  async criarCaixaParam() {
    // Cria o body como HTMLElement (Modal.show escapa strings, então
    // precisa ser elemento real pra inputs renderizarem)
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal__row">
        <label class="modal__field">
          <span>${I18n.t('aa.box.w', 'Largura (mm)')}</span>
          <input type="number" class="aa_box_in" data-k="w" value="2400" min="100" step="50">
        </label>
        <label class="modal__field">
          <span>${I18n.t('aa.box.h', 'Altura (mm)')}</span>
          <input type="number" class="aa_box_in" data-k="h" value="3000" min="100" step="50">
        </label>
        <label class="modal__field">
          <span>${I18n.t('aa.box.d', 'Profundidade (mm)')}</span>
          <input type="number" class="aa_box_in" data-k="d" value="200" min="50" step="10">
        </label>
      </div>
      <p class="modal__hint">${AutoAcm._escape(I18n.t('aa.box.hint',
        'A caixa será criada na origem do modelo e capturada automaticamente.'))}</p>
    `;

    // Captura referências antes do modal montar
    const inputs = wrap.querySelectorAll('.aa_box_in');
    const captured = {};
    const readVals = () => {
      inputs.forEach(i => { captured[i.dataset.k] = parseFloat(i.value); });
    };

    const result = await Modal.show({
      title:  I18n.t('aa.box.title', 'Criar caixa paramétrica'),
      body:   wrap,
      buttons: [
        { label: I18n.t('modal.cancel', 'Cancelar'), variant: 'secondary', value: null },
        { label: I18n.t('aa.box.create', 'Criar e capturar'), variant: 'primary',
          onClick: () => { readVals(); return 'ok'; } }
      ]
    });
    if (result !== 'ok') return;

    const w = captured.w, h = captured.h, d = captured.d;

    if (!w || !h || !d || w < 100 || h < 100 || d < 50) {
      Toast.error(I18n.t('aa.box.invalid',
        'Dimensões inválidas. W ≥ 100, H ≥ 100, D ≥ 50.'));
      return;
    }

    try {
      // Snapshot dos módulos existentes pra preservar params/nome/cor depois
      // do re-capture (o capturarFaces substitui o array todo).
      AutoAcm._saveFormToState();
      const existing = AutoAcm.state.modulos.map(m => ({
        entity_id: m.entity_id,
        nome:      m.nome,
        color_idx: m.color_idx,
        params:    JSON.parse(JSON.stringify(m.params || {})),
        edits:     JSON.parse(JSON.stringify(m.edits  || { del:{}, ofs:{} })),
        roles:     JSON.parse(JSON.stringify(m.roles  || {})),
        quant:     m.quant ? JSON.parse(JSON.stringify(m.quant)) : null
      }));
      const existing_ids = existing.map(e => e.entity_id);

      const r = await Bridge.call('autoacm_criar_caixa', {
        w: w, h: h, d: d,
        existing_ids: existing_ids
      });
      if (!r || !r.ok) {
        Toast.error(I18n.t('aa.box.error', 'Erro ao criar caixa') +
          (r && r.error ? ': ' + r.error : ''));
        return;
      }

      // Captura tudo (módulos antigos + nova caixa)
      await AutoAcm.capturarFaces();

      // Restaura params/nome/cor dos módulos antigos pelos entity_ids
      AutoAcm.state.modulos.forEach(m => {
        const old = existing.find(e => e.entity_id === m.entity_id);
        if (old) {
          m.nome      = old.nome;
          m.color_idx = old.color_idx;
          m.params    = old.params;
          m.edits     = old.edits;
          m.roles     = old.roles;
          if (old.quant) m.quant = old.quant;
        }
      });

      // Seleciona o módulo recém-criado (último que NÃO estava antes)
      const newIdx = AutoAcm.state.modulos.findIndex(m => m.entity_id === r.entity_id);
      if (newIdx >= 0) {
        AutoAcm.selectModulo(newIdx);
      }
      AutoAcm.renderTabs();

      Toast.success(I18n.t('aa.box.ok.append', 'Caixa criada. Total: {n} módulo(s).')
        .replace('{n}', AutoAcm.state.modulos.length), { duration: 2000 });
    } catch (e) {
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    }
  },

  // ── Ferramentas 3D ──────────────────────────────────────────────

  setTool3D(t) {
    // Se está trocando pra qualquer ferramenta que não 'add', desarma o placement
    if (t !== 'add' && AutoAcm._addState && AutoAcm._addState.armed) {
      AutoAcm._addState.armed = false;
      AutoAcm._addState.ghost = null;
    }
    AutoAcm.state.tool3D = t;
    document.querySelectorAll('.aa__tool[data-tool3d]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.tool3d === t);
    });
    // Botão Add fica destacado quando armado
    const addBtn = document.getElementById('aa3d_add_btn');
    if (addBtn) addBtn.classList.toggle('is-active', t === 'add');
    // Atualiza o cursor do canvas via atributo data-tool
    const c = document.getElementById('aa_preview3d');
    if (c) c.dataset.tool = t;
    AutoAcm.scheduleRedraw3D();
  },

  toggleSym() {
    AutoAcm.state.sym3D = !AutoAcm.state.sym3D;
    const el = document.getElementById('aa3d_sym_btn');
    if (el) el.classList.toggle('is-active', AutoAcm.state.sym3D);
    // Atualiza ghost mirror imediatamente se está em modo Adicionar
    if (AutoAcm.state.tool3D === 'add' && AutoAcm._addState.ghost) {
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      AutoAcm._addState.ghostMirror = AutoAcm.state.sym3D && m
        ? AutoAcm._mirrorBox(m, AutoAcm._addState.ghost)
        : null;
    }
    AutoAcm.scheduleRedraw3D();
  },

  // ══════════════════════════════════════════════════════════════════
  // ADICIONAR FERRAGEM — popover + confirm
  // ══════════════════════════════════════════════════════════════════

  _addState: { profW: 20, profH: 20, orient: 'v', cat: 'met', face: 'frontal', fita: true, magnet: false },

  /**
   * Liga/desliga o ímã. Quando ativo, o ghost gruda na coord perp de qualquer
   * peça existente próxima — facilita continuar perfis em linha.
   */
  toggleMagnet() {
    AutoAcm._addState.magnet = !AutoAcm._addState.magnet;
    const el = document.getElementById('aa3d_magnet_btn');
    if (el) el.classList.toggle('is-active', AutoAcm._addState.magnet);
    AutoAcm.scheduleRedraw3D();
  },

  /**
   * Snap por ímã: se ON, gruda a coord perp do box ao centro perp da peça
   * existente mais próxima (dentro de TOL mm).
   */
  _snapToMagnet(m, box) {
    const st = AutoAcm._addState;
    if (!st.magnet) return box;
    const spec = AutoAcm._faceSpec(st.face || 'frontal');
    const perpAxis = (st.orient === 'v') ? spec.horizAxis : spec.vertAxis;
    const perpSizeKey = perpAxis === 'x' ? 'w' : (perpAxis === 'y' ? 'd' : 'h');
    const center = box[perpAxis] + box[perpSizeKey] / 2;

    const pecas = (m.quant && m.quant.met_pecas) || [];
    const TOL = 30; // mm — tolerância visual razoável
    let best = null;
    pecas.forEach(pc => {
      const pcCenter = (pc[perpAxis] || 0) + (pc[perpSizeKey] || 0) / 2;
      const dist = Math.abs(pcCenter - center);
      if (dist < TOL && (best == null || dist < best.dist)) {
        best = { dist, target: pcCenter };
      }
    });
    if (best) {
      box[perpAxis] = best.target - box[perpSizeKey] / 2;
      box.snapped = true;
    }
    return box;
  },

  /**
   * Especificação por face: eixo fixo (perpendicular à face),
   * eixos livres (no plano da face), orientação "padrão" do comprimento,
   * e direção normal (sinal e qual coord do bbox usar como referência).
   *
   * face → { fixed: 'x'|'y'|'z', vertAxis: 'x'|'y'|'z', horizAxis: 'x'|'y'|'z',
   *          fixedMin: bool (true se a face é no canto min do bbox),
   *          depthAxis: same as fixed }
   */
  _faceSpec(face) {
    switch (face) {
      case 'frontal':  return { fixed: 'y', vertAxis: 'z', horizAxis: 'x', fixedMin: true  };
      case 'traseira': return { fixed: 'y', vertAxis: 'z', horizAxis: 'x', fixedMin: false };
      case 'esq':      return { fixed: 'x', vertAxis: 'z', horizAxis: 'y', fixedMin: true  };
      case 'dir':      return { fixed: 'x', vertAxis: 'z', horizAxis: 'y', fixedMin: false };
      case 'topo':     return { fixed: 'z', vertAxis: 'y', horizAxis: 'x', fixedMin: false };
      case 'base':     return { fixed: 'z', vertAxis: 'y', horizAxis: 'x', fixedMin: true  };
      default:         return { fixed: 'y', vertAxis: 'z', horizAxis: 'x', fixedMin: true  };
    }
  },

  /**
   * Retorna o valor fixo (em coords mundo) do plano estrutural daquela face.
   * Usa acm_esp + profH/2 ou (bdim - acm_esp - profH/2). Aproximação.
   */
  _faceFixedCoord(m, face) {
    const p = m.params;
    const acm = parseFloat(p.acm_esp || 3);
    const profH = AutoAcm._addState.profH || 20;
    const spec = AutoAcm._faceSpec(face);
    const dimMap = { x: m.w, y: m.d, z: m.h };
    const dim = dimMap[spec.fixed];
    // Centro da seção do metalon nesse eixo: acm + profH/2 (ou no outro lado)
    return spec.fixedMin ? (acm + profH / 2) : (dim - acm - profH / 2);
  },

  /**
   * Popula o <select> de faces com TODAS as 6 faces (mesmo as sem ACM).
   * Faces sem ACM ganham um sufixo "(sem ACM)" pra deixar claro mas ainda
   * podem ser usadas para reforços estruturais.
   */
  _fillAddFaces(m) {
    const sel = document.getElementById('aa3d_add_face');
    if (!sel) return;
    const enab = (m.params && m.params.enab) || {};
    const all = ['frontal', 'traseira', 'esq', 'dir', 'topo', 'base'];
    const labelKey = {
      frontal:  'aa.preview3d.add.face.frontal',
      traseira: 'aa.preview3d.add.face.traseira',
      esq:      'aa.preview3d.add.face.esq',
      dir:      'aa.preview3d.add.face.dir',
      topo:     'aa.preview3d.add.face.topo',
      base:     'aa.preview3d.add.face.base'
    };
    const labelFallback = {
      frontal: 'Frontal', traseira: 'Traseira',
      esq: 'Esquerda', dir: 'Direita',
      topo: 'Topo', base: 'Base'
    };
    const noAcmSuffix = I18n.t('aa.preview3d.add.face.no_acm', '(sem ACM)');
    sel.innerHTML = '';
    all.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      const base = I18n.t(labelKey[f], labelFallback[f]);
      opt.textContent = enab[f] ? base : `${base} ${noAcmSuffix}`;
      sel.appendChild(opt);
    });
    // Default: a face atual se ainda válida, senão frontal, senão a primeira habilitada
    const cur = AutoAcm._addState.face;
    const want = (cur && all.includes(cur)) ? cur :
                 (enab.frontal ? 'frontal' :
                  (all.find(f => enab[f]) || 'frontal'));
    sel.value = want;
    AutoAcm._addState.face = want;
  },

  toggleAddPop(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const pop = document.getElementById('aa3d_add_pop');
    const btn = document.getElementById('aa3d_add_btn');
    if (!pop || !btn) return;
    const open = pop.hasAttribute('hidden');
    if (open) {
      // Só pode adicionar se já gerou (precisa ter quant + materiais no modelo)
      const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
      if (!m || !m.quant || !m.quant.met_pecas) {
        Toast.error(I18n.t('aa.preview3d.add.need_gen', 'Gere a estrutura primeiro antes de adicionar ferragens.'));
        return;
      }
      // Popula o select com TODAS as 6 faces (com marca quando sem ACM)
      AutoAcm._fillAddFaces(m);
      // Sincroniza checkbox fita com state
      const fitaEl = document.getElementById('aa3d_add_fita');
      if (fitaEl) fitaEl.checked = AutoAcm._addState.fita !== false;

      pop.removeAttribute('hidden');
      btn.classList.add('is-active');
      // Fecha ao clicar fora
      setTimeout(() => {
        document.addEventListener('click', AutoAcm._addPopOutsideHandler);
      }, 0);
    } else {
      AutoAcm.closeAddPop();
    }
  },

  closeAddPop() {
    const pop = document.getElementById('aa3d_add_pop');
    const btn = document.getElementById('aa3d_add_btn');
    if (pop) pop.setAttribute('hidden', '');
    if (btn) btn.classList.remove('is-active');
    document.removeEventListener('click', AutoAcm._addPopOutsideHandler);
  },

  _addPopOutsideHandler(ev) {
    const wrap = document.querySelector('.aa__add-wrap');
    if (wrap && !wrap.contains(ev.target)) AutoAcm.closeAddPop();
  },

  setAddOrient(v) {
    AutoAcm._addState.orient = v;
    document.querySelectorAll('.aa__add-opt[data-add-orient]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.addOrient === v);
    });
  },

  setAddCat(v) {
    AutoAcm._addState.cat = v;
    document.querySelectorAll('.aa__add-opt[data-add-cat]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.addCat === v);
    });
  },

  /**
   * Calcula a caixa (x,y,z,w,d,h) da ferragem nova baseada em
   * orient + posição preset + perfil escolhido.
   *
   * Convenção das caixas (alinhada com auto_acm.rb):
   *   - Vertical (eixo z): w=profW, d=profH, h=len_z
   *   - Horizontal X (eixo x): w=len_x, d=profH, h=profW
   *
   * O Y é "emprestado" de uma peça existente do quant com o mesmo eixo
   * (assim o extra fica no mesmo plano estrutural que o resto).
   */
  _computeExtraBox(m) {
    const p = m.params;
    const bw = m.w, bh = m.h, bd = m.d;
    const mw = parseInt(p.met_w || 20, 10);
    const mh = parseInt(p.met_h || 20, 10);
    const st = AutoAcm._addState;

    const profW = st.profW || 20;   // dim "face" (paralela ao ACM)
    const profH = st.profH || 20;   // dim "profundidade" (perpendicular ao ACM)

    const posSel = document.getElementById('aa3d_add_pos');
    const pos = posSel ? posSel.value : 'centro';

    const q = m.quant || {};
    const pecas = q.met_pecas || [];

    // Amostra Y de peça existente com mesmo eixo (extra fica no mesmo plano)
    let sampleY = null;
    const wantedEixo = st.orient === 'v' ? 'z' : 'x';
    const sample = pecas.find(pc => pc.eixo === wantedEixo) || pecas[0];
    if (sample) sampleY = sample.y;
    if (sampleY == null) sampleY = mh; // fallback (deveria sempre existir)

    if (st.orient === 'v') {
      // Vertical: comprimento ao longo de Z, entre as travessas sup e inf (perim)
      const z0 = mh;                  // logo acima da travessa inferior
      const z1 = bh - mh;             // logo abaixo da travessa superior
      const lenZ = Math.max(z1 - z0, 100);

      let x;
      switch (pos) {
        case 'bord_esq': x = mw + mw;          break; // logo à direita do montante esquerdo
        case 'bord_dir': x = bw - mw - mw - profW; break;
        case 'bord_sup':
        case 'bord_inf':
        case 'centro':
        default:         x = (bw - profW) / 2;
      }
      return {
        eixo: 'z', cat: 'met',
        x, y: sampleY, z: z0,
        w: profW, d: profH, h: lenZ,
        profW, profH
      };
    } else {
      // Horizontal X: comprimento ao longo de X, entre os montantes esq e dir
      const x0 = mw;
      const x1 = bw - mw;
      const lenX = Math.max(x1 - x0, 100);

      let z;
      switch (pos) {
        case 'bord_sup': z = bh - mh - mh - profW; break;
        case 'bord_inf': z = mh + mh;              break;
        case 'bord_esq':
        case 'bord_dir':
        case 'centro':
        default:         z = (bh - profW) / 2;
      }
      return {
        eixo: 'x', cat: 'met',
        x: x0, y: sampleY, z,
        w: lenX, d: profH, h: profW,
        profW, profH
      };
    }
  },

  /**
   * "Armar" a ferramenta Adicionar — clica no popover Confirmar, fecha popover
   * e entra em modo placement (cursor de mira). Cada clique no canvas coloca
   * uma peça onde o mouse está. ESC ou clique direito cancela.
   */
  confirmAdd() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.quant) {
      Toast.error(I18n.t('aa.preview3d.add.need_gen', 'Gere a estrutura primeiro antes de adicionar ferragens.'));
      return;
    }

    // Lê os inputs de perfil (largura × altura)
    const pwEl = document.getElementById('aa3d_add_pw');
    const phEl = document.getElementById('aa3d_add_ph');
    const pw = parseInt(pwEl && pwEl.value, 10);
    const ph = parseInt(phEl && phEl.value, 10);
    if (!pw || !ph || pw < 5 || ph < 5 || pw > 200 || ph > 200) {
      Toast.error(I18n.t('aa.preview3d.add.invalid', 'Informe largura e altura válidas (mm).'));
      return;
    }
    AutoAcm._addState.profW = pw;
    AutoAcm._addState.profH = ph;

    // Face e fita
    const faceSel = document.getElementById('aa3d_add_face');
    if (faceSel && faceSel.value) AutoAcm._addState.face = faceSel.value;
    const fitaEl = document.getElementById('aa3d_add_fita');
    AutoAcm._addState.fita = !!(fitaEl && fitaEl.checked);

    AutoAcm._addState.armed = true;

    AutoAcm.closeAddPop();
    AutoAcm.setTool3D('add');
    Toast.info(
      I18n.t('aa.preview3d.add.armed',
        'Clique no preview para posicionar. ESC ou clique direito cancela.'),
      { duration: 3500 }
    );
  },

  /**
   * Inverse-projection genérico. Dado o pixel (mx,my), um eixo fixo
   * (axis = 'x'|'y'|'z') e seu valor mundo (fixedVal), resolve os outros
   * dois eixos. Retorna {x,y,z} mundo ou null se a vista é degenerada.
   *
   * Matemática:
   *   x_c = x - cx, y_c = y - cy, z_c = z - cz
   *   x1 = x_c*cosY - y_c*sinY
   *   y1 = x_c*sinY + y_c*cosY
   *   y2 = y1*cosX - z_c*sinX
   *   z2 = y1*sinX + z_c*cosX
   *   sx_eff = x1
   *   sy_eff = z2
   *
   * Para resolver, eliminamos a coord livre conjugada usando o eixo fixo.
   */
  _unproject3D(mx, my, axis, fixedVal) {
    const st = AutoAcm.state.lastSt3D;
    if (!st) return null;
    const cosY = Math.cos(AutoAcm.state.ry), sinY = Math.sin(AutoAcm.state.ry);
    const cosX = Math.cos(AutoAcm.state.rx), sinX = Math.sin(AutoAcm.state.rx);

    const sxEff = (mx - st.ox - AutoAcm.state.panX3D) / (st.s * AutoAcm.state.zoom3D);
    const syEff = -(my - st.oy - AutoAcm.state.panY3D) / (st.s * AutoAcm.state.zoom3D);

    if (axis === 'y') {
      // Y fixo. Resolve x, z.
      if (Math.abs(cosY) < 0.05 || Math.abs(cosX) < 0.05) return null;
      const yc = fixedVal - st.cy;
      const xc = (sxEff + yc * sinY) / cosY;
      const y1 = xc * sinY + yc * cosY;
      const zc = (syEff - y1 * sinX) / cosX;
      return { x: xc + st.cx, y: fixedVal, z: zc + st.cz };
    } else if (axis === 'x') {
      // X fixo. Resolve y, z.
      // x1 = xc*cosY - yc*sinY = sxEff  →  yc = (xc*cosY - sxEff) / sinY
      // Caso sinY ≈ 0: vista frontal, X é "incompatível" — degenera.
      if (Math.abs(sinY) < 0.05 || Math.abs(cosX) < 0.05) return null;
      const xc = fixedVal - st.cx;
      const yc = (xc * cosY - sxEff) / sinY;
      const y1 = xc * sinY + yc * cosY;
      const zc = (syEff - y1 * sinX) / cosX;
      return { x: fixedVal, y: yc + st.cy, z: zc + st.cz };
    } else {
      // Z fixo. Resolve x, y.
      // z2 = y1*sinX + zc*cosX = syEff  →  y1 = (syEff - zc*cosX) / sinX
      // Caso sinX ≈ 0: vista de topo perfeita, Z degenera.
      if (Math.abs(sinX) < 0.05 || Math.abs(cosY) < 0.05) return null;
      const zc = fixedVal - st.cz;
      const y1 = (syEff - zc * cosX) / sinX;
      // y1 = xc*sinY + yc*cosY  e  x1 = xc*cosY - yc*sinY = sxEff
      // Resolvendo o sistema 2x2 em (xc, yc):
      //   xc*cosY - yc*sinY = sxEff
      //   xc*sinY + yc*cosY = y1
      // det = cos²Y + sin²Y = 1
      const xc = sxEff * cosY + y1 * sinY;
      const yc = -sxEff * sinY + y1 * cosY;
      return { x: xc + st.cx, y: yc + st.cy, z: fixedVal };
    }
  },

  /**
   * Computa a caixa do extra. Recebe ponto mundo {x,y,z} (já no plano da face).
   * Usa _faceSpec pra saber qual eixo é o comprimento e qual a profundidade.
   *
   * Convenção:
   *   - lenAxis  = eixo do comprimento (v→spec.vertAxis, h→spec.horizAxis)
   *   - perpAxis = eixo livre no plano da face, perpendicular ao lenAxis
   *   - depthAxis = spec.fixed (perpendicular à face)
   * Comprimento = full span do bbox menos 2*mw (entre os perfis perim).
   * Profundidade = profH (entra pra dentro pelo lado da face).
   * Seção visual = profW (transversal ao comprimento, no plano da face).
   */
  _computeAddPlaceBox(m, world) {
    const p = m.params;
    const mw = parseInt(p.met_w || 20, 10);
    const mh = parseInt(p.met_h || 20, 10);
    const st = AutoAcm._addState;
    const spec = AutoAcm._faceSpec(st.face || 'frontal');

    const profW = st.profW || 20;
    const profH = st.profH || 20;

    const dimMap = { x: m.w, y: m.d, z: m.h };
    const lenAxis  = (st.orient === 'v') ? spec.vertAxis  : spec.horizAxis;
    const perpAxis = (st.orient === 'v') ? spec.horizAxis : spec.vertAxis;
    const depthAxis = spec.fixed;

    // Posições e tamanhos por eixo
    const lenSize = Math.max(dimMap[lenAxis] - 2 * mw, 100); // espaço entre perim
    const lenStart = mw;                                     // canto inferior do span

    // Perp: centrado no cursor, com clamp dentro do bbox (entre os perim)
    let perp = world[perpAxis] - profW / 2;
    const perpMin = mw;
    const perpMax = dimMap[perpAxis] - mw - profW;
    if (perp < perpMin) perp = perpMin;
    if (perp > perpMax) perp = perpMax;

    // Depth: posição fixa no canto da face (interno: + acm_esp; ou bdim - acm_esp - profH)
    const acm = parseFloat(p.acm_esp || 3);
    const depth = spec.fixedMin ? acm : (dimMap[depthAxis] - acm - profH);

    // Monta o {x,y,z,w,d,h} mapeando os 3 eixos
    const xyz = {};
    const whd = {};
    xyz[lenAxis]   = lenStart; whd[lenAxis]   = lenSize;
    xyz[perpAxis]  = perp;     whd[perpAxis]  = profW;
    xyz[depthAxis] = depth;    whd[depthAxis] = profH;

    return {
      eixo: lenAxis,
      x: xyz.x, y: xyz.y, z: xyz.z,
      w: whd.x, d: whd.y, h: whd.z,
      profW, profH,
      // Metadata p/ geração da fita (se houver)
      face: st.face, depthAxis, depthFixedMin: spec.fixedMin
    };
  },

  /**
   * Unproject + cálculo da caixa baseado na face escolhida. Retorna o box
   * computado, ou null se a vista está degenerada pra essa face.
   */
  _cursorBox(m, mx, my) {
    const st = AutoAcm._addState;
    const spec = AutoAcm._faceSpec(st.face || 'frontal');
    const fixedVal = AutoAcm._faceFixedCoord(m, st.face || 'frontal');
    const wp = AutoAcm._unproject3D(mx, my, spec.fixed, fixedVal);
    if (!wp) return null;
    const box = AutoAcm._computeAddPlaceBox(m, wp);
    return AutoAcm._snapToMagnet(m, box);
  },

  /**
   * Espelha um box ao longo do perpAxis do módulo (mirror left/right ou
   * front/back ou top/bottom, dependendo da face e da orientação).
   * Retorna o box espelhado ou null se a posição coincide com o original.
   */
  _mirrorBox(m, box) {
    const st = AutoAcm._addState;
    const spec = AutoAcm._faceSpec(st.face || 'frontal');
    const perpAxis = (st.orient === 'v') ? spec.horizAxis : spec.vertAxis;
    const perpSizeKey = perpAxis === 'x' ? 'w' : (perpAxis === 'y' ? 'd' : 'h');
    const dimMap = { x: m.w, y: m.d, z: m.h };
    const center = box[perpAxis] + box[perpSizeKey] / 2;
    const mirrored = dimMap[perpAxis] - center;
    if (Math.abs(mirrored - center) < 1) return null; // já está no centro
    const newBox = Object.assign({}, box);
    newBox[perpAxis] = mirrored - box[perpSizeKey] / 2;
    return newBox;
  },

  /**
   * Lista de extras a enviar pro Ruby: a peça principal + opcionalmente
   * uma fita_DF colada nela.
   */
  _buildExtrasFromBox(m, box) {
    const p = m.params;
    const st = AutoAcm._addState;
    const out = [];

    out.push({
      orient: st.orient,
      eixo:   box.eixo,
      cat:    st.cat || 'met',
      x: box.x, y: box.y, z: box.z,
      w: box.w, d: box.d, h: box.h,
      prof_w: box.profW, prof_h: box.profH
    });

    if (st.fita && p.fita_inc !== false) {
      const fl = parseFloat(p.fita_larg || 12); // largura da fita (na face)
      const fe = parseFloat(p.fita_esp  || 0.9); // espessura
      // Fita fica ENTRE a peça e o ACM (camada de fe mm de espessura).
      // Posicionada no lado da face do bbox, no mesmo span do comprimento.
      const fitaBox = { x: box.x, y: box.y, z: box.z, w: box.w, d: box.d, h: box.h };
      // No eixo de profundidade (depthAxis), a fita vai antes do metalon:
      //   se face é fixedMin (frontal/esq/base) → fita fica em depth - fe
      //   se !fixedMin (traseira/dir/topo) → fita fica em depth + profH (atrás da peça)
      const da = box.depthAxis;
      const sizeKey = da === 'x' ? 'w' : (da === 'y' ? 'd' : 'h');
      const startKey = da; // 'x','y','z'
      if (box.depthFixedMin) {
        fitaBox[startKey] = box[startKey] - fe;
      } else {
        fitaBox[startKey] = box[startKey] + box[sizeKey];
      }
      fitaBox[sizeKey] = fe;
      // Largura da fita (transversal ao comprimento, no plano da face) = fl,
      // centrada no perpAxis dentro da peça.
      const spec = AutoAcm._faceSpec(st.face || 'frontal');
      const perpAxis = (st.orient === 'v') ? spec.horizAxis : spec.vertAxis;
      const perpSizeKey = perpAxis === 'x' ? 'w' : (perpAxis === 'y' ? 'd' : 'h');
      const perpStartKey = perpAxis;
      const center = box[perpStartKey] + box[perpSizeKey] / 2;
      fitaBox[perpStartKey] = center - fl / 2;
      fitaBox[perpSizeKey]  = fl;

      out.push({
        orient: st.orient,
        eixo:   box.eixo,
        cat:    'fita',
        x: fitaBox.x, y: fitaBox.y, z: fitaBox.z,
        w: fitaBox.w, d: fitaBox.d, h: fitaBox.h
      });
    }

    return out;
  },

  /**
   * Chamado pelo mousedown quando tool='add'. Cria a peça (e opcionalmente
   * a fita) na posição do clique.
   */
  async _placeAddAt(mx, my) {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.quant) return;

    const box = AutoAcm._cursorBox(m, mx, my);
    if (!box) {
      Toast.error(I18n.t('aa.preview3d.add.view_bad',
        'Esta vista não permite posicionar. Use Iso ou Frontal.'));
      return;
    }

    const extras = AutoAcm._buildExtrasFromBox(m, box);

    // Simétrico ON: espelha a peça (e a fita) ao longo do perpAxis do módulo
    if (AutoAcm.state.sym3D) {
      const mirror = AutoAcm._mirrorBox(m, box);
      if (mirror) {
        AutoAcm._buildExtrasFromBox(m, mirror).forEach(e => extras.push(e));
      }
    }

    try {
      const r = await Bridge.call('autoacm_aplicar_edicoes', {
        entity_id:  m.entity_id,
        del_ids:    [],
        ofs_list:   [],
        extras_add: extras,
        params:     AutoAcm._flattenParams(m)
      });
      if (r && r.ok) {
        if (r.quant) {
          m.quant = r.quant;
          AutoAcm.scheduleRedraw3D();
          AutoAcm.updateQuantitativo(m);
        }
      } else {
        Toast.error(I18n.t('aa.edit.err', 'Erro ao aplicar edição') + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    }
  },

  /**
   * Desarma a ferramenta Adicionar (volta pra orbit).
   */
  cancelAdd() {
    AutoAcm._addState.armed = false;
    AutoAcm._addState.ghost = null;
    AutoAcm.setTool3D('orbit');
    AutoAcm.scheduleRedraw3D();
  },

  _isMoveTool3D() {
    return AutoAcm.state.tool3D === 'moveH' || AutoAcm.state.tool3D === 'moveV';
  },

  _pointInPoly3D(mx, my, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > my) !== (yj > my)) &&
                        (mx < (xj - xi) * (my - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  _hitTest3D(mx, my) {
    const candidates = [];
    AutoAcm.state.hitRects3D.forEach(r => {
      if (mx < r.minX || mx > r.maxX || my < r.minY || my > r.maxY) return;
      if (r.poly && !AutoAcm._pointInPoly3D(mx, my, r.poly)) return;
      candidates.push(r);
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.zdepth - b.zdepth);
    return candidates[0];
  },

  // ── Mouse binding 3D ────────────────────────────────────────────

  bind3D() {
    const c = document.getElementById('aa_preview3d');
    if (!c || c._aa3dBound) return;
    c._aa3dBound = true;
    c.dataset.tool = AutoAcm.state.tool3D || 'orbit';

    const getMouse = (e) => {
      const rect = c.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left),
        y: (e.clientY - rect.top)
      };
    };

    // Right-click em modo move = abre prompt numérico pra peça
    // Right-click em modo add = cancela placement
    c.addEventListener('contextmenu', e => {
      e.preventDefault();
      const tool = AutoAcm.state.tool3D;
      if (tool === 'add') { AutoAcm.cancelAdd(); return; }
      if (tool !== 'moveH' && tool !== 'moveV') return;
      const pos = getMouse(e);
      const hit = AutoAcm._hitTest3D(pos.x, pos.y);
      if (!hit) {
        Toast.info(I18n.t('aa.move.numeric.miss',
          'Clique direito em uma peça pra mover por valor numérico.'),
          { duration: 2500 });
        return;
      }
      AutoAcm._promptMoveNumeric(hit, tool);
    });

    c.addEventListener('mousedown', e => {
      e.preventDefault();
      const pos = getMouse(e);
      AutoAcm.state.lastX3D = e.clientX;
      AutoAcm.state.lastY3D = e.clientY;

      const tool = AutoAcm.state.tool3D;

      // MIDDLE MOUSE (button === 1) = orbit/pan sempre, ignora a
      // ferramenta ativa. Atalho universal pra navegar sem trocar tool.
      if (e.button === 1) {
        AutoAcm.state.dragging3D = true;
        AutoAcm.state.middleDrag = true;
        c.classList.add('is-dragging');
        return;
      }

      // SHIFT + qualquer ferramenta = orbit (pan)
      if (e.shiftKey || tool === 'orbit') {
        AutoAcm.state.dragging3D = true;
        c.classList.add('is-dragging');
        return;
      }

      // TESOURA: clique direto deleta a peça
      if (tool === 'cut') {
        const hit = AutoAcm._hitTest3D(pos.x, pos.y);
        if (hit) AutoAcm._aplicarCut(hit);
        return;
      }

      // TESOURA AUTO: deleta a barra E redistribui as irmãs do vão
      if (tool === 'cutauto') {
        const hit = AutoAcm._hitTest3D(pos.x, pos.y);
        if (hit) AutoAcm._aplicarCutAuto(hit);
        return;
      }

      // ADD: clique direto coloca a peça onde o cursor está
      if (tool === 'add' && e.button === 0) {
        AutoAcm._placeAddAt(pos.x, pos.y);
        return;
      }

      // MOVE H / MOVE V: inicia drag de peça
      if (tool === 'moveH' || tool === 'moveV') {
        const hit = AutoAcm._hitTest3D(pos.x, pos.y);
        const st = AutoAcm.state.lastSt3D;
        if (!hit || !hit.box || !st) return;

        // Usa a posição EFETIVA (com eventuais edições anteriores já aplicadas)
        const p = hit.box;
        const cx = p.x + p.w/2, cy = p.y + p.d/2, cz = p.z + p.h/2;
        const mode = (tool === 'moveV') ? 'V' : 'H';

        // Vetor 2D do eixo de movimento (pra drag 1:1 com o mouse)
        const pStart = AutoAcm._proj3D(cx, cy, cz, st);
        let pMove;
        if (mode === 'V') {
          pMove = AutoAcm._proj3D(cx, cy, cz + 100, st);
        } else {
          if (hit.eixo === 'x')       pMove = AutoAcm._proj3D(cx, cy + 100, cz, st);
          else if (hit.eixo === 'y')  pMove = AutoAcm._proj3D(cx + 100, cy, cz, st);
          else                        pMove = AutoAcm._proj3D(cx + 100, cy, cz, st);
        }
        const ax = pMove.x - pStart.x;
        const ay = pMove.y - pStart.y;
        let axLen = Math.sqrt(ax*ax + ay*ay);
        if (axLen < 0.0001) axLen = 0.0001;

        const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
        if (!mod.edits) mod.edits = { del: {}, ofs: {} };
        const existingOfs = mod.edits.ofs[hit.id];
        const startDelta = (existingOfs && existingOfs.mode === mode) ? (existingOfs.delta || 0) : 0;

        AutoAcm.state.dragPiece = {
          id: hit.id,
          item: hit,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startDelta: startDelta,
          mode: mode,
          axisX: ax / axLen,
          axisY: ay / axLen,
          pxPerMm: axLen / 100
        };
        c.classList.add('is-dragging');
      }
    });

    c.addEventListener('mousemove', e => {
      const pos = getMouse(e);

      // Drag de peça (move tool)
      if (AutoAcm.state.dragPiece) {
        const dp = AutoAcm.state.dragPiece;
        const mdx = e.clientX - dp.startClientX;
        const mdy = e.clientY - dp.startClientY;
        // Projeção do delta do mouse no vetor do eixo → mm ao longo do eixo
        const projPx = mdx * dp.axisX + mdy * dp.axisY;
        const delta  = projPx / dp.pxPerMm;

        const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
        if (!mod.edits) mod.edits = { del: {}, ofs: {} };
        mod.edits.ofs[dp.id] = { mode: dp.mode, delta: dp.startDelta + delta };

        // Simétrico
        if (AutoAcm.state.sym3D && mod.quant) {
          const symId = AutoAcm._findSymmetric(dp.item, mod.quant);
          if (symId) mod.edits.ofs[symId] = { mode: dp.mode, delta: -(dp.startDelta + delta) };
        }

        AutoAcm.scheduleRedraw3D();
        return;
      }

      // Drag de câmera (orbit)
      if (AutoAcm.state.dragging3D) {
        const dx = e.clientX - AutoAcm.state.lastX3D;
        const dy = e.clientY - AutoAcm.state.lastY3D;
        AutoAcm.state.lastX3D = e.clientX;
        AutoAcm.state.lastY3D = e.clientY;
        if (e.shiftKey) {
          AutoAcm.state.panX3D += dx;
          AutoAcm.state.panY3D += dy;
        } else {
          AutoAcm.state.ry += dx * 0.008;
          AutoAcm.state.rx += dy * 0.008;
        }
        AutoAcm.scheduleRedraw3D();
        return;
      }

      // Hover quando cut/move
      if (AutoAcm.state.tool3D === 'cut' || AutoAcm.state.tool3D === 'cutauto' || AutoAcm._isMoveTool3D()) {
        const hit = AutoAcm._hitTest3D(pos.x, pos.y);
        const newHover = hit ? hit.id : null;
        if (AutoAcm.state.hoverId3D !== newHover) {
          AutoAcm.state.hoverId3D = newHover;
          AutoAcm.scheduleRedraw3D();
        }
      }

      // Fantasma seguindo o cursor quando tool='add'
      if (AutoAcm.state.tool3D === 'add' && AutoAcm._addState.armed) {
        const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
        if (m && m.quant) {
          const box = AutoAcm._cursorBox(m, pos.x, pos.y);
          if (box) {
            AutoAcm._addState.ghost = box;
            // Pré-computa o espelho aqui pra evitar timing/scope no render
            if (AutoAcm.state.sym3D) {
              AutoAcm._addState.ghostMirror = AutoAcm._mirrorBox(m, box);
            } else {
              AutoAcm._addState.ghostMirror = null;
            }
            AutoAcm.scheduleRedraw3D();
          }
        }
      }
    });

    c.addEventListener('mouseup', () => {
      // Finaliza drag de peça → aplica edição no SU
      if (AutoAcm.state.dragPiece) {
        const dp = AutoAcm.state.dragPiece;
        const mod = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
        AutoAcm.state.dragPiece = null;
        c.classList.remove('is-dragging');

        const ofs = mod && mod.edits && mod.edits.ofs && mod.edits.ofs[dp.id];
        if (ofs && Math.abs((ofs.delta || 0) - dp.startDelta) > 0.5) {
          AutoAcm._aplicarMove(dp.item, ofs.delta, dp.mode);
        }
        return;
      }
      AutoAcm.state.dragging3D = false;
      AutoAcm.state.middleDrag  = false;
      c.classList.remove('is-dragging');
    });

    c.addEventListener('mouseleave', () => {
      AutoAcm.state.dragging3D = false;
      AutoAcm.state.middleDrag = false;
      AutoAcm.state.dragPiece  = null;
      AutoAcm.state.hoverId3D  = null;
      AutoAcm._addState.ghost  = null;
      c.classList.remove('is-dragging');
      AutoAcm.scheduleRedraw3D();
    });

    // ESC global cancela placement
    if (!window._aaEscBound) {
      window._aaEscBound = true;
      window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && AutoAcm.state.tool3D === 'add') {
          AutoAcm.cancelAdd();
        }
      });
    }

    // Impede o autoscroll default do middle-click no Windows
    c.addEventListener('auxclick', e => {
      if (e.button === 1) e.preventDefault();
    });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      AutoAcm.zoom3D(f);
    }, { passive: false });
  },

  // ══════════════════════════════════════════════════════════════════
  // APLICAR EDIÇÕES NO SKETCHUP (cut + move)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Encontra a peça simétrica (espelhada no centro X ou Y do módulo).
   */
  _findSymmetric(item, q) {
    const cat = item.cat || 'met';
    const src = cat === 'met'  ? q.met_pecas
              : cat === 'em'   ? q.em_pecas
              : cat === 'fita' ? q.fita_pecas
              : null;
    if (!src || !src.length) return null;
    const p = item.origBox;
    if (!p) return null;

    // Dimensões do módulo — sempre confiáveis (m.w/m.h/m.d capturadas)
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m) return null;
    const bw = m.w;  // largura (X)
    const bd = m.d;  // profundidade (Y)

    const mirrorX = bw - (p.x + p.w);
    const mirrorY = bd - (p.y + p.d);

    // Tolerância mais generosa (15mm) pra cobrir flutuações de float entre
    // Ruby → mm → polegadas internas SU → mm → JSON → JS
    const TOL      = 15;
    const IS_SELF  = 0.5; // se other.pos idêntica a p, é a própria peça

    let best = -1, bestDist = 1e9;
    src.forEach((other, i) => {
      if (!other) return;
      // Mesma forma
      if (Math.abs((other.w || 0) - (p.w || 0)) > 0.5) return;
      if (Math.abs((other.d || 0) - (p.d || 0)) > 0.5) return;
      if (Math.abs((other.h || 0) - (p.h || 0)) > 0.5) return;
      // Mesmo eixo de orientação
      if (other.eixo !== p.eixo) return;

      // Pula a própria peça (evita selecionar ela mesma como "simétrica")
      const distSelf =
        Math.abs((other.x || 0) - (p.x || 0)) +
        Math.abs((other.y || 0) - (p.y || 0)) +
        Math.abs((other.z || 0) - (p.z || 0));
      if (distSelf < IS_SELF) return;

      // Espelho em X (mirrorX, y, z)
      const d1 =
        Math.abs((other.x || 0) - mirrorX) +
        Math.abs((other.y || 0) - (p.y || 0)) +
        Math.abs((other.z || 0) - (p.z || 0));
      if (d1 < TOL && d1 < bestDist) { bestDist = d1; best = i; }

      // Espelho em Y (x, mirrorY, z)
      const d2 =
        Math.abs((other.x || 0) - (p.x || 0)) +
        Math.abs((other.y || 0) - mirrorY) +
        Math.abs((other.z || 0) - (p.z || 0));
      if (d2 < TOL && d2 < bestDist) { bestDist = d2; best = i; }

      // Espelho em X E Y (esquerda-traseira → direita-frontal)
      const d3 =
        Math.abs((other.x || 0) - mirrorX) +
        Math.abs((other.y || 0) - mirrorY) +
        Math.abs((other.z || 0) - (p.z || 0));
      if (d3 < TOL && d3 < bestDist) { bestDist = d3; best = i; }
    });

    return best < 0 ? null : (cat + '_' + best);
  },

  /**
   * Aplica deleção (tesoura) — marca local + envia ao Ruby.
   */
  async _aplicarCut(item) {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.quant) return;
    if (!m.edits) m.edits = { del: {}, ofs: {} };

    const delIds = [item.id];
    m.edits.del[item.id] = true;

    // Simétrico
    if (AutoAcm.state.sym3D) {
      const symId = AutoAcm._findSymmetric(item, m.quant);
      if (symId) {
        m.edits.del[symId] = true;
        delIds.push(symId);
      }
    }

    // Feedback imediato
    AutoAcm.scheduleRedraw3D();

    // Envia ao Ruby
    try {
      const r = await Bridge.call('autoacm_aplicar_edicoes', {
        entity_id: m.entity_id,
        del_ids:   delIds,
        ofs_list:  [],
        params:    AutoAcm._flattenParams(m)
      });
      if (r && r.ok) {
        // Ruby já deletou no modelo + recalculou quant
        // Limpa edits locais pois agora estão baked no model
        if (r.quant) {
          m.quant = r.quant;
          delIds.forEach(id => { delete m.edits.del[id]; });
        }
        AutoAcm.scheduleRedraw3D();
        AutoAcm.updateQuantitativo(m);
      } else {
        // Reverte local se falhou
        delIds.forEach(id => { delete m.edits.del[id]; });
        AutoAcm.scheduleRedraw3D();
        Toast.error(I18n.t('aa.edit.err', 'Erro ao aplicar edição') + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      delIds.forEach(id => { delete m.edits.del[id]; });
      AutoAcm.scheduleRedraw3D();
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    }
  },

  /**
   * TESOURA AUTO — deleta a barra clicada E redistribui as barras irmãs
   * do MESMO VÃO (entre emendas ou entre barras do perímetro) com
   * espaçamento igual. Emendas nunca se movem (são âncoras do vão).
   * Tudo numa única chamada atômica ao Ruby (del + ofs juntos).
   */
  async _aplicarCutAuto(item) {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.quant) return;
    if (!m.edits) m.edits = { del: {}, ofs: {} };

    // Só metalon interno pode ser cortado com redistribuição
    if (item.cat !== 'met') {
      Toast.error(I18n.t('aa.cutauto.so_met', 'Tesoura Auto só corta metalon — emendas não podem ser cortadas'));
      return;
    }
    const pcCut = item.origBox;
    if (!pcCut) return;
    if ((pcCut.tipo || '') === 'perim') {
      Toast.error(I18n.t('aa.cutauto.perim', 'Tesoura Auto não corta o perímetro — só travessas internas'));
      return;
    }

    // Blindagem: erro de cálculo aqui NÃO pode derrubar o preview — captura,
    // mostra o motivo na tela e sai sem tocar em nada
    let delIds, ofsList;
    try {

    const q = m.quant;
    const eixo = item.eixo || pcCut.eixo;
    // centro e tamanho de uma peça ao longo de um eixo
    const ctr = (pc, ax) => (ax === 'x') ? pc.x + pc.w / 2 : (ax === 'y') ? pc.y + pc.d / 2 : pc.z + pc.h / 2;
    const sz  = (pc, ax) => (ax === 'x') ? pc.w : (ax === 'y') ? pc.d : pc.h;
    const crossAxes = ['x', 'y', 'z'].filter(a => a !== eixo);
    const TOL = 2; // mm — tolerância pra "mesmo plano"

    // Barras paralelas vivas (mesmo eixo, não deletadas), com id/categoria
    const paralelas = [];
    (q.met_pecas || []).forEach((pc, i) => {
      const id = 'met_' + i;
      if (m.edits.del[id] || (pc.eixo || 'x') !== eixo) return;
      paralelas.push({ id, pc, cat: 'met', perim: (pc.tipo || '') === 'perim' });
    });
    (q.em_pecas || []).forEach((pc, i) => {
      const id = 'em_' + i;
      if (m.edits.del[id] || (pc.eixo || 'x') !== eixo) return;
      paralelas.push({ id, pc, cat: 'em', perim: false });
    });

    // MESMA FACE: das duas direções cruzadas, o plano da face é a que tem
    // mais barras na MESMA coordenada da barra cortada; a outra é a direção
    // de redistribuição (spread).
    const grupo = ax => paralelas.filter(b => b.id !== item.id && Math.abs(ctr(b.pc, ax) - ctr(pcCut, ax)) < TOL);
    const g0 = grupo(crossAxes[0]);
    const g1 = grupo(crossAxes[1]);
    let planoAx, spreadAx, faceBars;
    if (g0.length >= g1.length) { planoAx = crossAxes[0]; spreadAx = crossAxes[1]; faceBars = g0; }
    else                        { planoAx = crossAxes[1]; spreadAx = crossAxes[0]; faceBars = g1; }
    if (!faceBars.length) {
      Toast.error(I18n.t('aa.cutauto.min', 'Tesoura Auto: o vão precisa ter 2 ou mais barras pra redistribuir'));
      return;
    }

    // VÃO: limites = bordas internas dos bloqueadores (emenda ou perímetro)
    // mais próximos da barra cortada, ao longo do spread
    const cutC = ctr(pcCut, spreadAx);
    let loEdge = null, hiEdge = null;
    faceBars.filter(b => b.cat === 'em' || b.perim).forEach(b => {
      const c = ctr(b.pc, spreadAx), half = sz(b.pc, spreadAx) / 2;
      if (c < cutC && (loEdge === null || c + half > loEdge)) loEdge = c + half;
      if (c > cutC && (hiEdge === null || c - half < hiEdge)) hiEdge = c - half;
    });
    if (loEdge === null || hiEdge === null || hiEdge - loEdge < 1) {
      Toast.error(I18n.t('aa.cutauto.no_span', 'Não foi possível determinar o vão desta barra'));
      return;
    }

    // BARRAS LÓGICAS (clusters): uma barra física pode estar PARTIDA em
    // segmentos (anti-transpasse corta onde cruza emenda/passante — nomes
    // .s0/.s1). Segmentos na MESMA posição do spread = UMA barra lógica.
    // Cortar um segmento corta a barra INTEIRA; mover, move todos juntos.
    const internas = faceBars
      .filter(b => b.cat === 'met' && !b.perim)
      .concat([{ id: item.id, pc: pcCut, cat: 'met', perim: false }])
      .sort((a, b) => ctr(a.pc, spreadAx) - ctr(b.pc, spreadAx));
    const clusters = [];
    internas.forEach(b => {
      const c = ctr(b.pc, spreadAx);
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(c - last.center) < TOL) last.membros.push(b);
      else clusters.push({ center: c, membros: [b] });
    });
    // extensão combinada do cluster ao longo do eixo da barra (pras fitas)
    const clusterExt = cl => {
      let e0 = Infinity, e1 = -Infinity;
      cl.membros.forEach(b => {
        const c = ctr(b.pc, eixo), hl = sz(b.pc, eixo) / 2;
        if (c - hl < e0) e0 = c - hl;
        if (c + hl > e1) e1 = c + hl;
      });
      return [e0, e1];
    };

    const cutCluster = clusters.find(cl => cl.membros.some(b => b.id === item.id));
    // Irmãs = clusters DENTRO do vão (entre as emendas/perímetro), sem o cortado
    const irmasCl = clusters
      .filter(cl => cl !== cutCluster && cl.center > loEdge && cl.center < hiEdge)
      .sort((a, b) => a.center - b.center);
    if (!irmasCl.length) {
      // vão tinha só a barra cortada → nada pra redistribuir
      Toast.error(I18n.t('aa.cutauto.min', 'Tesoura Auto: o vão precisa ter 2 ou mais barras pra redistribuir'));
      return;
    }

    // FITA DUPLA-FACE — as tiras SOBRE uma barra lógica andam com ela.
    // Match: mesma direção, centrada no cluster, mesma face, sobrepondo a
    // extensão COMBINADA (funciona com barra e fita segmentadas)
    const fitaEixo = pc => {
      const dims = { x: pc.w, y: pc.d, z: pc.h };
      return Object.keys(dims).reduce((a, b) => dims[a] >= dims[b] ? a : b);
    };
    const fitasDo = cl => {
      const [e0, e1] = clusterExt(cl);
      const halfW = Math.max.apply(null, cl.membros.map(b => sz(b.pc, spreadAx))) / 2 + 1;
      const out = [];
      (q.fita_pecas || []).forEach((f, i) => {
        const id = 'fita_' + i;
        if (m.edits.del[id]) return;
        if (fitaEixo(f) !== eixo) return;                                  // corre na direção da barra?
        if (Math.abs(ctr(f, spreadAx) - cl.center) > halfW) return;        // centrada no cluster?
        if (Math.abs(ctr(f, planoAx) - ctr(pcCut, planoAx)) > 30) return;  // mesma face?
        const f0 = ctr(f, eixo) - sz(f, eixo) / 2;
        const f1 = ctr(f, eixo) + sz(f, eixo) / 2;
        const ov = Math.min(e1, f1) - Math.max(e0, f0);
        if (ov < 0.5 * (f1 - f0)) return;                                  // sobrepõe a barra?
        out.push(id);
      });
      return out;
    };

    // NOVAS POSIÇÕES: espaçamento igual entre os limites do vão — cada
    // cluster (barra lógica) recebe UM delta, aplicado a todos os segmentos
    const n = irmasCl.length;
    const step = (hiEdge - loEdge) / (n + 1);
    ofsList = [];
    const pushOfs = (id, delta) => {
      const o = { id: id, dx: 0, dy: 0, dz: 0 };
      if (spreadAx === 'x') o.dx = delta; else if (spreadAx === 'y') o.dy = delta; else o.dz = delta;
      ofsList.push(o);
    };
    irmasCl.forEach((cl, k) => {
      const delta = (loEdge + (k + 1) * step) - cl.center;
      if (Math.abs(delta) < 0.05) return;
      cl.membros.forEach(b => pushOfs(b.id, delta));
      fitasDo(cl).forEach(fid => pushOfs(fid, delta));
    });

    delIds = cutCluster.membros.map(b => b.id).concat(fitasDo(cutCluster));

    } catch (errAuto) {
      console.error('[AutoAcm] Tesoura Auto erro:', errAuto);
      Toast.error('Tesoura Auto: ' + (errAuto && errAuto.message ? errAuto.message : errAuto));
      return;
    }

    // Diagnóstico (dev): o que vai pro Ruby
    console.log('[AutoAcm] TesouraAuto del=', delIds.join(','), 'ofs=', ofsList.length);

    // Feedback imediato: some a barra cortada + fita dela (irmãs movem no retorno)
    delIds.forEach(id => { m.edits.del[id] = true; });
    AutoAcm.scheduleRedraw3D();

    try {
      const r = await Bridge.call('autoacm_aplicar_edicoes', {
        entity_id: m.entity_id,
        del_ids:   delIds,
        ofs_list:  ofsList,
        params:    AutoAcm._flattenParams(m)
      });
      if (r && r.ok) {
        if (r.quant) {
          m.quant = r.quant;
          delIds.forEach(id => { delete m.edits.del[id]; });
        } else {
          // Modelo mudou mas o quant não voltou (erro no recálculo Ruby) —
          // sem quant novo os ids do preview dessincronizam do modelo. Avisa.
          console.error('[AutoAcm] TesouraAuto: aplicado no modelo mas quant não retornou');
          Toast.error(I18n.t('aa.edit.err', 'Erro ao aplicar edição') + ' — regenere o módulo antes de continuar editando');
        }
        AutoAcm.scheduleRedraw3D();
        AutoAcm.updateQuantitativo(m);
      } else {
        delIds.forEach(id => { delete m.edits.del[id]; });
        AutoAcm.scheduleRedraw3D();
        Toast.error(I18n.t('aa.edit.err', 'Erro ao aplicar edição') + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      delIds.forEach(id => { delete m.edits.del[id]; });
      AutoAcm.scheduleRedraw3D();
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    }
  },

  /**
   * Aplica movimento — envia ao Ruby como offset.
   * mode = 'H' (perpendicular ao comprimento, plano XY) | 'V' (Z)
   */
  async _aplicarMove(item, delta, mode) {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.quant) return;

    // Monta o offset em dx/dy/dz conforme o eixo da peça
    const eixo = item.eixo || (item.origBox && item.origBox.eixo);
    let dx = 0, dy = 0, dz = 0;
    if (mode === 'V') {
      dz = delta;
    } else {
      if (eixo === 'x')      dy = delta;
      else if (eixo === 'y') dx = delta;
      else                   dx = delta;
    }

    const ofsList = [{ id: item.id, dx, dy, dz }];

    // Simétrico
    if (AutoAcm.state.sym3D) {
      const symId = AutoAcm._findSymmetric(item, m.quant);
      if (symId) {
        ofsList.push({ id: symId, dx: -dx, dy: -dy, dz: -dz });
      }
    }

    try {
      const r = await Bridge.call('autoacm_aplicar_edicoes', {
        entity_id: m.entity_id,
        del_ids:   [],
        ofs_list:  ofsList,
        params:    AutoAcm._flattenParams(m)
      });
      if (r && r.ok) {
        if (r.quant) {
          m.quant = r.quant;
          // Baked — limpa edits locais
          if (m.edits && m.edits.ofs) {
            ofsList.forEach(o => { delete m.edits.ofs[o.id]; });
          }
        }
        AutoAcm.scheduleRedraw3D();
        AutoAcm.updateQuantitativo(m);
      } else {
        Toast.error(I18n.t('aa.edit.err', 'Erro ao aplicar edição') + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // FACES A REVESTIR — bind via JS (evita CSS :has() não suportado)
  // ══════════════════════════════════════════════════════════════════

  _bindFaceChecks() {
    ['frontal', 'traseira', 'topo', 'base', 'esq', 'dir'].forEach(key => {
      const input = document.getElementById('aa_enab_' + key);
      if (!input) return;
      // Encontra o <label> pai
      let label = input.parentElement;
      while (label && !label.classList.contains('aa__face-check')) {
        label = label.parentElement;
      }
      if (!label) return;

      // Aplica estado inicial
      label.classList.toggle('is-checked', !!input.checked);

      // (Re)bind onchange
      input.onchange = () => {
        label.classList.toggle('is-checked', !!input.checked);
        AutoAcm._saveFaceEnabState();
        AutoAcm.scheduleRedraw();
        AutoAcm.scheduleRedraw3D();
      };
    });
  },

  _saveFaceEnabState() {
    const m = AutoAcm.state.modulos[AutoAcm.state.activeIdx];
    if (!m || !m.params) return;
    m.params.enab = {
      frontal:  AutoAcm._chk('aa_enab_frontal'),
      traseira: AutoAcm._chk('aa_enab_traseira'),
      topo:     AutoAcm._chk('aa_enab_topo'),
      base:     AutoAcm._chk('aa_enab_base'),
      esq:      AutoAcm._chk('aa_enab_esq'),
      dir:      AutoAcm._chk('aa_enab_dir')
    };
  },

  // ══════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════

  _showSection(id) { const el = document.getElementById(id); if (el) el.hidden = false; },
  _hideSection(id) { const el = document.getElementById(id); if (el) el.hidden = true; },

  _val(id, def) {
    const el = document.getElementById(id);
    return el ? el.value : def;
  },
  _setVal(id, v) {
    const el = document.getElementById(id);
    if (el && v !== undefined && v !== null) el.value = v;
  },
  _chk(id) {
    const el = document.getElementById(id);
    return el ? !!el.checked : false;
  },
  _setChk(id, v) {
    const el = document.getElementById(id);
    if (el) el.checked = !!v;
  },

  _highlightInSketchup(entityId) {
    Bridge.call('autoacm_selecionar', { entity_id: entityId, zoom: false }).catch(() => {});
  },

  _zoomTo(entityId) {
    Bridge.call('autoacm_selecionar', { entity_id: entityId, zoom: true }).catch(() => {});
  },

  _escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
};
