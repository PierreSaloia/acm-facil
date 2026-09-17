/* ══════════════════════════════════════════════════════════════════════════
   AUTO-ACM CURVO — panel.js (v2)
   Namespace: window.AutoAcmCurvo
   - Live binding (debounce) + auto-save por módulo
   - Color picker dinâmico do catálogo (tabs por categoria)
   - Junta seca/dilatação + cor dinâmica
   - Resumo + quantitativo expandido (área ACM por face, m de metalon, etc.)
   ══════════════════════════════════════════════════════════════════════════ */

window.AutoAcmCurvo = {
  state: {
    modulos: [],
    activeIdx: -1,
    loading: false,
    cores: {},
    ordemCat: [],
    juntaColors: [],
    fitaColors: [],
    activeCat: null,
    coresLoaded: false,
    saveTimer: null,
    // ── Preview 3D ──
    rx: -0.6155,            // iso clássico SketchUp: -35.264°
    ry: Math.PI / 4,        // 45°
    zoom3D: 1.0,
    panX3D: 0,
    panY3D: 0,
    dragging3D: false,
    middleDrag: false,
    lastX3D: 0, lastY3D: 0,
    // ── Preview 2D (zoom + pan + interação de emendas) ──
    zoom2D: 1.0,
    panX2D: 0,
    panY2D: 0,
    dragging2D: false,
    lastX2D: 0, lastY2D: 0,
    planTool:    'pan',     // 'pan'|'moveH'|'moveV'|'cutV'|'cutH'
    planXform:   null,
    planDragIdx: -1,
    planDragKind: null,
    panning2D:   false,
    panLastX:    0,
    panLastY:    0,
    // ── Preview 3D — ferramentas / Adicionar ferragem ──
    tool3D:      'orbit',   // 'orbit'|'cut'|'moveH'|'moveV'|'add'
    sym3D:       false,
    // Hit-test da estrutura gerada (Tesoura/Mover) — montado no render
    hitRects3D:  [],
    dragPiece:   null,      // drag de peça da estrutura (Mover H/V)
    hoverId3D:   null       // id da peça sob o cursor (cut/move)
  },

  // State da popover Adicionar (compartilhado entre módulos)
  _addState: { profW: 20, profH: 20, orient: 'v', cat: 'met', face: 'lateral', fita: true, magnet: false, armed: false, ghost: null },

  // ──────────────────────────────────────────────────────────────────────
  // INIT — chamado pelo router quando o módulo é aberto
  // ──────────────────────────────────────────────────────────────────────
  init() {
    AutoAcmCurvo.state.modulos = [];
    AutoAcmCurvo.state.activeIdx = -1;
    AutoAcmCurvo._hideAll();
    AutoAcmCurvo._loadCores();
    AutoAcmCurvo._bindLiveInputs();
    AutoAcmCurvo._bindJuntaTipo();
    AutoAcmCurvo._loadCustomFitaEsp();
    // Bind 3D quando o canvas estiver visível (após captura)
  },

  // ══════════════════════════════════════════════════════════════════
  // ESPESSURA DE FITA — presets + medidas custom salvas no PC
  // ══════════════════════════════════════════════════════════════════

  _FITA_ESP_KEY: 'signeng_fita_esp_custom',
  _FITA_ESP_PRESET: [0.5, 0.9, 1.2, 1.6],

  /** Reinsere no select as espessuras custom salvas em localStorage. */
  _loadCustomFitaEsp() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(AutoAcmCurvo._FITA_ESP_KEY) || '[]'); } catch (e) {}
    list.forEach(v => AutoAcmCurvo._ensureFitaEspOption(v));
  },

  /** Garante que o valor existe como <option> no select (insere ordenado). */
  _ensureFitaEspOption(v) {
    const sel = document.getElementById('aac_fe');
    if (!sel) return false;
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return false;
    const val = String(n);
    if ([...sel.options].some(o => o.value === val)) return true;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    const after = [...sel.options].find(o => parseFloat(o.value) > n);
    sel.insertBefore(opt, after || null);
    return true;
  },

  /** Botão (+): pede uma espessura nova, salva no PC e seleciona. */
  async addFitaEsp() {
    const raw = await Modal.prompt('Nova espessura de fita',
      'Digite a espessura em mm (ex: 1.6):', '');
    if (raw === null) return; // cancelou
    const n = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(n) || n <= 0) {
      if (window.Toast) Toast.error('Espessura inválida.');
      return;
    }
    const val = String(n);
    AutoAcmCurvo._ensureFitaEspOption(val);

    // Persiste só se não for um preset fixo
    if (!AutoAcmCurvo._FITA_ESP_PRESET.includes(n)) {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(AutoAcmCurvo._FITA_ESP_KEY) || '[]'); } catch (e) {}
      if (!list.map(String).includes(val)) {
        list.push(val);
        localStorage.setItem(AutoAcmCurvo._FITA_ESP_KEY, JSON.stringify(list));
      }
    }

    // Seleciona e dispara o fluxo normal de params/estrutura
    const sel = document.getElementById('aac_fe');
    if (sel) {
      sel.value = val;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  },

  _hideAll() {
    ['aac_tabs_wrap', 'aac_faces_section', 'aac_enab_section',
     'aac_acm_section', 'aac_chapa_section', 'aac_metalon_section',
     'aac_emenda_section', 'aac_junta_section', 'aac_fita_section',
     'aac_preview2d_section', 'aac_preview3d_section',
     'aac_resumo_section', 'aac_gerar_section', 'aac_quant_section'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
  },

  _hideSection(id) { const el = document.getElementById(id); if (el) el.hidden = true; },

  _showConfigSections() {
    ['aac_faces_section', 'aac_enab_section', 'aac_acm_section',
     'aac_chapa_section', 'aac_metalon_section', 'aac_emenda_section',
     'aac_junta_section', 'aac_fita_section',
     'aac_preview2d_section', 'aac_preview3d_section',
     'aac_resumo_section', 'aac_gerar_section'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = false;
    });
  },

  // ──────────────────────────────────────────────────────────────────────
  // CARREGA CORES DO CATÁLOGO (Bridge → Ruby)
  // ──────────────────────────────────────────────────────────────────────
  async _loadCores() {
    if (AutoAcmCurvo.state.coresLoaded) return;
    try {
      const r = await Bridge.call('autoacm_get_cores');
      if (r && r.ok) {
        AutoAcmCurvo.state.cores = r.cores_acm || {};
        AutoAcmCurvo.state.ordemCat = r.ordem_cat || Object.keys(r.cores_acm || {});
        AutoAcmCurvo.state.juntaColors = r.cores_junta || [];
        AutoAcmCurvo._mergeCustomJuntaCores();
        AutoAcmCurvo.state.fitaColors  = r.cores_fita  || [];
        AutoAcmCurvo.state.coresLoaded = true;
        AutoAcmCurvo._renderColorTabs();
        AutoAcmCurvo._renderJuntaSwatches();
        AutoAcmCurvo._renderFitaSwatches();
      }
    } catch (e) {
      // se falhar, fallback de cor única
      console.warn('AAC: falha ao carregar cores', e);
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // CAPTURAR FACES
  // ──────────────────────────────────────────────────────────────────────
  async capturarFaces() {
    if (AutoAcmCurvo.state.loading) return;
    AutoAcmCurvo.state.loading = true;
    const btn = document.getElementById('aac_btn_capturar');
    if (btn) btn.disabled = true;

    try {
      const r = await Bridge.call('autoacm_curvo_capturar');
      if (!r || !r.ok) {
        const code = r && r.code;
        const msg = AutoAcmCurvo._errMsg(code, r && r.error);
        if (window.Toast) Toast.error(msg, { title: 'Erro na captura' });
        else alert(msg);
        return;
      }

      // preserva params/nome/cor dos modulos antigos (por entity_id)
      const old = AutoAcmCurvo.state.modulos || [];
      AutoAcmCurvo.state.modulos = (r.modulos || []).map((m, i) => {
        const prev = old.find(o => o.entity_id === m.entity_id);
        return {
          ...m,
          color_idx: prev ? prev.color_idx : (i % 12),
          nome:      prev && prev.nome ? prev.nome : m.nome,
          params:    prev && prev.params ? prev.params : AutoAcmCurvo._defaultParams(),
          quant:     prev ? prev.quant : null
        };
      });
      AutoAcmCurvo.state.faceColors = r.face_colors || [];
      AutoAcmCurvo.renderTabs();
      AutoAcmCurvo._renderFacesList();
      AutoAcmCurvo._showConfigSections();
      if (AutoAcmCurvo.state.modulos.length > 0) {
        AutoAcmCurvo.selectModulo(0);
      }
      AutoAcmCurvo._updateResumo();
      // Bind dos canvas 2D + 3D (idempotente) + render inicial
      AutoAcmCurvo.bind2D();
      AutoAcmCurvo.bind3D();
      AutoAcmCurvo.scheduleRedraw3D();
      AutoAcmCurvo.scheduleRedraw2D();

      if (window.Toast) {
        const n = r.modulos.length;
        Toast.success(`${n} módulo${n > 1 ? 's' : ''} detectado${n > 1 ? 's' : ''}.`);
      }
    } catch (e) {
      if (window.Toast) Toast.error('Erro de comunicação: ' + e.message);
      else alert('Erro: ' + e.message);
    } finally {
      AutoAcmCurvo.state.loading = false;
      if (btn) btn.disabled = false;
    }
  },

  _errMsg(code, raw) {
    const map = {
      'autoacmcurvo.no_selection':     'Selecione um ou mais grupos antes de capturar.',
      'autoacmcurvo.no_valid_modules': 'Nenhum módulo válido encontrado. O sólido precisa ter topo + base + facetas laterais.',
      'autoacmcurvo.detect_failed':    'Não foi possível detectar a geometria. Verifique se o sólido tem topo (normal +Z) e base (normal -Z).',
      'autoacmcurvo.no_group':         'Selecione o grupo antes de gerar.',
      'autoacmcurvo.entity_not_found': 'Grupo não encontrado no modelo (foi deletado?).'
    };
    return map[code] || (raw ? `Erro: ${raw}` : 'Erro desconhecido.');
  },

  _defaultParams() {
    // Padrões iniciais SINCRONIZADOS com auto_acm normal (CLAUDE.md §17)
    return {
      cor_acm:       'Branco Brilho (VX103)',
      cor_junta:     'Preto',
      acm:           3,
      mw: 20, mh: 20,
      ew: 30, eh: 20,
      fl: 12, fe: 0.9,
      inc_fita:      true,
      cor_fita:      'Cyan',
      junta_tipo:    'seca',
      junta_mm:      8,
      emenda_align:  'esquerda',
      chapa_larg:    1220,
      chapa_comp:    5000,
      chapa_orient:  'horizontal',
      roles_enab: {
        frontal: true, traseira: true,
        esq: true, dir: true,
        topo: true, base: false
      },
      // Preview 2D — emendas customizadas (null = calcular auto)
      planEmH: null,
      planEmV: null,
      // Ferragens custom adicionadas via popover "Adicionar"
      customPieces: []
    };
  },

  // ──────────────────────────────────────────────────────────────────────
  // RENDER TABS DOS MÓDULOS (idêntico ao auto_acm normal)
  // ──────────────────────────────────────────────────────────────────────
  renderTabs() {
    const wrap = document.getElementById('aac_tabs_wrap');
    const row  = document.getElementById('aac_tabs');
    if (!wrap || !row) return;

    const n = AutoAcmCurvo.state.modulos.length;
    if (n === 0) { wrap.hidden = true; return; }

    wrap.hidden = false;
    row.innerHTML = '';

    AutoAcmCurvo.state.modulos.forEach((m, idx) => {
      const btn = document.createElement('div');
      btn.className = 'aac__tab' + (idx === AutoAcmCurvo.state.activeIdx ? ' is-active' : '');
      btn.draggable = true;
      btn.dataset.idx = idx;
      const hasQuant = !!(m.quant);
      const colorIdx = (m.color_idx == null ? idx : m.color_idx) % 12;
      btn.style.setProperty('--tab-color', `var(--mod-color-${colorIdx})`);

      const dimStr = `${m.w} × ${m.h} × ${m.d}`;
      const facetStr = `${m.n_facets || 0} facetas`;
      btn.innerHTML = `
        <span class="aac__tab-color" title="Cor do módulo (clique pra trocar)"></span>
        <span class="aac__tab-num">${idx + 1}.</span>
        <span class="aac__tab-name" data-idx="${idx}">${AutoAcmCurvo._esc(m.nome)}</span>
        <span class="aac__tab-dim">${dimStr}</span>
        <span class="aac__tab-facets">${facetStr}</span>
        ${hasQuant ? '<span class="aac__tab-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}
        <button class="aac__tab-dup" title="Duplicar módulo" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="aac__tab-close" title="Deletar módulo" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      btn.title = 'Clique = selecionar · Duplo no nome = renomear · Duplo na aba = zoom · Arraste pra reordenar';

      // Click select (deferred 260ms pra permitir dblclick cancelar)
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.aac__tab-close')) return;
        if (e.target.closest('.aac__tab-dup')) return;
        if (e.target.closest('.aac__tab-color')) return;
        if (e.target.classList.contains('aac__tab-name-input')) return;
        if (btn._aacClickTimer) return;
        btn._aacClickTimer = setTimeout(() => {
          btn._aacClickTimer = null;
          AutoAcmCurvo.selectModulo(idx);
        }, 260);
      });

      // Duplo clique
      btn.addEventListener('dblclick', (e) => {
        if (e.target.closest('.aac__tab-close')) return;
        if (e.target.closest('.aac__tab-color')) return;
        if (btn._aacClickTimer) {
          clearTimeout(btn._aacClickTimer);
          btn._aacClickTimer = null;
        }
        if (e.target.closest('.aac__tab-name')) {
          if (idx !== AutoAcmCurvo.state.activeIdx) {
            AutoAcmCurvo._saveFormToState();
            AutoAcmCurvo.state.activeIdx = idx;
          }
          AutoAcmCurvo._beginRenameTab(btn, idx);
        } else {
          AutoAcmCurvo._zoomTo(m.entity_id);
        }
      });

      // Click no DOT de cor = ciclar cor
      btn.querySelector('.aac__tab-color').addEventListener('click', (e) => {
        e.stopPropagation();
        AutoAcmCurvo._cycleTabColor(idx);
      });

      // Botão close
      btn.querySelector('.aac__tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        AutoAcmCurvo.deleteModulo(idx);
      });

      // Botão duplicar
      btn.querySelector('.aac__tab-dup').addEventListener('click', (e) => {
        e.stopPropagation();
        AutoAcmCurvo.duplicarModulo(idx);
      });

      // Drag-drop pra reordenar
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        btn.classList.add('is-dragging');
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('is-dragging');
        document.querySelectorAll('.aac__tab.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
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
        AutoAcmCurvo.reorderModulo(fromIdx, idx);
      });

      row.appendChild(btn);
    });
  },

  selectModulo(idx) {
    if (AutoAcmCurvo.state.activeIdx >= 0 && AutoAcmCurvo.state.activeIdx !== idx) {
      AutoAcmCurvo._saveFormToState();
    }
    AutoAcmCurvo.state.activeIdx = idx;
    AutoAcmCurvo.renderTabs();
    AutoAcmCurvo._loadStateToForm();
    AutoAcmCurvo._renderFacesList();
    AutoAcmCurvo._updateResumo();
    AutoAcmCurvo._refreshUndoBtn();
    AutoAcmCurvo.scheduleRedraw3D();
    AutoAcmCurvo.scheduleRedraw2D();
  },

  // ──────────────────────────────────────────────────────────────────────
  // RENAME / COR / REORDER / DUPLICAR / DELETE
  // ──────────────────────────────────────────────────────────────────────
  _beginRenameTab(tabEl, idx) {
    const m = AutoAcmCurvo.state.modulos[idx];
    if (!m) return;
    const nameEl = tabEl.querySelector('.aac__tab-name');
    if (!nameEl || nameEl.classList.contains('aac__tab-name-input')) return;
    const original = m.nome || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'aac__tab-name aac__tab-name-input';
    input.value = original;
    input.maxLength = 60;
    input.dataset.idx = String(idx);

    const finish = (commit) => {
      let val = commit ? input.value.trim() : original;
      if (!val) val = original || ('Curvo ' + (idx + 1));
      val = val.replace(/[<>"]/g, '').slice(0, 60);
      m.nome = val;
      AutoAcmCurvo.renderTabs();
      AutoAcmCurvo._updateResumo();
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

  _cycleTabColor(idx) {
    const m = AutoAcmCurvo.state.modulos[idx];
    if (!m) return;
    m.color_idx = ((m.color_idx == null ? idx : m.color_idx) + 1) % 12;
    AutoAcmCurvo.renderTabs();
  },

  reorderModulo(fromIdx, toIdx) {
    const arr = AutoAcmCurvo.state.modulos;
    if (fromIdx < 0 || fromIdx >= arr.length) return;
    if (toIdx < 0 || toIdx >= arr.length) return;
    if (fromIdx === toIdx) return;
    AutoAcmCurvo._saveFormToState();
    const activeId = arr[AutoAcmCurvo.state.activeIdx]
      ? arr[AutoAcmCurvo.state.activeIdx].entity_id : null;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    if (activeId != null) {
      const newActive = arr.findIndex(m => m.entity_id === activeId);
      if (newActive >= 0) AutoAcmCurvo.state.activeIdx = newActive;
    }
    AutoAcmCurvo.renderTabs();
    if (window.Toast) Toast.info('Módulos reordenados.', { duration: 2000 });
  },

  async duplicarModulo(idx) {
    const src = AutoAcmCurvo.state.modulos[idx];
    if (!src) return;
    AutoAcmCurvo._saveFormToState();

    // snapshot dos módulos atuais
    const existing = AutoAcmCurvo.state.modulos.map(m => ({
      entity_id: m.entity_id,
      nome:      m.nome,
      color_idx: m.color_idx,
      params:    JSON.parse(JSON.stringify(m.params || {})),
      quant:     m.quant ? JSON.parse(JSON.stringify(m.quant)) : null
    }));
    const existing_ids = existing.map(e => e.entity_id);

    try {
      // Reusa o callback do auto_acm normal — só clona o grupo no SU
      const r = await Bridge.call('autoacm_duplicar_modulo', {
        entity_id:    src.entity_id,
        existing_ids: existing_ids
      });
      if (!r || !r.ok) {
        if (window.Toast) Toast.error('Erro ao duplicar' + (r && r.error ? ': ' + r.error : ''));
        return;
      }
      // Re-captura tudo
      await AutoAcmCurvo.capturarFaces();
      // Restaura params/nome/cor dos antigos
      AutoAcmCurvo.state.modulos.forEach(m => {
        const old = existing.find(e => e.entity_id === m.entity_id);
        if (old) {
          m.nome      = old.nome;
          m.color_idx = old.color_idx;
          m.params    = old.params;
          if (old.quant) m.quant = old.quant;
        }
      });
      // Aplica config do source no novo módulo
      const novo = AutoAcmCurvo.state.modulos.find(m => m.entity_id === r.entity_id);
      if (novo) {
        const srcSnap = existing.find(e => e.entity_id === src.entity_id);
        if (srcSnap) {
          novo.params    = JSON.parse(JSON.stringify(srcSnap.params));
          novo.color_idx = srcSnap.color_idx;
        }
        novo.nome = (srcSnap ? srcSnap.nome : src.nome || 'Curvo') + ' (cópia)';
        const newIdx = AutoAcmCurvo.state.modulos.indexOf(novo);
        AutoAcmCurvo.selectModulo(newIdx);
      }
      AutoAcmCurvo.renderTabs();
      if (window.Toast) Toast.success(`Módulo duplicado. Total: ${AutoAcmCurvo.state.modulos.length}.`, { duration: 2000 });
    } catch (e) {
      if (window.Toast) Toast.error('Erro: ' + e.message);
    }
  },

  async deleteModulo(idx) {
    const m = AutoAcmCurvo.state.modulos[idx];
    if (!m) return;
    let ok;
    if (window.Modal && Modal.confirm) {
      ok = await Modal.confirm('Deletar módulo',
        `Remover "${m.nome || ('Curvo ' + (idx + 1))}" da lista? Essa ação não apaga nada do SketchUp, só limpa do plugin.`);
    } else {
      ok = confirm(`Remover "${m.nome || ('Curvo ' + (idx + 1))}" da lista? Não apaga do SketchUp.`);
    }
    if (!ok) return;

    AutoAcmCurvo.state.modulos.splice(idx, 1);
    const n = AutoAcmCurvo.state.modulos.length;
    if (n === 0) {
      AutoAcmCurvo.state.activeIdx = -1;
      AutoAcmCurvo._hideAll();
      if (window.Toast) Toast.info('Lista esvaziada. Capture novos módulos pra continuar.');
      return;
    }
    if (AutoAcmCurvo.state.activeIdx === idx) {
      AutoAcmCurvo.state.activeIdx = -1;
      AutoAcmCurvo.selectModulo(Math.min(idx, n - 1));
    } else if (AutoAcmCurvo.state.activeIdx > idx) {
      AutoAcmCurvo.state.activeIdx -= 1;
      AutoAcmCurvo.renderTabs();
    } else {
      AutoAcmCurvo.renderTabs();
    }
    if (window.Toast) Toast.success('Módulo removido.', { duration: 2000 });
  },

  _zoomTo(entityId) {
    Bridge.call('autoacm_curvo_selecionar', { entity_id: entityId, zoom: true }).catch(() => {});
  },

  // ──────────────────────────────────────────────────────────────────────
  // FACES LIST — paleta de cores capturadas (uma swatch por face)
  // ──────────────────────────────────────────────────────────────────────
  _renderFacesList() {
    const wrap = document.getElementById('aac_faces_list');
    const sec  = document.getElementById('aac_faces_section');
    if (!wrap || !sec) return;
    const fc = AutoAcmCurvo.state.faceColors || [];
    if (fc.length === 0) { sec.hidden = true; return; }
    sec.hidden = false;
    wrap.innerHTML = fc.map(f => {
      const rgb = `rgb(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]})`;
      return `
        <div class="aac__face-chip">
          <span class="aac__face-chip-dot" style="background:${rgb}"></span>
          <span class="aac__face-chip-label">${AutoAcmCurvo._esc(f.label)}</span>
        </div>
      `;
    }).join('');

    // atualizar contadores na seção FACES A REVESTIR
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (m) {
      const elNF = document.getElementById('aac_n_front');
      const elNT = document.getElementById('aac_n_tras');
      if (elNF) elNF.textContent = m.n_frontal ? `${m.n_frontal} facetas` : '';
      if (elNT) elNT.textContent = m.n_traseira ? `${m.n_traseira} facetas` : '';
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // COLOR PICKER (categorias do catálogo CORES_ACM)
  // ──────────────────────────────────────────────────────────────────────
  _renderColorTabs() {
    const tabs = document.getElementById('aac_color_tabs');
    if (!tabs) return;
    const cats = AutoAcmCurvo.state.ordemCat;
    if (cats.length === 0) return;
    if (!AutoAcmCurvo.state.activeCat) AutoAcmCurvo.state.activeCat = cats[0];
    tabs.innerHTML = cats.map(cat => `
      <button class="aac__color-tab${cat === AutoAcmCurvo.state.activeCat ? ' is-active' : ''}"
              type="button"
              onclick="AutoAcmCurvo._setColorCat('${cat}')">
        ${AutoAcmCurvo._esc(cat)}
      </button>
    `).join('');
    AutoAcmCurvo._renderColorGrid();
  },

  _setColorCat(cat) {
    AutoAcmCurvo.state.activeCat = cat;
    AutoAcmCurvo._renderColorTabs();
  },

  _renderColorGrid() {
    const grid = document.getElementById('aac_color_grid');
    if (!grid) return;
    const cat = AutoAcmCurvo.state.activeCat;
    const list = (AutoAcmCurvo.state.cores[cat] || []);
    const sel = document.getElementById('aac_cor_acm').value;
    grid.innerHTML = list.map(c => {
      const rgb = `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`;
      const active = c.nome === sel ? ' is-active' : '';
      return `
        <button type="button" class="aac__color-swatch${active}"
                style="background:${rgb}"
                title="${AutoAcmCurvo._esc(c.nome)}"
                onclick="AutoAcmCurvo._selectColor('${AutoAcmCurvo._escAttr(c.nome)}',${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})"></button>
      `;
    }).join('');
    AutoAcmCurvo._updateColorDisplay();
  },

  _selectColor(nome, r, g, b) {
    document.getElementById('aac_cor_acm').value = nome;
    AutoAcmCurvo._updateColorDisplay(r, g, b, nome);
    AutoAcmCurvo._renderColorGrid();
    AutoAcmCurvo._scheduleSave();
  },

  _updateColorDisplay(r, g, b, nome) {
    const sw  = document.getElementById('aac_cor_swatch');
    const nm  = document.getElementById('aac_cor_nome');
    if (!sw || !nm) return;
    const cor = nome || document.getElementById('aac_cor_acm').value;
    if (r == null) {
      // procura RGB no catálogo
      for (const cat in AutoAcmCurvo.state.cores) {
        const found = (AutoAcmCurvo.state.cores[cat] || []).find(c => c.nome === cor);
        if (found) { r = found.rgb[0]; g = found.rgb[1]; b = found.rgb[2]; break; }
      }
    }
    if (r != null) sw.style.background = `rgb(${r},${g},${b})`;
    nm.textContent = cor;
  },

  // ──────────────────────────────────────────────────────────────────────
  // JUNTA — swatches de cor + bind tipo/seca/dilatação
  // ──────────────────────────────────────────────────────────────────────
  _renderJuntaSwatches() {
    const wrap = document.getElementById('aac_junta_swatches');
    if (!wrap) return;
    const list = AutoAcmCurvo.state.juntaColors || [];
    const sel = document.getElementById('aac_cor_junta').value;
    wrap.innerHTML = list.map(c => {
      const rgb = `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`;
      const active = c.nome === sel ? ' is-active' : '';
      return `
        <button type="button" class="aac__junta-swatch${active}"
                style="background:${rgb}"
                title="${AutoAcmCurvo._esc(c.nome)}"
                onclick="AutoAcmCurvo._selectJunta('${AutoAcmCurvo._escAttr(c.nome)}')"></button>
      `;
    }).join('') +
      `<button type="button" class="aac__junta-swatch aac__junta-swatch--add" title="Adicionar cor" onclick="AutoAcmCurvo.addJuntaCor()">+</button>`;
  },

  _selectJunta(nome) {
    document.getElementById('aac_cor_junta').value = nome;
    AutoAcmCurvo._renderJuntaSwatches();
    AutoAcmCurvo._scheduleSave();
  },

  // ══════════════════════════════════════════════════════════════════
  // CORES DE JUNTA CUSTOM — paleta + seletor livre, salvas no PC
  // ══════════════════════════════════════════════════════════════════

  _JUNTA_CORES_KEY: 'signeng_junta_cores_custom',

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

  _mergeCustomJuntaCores() {
    let listLs = [];
    try { listLs = JSON.parse(localStorage.getItem(AutoAcmCurvo._JUNTA_CORES_KEY) || '[]'); } catch (e) {}
    AutoAcmCurvo.state.juntaColors = AutoAcmCurvo.state.juntaColors || [];
    listLs.forEach(c => {
      if (!c || !c.nome || !Array.isArray(c.rgb)) return;
      if (!AutoAcmCurvo.state.juntaColors.some(x => x.nome === c.nome)) {
        AutoAcmCurvo.state.juntaColors.push({ nome: c.nome, rgb: c.rgb });
      }
    });
  },

  _hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },

  _buildJuntaModalBody() {
    const wrap = document.createElement('div');
    wrap.className = 'junta-pal';
    const grid = AutoAcmCurvo._JUNTA_PALETTE.map(c =>
      `<button type="button" class="junta-pal__swatch" data-hex="${c.hex}" data-nome="${AutoAcmCurvo._esc(c.nome)}" style="background:${c.hex}" title="${AutoAcmCurvo._esc(c.nome)}"></button>`
    ).join('');
    wrap.innerHTML = `
      <p class="junta-pal__hint">Escolha uma cor pronta ou crie a sua:</p>
      <div class="junta-pal__grid">${grid}</div>
      <div class="junta-pal__custom">
        <input type="color" class="junta-pal__color" id="aac_junta_new_color" value="#888888">
        <input type="text" class="junta-pal__name field__input" id="aac_junta_new_name" placeholder="Nome da cor">
      </div>
    `;
    wrap.querySelectorAll('.junta-pal__swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        wrap.querySelectorAll('.junta-pal__swatch').forEach(s => s.classList.remove('is-selected'));
        sw.classList.add('is-selected');
        const colorEl = wrap.querySelector('#aac_junta_new_color');
        const nameEl  = wrap.querySelector('#aac_junta_new_name');
        if (colorEl) colorEl.value = sw.dataset.hex;
        if (nameEl && !nameEl.value.trim()) nameEl.value = sw.dataset.nome;
      });
    });
    return wrap;
  },

  async addJuntaCor() {
    const body = AutoAcmCurvo._buildJuntaModalBody();
    const res = await Modal.show({
      title: 'Adicionar cor de junta',
      body,
      buttons: [
        { label: 'Cancelar', variant: 'secondary', value: null },
        {
          label: 'Adicionar', variant: 'primary',
          onClick: (bodyEl) => {
            const hex = (bodyEl.querySelector('#aac_junta_new_color') || {}).value || '#888888';
            let nome = ((bodyEl.querySelector('#aac_junta_new_name') || {}).value || '').trim();
            if (!nome) nome = hex.toUpperCase();
            return { nome, rgb: AutoAcmCurvo._hexToRgb(hex) };
          }
        }
      ]
    });
    if (!res || !res.rgb) return;

    AutoAcmCurvo.state.juntaColors = AutoAcmCurvo.state.juntaColors || [];
    const existing = AutoAcmCurvo.state.juntaColors.find(c => c.nome === res.nome);
    if (existing) existing.rgb = res.rgb;
    else AutoAcmCurvo.state.juntaColors.push({ nome: res.nome, rgb: res.rgb });

    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(AutoAcmCurvo._JUNTA_CORES_KEY) || '[]'); } catch (e) {}
    saved = saved.filter(c => c && c.nome !== res.nome);
    saved.push({ nome: res.nome, rgb: res.rgb });
    localStorage.setItem(AutoAcmCurvo._JUNTA_CORES_KEY, JSON.stringify(saved));

    AutoAcmCurvo._selectJunta(res.nome);
  },

  // ──────────────────────────────────────────────────────────────────────
  // FITA — swatches de cor (mesmo padrão da junta)
  // ──────────────────────────────────────────────────────────────────────
  _renderFitaSwatches() {
    const wrap = document.getElementById('aac_fita_swatches');
    if (!wrap) return;
    const list = AutoAcmCurvo.state.fitaColors || [];
    const sel = document.getElementById('aac_cor_fita').value;
    wrap.innerHTML = list.map(c => {
      const rgb = `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`;
      const active = c.nome === sel ? ' is-active' : '';
      return `
        <button type="button" class="aac__junta-swatch${active}"
                style="background:${rgb}"
                title="${AutoAcmCurvo._esc(c.nome)}"
                onclick="AutoAcmCurvo._selectFita('${AutoAcmCurvo._escAttr(c.nome)}')"></button>
      `;
    }).join('');
  },

  _selectFita(nome) {
    document.getElementById('aac_cor_fita').value = nome;
    AutoAcmCurvo._renderFitaSwatches();
    AutoAcmCurvo._scheduleSave();
  },

  _bindJuntaTipo() {
    document.querySelectorAll('input[name="aac_junta_tipo"]').forEach(r => {
      r.addEventListener('change', () => {
        const dil = document.getElementById('aac_junta_dil_row');
        if (dil) dil.style.opacity = (r.value === 'dilatacao' && r.checked) ? '1' : '0.5';
        AutoAcmCurvo._scheduleSave();
      });
    });
  },

  // ──────────────────────────────────────────────────────────────────────
  // TAMANHO DA CHAPA (preset + custom — padrão auto_acm)
  // ──────────────────────────────────────────────────────────────────────
  _CHAPA_PRESETS: {
    '5000x1220': { comp: 5000, larg: 1220 },
    '5000x1500': { comp: 5000, larg: 1500 },
    '2440x1220': { comp: 2440, larg: 1220 },
    '3200x1500': { comp: 3200, larg: 1500 }
  },

  onChapaPresetChange() {
    const sel = document.getElementById('aac_chapa_preset');
    const wrap = document.getElementById('aac_chapa_custom_wrap');
    if (!sel) return;
    const val = sel.value;
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    if (val === 'custom') {
      if (wrap) wrap.hidden = false;
      AutoAcmCurvo.onChapaCustomChange();
      return;
    }
    if (wrap) wrap.hidden = true;
    const preset = AutoAcmCurvo._CHAPA_PRESETS[val];
    if (!preset) return;
    setV('aac_chapa_larg', preset.larg);
    setV('aac_chapa_comp_custom', preset.comp);
    setV('aac_chapa_larg_custom', preset.larg);
    AutoAcmCurvo._applyChapaSize(preset.comp, preset.larg);
  },

  onChapaCustomChange() {
    const get = (id, def) => { const el = document.getElementById(id); const v = el ? parseInt(el.value, 10) : NaN; return Number.isFinite(v) ? v : def; };
    const comp = get('aac_chapa_comp_custom', 5000);
    const larg = get('aac_chapa_larg_custom', 1220);
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setV('aac_chapa_larg', larg);
    AutoAcmCurvo._applyChapaSize(comp, larg);
  },

  _applyChapaSize(comp, larg) {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (m && m.params) {
      m.params.chapa_larg = larg;
      m.params.chapa_comp = comp;
    }
    AutoAcmCurvo._scheduleSave();
  },

  _syncChapaPreset(comp, larg) {
    const sel = document.getElementById('aac_chapa_preset');
    const wrap = document.getElementById('aac_chapa_custom_wrap');
    if (!sel) return;
    const key = comp + 'x' + larg;
    if (AutoAcmCurvo._CHAPA_PRESETS[key]) {
      sel.value = key;
      if (wrap) wrap.hidden = true;
    } else {
      sel.value = 'custom';
      if (wrap) wrap.hidden = false;
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // ORIENTAÇÃO DA CHAPA (pills + hint de aproveitamento — padrão auto_acm)
  // ──────────────────────────────────────────────────────────────────────
  setOrient(val, skipSave) {
    document.querySelectorAll('.aac__pill[data-val]').forEach(p => {
      p.classList.toggle('is-active', p.dataset.val === val);
    });
    const hidden = document.getElementById('aac_chapa_orient');
    if (hidden) hidden.value = val;
    if (!skipSave) AutoAcmCurvo._scheduleSave();
  },

  // Heurística: simula _calcEmendas2D pros 2 eixos em cada orientação,
  // soma chapas por faceta habilitada e mostra qual economiza.
  _updateOrientHint(m) {
    const el = document.getElementById('aac_orient_hint');
    if (!el) return;
    if (!m || !m.params) { el.hidden = true; return; }
    const p = m.params;
    const chapaLarg = parseInt(p.chapa_larg || 1220, 10);
    const chapaComp = parseInt(p.chapa_comp || 5000, 10);
    const jt = (p.junta_tipo === 'seca') ? 0 : (parseFloat(p.junta_mm) || 0);
    const align = p.emenda_align || 'esquerda';

    // Soma chapas das facetas habilitadas. Cada faceta vira um trapézio
    // "deitado": dimensão longa = altura do módulo, curta = larg média.
    let facets;
    try { facets = AutoAcmCurvo._buildFacets2D ? AutoAcmCurvo._buildFacets2D(m) : null; }
    catch { facets = null; }
    if (!facets || !facets.length) { el.hidden = true; return; }

    const countFor = (orient) => {
      // horizontal = 5000 corre na DIM LONGA (altura), 1220 na DIM CURTA (larg)
      // vertical   = 5000 na DIM CURTA (larg), 1220 na DIM LONGA (altura)
      const chapaLong  = (orient === 'horizontal') ? chapaComp : chapaLarg;
      const chapaShort = (orient === 'horizontal') ? chapaLarg : chapaComp;
      let total = 0;
      facets.forEach(fc => {
        const dimLong  = parseFloat(fc.altura) || 0;
        const lb = parseFloat(fc.larg_base) || 0;
        const lt = parseFloat(fc.larg_topo) || 0;
        const dimShort = (lb + lt) / 2;
        if (dimLong < 1 || dimShort < 1) return;
        const emL = AutoAcmCurvo._calcEmendas2D(dimLong,  chapaLong,  jt, align);
        const emS = AutoAcmCurvo._calcEmendas2D(dimShort, chapaShort, jt, align);
        total += (emL.length + 1) * (emS.length + 1);
      });
      return total;
    };

    const orient  = p.chapa_orient || 'horizontal';
    const cur     = countFor(orient);
    const oth     = countFor(orient === 'horizontal' ? 'vertical' : 'horizontal');
    const othName = orient === 'horizontal' ? 'Vertical' : 'Horizontal';

    if (cur === 0 || oth === 0) { el.hidden = true; return; }

    if (oth < cur) {
      const saved = cur - oth;
      const pct   = Math.round((saved / cur) * 100);
      el.hidden = false;
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
        ' ' + othName + ' economiza ' + saved + ' chapas (~' + pct + '%): ' + oth + ' vs ' + cur + '.';
    } else if (cur === oth) {
      el.hidden = true;
    } else {
      el.hidden = false;
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        ' Orientação atual é a mais econômica (' + cur + ' chapas).';
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // FACES A REVESTIR — toggla classe is-checked nos cartões
  // ──────────────────────────────────────────────────────────────────────
  _bindFaceCards() {
    ['frontal', 'traseira', 'esq', 'dir', 'topo', 'base'].forEach(key => {
      const input = document.getElementById('aac_enab_' + key);
      if (!input) return;
      let label = input.parentElement;
      while (label && !label.classList.contains('aac__face-check')) {
        label = label.parentElement;
      }
      if (!label) return;
      label.classList.toggle('is-checked', !!input.checked);
      input.onchange = () => {
        label.classList.toggle('is-checked', !!input.checked);
        AutoAcmCurvo._scheduleSave();
      };
    });
  },

  // ──────────────────────────────────────────────────────────────────────
  // LIVE BINDING — qualquer mudança em input/select/checkbox dentro do .aac
  // dispara um save com debounce de 250ms
  // ──────────────────────────────────────────────────────────────────────
  _bindLiveInputs() {
    const root = document.querySelector('.aac');
    if (!root) return;
    root.addEventListener('input', e => {
      if (e.target.matches('input, select, textarea')) {
        AutoAcmCurvo._scheduleSave();
      }
    });
    root.addEventListener('change', e => {
      if (e.target.matches('input, select, textarea')) {
        AutoAcmCurvo._scheduleSave();
      }
    });
  },

  _scheduleSave() {
    clearTimeout(AutoAcmCurvo.state.saveTimer);
    AutoAcmCurvo.state.saveTimer = setTimeout(() => {
      AutoAcmCurvo._saveFormToState();
      AutoAcmCurvo._updateResumo();
      AutoAcmCurvo._updateOrientHint(AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx]);
      AutoAcmCurvo.scheduleRedraw3D();
      AutoAcmCurvo.scheduleRedraw2D();
    }, 250);
  },

  // ──────────────────────────────────────────────────────────────────────
  // FORM ↔ STATE
  // ──────────────────────────────────────────────────────────────────────
  _saveFormToState() {
    const idx = AutoAcmCurvo.state.activeIdx;
    if (idx < 0) return;
    const m = AutoAcmCurvo.state.modulos[idx];
    if (!m) return;
    m.params = AutoAcmCurvo._coletarParams();
  },

  _loadStateToForm() {
    const idx = AutoAcmCurvo.state.activeIdx;
    if (idx < 0) return;
    const m = AutoAcmCurvo.state.modulos[idx];
    if (!m || !m.params) return;
    const p = m.params;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    const setRad = (name, v) => {
      document.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = (r.value === v); });
    };

    setVal('aac_cor_acm', p.cor_acm);
    setVal('aac_cor_junta', p.cor_junta);
    setVal('aac_cor_fita', p.cor_fita || 'Cyan');
    setVal('aac_acm_esp', p.acm);
    setVal('aac_mw', p.mw);
    setVal('aac_mh', p.mh);
    setVal('aac_ew', p.ew);
    setVal('aac_eh', p.eh);
    setVal('aac_fl', p.fl);
    AutoAcmCurvo._ensureFitaEspOption(p.fe);
    setVal('aac_fe', p.fe);
    setChk('aac_inc_fita', p.inc_fita);
    setRad('aac_junta_tipo', p.junta_tipo);
    setVal('aac_junta_mm', p.junta_mm);
    setRad('aac_em_align', p.emenda_align);
    setVal('aac_chapa_larg', p.chapa_larg);
    setVal('aac_chapa_comp_custom', p.chapa_comp || 5000);
    setVal('aac_chapa_larg_custom', p.chapa_larg || 1220);
    AutoAcmCurvo._syncChapaPreset(p.chapa_comp || 5000, p.chapa_larg || 1220);
    AutoAcmCurvo.setOrient(p.chapa_orient || 'horizontal', true);
    setChk('aac_enab_frontal',  p.roles_enab.frontal);
    setChk('aac_enab_traseira', p.roles_enab.traseira);
    setChk('aac_enab_esq',      p.roles_enab.esq);
    setChk('aac_enab_dir',      p.roles_enab.dir);
    setChk('aac_enab_topo',     p.roles_enab.topo);
    setChk('aac_enab_base',     p.roles_enab.base);
    AutoAcmCurvo._updateColorDisplay();
    AutoAcmCurvo._renderColorGrid();
    AutoAcmCurvo._renderJuntaSwatches();
    AutoAcmCurvo._renderFitaSwatches();
    AutoAcmCurvo._bindFaceCards();
    AutoAcmCurvo._updateOrientHint(AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx]);
    AutoAcmCurvo._renderCustomPiecesList();
  },

  _coletarParams() {
    const num = (id, def) => {
      const el = document.getElementById(id);
      const v = el ? parseFloat(el.value) : NaN;
      return isFinite(v) ? v : def;
    };
    const chk = (id, def) => {
      const el = document.getElementById(id);
      return el ? !!el.checked : def;
    };
    const sel = (id, def) => {
      const el = document.getElementById(id);
      return el ? el.value : def;
    };
    const rad = (name, def) => {
      const el = document.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : def;
    };

    // Preserva as peças adicionadas (vivem em m.params.customPieces).
    const _customPiecesSnapshot = (() => {
      const mm = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
      const arr = mm && mm.params && Array.isArray(mm.params.customPieces) ? mm.params.customPieces : [];
      return arr.slice();
    })();

    return {
      cor_acm:       sel('aac_cor_acm', 'Branco Brilho (VX103)'),
      cor_junta:     sel('aac_cor_junta', 'Preto'),
      // RGB da cor de junta (pra cores custom funcionarem na geração Ruby)
      cor_junta_rgb: ((AutoAcmCurvo.state.juntaColors || []).find(c => c.nome === sel('aac_cor_junta', 'Preto')) || {}).rgb || null,
      acm:           num('aac_acm_esp', 4),
      mw:            num('aac_mw', 50),
      mh:            num('aac_mh', 50),
      ew:            num('aac_ew', 30),
      eh:            num('aac_eh', 20),
      fl:            num('aac_fl', 12),
      fe:            num('aac_fe', 0.9),
      inc_fita:      chk('aac_inc_fita', true),
      cor_fita:      sel('aac_cor_fita', 'Cyan'),
      junta_tipo:    rad('aac_junta_tipo', 'seca'),
      junta_mm:      num('aac_junta_mm', 8),
      emenda_align:  rad('aac_em_align', 'esquerda'),
      chapa_larg:    num('aac_chapa_larg', 1220),
      chapa_comp:    num('aac_chapa_comp_custom', 5000),
      chapa_orient:  sel('aac_chapa_orient', 'horizontal'),
      // IMPORTANTE: preservar AMBAS as chaves. `custom_pieces` (snake) é o
      // que o payload do Ruby `gerar` consome; `customPieces` (camel) é o
      // que TODO o JS lê (render, push, etc). Sem a camel, _saveFormToState
      // ao reconstruir m.params apagava as peças (apareciam e sumiam).
      custom_pieces: _customPiecesSnapshot,
      customPieces:  _customPiecesSnapshot,
      roles_enab: {
        frontal:  chk('aac_enab_frontal', true),
        traseira: chk('aac_enab_traseira', true),
        esq:      chk('aac_enab_esq', true),
        dir:      chk('aac_enab_dir', true),
        topo:     chk('aac_enab_topo', true),
        base:     chk('aac_enab_base', false)
      }
    };
  },

  // ──────────────────────────────────────────────────────────────────────
  // RESUMO (cards live)
  // ──────────────────────────────────────────────────────────────────────
  _updateResumo() {
    const grid = document.getElementById('aac_resumo_grid');
    if (!grid) return;
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m) { grid.innerHTML = ''; return; }
    const p = m.params || AutoAcmCurvo._defaultParams();

    const cards = [
      { label: 'Módulo',
        value: `${m.h_mm} mm`,
        sub: `base ${m.w_base_mm}×${m.d_base_mm} → topo ${m.w_topo_mm}×${m.d_topo_mm}` },
      { label: 'Facetas',
        value: `${m.n_facets}`,
        sub: `frontal ${m.n_frontal} · traseira ${m.n_traseira} · cantos ${m.n_corners}` },
      { label: 'ACM',
        value: `${p.acm} mm`,
        sub: AutoAcmCurvo._truncar(p.cor_acm, 26) },
      { label: 'Chapa',
        value: `${p.chapa_larg} mm`,
        sub: `${p.chapa_orient} · emendas ${p.emenda_align}` },
      { label: 'Metalon',
        value: `${p.mw}×${p.mh} mm`,
        sub: 'perfil estrutural' },
      { label: 'Emenda',
        value: `${p.ew}×${p.eh} mm`,
        sub: 'perfil de junção' },
      { label: 'Junta',
        value: p.junta_tipo === 'seca' ? 'Seca' : `${p.junta_mm} mm`,
        sub: p.junta_tipo === 'seca' ? '—' : `dilatação · ${p.cor_junta}` },
      { label: 'Fita DF',
        value: p.inc_fita ? `${p.fl}×${p.fe} mm` : '—',
        sub: p.inc_fita ? 'incluída' : 'não incluída' }
    ];
    grid.innerHTML = cards.map(c => `
      <div class="aac__resumo-card">
        <div class="aac__resumo-label">${AutoAcmCurvo._esc(c.label)}</div>
        <div class="aac__resumo-value">${AutoAcmCurvo._esc(c.value)}</div>
        <div class="aac__resumo-sub">${AutoAcmCurvo._esc(c.sub)}</div>
      </div>
    `).join('');
  },

  // ──────────────────────────────────────────────────────────────────────
  // GERAR
  // ──────────────────────────────────────────────────────────────────────
  async gerar() {
    if (AutoAcmCurvo.state.loading) return;
    if (AutoAcmCurvo.state.activeIdx < 0) {
      if (window.Toast) Toast.warning('Capture um módulo primeiro.');
      return;
    }
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m) return;
    AutoAcmCurvo._saveFormToState();
    const params = m.params;

    AutoAcmCurvo.state.loading = true;
    const btn = document.getElementById('aac_btn_gerar');
    if (btn) btn.disabled = true;
    try {
      const r = await Bridge.call('autoacm_curvo_gerar', {
        entity_id: m.entity_id,
        params: params
      });
      if (!r || !r.ok) {
        const msg = AutoAcmCurvo._errMsg(r && r.code, r && r.error);
        if (window.Toast) Toast.error(msg, { title: 'Erro ao gerar' });
        else alert(msg);
        return;
      }
      m.quant = r.quant;
      if (r.quant && r.quant.origin) m.origin = r.quant.origin;
      m.history = [];                    // baseline gerado = piso do desfazer
      AutoAcmCurvo._refreshUndoBtn();
      AutoAcmCurvo._renderQuant(r.quant);
      AutoAcmCurvo.renderTabs();         // mostra check verde
      AutoAcmCurvo.scheduleRedraw3D();   // re-render com peças geradas
      if (window.Toast) Toast.success('Estrutura gerada com sucesso.');
    } catch (e) {
      if (window.Toast) Toast.error('Erro: ' + e.message);
      else alert('Erro: ' + e.message);
    } finally {
      AutoAcmCurvo.state.loading = false;
      if (btn) btn.disabled = false;
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // DESFAZER (Ctrl+Z) — volta UMA alteração por vez (corte/mover/adicionar)
  // até o estado gerado. Sem alerta. Usa snapshots empilhados antes de cada
  // edição; o Ruby reconstrói a estrutura a partir do snapshot (sem
  // analisar_modulo, que falha após edições nas faces ACM).
  // ──────────────────────────────────────────────────────────────────────

  /** Empilha o estado atual (pecas_3d + origin + peças custom) antes de uma edição. */
  _pushHistory(m) {
    if (!m || !m.quant) return;
    try {
      const snap = {
        pecas:  JSON.parse(JSON.stringify(m.quant.pecas_3d || [])),
        origin: Array.isArray(m.origin) ? m.origin.slice() : null,
        custom: JSON.parse(JSON.stringify((m.params && m.params.customPieces) || []))
      };
      if (!Array.isArray(m.history)) m.history = [];
      m.history.push(snap);
      if (m.history.length > 50) m.history.shift();   // cap de segurança
    } catch (_) {}
    AutoAcmCurvo._refreshUndoBtn();
  },

  /** Habilita/desabilita o botão Desfazer conforme há histórico. */
  _refreshUndoBtn() {
    const btn = document.getElementById('aac3d_undo_btn');
    if (!btn) return;
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    const has = !!(m && Array.isArray(m.history) && m.history.length);
    btn.disabled = !has;
    btn.classList.toggle('is-disabled', !has);
  },

  async desfazer() {
    if (AutoAcmCurvo.state.loading) return;
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m) return;
    if (!Array.isArray(m.history) || !m.history.length) {
      if (window.Toast) Toast.info('Nada para desfazer.', { duration: 1400 });
      return;
    }
    const snap = m.history.pop();
    AutoAcmCurvo._refreshUndoBtn();
    AutoAcmCurvo.state.dragPiece = null;
    AutoAcmCurvo.state.hoverId3D = null;
    if (m.edits) m.edits = { del: {}, ofs: {} };

    try {
      const r = await Bridge.call('autoacm_curvo_restaurar_snapshot', {
        entity_id: m.entity_id,
        pecas:     snap.pecas,
        origin:    snap.origin
      });
      if (r && r.ok) {
        if (!m.quant) m.quant = {};
        m.quant.pecas_3d = r.pecas_3d || snap.pecas;
        if (r.origin) m.origin = r.origin;
        if (m.params) m.params.customPieces = snap.custom || [];
        AutoAcmCurvo._renderCustomPiecesList();
        AutoAcmCurvo.scheduleRedraw3D();
        AutoAcmCurvo._scheduleSave();
      } else {
        m.history.push(snap);   // falhou — devolve ao histórico
        AutoAcmCurvo._refreshUndoBtn();
        if (window.Toast) Toast.error('Erro ao desfazer' + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      m.history.push(snap);
      AutoAcmCurvo._refreshUndoBtn();
      if (window.Toast) Toast.error('Erro: ' + e.message);
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // QUANTITATIVO (render expandido)
  // ──────────────────────────────────────────────────────────────────────
  _renderQuant(q) {
    if (!q) return;
    const wrap = document.getElementById('aac_quant_section');
    const grid = document.getElementById('aac_quant_grid');
    const facesWrap = document.getElementById('aac_quant_faces');
    if (!wrap || !grid) return;
    wrap.hidden = false;

    const cards = [];
    if (q.modulo) {
      cards.push({
        label: 'Módulo',
        value: `${q.modulo.altura_mm} mm`,
        sub: `${q.modulo.n_facetas} facetas · ${q.modulo.n_corners} cantos`
      });
    }
    if (q.acm) {
      cards.push({
        label: 'ACM total',
        value: `${q.acm.total_m2} m²`,
        sub: `~${q.acm.chapas_est} chapa${q.acm.chapas_est !== 1 ? 's' : ''} de ${q.chapa.larg_mm}×${q.chapa.comp_mm || 5000}mm`
      });
    }
    if (q.metalon) {
      cards.push({
        label: 'Metalon · total',
        value: `${q.metalon.total_m} m`,
        sub: `~${q.metalon.barras_6m} barras de 6m · perfil ${q.metalon.secao_mm}`
      });
      cards.push({
        label: 'Metalon · detalhe',
        value: `${q.metalon.montantes_qtd} mont.`,
        sub: `montantes ${q.metalon.montantes_m}m · anéis ${q.metalon.aneis_m}m · travessas ${q.metalon.travessas_m}m`
      });
    }
    if (q.emenda) {
      cards.push({
        label: 'Emendas',
        value: `${q.emenda.qtd} (${q.emenda.m} m)`,
        sub: `~${q.emenda.barras_6m} barras de 6m · perfil ${q.emenda.secao_mm}`
      });
    }
    if (q.junta) {
      cards.push({
        label: 'Junta',
        value: q.junta.tipo === 'seca' ? 'Seca' : `${q.junta.mm} mm`,
        sub: q.junta.tipo === 'seca' ? '—' : `dilatação · ${q.junta.cor}`
      });
    }
    if (q.fita) {
      cards.push({
        label: 'Fita DF',
        value: `${q.fita.m} m`,
        sub: `${q.fita.largura_mm}×${q.fita.espessura_mm} mm`
      });
    }

    grid.innerHTML = cards.map(c => `
      <div class="aac__quant-card">
        <div class="aac__quant-card-label">${AutoAcmCurvo._esc(c.label)}</div>
        <div class="aac__quant-card-value">${AutoAcmCurvo._esc(c.value)}</div>
        ${c.sub ? `<div class="aac__quant-card-sub">${AutoAcmCurvo._esc(c.sub)}</div>` : ''}
      </div>
    `).join('');

    // tabela de áreas por face
    if (facesWrap && q.acm && q.acm.faces && q.acm.faces.length > 0) {
      facesWrap.innerHTML = `
        <h4 class="aac__quant-faces-title">Área por face</h4>
        <table class="aac__quant-faces-table">
          <thead><tr><th>Face</th><th class="aac__num">Área (m²)</th></tr></thead>
          <tbody>
            ${q.acm.faces.map(f => `
              <tr>
                <td>${AutoAcmCurvo._esc(f.label)}</td>
                <td class="aac__num">${f.area_m2}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (facesWrap) {
      facesWrap.innerHTML = '';
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  // DEBUG — exporta o envelope do módulo ativo (pra debugar geometria)
  // ══════════════════════════════════════════════════════════════════════
  dumpEnvelope() {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m) { alert('Nenhum módulo selecionado.'); return; }
    const dump = {
      nome: m.nome,
      bbox: { w: m.w, h: m.h, d: m.d },
      n_facets: m.n_facets,
      n_frontal: m.n_frontal,
      n_traseira: m.n_traseira,
      n_corners: m.n_corners,
      envelope: m.envelope,
      facets_2d: AutoAcmCurvo._buildFacets2D(m).map(fc => ({
        label: fc.label, role: fc.role,
        verts_uv: fc.verts,
        larg_base: fc.larg_base,
        larg_topo: fc.larg_topo,
        altura:    fc.altura
      }))
    };
    const json = JSON.stringify(dump, null, 2);
    // tenta copiar pra clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        () => { if (window.Toast) Toast.success('Envelope JSON copiado pra clipboard. Cole aqui na conversa.'); else alert('Copiado!'); },
        () => { prompt('Selecione e copie (Ctrl+C):', json); }
      );
    } else {
      prompt('Selecione e copie (Ctrl+C):', json);
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  // PREVIEW 2D PLANIFICADO
  // Cada faceta vira um trapézio no plano local (u=horizontal, v=altura
  // inclinada). Trapézios desenhados lado a lado em ordem cíclica (frontais,
  // dir, traseiras, esq). Emendas marcadas como linhas baseadas em chapa.
  // ══════════════════════════════════════════════════════════════════════
  scheduleRedraw2D() {
    if (AutoAcmCurvo._redraw2DScheduled) return;
    AutoAcmCurvo._redraw2DScheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        AutoAcmCurvo._redraw2DScheduled = false;
        try { AutoAcmCurvo.draw2D(); } catch (e) { console.error('[AutoAcmCurvo] draw2D erro:', e); }
      });
    });
  },

  // Cor de fundo do trapézio por role (transparências leves) — usado no 2D
  _roleColor2D(role) {
    const map = {
      frontal:  { fill: 'rgba(220, 40, 200, 0.18)', stroke: 'rgba(150, 20, 130, 0.85)' },
      traseira: { fill: 'rgba(40, 200, 60, 0.18)',  stroke: 'rgba(20, 130, 40, 0.85)' },
      esq:      { fill: 'rgba(40, 200, 220, 0.18)', stroke: 'rgba(20, 130, 150, 0.85)' },
      dir:      { fill: 'rgba(220, 40, 40, 0.18)',  stroke: 'rgba(150, 20, 20, 0.85)' },
      topo:     { fill: 'rgba(40, 80, 220, 0.18)',  stroke: 'rgba(20, 40, 150, 0.85)' },
      base:     { fill: 'rgba(240, 220, 40, 0.18)', stroke: 'rgba(150, 130, 20, 0.85)' }
    };
    return map[role] || map.frontal;
  },

  // Cor das facetas no 3D — alpha mais alto pra dar volume e facilitar
  // ler o afunilamento. RGB sofrem shade conforme normal rotacionada
  // (mais escuro = mais perpendicular ao olhar). Mesmas cores do 2D.
  _roleColor3D(role, shade) {
    const base = {
      frontal:  [220,  40, 200],
      traseira: [ 40, 200,  60],
      esq:      [ 40, 200, 220],
      dir:      [220,  40,  40],
      topo:     [ 40,  80, 220],
      base:     [240, 220,  40]
    }[role] || [180, 180, 180];
    const r = Math.round(base[0] * shade);
    const g = Math.round(base[1] * shade);
    const b = Math.round(base[2] * shade);
    return {
      fill:   `rgba(${r},${g},${b},0.78)`,
      stroke: `rgba(${Math.round(r*0.55)},${Math.round(g*0.55)},${Math.round(b*0.55)},0.95)`
    };
  },

  // Constrói lista de facetas planificadas. Se o envelope vier com polygons
  // (face lateral completa, n vértices), preserva multi-segmentos (step,
  // shoulder, dobra). Senão cai no fallback de 4 cantos (frustum simples).
  // u = projeção horizontal (no plano XY) ao longo da aresta da base
  // v = altura vertical Z absoluta (não slant)
  _buildFacets2D(m) {
    const env = m.envelope;
    if (!env || !env.base || !env.topo) return [];
    const base = env.base;
    const topo = env.topo;
    const roles = env.roles || [];
    const polygons = env.polygons || [];
    const N = Math.min(base.length, topo.length);
    if (N < 3) return [];

    const facets = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const bL = base[i], bR = base[j];
      const tL = topo[i], tR = topo[j];

      // Eixo u: horizontal no plano XY, direção bL→bR
      const uX = bR[0] - bL[0], uY = bR[1] - bL[1];
      const uLen = Math.sqrt(uX * uX + uY * uY);
      if (uLen < 1e-3) continue;
      const uNx = uX / uLen, uNy = uY / uLen;

      // Projeta um ponto 3D (no espaço local em mm) pro plano (u, v) da faceta
      const proj = (p) => {
        const dx = p[0] - bL[0], dy = p[1] - bL[1];
        return [
          dx * uNx + dy * uNy, // u — paralelo à base no plano horizontal
          p[2] - bL[2]          // v — altura Z absoluta a partir da base
        ];
      };

      // ── Tenta usar o polígono completo da face (multi-segmento) ──
      let verts = null;
      const poly3D = polygons[i];
      if (Array.isArray(poly3D) && poly3D.length >= 3) {
        verts = poly3D.map(proj);
        // Filtra duplicatas consecutivas (vértices coincidentes em u,v)
        verts = verts.filter((p, k) => {
          const q = verts[(k + verts.length - 1) % verts.length];
          return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5;
        });
        if (verts.length < 3) verts = null;
      }
      // Fallback: quad de 4 cantos (frustum simples)
      if (!verts) {
        verts = [proj(bL), proj(bR), proj(tR), proj(tL)];
      }

      // Calcula largura na BASE (vértices em v ≈ 0) e no TOPO (v ≈ max)
      const vMax = verts.reduce((mx, v) => Math.max(mx, v[1]), 0);
      const tol = Math.max(1, vMax * 0.001);
      const baseUs = verts.filter(v => Math.abs(v[1]) < tol).map(v => v[0]);
      const topoUs = verts.filter(v => Math.abs(v[1] - vMax) < tol).map(v => v[0]);
      const larg_base = baseUs.length >= 2 ? (Math.max(...baseUs) - Math.min(...baseUs)) : 0;
      const larg_topo = topoUs.length >= 2 ? (Math.max(...topoUs) - Math.min(...topoUs)) : 0;
      const altura = vMax;

      const roleInfo = roles[i] || { role: 'frontal', idx: i, label: 'Faceta ' + (i+1) };
      facets.push({
        verts:      verts,
        larg_base, larg_topo, altura,
        role:       roleInfo.role,
        idx:        roleInfo.idx,
        label:      roleInfo.label,
        // Sinaliza se o polígono é multi-segmento (mais de 4 vértices)
        multi:      verts.length > 4
      });
    }
    return facets;
  },

  // Calcula posições de emenda usando o mesmo algoritmo do Ruby (calc_emendas)
  // dim: dimensão total (mm); chapa: tamanho da chapa (mm); jt: junta (mm); align: alinhamento
  _calcEmendas2D(dim, chapa, jt, align) {
    if (dim <= chapa + 1) return [];
    const ems = [];
    if (align === 'simetrica') {
      let n = Math.ceil((dim + jt) / (chapa + jt));
      if (n < 2) n = 2;
      const panel_w = (dim - (n - 1) * jt) / n;
      let cur = 0;
      for (let i = 1; i < n; i++) {
        cur += panel_w;
        ems.push(cur);
        cur += jt;
      }
    } else {
      let n_full = Math.floor((dim + jt) / (chapa + jt));
      if (n_full < 1) n_full = 1;
      let widths;
      if (align === 'esquerda') {
        const total = n_full * chapa + (n_full - 1) * jt;
        const side = dim - total - jt;
        widths = (side > 1) ? [side].concat(Array(n_full).fill(chapa)) : Array(n_full).fill(chapa);
      } else if (align === 'direita') {
        const total = n_full * chapa + (n_full - 1) * jt;
        const side = dim - total - jt;
        widths = (side > 1) ? Array(n_full).fill(chapa).concat([side]) : Array(n_full).fill(chapa);
      } else if (align === 'central') {
        const inner_jts = (n_full > 1) ? (n_full - 1) * jt : 0;
        const side_jts = (n_full > 0) ? 2 * jt : 0;
        const side_w = (dim - n_full * chapa - inner_jts - side_jts) / 2;
        widths = (side_w > 1) ? [side_w].concat(Array(n_full).fill(chapa)).concat([side_w]) : Array(n_full).fill(chapa);
      } else {
        widths = Array(n_full).fill(chapa);
      }
      let cur = 0;
      for (let i = 0; i < widths.length - 1; i++) {
        cur += widths[i];
        ems.push(cur);
        cur += jt;
      }
    }
    return ems.filter(e => e > 1 && e < dim - 1);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // INTERAÇÃO DO 2D PLANIFICADO — pan, zoom, tools (Mover/Cortar)
  // (Port direto do Auto-ACM normal, adaptado pra namespace AutoAcmCurvo)
  // ═══════════════════════════════════════════════════════════════════════

  setPlanTool(t) {
    AutoAcmCurvo.state.planTool = t;
    document.querySelectorAll('.aac__tool[data-plan-tool]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.planTool === t);
    });
    const c = document.getElementById('aac_preview2d');
    if (!c) return;
    c.classList.remove('is-moving', 'is-moving-v', 'is-cutting');
    if (t === 'moveH')      c.classList.add('is-moving');
    else if (t === 'moveV') c.classList.add('is-moving-v');
    else if (t === 'cutV' || t === 'cutH') c.classList.add('is-cutting');
  },

  /** Reseta apenas a câmera 2D (zoom + pan), mantendo emendas. */
  planResetView() {
    AutoAcmCurvo.state.zoom2D = 1.0;
    AutoAcmCurvo.state.panX2D = 0;
    AutoAcmCurvo.state.panY2D = 0;
    AutoAcmCurvo.scheduleRedraw2D();
  },

  /** Reseta as emendas customizadas (volta pro cálculo automático). */
  planReset() {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.params) return;
    m.params.planEmH = null;
    m.params.planEmV = null;
    AutoAcmCurvo.scheduleRedraw2D();
  },

  _planGetMouseMM(ev) {
    const c  = document.getElementById('aac_preview2d');
    const xf = AutoAcmCurvo.state.planXform;
    if (!c || !xf) return null;
    const rect = c.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const mmX = (px - xf.ox) / xf.sc;
    const mmY = xf.perimTotal - (py - xf.oy) / xf.sc;
    return { px, py, mmX, mmY };
  },

  _planFindNearestEm(p) {
    const xf = AutoAcmCurvo.state.planXform;
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

  _showPlanTooltip(ev, valMm) {
    let tip = document.getElementById('aac_plan_tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'aac_plan_tooltip';
      tip.className = 'aac__plan-tooltip';
      document.body.appendChild(tip);
    }
    tip.textContent = valMm + ' mm';
    tip.style.left = (ev.clientX + 14) + 'px';
    tip.style.top  = (ev.clientY - 26) + 'px';
    tip.hidden = false;
  },

  _hidePlanTooltip() {
    const tip = document.getElementById('aac_plan_tooltip');
    if (tip) tip.hidden = true;
  },

  planBindMouse() {
    const c = document.getElementById('aac_preview2d');
    if (!c || c._aacBound) return;
    c._aacBound = true;

    // Wheel zoom centrado no mouse
    c.addEventListener('wheel', ev => {
      ev.preventDefault();
      const xf = AutoAcmCurvo.state.planXform;
      if (!xf) return;
      const rect = c.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const oldZ = AutoAcmCurvo.state.zoom2D || 1;
      const factor = ev.deltaY < 0 ? 1.15 : 0.87;
      let newZ = Math.max(0.3, Math.min(8.0, oldZ * factor));
      const k = (newZ / oldZ) - 1;
      AutoAcmCurvo.state.panX2D = (AutoAcmCurvo.state.panX2D || 0) - (mx - xf.ox - (xf.unfoldedW * xf.sc) / 2) * k;
      AutoAcmCurvo.state.panY2D = (AutoAcmCurvo.state.panY2D || 0) - (my - xf.oy - (xf.perimTotal * xf.sc) / 2) * k;
      AutoAcmCurvo.state.zoom2D = newZ;
      AutoAcmCurvo.scheduleRedraw2D();
    }, { passive: false });

    c.addEventListener('mousedown', ev => {
      // Botão do meio OU Shift+esquerdo = pan
      if (ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
        ev.preventDefault();
        AutoAcmCurvo.state.panning2D = true;
        AutoAcmCurvo.state.panLastX  = ev.clientX;
        AutoAcmCurvo.state.panLastY  = ev.clientY;
        c.classList.add('is-panning');
        return;
      }

      const pt  = AutoAcmCurvo._planGetMouseMM(ev);
      const mod = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
      if (!pt || !mod) return;
      const xf = AutoAcmCurvo.state.planXform;
      if (!xf) return;

      const tool = AutoAcmCurvo.state.planTool;
      if (tool === 'moveH' || tool === 'moveV') {
        const hit = AutoAcmCurvo._planFindNearestEm(pt);
        if (hit) {
          if (mod.params.planEmH === null) mod.params.planEmH = xf.emH.slice();
          if (mod.params.planEmV === null) mod.params.planEmV = xf.emV.slice();
          AutoAcmCurvo.state.planDragKind = hit.kind;
          AutoAcmCurvo.state.planDragIdx  = hit.idx;
        }
      } else if (tool === 'cutV') {
        if (pt.mmX > 20 && pt.mmX < xf.unfoldedW - 20) {
          if (mod.params.planEmH === null) mod.params.planEmH = xf.emH.slice();
          mod.params.planEmH.push(Math.round(pt.mmX));
          mod.params.planEmH.sort((a, b) => a - b);
          AutoAcmCurvo.scheduleRedraw2D();
        }
      } else if (tool === 'cutH') {
        if (pt.mmY > 20 && pt.mmY < xf.perimTotal - 20) {
          if (mod.params.planEmV === null) mod.params.planEmV = xf.emV.slice();
          mod.params.planEmV.push(Math.round(pt.mmY));
          mod.params.planEmV.sort((a, b) => a - b);
          AutoAcmCurvo.scheduleRedraw2D();
        }
      }
    });

    c.addEventListener('mousemove', ev => {
      if (AutoAcmCurvo.state.panning2D) {
        const dx = ev.clientX - AutoAcmCurvo.state.panLastX;
        const dy = ev.clientY - AutoAcmCurvo.state.panLastY;
        AutoAcmCurvo.state.panLastX = ev.clientX;
        AutoAcmCurvo.state.panLastY = ev.clientY;
        AutoAcmCurvo.state.panX2D = (AutoAcmCurvo.state.panX2D || 0) + dx;
        AutoAcmCurvo.state.panY2D = (AutoAcmCurvo.state.panY2D || 0) + dy;
        AutoAcmCurvo.scheduleRedraw2D();
        return;
      }

      if (AutoAcmCurvo.state.planDragIdx < 0) return;
      const pt  = AutoAcmCurvo._planGetMouseMM(ev);
      const mod = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
      if (!pt || !mod) return;
      const xf = AutoAcmCurvo.state.planXform;
      if (!xf) return;

      const valMm = (AutoAcmCurvo.state.planDragKind === 'H')
        ? Math.round(pt.mmX) : Math.round(pt.mmY);
      AutoAcmCurvo._showPlanTooltip(ev, valMm);

      if (AutoAcmCurvo.state.planDragKind === 'H') {
        const x = Math.max(20, Math.min(xf.unfoldedW - 20, Math.round(pt.mmX)));
        mod.params.planEmH[AutoAcmCurvo.state.planDragIdx] = x;
        mod.params.planEmH.sort((a, b) => a - b);
        AutoAcmCurvo.state.planDragIdx = mod.params.planEmH.indexOf(x);
      } else if (AutoAcmCurvo.state.planDragKind === 'V') {
        const y = Math.max(20, Math.min(xf.perimTotal - 20, Math.round(pt.mmY)));
        mod.params.planEmV[AutoAcmCurvo.state.planDragIdx] = y;
        mod.params.planEmV.sort((a, b) => a - b);
        AutoAcmCurvo.state.planDragIdx = mod.params.planEmV.indexOf(y);
      }
      AutoAcmCurvo.scheduleRedraw2D();
    });

    const endDrag = () => {
      AutoAcmCurvo.state.planDragIdx  = -1;
      AutoAcmCurvo.state.planDragKind = null;
      AutoAcmCurvo.state.panning2D    = false;
      c.classList.remove('is-panning');
      AutoAcmCurvo._hidePlanTooltip();
    };
    c.addEventListener('mouseup',    endDrag);
    c.addEventListener('mouseleave', endDrag);

    // Right-click numa emenda = prompt numérico (igual ao auto_acm)
    c.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      const pt  = AutoAcmCurvo._planGetMouseMM(ev);
      const mod = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
      const xf  = AutoAcmCurvo.state.planXform;
      if (!pt || !mod || !xf) return;
      const hit = AutoAcmCurvo._planFindNearestEm(pt);
      if (!hit) {
        if (window.Toast) Toast.info('Clique direito sobre uma emenda pra digitar valor exato.', { duration: 2500 });
        return;
      }
      const arr = (hit.kind === 'H') ? xf.emH : xf.emV;
      const cur = arr[hit.idx];
      const max = (hit.kind === 'H') ? xf.unfoldedW : xf.perimTotal;
      const raw = prompt('Posição da emenda (mm, 0–' + max + '):', String(cur));
      if (raw == null) return;
      const v = Math.round(Number(raw));
      if (!Number.isFinite(v) || v < 20 || v > max - 20) {
        if (window.Toast) Toast.error('Valor fora do intervalo válido.');
        return;
      }
      if (hit.kind === 'H') {
        if (mod.params.planEmH === null) mod.params.planEmH = xf.emH.slice();
        mod.params.planEmH[hit.idx] = v;
        mod.params.planEmH.sort((a, b) => a - b);
      } else {
        if (mod.params.planEmV === null) mod.params.planEmV = xf.emV.slice();
        mod.params.planEmV[hit.idx] = v;
        mod.params.planEmV.sort((a, b) => a - b);
      }
      AutoAcmCurvo.scheduleRedraw2D();
    });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PREVIEW 3D — Ferramentas + Adicionar ferragem (port do Auto-ACM normal)
  // ═══════════════════════════════════════════════════════════════════════

  setTool3D(t) {
    AutoAcmCurvo.state.tool3D = t;
    document.querySelectorAll('.aac__tool[data-tool3d]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.tool3d === t);
    });
    const c = document.getElementById('aac_preview3d');
    if (c) {
      c.dataset.tool = t;
      c.classList.remove('is-dragging');
    }
    // Limpa highlight de hover ao trocar de ferramenta (evita realce preso)
    if (AutoAcmCurvo.state.hoverId3D) {
      AutoAcmCurvo.state.hoverId3D = null;
      AutoAcmCurvo.scheduleRedraw3D();
    }
    // Sai do modo "armed" (adicionar) se o usuário trocou pra outra ferramenta
    if (t !== 'add' && AutoAcmCurvo._addState && AutoAcmCurvo._addState.armed) {
      AutoAcmCurvo._addState.armed = false;
      AutoAcmCurvo._addState.ghost = null;
      AutoAcmCurvo.scheduleRedraw3D();
    }
  },

  toggleSym() {
    AutoAcmCurvo.state.sym3D = !AutoAcmCurvo.state.sym3D;
    const el = document.getElementById('aac3d_sym_btn');
    if (el) el.classList.toggle('is-active', AutoAcmCurvo.state.sym3D);
    AutoAcmCurvo.scheduleRedraw3D();
  },

  toggleMagnet() {
    AutoAcmCurvo._addState.magnet = !AutoAcmCurvo._addState.magnet;
    const el = document.getElementById('aac3d_magnet_btn');
    if (el) el.classList.toggle('is-active', AutoAcmCurvo._addState.magnet);
  },

  toggleAddPop(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const pop = document.getElementById('aac3d_add_pop');
    const btn = document.getElementById('aac3d_add_btn');
    if (!pop || !btn) return;
    const open = pop.hasAttribute('hidden');
    if (open) {
      // Só pode adicionar se gerou estrutura
      const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
      if (!m || !m.quant) {
        if (window.Toast) Toast.error('Gere a estrutura primeiro antes de adicionar ferragens.');
        return;
      }
      AutoAcmCurvo._fillAddFaces();
      const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
      const st = AutoAcmCurvo._addState;
      setV('aac3d_add_pw', st.profW);
      setV('aac3d_add_ph', st.profH);
      setChk('aac3d_add_fita', st.fita !== false);
      AutoAcmCurvo._refreshAddPopActiveStates();

      pop.removeAttribute('hidden');
      btn.classList.add('is-active');
      // Fecha ao clicar fora — listener em CLICK (não mousedown, pra não
      // disparar antes do click do form). Idêntico ao Auto-ACM normal.
      setTimeout(() => {
        document.addEventListener('click', AutoAcmCurvo._addPopOutsideHandler);
      }, 0);
    } else {
      AutoAcmCurvo.closeAddPop();
    }
  },

  closeAddPop() {
    const pop = document.getElementById('aac3d_add_pop');
    const btn = document.getElementById('aac3d_add_btn');
    if (pop) pop.setAttribute('hidden', '');
    if (btn) btn.classList.remove('is-active');
    document.removeEventListener('click', AutoAcmCurvo._addPopOutsideHandler);
  },

  _addPopOutsideHandler(ev) {
    const wrap = document.querySelector('.aac__add-wrap');
    if (wrap && !wrap.contains(ev.target)) AutoAcmCurvo.closeAddPop();
  },

  setAddCat(cat) {
    AutoAcmCurvo._addState.cat = cat;
    AutoAcmCurvo._refreshAddPopActiveStates();
  },

  setAddOrient(o) {
    AutoAcmCurvo._addState.orient = o;
    AutoAcmCurvo._refreshAddPopActiveStates();
  },

  _refreshAddPopActiveStates() {
    const st = AutoAcmCurvo._addState;
    document.querySelectorAll('[data-add-cat]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.addCat === st.cat);
    });
    document.querySelectorAll('[data-add-orient]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.addOrient === st.orient);
    });
  },

  /**
   * Popula o <select> com 3 opções: Lateral / Topo / Base.
   * "Lateral" é genérico — o usuário gira o isométrico pra mirar a faceta
   * que quer e clica nela (o clique decide qual faceta, não o dropdown).
   * Topo/Base são caps planos.
   */
  _fillAddFaces() {
    const sel = document.getElementById('aac3d_add_face');
    if (!sel) return;
    const opts = [
      { value: 'lateral', label: 'Lateral' },
      { value: 'topo',    label: 'Topo' },
      { value: 'base',    label: 'Base' }
    ];
    sel.innerHTML = '';
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    // Default: mantém a escolha atual se válida, senão 'lateral'.
    const cur = AutoAcmCurvo._addState.face;
    const valid = opts.some(o => o.value === cur);
    const want = valid ? cur : 'lateral';
    sel.value = want;
    AutoAcmCurvo._addState.face = want;
  },

  /**
   * Confirma o form da popover — ARMA o modo "add" (NÃO salva a peça ainda).
   * Idêntico ao Auto-ACM normal: o usuário precisa CLICAR no preview 3D
   * pra posicionar. ESC ou clique direito cancela.
   */
  confirmAdd() {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.params) {
      if (window.Toast) Toast.error('Selecione um módulo antes de adicionar ferragens.');
      return;
    }
    const pwEl = document.getElementById('aac3d_add_pw');
    const phEl = document.getElementById('aac3d_add_ph');
    const pw = parseInt(pwEl && pwEl.value, 10);
    const ph = parseInt(phEl && phEl.value, 10);
    if (!pw || !ph || pw < 5 || ph < 5 || pw > 200 || ph > 200) {
      if (window.Toast) Toast.error('Informe largura e altura válidas (5-200 mm).');
      return;
    }
    AutoAcmCurvo._addState.profW = pw;
    AutoAcmCurvo._addState.profH = ph;
    const faceSel = document.getElementById('aac3d_add_face');
    if (faceSel && faceSel.value) AutoAcmCurvo._addState.face = faceSel.value;
    const fitaEl = document.getElementById('aac3d_add_fita');
    AutoAcmCurvo._addState.fita = !!(fitaEl && fitaEl.checked);

    // ARMA — não salva ainda. O usuário clica no 3D pra posicionar.
    AutoAcmCurvo._addState.armed = true;

    // Ghost inicial centrado na 1ª facet com role compatível, pra dar feedback
    // visual imediato sem precisar mover o mouse (igual ao normal, que mostra
    // o fantasma assim que o cursor entra no canvas).
    const st_add = AutoAcmCurvo._addState;
    AutoAcmCurvo._addState.ghost = {
      cat:    st_add.cat,
      orient: st_add.orient,
      face:   st_add.face || 'frontal',
      profW:  st_add.profW,
      profH:  st_add.profH,
      posU:   0.5,
      posV:   0.5
    };

    AutoAcmCurvo.closeAddPop();
    AutoAcmCurvo.setTool3D('add');
    AutoAcmCurvo.scheduleRedraw3D();

    if (window.Toast) {
      Toast.info('Mova o mouse sobre o preview pra posicionar e clique pra confirmar. ESC cancela.', { duration: 3500 });
    }
  },

  /** Cancela o modo Adicionar (volta pra orbit). */
  cancelAdd() {
    AutoAcmCurvo._addState.armed = false;
    AutoAcmCurvo._addState.ghost = null;
    AutoAcmCurvo.setTool3D('orbit');
    AutoAcmCurvo.scheduleRedraw3D();
  },

  /**
   * Handler do clique no canvas 3D quando o modo Adicionar está armed.
   * Faz hit-test contra as facetas projetadas, identifica qual foi clicada,
   * computa posU/posV aproximados via bbox da projeção, salva a peça,
   * RE-GERA A ESTRUTURA NO SKETCHUP NA HORA (idêntico ao Auto-ACM normal
   * que chama autoacm_aplicar_edicoes), e desarma.
   */
  async _handleAddClick3D(ev) {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m) return;
    const c = document.getElementById('aac_preview3d');
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;

    const st = AutoAcmCurvo.state.lastSt3D;
    if (!st) {
      if (window.Toast) Toast.error('Aguarde o preview 3D carregar.');
      return;
    }

    // Acha a facet com role == _addState.face que contém o clique
    const env = m.envelope || {};
    const base = env.base || [];
    const topo = env.topo || [];
    const polys = env.polygons || [];
    const roles = env.roles || [];
    const N = Math.min(base.length, topo.length);
    if (N < 3) {
      if (window.Toast) Toast.error('Envelope vazio. Capture um módulo.');
      return;
    }

    const targetFace = AutoAcmCurvo._addState.face;
    const st_add = AutoAcmCurvo._addState;
    // NaN-safe: inverseBilinear pode devolver NaN em vistas de viés (cap).
    // NaN no posU/posV vira null no JSON → Ruby usa 0.5 (desenha certo no SU),
    // mas o NaN ficava no JS e sumia do preview. Coage não-finito pra 0.5.
    const clampP = v => { v = Number(v); if (!isFinite(v)) v = 0.5; return Math.max(0.02, Math.min(0.98, v)); };

    // Hit normalizado: { face, facetIdx, posU, posV }. Caps (topo/base) vão
    // por uma rota; laterais por outra — mas AMBOS usam o mesmo ponto que o
    // ghost mostra (via _cursorBoxCurvo / mesmo hit-test).
    let hit = null;

    if (targetFace === 'topo' || targetFace === 'base') {
      // CAP: reaproveita a lógica de cap do _cursorBoxCurvo pra posU/posV.
      const cap = AutoAcmCurvo._cursorBoxCurvo(m, px, py);
      if (!cap) {
        if (window.Toast) Toast.warning('Clique sobre o topo/base da estrutura no preview 3D.');
        return;
      }
      hit = { face: targetFace, facetIdx: -1, posU: cap.posU, posV: cap.posV };
    } else {
      // LATERAL: faceta SOB O CURSOR, escolhendo a mais à FRENTE (menor
      // profundidade projetada). Sem break no 1º match — facetas de trás
      // podem vir antes na array e roubar o clique (bug esq/dir). Idêntico
      // ao hit-test do ghost — peça cai exatamente onde o fantasma mostra.
      const inPoly = AutoAcmCurvo._pointInPolygon2D;
      let best = null, bestDepth = -Infinity;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        let poly3D = polys[i];
        if (!Array.isArray(poly3D) || poly3D.length < 3) {
          poly3D = [base[i], base[j], topo[j], topo[i]];
        }
        const projP = poly3D.map(pt => AutoAcmCurvo._proj3D(pt[0], pt[1], pt[2], st));
        const poly2D = projP.map(p => [p.x, p.y]);
        if (!inPoly(px, py, poly2D)) continue;
        const avgD = projP.reduce((s, p) => s + p.d, 0) / projP.length;
        if (avgD <= bestDepth) continue;   // faceta que o usuário mira (lado visível)
        bestDepth = avgD;
        const bL = AutoAcmCurvo._proj3D(base[i][0], base[i][1], base[i][2], st);
        const bR = AutoAcmCurvo._proj3D(base[j][0], base[j][1], base[j][2], st);
        const tL = AutoAcmCurvo._proj3D(topo[i][0], topo[i][1], topo[i][2], st);
        const tR = AutoAcmCurvo._proj3D(topo[j][0], topo[j][1], topo[j][2], st);
        const uv = AutoAcmCurvo._inverseBilinear2D(px, py, bL, bR, tR, tL);
        best = { idx: i, posU: uv.u, posV: uv.v, role: (roles[i] && roles[i].role) || 'frontal' };
      }
      if (!best) {
        if (window.Toast) Toast.warning('Clique sobre uma face da estrutura no preview 3D.');
        return;
      }
      hit = { face: best.role, facetIdx: best.idx, posU: best.posU, posV: best.posV };
    }

    // Salva a peça
    AutoAcmCurvo._pushHistory(m);       // snapshot pré-adição (pro desfazer)
    if (!Array.isArray(m.params.customPieces)) m.params.customPieces = [];
    const piece = {
      id:      'cp_' + Date.now() + '_' + Math.floor(Math.random()*1000),
      cat:     st_add.cat,
      orient:  st_add.orient,
      face:    hit.face,        // rótulo/roteamento (caps topo/base)
      facetIdx: hit.facetIdx,   // índice EXATO da faceta — fonte de verdade do placement lateral
      profW:   st_add.profW,
      profH:   st_add.profH,
      fita:    st_add.fita,
      sym:     !!AutoAcmCurvo.state.sym3D,
      posU:    clampP(hit.posU),
      posV:    clampP(hit.posV)
    };
    m.params.customPieces.push(piece);

    // bug#1: PERMANECE ARMADO. Adiciona quantas peças quiser; sai do modo
    // trocando de ferramenta (Orbit/Tesoura) ou apertando ESC.

    AutoAcmCurvo._renderCustomPiecesList();
    AutoAcmCurvo.scheduleRedraw3D();
    AutoAcmCurvo._scheduleSave();

    // ADICIONA INCREMENTALMENTE no SketchUp — mirror do autoacm_aplicar_edicoes
    // do normal. Não regenera a estrutura: só desenha a peça nova em
    // EST_Metalon (e fita em FITA_DF se ligado). Rápido + isolado.
    try {
      const r = await Bridge.call('autoacm_curvo_adicionar_peca', {
        entity_id: m.entity_id,
        piece:     piece,
        params:    m.params
      });
      if (r && r.ok) {
        if (!m.quant) m.quant = {};
        if (Array.isArray(r.pecas_3d)) {
          // PREFERIDO: estrutura inteira re-coletada do modelo (captura
          // geometria multi-segmento, ex: emenda vertical calandrada seguindo
          // a curva). Substitui o array — preview == SketchUp, ids consistentes.
          m.quant.pecas_3d = r.pecas_3d;
          if (r.origin) m.origin = r.origin;
        } else if (Array.isArray(r.pecas_added) && r.pecas_added.length) {
          // Fallback (Ruby antigo): anexa só as peças desenhadas.
          if (!Array.isArray(m.quant.pecas_3d)) m.quant.pecas_3d = [];
          piece._pecaIds = [];
          r.pecas_added.forEach(pc => {
            const tag = piece.id + '_' + (pc.nome || '');
            pc.cpId = tag;
            m.quant.pecas_3d.push(pc);
            piece._pecaIds.push(tag);
          });
        }
        AutoAcmCurvo.scheduleRedraw3D();
        if (window.Toast) Toast.success('Ferragem ' + piece.profW + '×' + piece.profH + ' adicionada · ' + (piece.orient==='v'?'vertical':'horizontal') + ' · clique pra adicionar outra (Orbit/ESC sai)');
      } else {
        // Rollback do preview: remove a peça da lista local pra ficar consistente
        // com o que o SU tem (já que Ruby não conseguiu desenhar).
        m.params.customPieces = m.params.customPieces.filter(pp => pp.id !== piece.id);
        if (Array.isArray(m.history)) m.history.pop();   // edição não aplicou
        AutoAcmCurvo._refreshUndoBtn();
        AutoAcmCurvo._renderCustomPiecesList();
        AutoAcmCurvo.scheduleRedraw3D();
        AutoAcmCurvo._scheduleSave();
        const detail = r ? (r.error || r.code || JSON.stringify(r)) : 'sem resposta';
        if (window.Toast) Toast.error('Erro ao adicionar peça: ' + detail);
        console.error('[AutoAcmCurvo] adicionar_peca falhou:', r);
      }
    } catch (e) {
      // Rollback do preview também em falha de comunicação
      m.params.customPieces = m.params.customPieces.filter(pp => pp.id !== piece.id);
      if (Array.isArray(m.history)) m.history.pop();
      AutoAcmCurvo._refreshUndoBtn();
      AutoAcmCurvo._renderCustomPiecesList();
      AutoAcmCurvo.scheduleRedraw3D();
      AutoAcmCurvo._scheduleSave();
      if (window.Toast) Toast.error('Falha de comunicação: ' + e.message);
    }
  },

  /** Point-in-polygon 2D (ray casting). polygon = [[x,y], ...] */
  _pointInPolygon2D(px, py, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > py) !== (yj > py)) &&
                        (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER + HIT-TEST das custom pieces no canvas 3D
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Computa endpoints 3D do eixo de uma peça (posicionada numa facet).
   * Retorna {start3D, end3D, facetIdx, found} ou null.
   *
   *  - orient='h' → linha do bL_at_v até bR_at_v (faixa horizontal).
   *  - orient='v' → linha do bottom_at_u até top_at_u (faixa vertical).
   */
  _pieceAxis3D(piece, m) {
    const env = m && m.envelope;
    if (!env) return null;
    const base = env.base || [];
    const topo = env.topo || [];
    const roles = env.roles || [];
    const N = Math.min(base.length, topo.length);
    if (N < 3) return null;
    const targetRole = piece.face || 'frontal';

    // ── Caps planas (topo/base) ────────────────────────────────────────
    if (targetRole === 'topo' || targetRole === 'base') {
      const ring = targetRole === 'topo' ? topo : base;
      if (ring.length < 3) return null;
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      ring.forEach(p => {
        if (p[0] < xMin) xMin = p[0];
        if (p[0] > xMax) xMax = p[0];
        if (p[1] < yMin) yMin = p[1];
        if (p[1] > yMax) yMax = p[1];
      });
      const zCap = ring.reduce((s, p) => s + p[2], 0) / ring.length;
      const posU = (piece.posU != null) ? piece.posU : 0.5;
      const posV = (piece.posV != null) ? piece.posV : 0.5;
      // Convenção: orient='v' → peça corre ao longo de Y (em X fixo);
      //            orient='h' → peça corre ao longo de X (em Y fixo).
      const xAt = xMin + posU * (xMax - xMin);
      const yAt = yMin + posV * (yMax - yMin);
      let s3, e3;
      if (piece.orient === 'h') {
        s3 = [xMin, yAt, zCap];
        e3 = [xMax, yAt, zCap];
      } else {
        s3 = [xAt, yMin, zCap];
        e3 = [xAt, yMax, zCap];
      }
      return { start3D: s3, end3D: e3, facetIdx: -1, role: targetRole };
    }

    // Laterais: usa o índice EXATO salvo na peça (index-based). Sem
    // re-casar por role — o índice é a fonte de verdade, igual ao Ruby.
    const lerp3 = (a, b, t) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
    const drawAtFacet = (i) => {
      const j = (i + 1) % N;
      const bL = base[i], bR = base[j], tL = topo[i], tR = topo[j];
      if (!bL || !bR || !tL || !tR) return null;
      const posU = (piece.posU != null) ? piece.posU : 0.5;
      const posV = (piece.posV != null) ? piece.posV : 0.5;
      let s3, e3;
      if (piece.orient === 'h') {
        s3 = lerp3(bL, tL, posV);
        e3 = lerp3(bR, tR, posV);
      } else {
        s3 = lerp3(bL, bR, posU);
        e3 = lerp3(tL, tR, posU);
      }
      return { start3D: s3, end3D: e3, facetIdx: i, role: (roles[i] && roles[i].role) || targetRole };
    };

    // Caminho principal: facetIdx salvo na peça.
    if (piece.facetIdx != null && piece.facetIdx >= 0 && piece.facetIdx < N) {
      const r = drawAtFacet(piece.facetIdx);
      if (r) return r;
    }
    // Fallback legado (peças antigas sem facetIdx): 1ª facet com role compatível.
    for (let i = 0; i < N; i++) {
      const r = (roles[i] && roles[i].role) || 'frontal';
      if (r !== targetRole) continue;
      const out = drawAtFacet(i);
      if (out) return out;
    }
    return null;
  },

  /**
   * Retorna os 4 cantos 3D da FAIXA (ribbon) de uma peça — pra desenhar como
   * polígono preenchido no preview (em vez de uma linha fina que se perde).
   * Lateral: usa facetIdx; faixa de largura profW ao longo do eixo da peça.
   * Cap (topo/base): faixa no plano do anel.
   * Retorna array [[x,y,z]×4] ou null.
   */
  _pieceQuad3D(piece, m) {
    const env = m && m.envelope;
    if (!env) return null;
    const base = env.base || [];
    const topo = env.topo || [];
    const roles = env.roles || [];
    const N = Math.min(base.length, topo.length);
    if (N < 3) return null;
    const targetRole = piece.face || 'frontal';
    const profW = (piece.profW != null) ? piece.profW : 20;
    const posU = (piece.posU != null) ? piece.posU : 0.5;
    const posV = (piece.posV != null) ? piece.posV : 0.5;
    const lerp3 = (a, b, t) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
    const dist3 = (a, b) => Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]);

    // ── Caps planas (topo/base) ──
    if (targetRole === 'topo' || targetRole === 'base') {
      const ring = targetRole === 'topo' ? topo : base;
      if (ring.length < 3) return null;
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      ring.forEach(p => {
        if (p[0] < xMin) xMin = p[0]; if (p[0] > xMax) xMax = p[0];
        if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1];
      });
      const zCap = ring.reduce((s, p) => s + p[2], 0) / ring.length;
      const w = xMax - xMin, d = yMax - yMin;
      const halfW = profW / 2;
      if (piece.orient === 'h') {
        const yAt = yMin + posV * d;
        return [[xMin, yAt-halfW, zCap], [xMax, yAt-halfW, zCap], [xMax, yAt+halfW, zCap], [xMin, yAt+halfW, zCap]];
      } else {
        const xAt = xMin + posU * w;
        return [[xAt-halfW, yMin, zCap], [xAt-halfW, yMax, zCap], [xAt+halfW, yMax, zCap], [xAt+halfW, yMin, zCap]];
      }
    }

    // ── Lateral por facetIdx (fallback: 1ª faceta do role) ──
    let i = (piece.facetIdx != null && piece.facetIdx >= 0 && piece.facetIdx < N) ? piece.facetIdx : -1;
    if (i < 0) {
      for (let k = 0; k < N; k++) {
        const r = (roles[k] && roles[k].role) || 'frontal';
        if (r === targetRole) { i = k; break; }
      }
    }
    if (i < 0) return null;
    const j = (i + 1) % N;
    const bL = base[i], bR = base[j], tL = topo[i], tR = topo[j];
    if (!bL || !bR || !tL || !tR) return null;
    const bilerp = (u, v) => {
      const bot = lerp3(bL, bR, u);
      const top = lerp3(tL, tR, u);
      return lerp3(bot, top, v);
    };
    if (piece.orient === 'h') {
      // faixa horizontal: corre na largura (u 0→1), espessura profW na altura (v)
      const facetH = (dist3(bL, tL) + dist3(bR, tR)) / 2 || 1;
      const dv = Math.min(0.96, profW / facetH);
      const v0 = Math.max(0, posV - dv/2), v1 = Math.min(1, posV + dv/2);
      return [bilerp(0, v0), bilerp(1, v0), bilerp(1, v1), bilerp(0, v1)];
    } else {
      // faixa vertical: corre na altura (v 0→1), espessura profW na largura (u)
      const facetW = (dist3(bL, bR) + dist3(tL, tR)) / 2 || 1;
      const du = Math.min(0.96, profW / facetW);
      const u0 = Math.max(0, posU - du/2), u1 = Math.min(1, posU + du/2);
      return [bilerp(u0, 0), bilerp(u1, 0), bilerp(u1, 1), bilerp(u0, 1)];
    }
  },

  /**
   * Extruda a faixa da peça (_pieceQuad3D) por profH pra formar uma CAIXA
   * de 8 vértices (4 na superfície + 4 extrudados). Lateral: extruda pra
   * dentro (normal da faceta → centro). Topo: pra baixo. Base: pra cima.
   * Retorna array de 8 [x,y,z] (0-3 superfície, 4-7 extrudado) ou null.
   */
  _pieceBoxVerts(piece, m) {
    const quad = AutoAcmCurvo._pieceQuad3D(piece, m);
    if (!quad) return null;
    const profH = (piece.profH != null) ? piece.profH : 20;
    const targetRole = piece.face || 'frontal';
    let tvec;
    if (targetRole === 'topo' || targetRole === 'base') {
      tvec = [0, 0, (targetRole === 'topo') ? -profH : profH];
    } else {
      // Normal da faixa (cross dos lados) → aponta pra dentro (centro do bbox).
      const a = quad[0], b = quad[1], d = quad[3];
      const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
      const e2 = [d[0]-a[0], d[1]-a[1], d[2]-a[2]];
      let nx = e1[1]*e2[2] - e1[2]*e2[1];
      let ny = e1[2]*e2[0] - e1[0]*e2[2];
      let nz = e1[0]*e2[1] - e1[1]*e2[0];
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const qcx = (quad[0][0]+quad[1][0]+quad[2][0]+quad[3][0]) / 4;
      const qcy = (quad[0][1]+quad[1][1]+quad[2][1]+quad[3][1]) / 4;
      const cX = (m.w || 0) / 2, cY = (m.d || 0) / 2;
      if (nx*(cX - qcx) + ny*(cY - qcy) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      tvec = [nx*profH, ny*profH, nz*profH];
    }
    const back = quad.map(p => [p[0]+tvec[0], p[1]+tvec[1], p[2]+tvec[2]]);
    return [quad[0], quad[1], quad[2], quad[3], back[0], back[1], back[2], back[3]];
  },

  /**
   * Cria 1 caixa sólida por peça custom e empurra em `polys` no mesmo formato
   * das peças geradas {verts, faces, ly} — assim renderizam idênticas no allF.
   */
  _appendCustomPieceBoxes(m, polys) {
    const pieces = (m && m.params && Array.isArray(m.params.customPieces)) ? m.params.customPieces : [];
    if (!pieces.length) return;
    const boxFaces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,4,7,3],[1,2,6,5]];
    pieces.forEach((piece, i) => {
      const verts = AutoAcmCurvo._pieceBoxVerts(piece, m);
      if (!verts) return;
      const ly = (piece.cat === 'em') ? 'emenda' : 'metalon';
      polys.push({ verts, faces: boxFaces, ly, id: 'custom_' + i, nome: piece.id, custom: true });
    });
  },

  /**
   * Dado screen (mx,my), encontra a facet sob o cursor (preferindo a face do
   * popover) e retorna um "ghost piece" pronto pra desenhar via _pieceAxis3D.
   * Equivalente curvo do _cursorBox do Auto-ACM normal.
   */
  _cursorBoxCurvo(m, mx, my) {
    if (!m || !m.envelope) return null;
    const env = m.envelope;
    const base = env.base || [];
    const topo = env.topo || [];
    const roles = env.roles || [];
    const polys = env.polygons || [];
    const N = Math.min(base.length, topo.length);
    if (N < 3) return null;
    const st = AutoAcmCurvo.state.lastSt3D;
    if (!st) return null;

    const st_add = AutoAcmCurvo._addState;
    const targetFace = st_add.face || 'frontal';
    // NaN-safe (inverseBilinear pode devolver NaN em vistas de viés).
    const clamp = v => { v = Number(v); if (!isFinite(v)) v = 0.5; return Math.max(0.02, Math.min(0.98, v)); };

    // ── 1) Caps planas (topo/base) ──────────────────────────────────────
    // Topo e base não têm entradas em env.roles porque o Ruby só rotula
    // as facetas laterais. Aqui as tratamos como faces virtuais cujo
    // polígono é o anel base[] ou topo[]. Posicionamento via bbox em XY.
    if (targetFace === 'topo' || targetFace === 'base') {
      const ring = targetFace === 'topo' ? topo : base;
      if (ring.length < 3) return null;
      // Bbox em XY (assumindo cap aprox horizontal alinhado a XY)
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      ring.forEach(p => {
        if (p[0] < xMin) xMin = p[0];
        if (p[0] > xMax) xMax = p[0];
        if (p[1] < yMin) yMin = p[1];
        if (p[1] > yMax) yMax = p[1];
      });
      const w = xMax - xMin, d = yMax - yMin;
      if (w < 50 || d < 50) return null;

      // Cursor → mundo XY via _unproject2D no plano z = média do anel.
      // Como o cap é flat-z, podemos resolver com _proj3D inverso:
      // procura por busca binária no XY do bbox. Mais simples e robusto:
      // amostra o cursor por inverso bilinear num quad XY do bbox do cap
      // (4 cantos do bbox em z = z_cap), projetados na tela.
      const zCap = ring.reduce((s, p) => s + p[2], 0) / ring.length;
      const corners = [
        [xMin, yMin, zCap],
        [xMax, yMin, zCap],
        [xMax, yMax, zCap],
        [xMin, yMax, zCap]
      ];
      const proj = corners.map(c => AutoAcmCurvo._proj3D(c[0], c[1], c[2], st));
      // Hit-test contra o polígono real do cap (não o bbox), pra não pegar
      // cursor fora do anel mas dentro do bbox.
      const ringProj = ring.map(p => AutoAcmCurvo._proj3D(p[0], p[1], p[2], st));
      const poly2D = ringProj.map(p => [p.x, p.y]);
      if (!AutoAcmCurvo._pointInPolygon2D(mx, my, poly2D)) {
        // Cursor fora do cap → mantém ghost no centro do bbox
        return {
          cat: st_add.cat, orient: st_add.orient, face: targetFace,
          profW: st_add.profW, profH: st_add.profH,
          posU: 0.5, posV: 0.5
        };
      }
      // Dentro do cap: usa inverso bilinear do bbox-quad pra mapear cursor → UV.
      const uv = AutoAcmCurvo._inverseBilinear2D(mx, my, proj[0], proj[1], proj[2], proj[3]);
      return {
        cat: st_add.cat, orient: st_add.orient, face: targetFace,
        profW: st_add.profW, profH: st_add.profH,
        posU: clamp(uv.u), posV: clamp(uv.v)
      };
    }

    // ── 2) Facetas laterais — faceta SOB O CURSOR (role-agnóstico) ──────
    // Não filtra por role do dropdown: o cursor decide a faceta. Retorna
    // facetIdx pra que _pieceAxis3D renderize o ghost EXATAMENTE nessa
    // faceta (igual ao placement). Isso elimina a inversão esq/dir, que
    // vinha de renderizar na 1ª faceta do role em vez da faceta do cursor.
    let bestInside = null, bestInsideDepth = -Infinity;
    let bestOutside = null, bestOutsideDist = Infinity;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      let poly3D = polys[i];
      if (!Array.isArray(poly3D) || poly3D.length < 3) {
        poly3D = [base[i], base[j], topo[j], topo[i]];
      }
      const projP = poly3D.map(pt => AutoAcmCurvo._proj3D(pt[0], pt[1], pt[2], st));
      const poly2D = projP.map(p => [p.x, p.y]);
      const bL = AutoAcmCurvo._proj3D(base[i][0], base[i][1], base[i][2], st);
      const bR = AutoAcmCurvo._proj3D(base[j][0], base[j][1], base[j][2], st);
      const tL = AutoAcmCurvo._proj3D(topo[i][0], topo[i][1], topo[i][2], st);
      const tR = AutoAcmCurvo._proj3D(topo[j][0], topo[j][1], topo[j][2], st);
      const uv = AutoAcmCurvo._inverseBilinear2D(mx, my, bL, bR, tR, tL);
      const role = (roles[i] && roles[i].role) || 'frontal';
      if (AutoAcmCurvo._pointInPolygon2D(mx, my, poly2D)) {
        // Entre as facetas sob o cursor, escolhe a do LADO VISÍVEL que o
        // usuário mira (mesmo critério do clique). Sem isso, a faceta oposta
        // (de trás) roubava o ghost e a peça caía na lateral errada.
        const avgD = projP.reduce((s, p) => s + p.d, 0) / projP.length;
        if (avgD > bestInsideDepth) {
          bestInsideDepth = avgD;
          bestInside = { idx: i, posU: uv.u, posV: uv.v, role: role };
        }
      } else {
        const cx2 = (bL.x + bR.x + tL.x + tR.x) / 4;
        const cy2 = (bL.y + bR.y + tL.y + tR.y) / 4;
        const d = Math.hypot(mx - cx2, my - cy2);
        if (d < bestOutsideDist) {
          bestOutsideDist = d;
          bestOutside = { idx: i, posU: uv.u, posV: uv.v, role: role };
        }
      }
    }
    const best = bestInside || bestOutside;
    if (!best) return null;
    return {
      cat:     st_add.cat,
      orient:  st_add.orient,
      face:    best.role,
      facetIdx: best.idx,
      profW:   st_add.profW,
      profH:   st_add.profH,
      posU:    clamp(best.posU),
      posV:    clamp(best.posV)
    };
  },

  /**
   * Desenha o ghost da peça em modo Adicionar — halo translúcido + linha
   * tracejada + label. Visualmente segue a convenção do _drawCustomPieces3D
   * (linha colorida) porém transparente.
   */
  _drawGhostPiece(ctx, m, st) {
    const g = AutoAcmCurvo._addState.ghost;
    if (!g) return;
    const quad = AutoAcmCurvo._pieceQuad3D(g, m);
    if (!quad) return;
    const proj = quad.map(c => AutoAcmCurvo._proj3D(c[0], c[1], c[2], st));
    const isEm   = g.cat === 'em';
    const accent = isEm ? 'rgba(217, 119, 6, 0.95)' : 'rgba(37, 99, 235, 0.95)';
    const fill   = isEm ? 'rgba(217, 119, 6, 0.30)' : 'rgba(37, 99, 235, 0.30)';
    ctx.save();
    // faixa translúcida (mesma forma da peça que será fixada)
    ctx.beginPath();
    proj.forEach((p, k) => k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    const cx = proj.reduce((s, p) => s + p.x, 0) / proj.length;
    const cy = proj.reduce((s, p) => s + p.y, 0) / proj.length;
    // label
    const orientGlyph = g.orient === 'v' ? '↕' : '↔';
    const label = orientGlyph + ' ' + g.profW + '×' + g.profH;
    ctx.font = 'bold 10px "Geist Mono", monospace';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(23, 23, 23, 0.92)';
    ctx.fillRect(cx - tw/2 - 5, cy + 12, tw + 10, 16);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 20);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.restore();
  },

  /**
   * Desenha cada peça custom como linha colorida no canvas 3D, com badge ID.
   * Cor por tipo: emerald = estrutura (met), amber = emenda (em).
   */
  _drawCustomPieces3D(ctx, m, st) {
    // No-op: a peça adicionada é renderizada como SÓLIDO via m.quant.pecas_3d
    // (geometria real devolvida pelo Ruby em adicionar_peca), idêntico à
    // estrutura. Sem overlay de faixa plana e sem labels.
  },

  /**
   * Hit-test 2D: encontra peça mais próxima do clique no canvas 3D.
   * Retorna { piece, idx, dist, axis } ou null.
   */
  _hitTestCustomPiece(px, py, maxDist) {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.params) return null;
    const pieces = Array.isArray(m.params.customPieces) ? m.params.customPieces : [];
    if (!pieces.length) return null;
    const st = AutoAcmCurvo.state.lastSt3D;
    if (!st) return null;
    const limit = maxDist || 14;
    let best = null;
    pieces.forEach((piece, idx) => {
      const ax = AutoAcmCurvo._pieceAxis3D(piece, m);
      if (!ax) return;
      const a = AutoAcmCurvo._proj3D(ax.start3D[0], ax.start3D[1], ax.start3D[2], st);
      const b = AutoAcmCurvo._proj3D(ax.end3D[0],   ax.end3D[1],   ax.end3D[2],   st);
      const d = AutoAcmCurvo._distPointToSeg2D(px, py, a.x, a.y, b.x, b.y);
      if (d <= limit && (!best || d < best.dist)) {
        best = { piece, idx, dist: d, axis: ax, a, b };
      }
    });
    return best;
  },

  /**
   * Drag de peça (Mover H/V): atualiza posU ou posV via hit-test contra
   * a facet onde a peça vive, reaproveitando o inverso bilinear.
   */
  _handleMovePieceDrag(ev, mp) {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.params) return;
    const pieces = m.params.customPieces || [];
    const piece = pieces.find(p => p.id === mp.id);
    if (!piece) return;
    const env = m.envelope || {};
    const base = env.base || [];
    const topo = env.topo || [];
    const roles = env.roles || [];
    const st = AutoAcmCurvo.state.lastSt3D;
    if (!st) return;
    const c = document.getElementById('aac_preview3d');
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;

    // Acha facet com role da peça
    const N = Math.min(base.length, topo.length);
    let bL, bR, tL, tR;
    for (let i = 0; i < N; i++) {
      const r = (roles[i] && roles[i].role) || 'frontal';
      if (r !== piece.face) continue;
      const j = (i + 1) % N;
      bL = base[i]; bR = base[j]; tL = topo[i]; tR = topo[j];
      break;
    }
    if (!bL) return;

    // Projeta 4 cantos e usa inverso bilinear pra estimar (u,v)
    const pA = AutoAcmCurvo._proj3D(bL[0], bL[1], bL[2], st);
    const pB = AutoAcmCurvo._proj3D(bR[0], bR[1], bR[2], st);
    const pC = AutoAcmCurvo._proj3D(tR[0], tR[1], tR[2], st);
    const pD = AutoAcmCurvo._proj3D(tL[0], tL[1], tL[2], st);
    const uv = AutoAcmCurvo._inverseBilinear2D(px, py, pA, pB, pC, pD);
    const clamp = v => Math.max(0.02, Math.min(0.98, v));

    if (mp.kind === 'moveH') {
      // Move ao longo de U (horizontal). Pra orient='h', a barra é horizontal
      // (faixa em V constante); então moveH ajusta a faixa em U? Não faz
      // sentido pra orient='h'. Pra orient='v' (vertical), moveH ajusta posU.
      // Convenção: moveH atualiza posU; moveV atualiza posV. Funciona pros
      // 2 orient — só "deita" o eixo da peça em direções diferentes.
      piece.posU = clamp(uv.u);
    } else if (mp.kind === 'moveV') {
      piece.posV = clamp(uv.v);
    }
    AutoAcmCurvo.scheduleRedraw3D();
  },

  /** Distância de um ponto a um segmento 2D. */
  _distPointToSeg2D(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx*dx + dy*dy;
    if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx, qy = ay + t * dy;
    return Math.hypot(px - qx, py - qy);
  },

  // ══════════════════════════════════════════════════════════════════════
  // TESOURA / MOVER na ESTRUTURA GERADA — espelho do Auto-ACM normal.
  // Hit-test contra hitRects3D (montados no render), edição via callback
  // Ruby autoacm_curvo_aplicar_edicoes (erase!/transform! direto, sem regen).
  // ══════════════════════════════════════════════════════════════════════

  /** Converte um offset {mode,delta} + eixo da peça em vetor [dx,dy,dz] mm.
   *  mode 'V' → eixo Z; 'H' → perpendicular ao comprimento no plano XY. */
  _ofsVec(ofs, eixo) {
    const mode = ofs.mode, delta = ofs.delta || 0;
    let dx = 0, dy = 0, dz = 0;
    if (mode === 'V') {
      dz = delta;
    } else {
      if (eixo === 'x')      dy = delta;
      else if (eixo === 'y') dx = delta;
      else                   dx = delta;
    }
    return [dx, dy, dz];
  },

  /** Hit-test da estrutura: peça visível mais próxima (menor profundidade). */
  _hitTest3D(mx, my) {
    const rects = AutoAcmCurvo.state.hitRects3D || [];
    const cands = [];
    rects.forEach(r => {
      if (mx < r.minX || mx > r.maxX || my < r.minY || my > r.maxY) return;
      let inside = false;
      for (let i = 0; i < r.faces.length; i++) {
        if (AutoAcmCurvo._pointInPoly3D(mx, my, r.faces[i])) { inside = true; break; }
      }
      if (!inside) return;
      cands.push(r);
    });
    if (!cands.length) return null;
    cands.sort((a, b) => a.zdepth - b.zdepth);
    return cands[0];
  },

  /** Ponto-em-polígono 2D (ray casting). poly = [{x,y}, ...]. */
  _pointInPoly3D(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  /** Tesoura: deleta a peça da estrutura via callback Ruby. */
  async _aplicarCutCurvo(item) {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.quant) return;
    AutoAcmCurvo._pushHistory(m);       // snapshot pré-corte (pro desfazer)
    if (!m.edits) m.edits = { del: {}, ofs: {} };
    m.edits.del[item.id] = true;
    AutoAcmCurvo.scheduleRedraw3D();   // feedback imediato (some na hora)
    try {
      const r = await Bridge.call('autoacm_curvo_aplicar_edicoes', {
        entity_id: m.entity_id,
        del_ids:   [item.id],
        ofs_list:  []
      });
      if (r && r.ok) {
        if (r.pecas_3d) m.quant.pecas_3d = r.pecas_3d;
        if (r.origin) m.origin = r.origin;
        delete m.edits.del[item.id];   // bakeado no modelo + pecas_3d re-numerado
        AutoAcmCurvo.scheduleRedraw3D();
        if (window.Toast) Toast.success('Peça removida.', { duration: 1800 });
      } else {
        delete m.edits.del[item.id];
        if (Array.isArray(m.history)) m.history.pop();   // edição não aplicou
        AutoAcmCurvo._refreshUndoBtn();
        AutoAcmCurvo.scheduleRedraw3D();
        if (window.Toast) Toast.error('Erro ao remover' + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      delete m.edits.del[item.id];
      if (Array.isArray(m.history)) m.history.pop();
      AutoAcmCurvo._refreshUndoBtn();
      AutoAcmCurvo.scheduleRedraw3D();
      if (window.Toast) Toast.error('Erro: ' + e.message);
    }
  },

  /** Mover: aplica o deslocamento da peça via callback Ruby. */
  async _aplicarMoveCurvo(item, delta, mode) {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.quant) return;
    const eixo = item.eixo || 'z';
    let dx = 0, dy = 0, dz = 0;
    if (mode === 'V') { dz = delta; }
    else { if (eixo === 'x') dy = delta; else if (eixo === 'y') dx = delta; else dx = delta; }

    AutoAcmCurvo._pushHistory(m);       // snapshot pré-move (pro desfazer)

    // BAKE LOCAL: aplica o deslocamento direto nos verts da peça (mesmo frame
    // mm de pecas_3d). Garante que o preview reflita o move sem depender do
    // pecas_3d que volta do Ruby (que poderia vir nulo/defasado). Num MOVE o
    // conjunto de ids não muda (só DELETE re-numera), então é seguro.
    const baked = AutoAcmCurvo._shiftPieceVerts(m, item.id, dx, dy, dz);
    if (m.edits && m.edits.ofs) delete m.edits.ofs[item.id];
    AutoAcmCurvo.scheduleRedraw3D();

    // Persiste no SketchUp
    try {
      const r = await Bridge.call('autoacm_curvo_aplicar_edicoes', {
        entity_id: m.entity_id,
        del_ids:   [],
        ofs_list:  [{ id: item.id, dx, dy, dz }]
      });
      if (r && r.ok) {
        if (window.Toast) Toast.success('Posição atualizada.', { duration: 1800 });
      } else {
        // Reverte o bake local se o Ruby falhou
        if (baked) AutoAcmCurvo._shiftPieceVerts(m, item.id, -dx, -dy, -dz);
        if (Array.isArray(m.history)) m.history.pop();
        AutoAcmCurvo._refreshUndoBtn();
        AutoAcmCurvo.scheduleRedraw3D();
        if (window.Toast) Toast.error('Erro ao mover' + (r && r.error ? ': ' + r.error : ''));
      }
    } catch (e) {
      if (baked) AutoAcmCurvo._shiftPieceVerts(m, item.id, -dx, -dy, -dz);
      if (Array.isArray(m.history)) m.history.pop();
      AutoAcmCurvo._refreshUndoBtn();
      AutoAcmCurvo.scheduleRedraw3D();
      if (window.Toast) Toast.error('Erro: ' + e.message);
    }
  },

  /** Desloca os verts da peça (id) em pecas_3d por (dx,dy,dz) mm. Retorna true se achou. */
  _shiftPieceVerts(m, id, dx, dy, dz) {
    if (!m || !m.quant || !Array.isArray(m.quant.pecas_3d)) return false;
    const pc = m.quant.pecas_3d.find(p => p.id === id);
    if (!pc || !Array.isArray(pc.verts)) return false;
    pc.verts = pc.verts.map(v => [v[0] + dx, v[1] + dy, v[2] + dz]);
    return true;
  },

  /**
   * Inverso bilinear de um quad ABCD (em ordem CCW: bL→bR→tR→tL).
   * Dado ponto P, retorna {u,v} onde P ≈ (1-u)(1-v)A + u(1-v)B + uv C + (1-u)v D.
   * Resolve iterativamente (Newton em 2 vars) — preciso o bastante pra UI.
   */
  _inverseBilinear2D(px, py, A, B, C, D) {
    // Resolve por iteração: 6 passos de Newton bastam pra ~1e-6.
    let u = 0.5, v = 0.5;
    for (let i = 0; i < 8; i++) {
      const omu = 1 - u, omv = 1 - v;
      const Fx = omu*omv*A.x + u*omv*B.x + u*v*C.x + omu*v*D.x - px;
      const Fy = omu*omv*A.y + u*omv*B.y + u*v*C.y + omu*v*D.y - py;
      // Jacobiano
      const dFx_du = -omv*A.x + omv*B.x + v*C.x - v*D.x;
      const dFx_dv = -omu*A.x - u*B.x + u*C.x + omu*D.x;
      const dFy_du = -omv*A.y + omv*B.y + v*C.y - v*D.y;
      const dFy_dv = -omu*A.y - u*B.y + u*C.y + omu*D.y;
      const det = dFx_du * dFy_dv - dFx_dv * dFy_du;
      if (Math.abs(det) < 1e-9) break;
      const du = ( dFy_dv * Fx - dFx_dv * Fy) / det;
      const dv = (-dFy_du * Fx + dFx_du * Fy) / det;
      u -= du; v -= dv;
      if (Math.abs(du) + Math.abs(dv) < 1e-6) break;
    }
    return { u: u, v: v };
  },

  /**
   * Remove uma peça custom pelo id. Re-gera no SketchUp imediatamente
   * (idêntico ao Auto-ACM normal que aplica cut na hora).
   */
  async removeCustomPiece(id) {
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.params || !Array.isArray(m.params.customPieces)) return;
    m.params.customPieces = m.params.customPieces.filter(p => p.id !== id);
    AutoAcmCurvo._renderCustomPiecesList();
    AutoAcmCurvo.scheduleRedraw3D();
    AutoAcmCurvo._scheduleSave();
    // Re-gera no SketchUp imediatamente
    try {
      const r = await Bridge.call('autoacm_curvo_gerar', {
        entity_id: m.entity_id,
        params:    m.params
      });
      if (r && r.ok && r.quant) {
        m.quant = r.quant;
        AutoAcmCurvo.scheduleRedraw3D();
      }
    } catch (_) { /* silencioso — peça já saiu da lista */ }
  },

  /** Lista de peças adicionadas — OCULTA (igual ao Auto-ACM normal, que não
   * mostra listagem). As peças seguem no state pra persistência/re-gerar;
   * remoção é feita pela ferramenta Tesoura clicando na peça no 3D. */
  _renderCustomPiecesList() {
    const wrap = document.getElementById('aac_custom_pieces');
    if (wrap) wrap.hidden = true;
  },

  // Helper: deriva dims equivalentes ao Auto-ACM normal (bw, bh, bd)
  // do envelope curvo + dispoé "frontal" como UNFOLD do arco da curva.
  _computeEnvelopeDims(m) {
    const facets = AutoAcmCurvo._buildFacets2D(m);
    let bw_front = 0, bw_back = 0, bd_max = 0, bh = 0;
    for (const fc of facets) {
      const wAvg = (fc.larg_base + fc.larg_topo) / 2;
      if (fc.role === 'frontal')        bw_front += wAvg;
      else if (fc.role === 'traseira')  bw_back  += wAvg;
      else if (fc.role === 'esq' || fc.role === 'dir') bd_max = Math.max(bd_max, wAvg);
      if (fc.altura > bh) bh = fc.altura;
    }
    if (bw_front <= 0) bw_front = bw_back;
    if (bd_max <= 0 && m.envelope && Array.isArray(m.envelope.base) && m.envelope.base.length >= 3) {
      const xs = m.envelope.base.map(p => p[0]);
      const ys = m.envelope.base.map(p => p[1]);
      const w = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      const h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      bd_max = Math.min(w, h);
    }
    return { bw: bw_front || 0, bh: bh || 0, bd: bd_max || 0, facets };
  },

  draw2D() {
    const c = document.getElementById('aac_preview2d');
    if (!c) return;
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m || !m.params) return;
    if (c.offsetParent === null || c.clientWidth < 50) {
      requestAnimationFrame(() => AutoAcmCurvo.draw2D());
      return;
    }
    // Liga mouse handlers (idempotente — segura em re-renders)
    AutoAcmCurvo.planBindMouse();

    const p = m.params;
    const env = AutoAcmCurvo._computeEnvelopeDims(m);
    const bw = Math.round(env.bw);
    const bh = Math.round(env.bh);
    const bd = Math.round(env.bd);

    // HiDPI
    const dpr = window.devicePixelRatio || 1;
    let cssW = c.clientWidth || 1000;
    let cssH = c.clientHeight || 480;
    if (cssW < 100) cssW = 1000;
    if (cssH < 100) cssH = 480;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (c.width  !== targetW) c.width  = targetW;
    if (c.height !== targetH) c.height = targetH;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = cssW, H = cssH;

    // Empty state se não houver envelope
    if (bw <= 0 || bh <= 0) {
      const grad0 = ctx.createLinearGradient(0, 0, 0, H);
      grad0.addColorStop(0, '#ffffff'); grad0.addColorStop(1, '#f4f6f9');
      ctx.fillStyle = grad0; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(150, 150, 150, 0.9)';
      ctx.font = '12px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados de envelope. Capture um módulo.', W / 2, H / 2);
      return;
    }

    const en = p.roles_enab || { frontal: true, traseira: true, topo: true, base: false, esq: true, dir: true };
    const chapaComp   = parseInt(p.chapa_comp || 5000, 10);
    const chapaLarg   = parseInt(p.chapa_larg || 1220, 10);
    const chapaOrient = p.chapa_orient || 'horizontal';
    const jt          = (p.junta_tipo === 'seca') ? 0 : (parseFloat(p.junta_mm || 8));
    const align       = p.emenda_align || 'esquerda';

    let acmColor = '#cc2020';
    let juntaColor = '#222';
    // (Curvo não mantém paleta de cores RGB local — usa só cor_acm/cor_junta nomes pra label)

    // Perímetro vertical desdobrado: base + frontal + topo + traseira
    const sections = [];
    if (en.base)     sections.push({ role: 'base',     label: 'BASE',     h: bd, color: 'rgba(217, 119, 6, 0.10)',  strokeColor: '#b45309' });
    if (en.frontal)  sections.push({ role: 'frontal',  label: 'FRONTAL',  h: bh, color: 'rgba(37, 99, 235, 0.10)',  strokeColor: '#1d4ed8' });
    if (en.topo)     sections.push({ role: 'topo',     label: 'TOPO',     h: bd, color: 'rgba(8, 145, 178, 0.10)',  strokeColor: '#0e7490' });
    if (en.traseira) sections.push({ role: 'traseira', label: 'TRASEIRA', h: bh, color: 'rgba(147, 51, 234, 0.10)', strokeColor: '#7e22ce' });

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#f4f6f9');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    if (sections.length === 0) {
      ctx.fillStyle = 'rgba(107, 114, 128, 0.6)';
      ctx.font = '12px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Habilite ao menos uma face para ver o preview', W/2, H/2);
      return;
    }

    // Header
    ctx.fillStyle = 'rgba(23, 23, 23, 0.85)';
    ctx.font = 'bold 13px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PLANIFICADO  ' + bw + ' × ' + bh + ' × ' + bd + ' mm  · unfold do arco', 12, 18);
    ctx.fillStyle = 'rgba(107, 114, 128, 0.85)';
    ctx.font = '10px "Geist Mono", monospace';
    ctx.fillText('Chapa ' + chapaLarg + ' × ' + chapaComp + ' · ' + chapaOrient + ' · ' + align + ' · facetas frontal=' + env.facets.filter(f=>f.role==='frontal').length, 12, 32);

    // Perímetro total
    let perimTotal = 0;
    sections.forEach(s => { perimTotal += s.h; });
    const unfoldedW = bw;

    const horChapa = (chapaOrient === 'vertical') ? chapaLarg : chapaComp;
    const verChapa = (chapaOrient === 'vertical') ? chapaComp : chapaLarg;

    const emH = (p.planEmH !== null && p.planEmH !== undefined) ? p.planEmH.slice()
                                                                 : AutoAcmCurvo._calcEmendas2D(unfoldedW, horChapa, jt, align);
    const emV = (p.planEmV !== null && p.planEmV !== undefined) ? p.planEmV.slice()
                                                                 : AutoAcmCurvo._calcEmendas2D(perimTotal, verChapa, jt, align);

    // Margens + escala
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
    const scBase = Math.min(aw / Math.max(totalDrawW, 1), ah / Math.max(perimTotal, 1));
    if (scBase < 0.01) return;
    const z = AutoAcmCurvo.state.zoom2D || 1;
    const panX = AutoAcmCurvo.state.panX2D || 0;
    const panY = AutoAcmCurvo.state.panY2D || 0;
    const sc = scBase * z;
    const ox = ml + (aw - totalDrawW * sc) / 2 + leftExt * sc + panX;
    const oy = mt + (ah - perimTotal * sc) / 2 + panY;
    const tx = mm => ox + mm * sc;
    const ty = mm => oy + (perimTotal - mm) * sc;
    const tw = mm => mm * sc;

    AutoAcmCurvo.state.planXform = { ox, oy, sc, perimTotal, unfoldedW, emH, emV };

    // Background sections coloridos
    let cumH = 0;
    sections.forEach(s => {
      ctx.fillStyle = s.color;
      ctx.fillRect(tx(0), ty(cumH + s.h), tw(unfoldedW), tw(s.h));
      cumH += s.h;
    });

    // Toolbar toggles
    const showEmendas = AutoAcmCurvo._chk('aac2d_emendas');
    const showDims    = AutoAcmCurvo._chk('aac2d_dims');
    const showLabels  = AutoAcmCurvo._chk('aac2d_labels');

    // Chapa grid com IDs
    const ptsH = [0].concat(emH).concat([unfoldedW]);
    const ptsV = [0].concat(emV).concat([perimTotal]);
    const chapasList = [];
    let chapaSeq = 0;
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
        chapasList.push({ id: chapaId, w: shW, h: shH, kind: (isFullH && isFullW) ? 'inteira' : 'retalho' });

        if (isFullH && isFullW) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
          ctx.strokeStyle = 'rgba(4, 120, 87, 0.85)';
        } else {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.strokeStyle = 'rgba(180, 83, 9, 0.85)';
        }
        ctx.lineWidth = 1.5;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);

        if (showLabels && (x1 - x0) > 32 && (y1 - y0) > 18) {
          const padX = 4;
          ctx.font = 'bold 9px "Geist Mono", monospace';
          const tw1 = ctx.measureText(chapaId).width;
          ctx.fillStyle = 'rgba(23, 23, 23, 0.85)';
          ctx.fillRect(x0 + 2, y0 + 2, tw1 + padX * 2, 13);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(chapaId, x0 + 2 + padX, y0 + 2 + 6.5);
        }

        if (showDims && (x1 - x0) > 50 && (y1 - y0) > 22) {
          const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
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
    AutoAcmCurvo.state.planXform.chapas = chapasList;

    // Laterais esq/dir
    const drawLateral = (xMmStart, xMmEnd, labelRole) => {
      const x0 = tx(xMmStart), x1 = tx(xMmEnd);
      const y0 = ty(foldRefYEnd),   y1 = ty(foldRefYStart);
      const w0 = x1 - x0, h0 = y1 - y0;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
      ctx.fillRect(x0, y0, w0, h0);
      ctx.strokeStyle = 'rgba(67, 56, 202, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, w0 - 1, h0 - 1);
      if (w0 > 28 && h0 > 30) {
        ctx.fillStyle = 'rgba(67, 56, 202, 0.92)';
        ctx.fillRect(x0 + 2, y0 + 2, Math.min(w0 - 4, 48), 13);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px "Geist Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelRole.toUpperCase(), x0 + 6, y0 + 2 + 6.5);
      }
      if (showDims && w0 > 36 && h0 > 50) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
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

    // Dobras verticais (frontal/esq, frontal/dir)
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

    // Dobras horizontais entre seções
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

    // Emendas H/V
    if (showEmendas) {
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
    }

    // Borda externa
    ctx.strokeStyle = 'rgba(23, 23, 23, 0.20)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx(0), ty(perimTotal), tw(unfoldedW), tw(perimTotal));

    // Labels das seções (esquerda)
    if (showLabels) {
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
    }

    // Cotas totais
    if (showDims) {
      ctx.fillStyle = 'rgba(23, 23, 23, 0.80)';
      ctx.font = 'bold 11px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(unfoldedW + ' mm', tx(unfoldedW / 2), ty(0) + 22);
      ctx.save();
      ctx.translate(tx(showDir ? unfoldedW + bd : unfoldedW) + 56, (ty(0) + ty(perimTotal)) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(perimTotal + ' mm', 0, 0);
      ctx.restore();
    }

    // Legenda
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

    // HUD canto direito
    ctx.fillStyle = 'rgba(75, 85, 99, 0.6)';
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`zoom ${z.toFixed(2)}x · scroll = zoom · shift+arraste = pan`, W - 12, H - 8);
  },

  // Stub legado — substituído pelo render planificado acima.
  _draw2D_legacyFacets() {
    const c = document.getElementById('aac_preview2d');
    if (!c) return;
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m) return;
    if (c.offsetParent === null || c.clientWidth < 50) {
      requestAnimationFrame(() => AutoAcmCurvo._draw2D_legacyFacets());
      return;
    }

    const facets = AutoAcmCurvo._buildFacets2D(m);

    const p = m.params || AutoAcmCurvo._defaultParams();
    const chapa = parseFloat(p.chapa_larg) || 1220;
    const orient = p.chapa_orient || 'horizontal';
    const jt = (p.junta_tipo === 'seca') ? 0 : (parseFloat(p.junta_mm) || 0);
    const align = p.emenda_align || 'esquerda';

    const showEmendas = AutoAcmCurvo._chk('aac2d_emendas');
    const showDims    = AutoAcmCurvo._chk('aac2d_dims');
    const showLabels  = AutoAcmCurvo._chk('aac2d_labels');

    const dpr = window.devicePixelRatio || 1;
    let cssW = c.clientWidth || 1000;
    let cssH = c.clientHeight || 480;
    if (cssW < 100) cssW = 1000;
    if (cssH < 100) cssH = 480;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (c.width  !== targetW) c.width  = targetW;
    if (c.height !== targetH) c.height = targetH;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = cssW, H = cssH;

    // Fundo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // HUD topo (sempre, ainda que sem facetas)
    ctx.fillStyle = 'rgba(75, 85, 99, 0.7)';
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`chapa ${chapa}mm · ${orient} · emendas ${align}${jt > 0 ? ' · junta ' + jt + 'mm' : ''} · facetas ${facets.length}`, 12, 16);

    if (facets.length === 0) {
      ctx.fillStyle = 'rgba(150, 150, 150, 0.9)';
      ctx.font = '12px "Geist", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados de envelope. Capture um módulo.', W / 2, H / 2);
      return;
    }

    // HUD debug: dimensões reais por faceta (linha 2)
    ctx.fillStyle = 'rgba(75, 85, 99, 0.55)';
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    const debugLine = facets.map((fc, i) =>
      `${i+1}.${fc.label.replace(' ', '')}: b=${Math.round(fc.larg_base)}/t=${Math.round(fc.larg_topo)}/h=${Math.round(fc.altura)}`
    ).join('  ·  ');
    ctx.fillText(debugLine, 12, 28);

    // Debug detalhado (toggle)
    if (AutoAcmCurvo._chk('aac2d_debug')) {
      ctx.fillStyle = 'rgba(180, 50, 50, 0.85)';
      ctx.font = '9px "Geist Mono", monospace';
      const env = m.envelope || { base: [], topo: [] };
      const fmt = (p) => `(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])})`;
      let y = 42;
      ctx.fillText('BASE: ' + env.base.map((p, i) => `${i}=${fmt(p)}`).join(' '), 12, y); y += 11;
      ctx.fillText('TOPO: ' + env.topo.map((p, i) => `${i}=${fmt(p)}`).join(' '), 12, y); y += 11;
      // primeira faceta detalhada
      if (facets.length > 0) {
        const fc0 = facets[0];
        ctx.fillText(
          `f0 verts(u,v): bL=${fmt([fc0.verts[0][0], fc0.verts[0][1], 0])} bR=${fmt([fc0.verts[1][0], fc0.verts[1][1], 0])} tR=${fmt([fc0.verts[2][0], fc0.verts[2][1], 0])} tL=${fmt([fc0.verts[3][0], fc0.verts[3][1], 0])}`,
          12, y
        );
      }
    }

    // ── ORIENTAÇÃO SEMPRE VERTICAL (modelos "de pé") — facetas como vista
    //    ortográfica empilhada lado a lado. Zoom + pan via wheel/shift+drag
    //    permitem ver detalhe sem girar layout.
    const n = facets.length;
    const rotated = false;
    const cols = Math.min(n, 4);
    const rows = Math.ceil(n / cols);

    const PAD = 20;
    const TOP_HUD = 42;
    const cellPadX = 80;       // padding pras cotas nas laterais (afastadas do polígono)
    const cellPadY_top = 50;   // espaço pra cota do topo
    const cellPadY_bot = 60;   // espaço pra cota da base + label da faceta

    // ── Aplica zoom/pan globais via transform — afeta todo o desenho
    //    (incluindo facetas, cotas, labels). HUD continua fora do transform.
    const z = AutoAcmCurvo.state.zoom2D;
    const px = AutoAcmCurvo.state.panX2D;
    const py = AutoAcmCurvo.state.panY2D;
    ctx.save();
    ctx.translate(W / 2 + px, H / 2 + py);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);

    const cellW = (W - PAD * 2) / cols;
    const cellH = (H - PAD * 2 - TOP_HUD) / rows;

    facets.forEach((fc, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cellOx = PAD + col * cellW;
      const cellOy = PAD + TOP_HUD + row * cellH;

      const innerW = cellW - cellPadX * 2;
      const innerH = cellH - cellPadY_top - cellPadY_bot;

      // Em rotated mode, o trapézio é deitado: largura visual = altura mm,
      // altura visual = largura mm
      const visW_mm = rotated ? fc.altura : Math.max(fc.larg_base, fc.larg_topo, 1);
      const visH_mm = rotated ? Math.max(fc.larg_base, fc.larg_topo, 1) : fc.altura;

      const s = Math.min(innerW / visW_mm, innerH / Math.max(visH_mm, 1));

      // u-range cobrindo TODOS os vértices do polígono (suporta N-lados, não só 4)
      const allUs = fc.verts.map(v => v[0]);
      const uMin = Math.min.apply(null, allUs);
      const uMax = Math.max.apply(null, allUs);

      // toCanvas converte (u, v) em mm da faceta → coords canvas
      // Modo NORMAL: u = horizontal canvas, v = vertical (altura sobe → y diminui)
      // Modo ROTATED: v = horizontal canvas, u = vertical (base v=0 fica embaixo)
      let toCanvas;
      if (rotated) {
        // Centralizado: o eixo u (largura) vai vertical e centrada na célula
        // O eixo v (altura) vai horizontal: base à esq, topo à dir
        const uCenter = (uMin + uMax) / 2;
        const ox = cellOx + cellPadX;                              // esquerda da área útil
        const oy = cellOy + cellPadY_top + innerH / 2;             // centro vertical
        toCanvas = (u, v) => ({
          x: ox + v * s,
          y: oy - (u - uCenter) * s
        });
      } else {
        const uSpan = uMax - uMin;
        const drawW = uSpan * s;
        const ox = cellOx + cellPadX + (innerW - drawW) / 2 - uMin * s;
        const oy = cellOy + cellPadY_top + innerH; // base na parte de baixo
        toCanvas = (u, v) => ({
          x: ox + u * s,
          y: oy - v * s
        });
      }

      const colors = AutoAcmCurvo._roleColor2D(fc.role);

      // Projeta TODOS os vértices do polígono pra coords canvas
      const pp = fc.verts.map(v => toCanvas(v[0], v[1]));
      // Mantém p0..p3 como referências do "quad lógico" (base-left, base-right,
      // topo-right, topo-left) usados por código legado de cotas/anotações.
      // Para polígonos multi-segmento: p0/p1 = vértices em v≈0 (base),
      // p2/p3 = vértices em v≈altura (topo).
      const vMaxF = fc.altura;
      const tolF = Math.max(1, vMaxF * 0.001);
      const baseIdx = [];
      const topoIdx = [];
      fc.verts.forEach((v, k) => {
        if (Math.abs(v[1]) < tolF) baseIdx.push(k);
        else if (Math.abs(v[1] - vMaxF) < tolF) topoIdx.push(k);
      });
      // Pega o de menor u e maior u em cada nível
      const pickMinMax = (idxs) => {
        if (idxs.length === 0) return [null, null];
        const sorted = idxs.slice().sort((a, b) => fc.verts[a][0] - fc.verts[b][0]);
        return [pp[sorted[0]], pp[sorted[sorted.length - 1]]];
      };
      const [p0, p1] = pickMinMax(baseIdx);
      const [p3, p2] = pickMinMax(topoIdx);

      // Desenha o polígono completo (N lados)
      ctx.beginPath();
      pp.forEach((p, k) => k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // EMENDAS
      if (showEmendas) {
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        if (orient === 'horizontal') {
          const emendas = AutoAcmCurvo._calcEmendas2D(fc.altura, chapa, jt, align);
          emendas.forEach(em => {
            const tFrac = em / fc.altura;
            const xLeft  = fc.verts[0][0] + (fc.verts[3][0] - fc.verts[0][0]) * tFrac;
            const xRight = fc.verts[1][0] + (fc.verts[2][0] - fc.verts[1][0]) * tFrac;
            const pA = toCanvas(xLeft,  em);
            const pB = toCanvas(xRight, em);
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.stroke();
          });
        } else {
          const wAvg = (fc.larg_base + fc.larg_topo) / 2;
          const emendas = AutoAcmCurvo._calcEmendas2D(wAvg, chapa, jt, align);
          emendas.forEach(em => {
            const u = uMin + em;
            const pA = toCanvas(u, 0);
            const pB = toCanvas(u, fc.altura);
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.stroke();
          });
        }
        ctx.setLineDash([]);
      }

      // DIMENSÕES — estilo SketchUp (linha de extensão + linha de cota com setas)
      // p0..p3 podem ser null se o polígono não tem v=0 ou v=altura (raro)
      if (showDims) {
        if (p0 && p1) AutoAcmCurvo._drawCota(ctx, p0, p1, `${Math.round(fc.larg_base)} mm`, 'down');
        if (p3 && p2) AutoAcmCurvo._drawCota(ctx, p3, p2, `${Math.round(fc.larg_topo)} mm`, 'up');
        if (p1 && p2) AutoAcmCurvo._drawCota(ctx, p1, p2, `${Math.round(fc.altura)} mm`, 'right');
      }

      // ANOTAÇÃO "em ângulo" — itera por TODAS as arestas do polígono (N-lados),
      // marca apenas as diagonais. As retas (horizontais/verticais) ficam
      // implícitas pela forma do polígono — não precisam de label.
      if (showLabels) {
        const cxF = pp.reduce((s, p) => s + p.x, 0) / pp.length;
        const cyF = pp.reduce((s, p) => s + p.y, 0) / pp.length;
        ctx.font = 'bold 9px "Geist Mono", monospace';
        ctx.fillStyle = 'rgba(220, 100, 0, 0.95)';
        for (let k = 0; k < fc.verts.length; k++) {
          const va = fc.verts[k];
          const vb = fc.verts[(k + 1) % fc.verts.length];
          const sameU = Math.abs(va[0] - vb[0]) < 0.5;
          const sameV = Math.abs(va[1] - vb[1]) < 0.5;
          if (sameU || sameV) continue;          // aresta reta — sem label
          // Não marca diagonais muito curtas (ruído)
          const seg = Math.hypot(vb[0] - va[0], vb[1] - va[1]);
          if (seg < fc.altura * 0.05) continue;
          const pa = pp[k], pb = pp[(k + 1) % pp.length];
          const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const len = Math.hypot(dx, dy) || 1;
          let nx = dy / len, ny = -dx / len;
          if ((mx - cxF) * nx + (my - cyF) * ny < 0) { nx = -nx; ny = -ny; }
          const off = 18;
          ctx.textAlign = nx > 0.3 ? 'left' : (nx < -0.3 ? 'right' : 'center');
          ctx.textBaseline = 'middle';
          ctx.fillText('em ângulo', mx + nx * off, my + ny * off);
        }
      }

      // LABEL
      if (showLabels) {
        ctx.fillStyle = 'rgba(23, 23, 23, 0.95)';
        ctx.font = 'bold 12px "Geist", sans-serif';
        ctx.textAlign = 'center';
        const cellCx = cellOx + cellW / 2;
        ctx.fillText(fc.label, cellCx, cellOy + cellH - 8);
      }
    });

    ctx.restore(); // fecha zoom/pan transform

    // HUD persistente: dica de uso (fora do transform pra ficar fixo)
    ctx.fillStyle = 'rgba(75, 85, 99, 0.6)';
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`zoom ${z.toFixed(2)}x · scroll = zoom · shift+arraste = pan`, W - 12, H - 8);
  },

  // ─────────────────────────────────────────────────────────────────────
  // Helper: desenha uma cota estilo SketchUp entre 2 pontos.
  //   p1, p2  — pontos extremos do segmento sendo medido (canvas coords)
  //   label   — texto a mostrar no centro
  //   side    — 'up'|'down'|'left'|'right' = pra que lado a cota se afasta
  // ─────────────────────────────────────────────────────────────────────
  _drawCota(ctx, p1, p2, label, side) {
    const off = 32; // distância da aresta até a linha de cota (afastada pra não sobrepor)
    const ext = 6;  // distância da linha de cota até a ponta da extensão
    const sideSign = (side === 'up' || side === 'left') ? -1 : 1;
    // Eixo principal da cota: 'horizontal' (cota fica acima/abaixo) ou 'vertical' (à esquerda/direita)
    const horizontal = (side === 'up' || side === 'down');

    let q1, q2;
    if (horizontal) {
      const yOff = ((p1.y + p2.y) / 2) + sideSign * off;
      q1 = { x: p1.x, y: yOff };
      q2 = { x: p2.x, y: yOff };
    } else {
      const xOff = ((p1.x + p2.x) / 2) + sideSign * off;
      q1 = { x: xOff, y: p1.y };
      q2 = { x: xOff, y: p2.y };
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.85)';
    ctx.lineWidth = 0.8;
    ctx.fillStyle = 'rgba(75, 85, 99, 0.95)';

    // Linhas de extensão (do ponto até além da linha de cota)
    const extend = (a, b) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      ctx.lineTo(b.x + (dx / len) * ext, b.y + (dy / len) * ext);
      ctx.stroke();
    };
    extend(p1, q1);
    extend(p2, q2);

    // Linha de cota (com setas)
    ctx.beginPath();
    ctx.moveTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.stroke();

    // Setas em q1 e q2
    const drawArrow = (tip, dir) => {
      const sz = 5;
      const ang = Math.atan2(dir.y, dir.x);
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - sz * Math.cos(ang - 0.35), tip.y - sz * Math.sin(ang - 0.35));
      ctx.lineTo(tip.x - sz * Math.cos(ang + 0.35), tip.y - sz * Math.sin(ang + 0.35));
      ctx.closePath();
      ctx.fill();
    };
    drawArrow(q1, { x: q1.x - q2.x, y: q1.y - q2.y });
    drawArrow(q2, { x: q2.x - q1.x, y: q2.y - q1.y });

    // Texto centralizado na linha de cota (com fundo branco pra legibilidade)
    const cx = (q1.x + q2.x) / 2;
    const cy = (q1.y + q2.y) / 2;
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 6;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(cx - w / 2, cy - 7, w, 14);
    ctx.fillStyle = 'rgba(40, 50, 70, 0.95)';
    ctx.fillText(label, cx, cy);

    ctx.restore();
  },

  // ══════════════════════════════════════════════════════════════════════
  // PREVIEW 3D ISOMÉTRICO — adaptado do auto_acm normal
  // - Envelope: polígonos base/topo + arestas verticais (geometria afunilada real)
  // - Peças geradas: bbox axis-aligned (perde inclinação dos montantes na v1)
  // - Sem ferramentas cut/move/sym (só visualização)
  // ══════════════════════════════════════════════════════════════════════
  scheduleRedraw3D() {
    if (AutoAcmCurvo._redraw3DScheduled) return;
    AutoAcmCurvo._redraw3DScheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        AutoAcmCurvo._redraw3DScheduled = false;
        try { AutoAcmCurvo.draw3D(); } catch (e) { console.error('[AutoAcmCurvo] draw3D erro:', e); }
      });
    });
  },

  // Projeção 3D → 2D (yaw em ry, pitch em rx)
  _proj3D(x, y, z, st) {
    x -= st.cx; y -= st.cy; z -= st.cz;
    const cosY = Math.cos(AutoAcmCurvo.state.ry), sinY = Math.sin(AutoAcmCurvo.state.ry);
    const x1 = x * cosY - y * sinY;
    const y1 = x * sinY + y * cosY;
    const cosX = Math.cos(AutoAcmCurvo.state.rx), sinX = Math.sin(AutoAcmCurvo.state.rx);
    const y2 = y1 * cosX - z * sinX;
    const z2 = y1 * sinX + z * cosX;
    return {
      x: st.ox + AutoAcmCurvo.state.panX3D + x1 * st.s * AutoAcmCurvo.state.zoom3D,
      y: st.oy + AutoAcmCurvo.state.panY3D - z2 * st.s * AutoAcmCurvo.state.zoom3D,
      d: y2
    };
  },

  // Componente Y da normal rotacionada (back-face culling)
  _normalY3D(nx, ny, nz) {
    const cosY = Math.cos(AutoAcmCurvo.state.ry), sinY = Math.sin(AutoAcmCurvo.state.ry);
    const ny1 = nx * sinY + ny * cosY;
    const cosX = Math.cos(AutoAcmCurvo.state.rx), sinX = Math.sin(AutoAcmCurvo.state.rx);
    return ny1 * cosX - nz * sinX;
  },

  _layerColor3D(ly) {
    const map = {
      metalon:  { fill: 'rgba(55, 75, 120, 0.75)',  stroke: 'rgba(23, 37, 84, 1.0)',  w: 0.9 },
      emenda:   { fill: 'rgba(220, 38, 38, 0.82)',  stroke: 'rgba(153, 27, 27, 1.0)', w: 1.0 },
      fita:     { fill: 'rgba(5, 150, 105, 0.72)',  stroke: 'rgba(4, 120, 87, 1.0)',  w: 0.8 }
    };
    return map[ly] || map.metalon;
  },

  // Constrói lista de polígonos REAIS das peças (8 vértices + 6 faces de cada solid6)
  // Vem do Ruby via quant.pecas_3d. Se faltar, cai pro fallback bbox antigo.
  _buildPolys3D(m) {
    const polys = [];
    const q = m.quant;
    if (q && q.pecas_3d && q.pecas_3d.length > 0) {
      q.pecas_3d.forEach((pc, i) => {
        polys.push({
          verts: pc.verts,
          faces: pc.faces,
          ly:    pc.tipo,
          // id estável do Ruby (met_N/em_N/fita_N) → casa com mapear_pecas_curvo,
          // habilitando Tesoura/Mover na estrutura. Peças custom anexadas no JS
          // (cpId, sem id) ficam com id=null → fora do hit-test da estrutura
          // (são tratadas pelo caminho custom até o próximo regen lhes dar id).
          id:    pc.id || null,
          nome:  pc.nome
        });
      });
    } else if (q) {
      // Fallback: bbox axis-aligned (compat com geração antiga)
      const boxFaces = [
        [0,3,2,1],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,4,7,3],[1,2,6,5]
      ];
      const pushBox = (pc, ly, idPref, i) => {
        const x=pc.x, y=pc.y, z=pc.z, w=pc.w, d=pc.d, h=pc.h;
        const verts = [
          [x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z],
          [x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]
        ];
        polys.push({ verts, faces: boxFaces, ly, id: idPref + '_' + i, nome: pc.nome });
      };
      (((q.metalon || {}).pecas) || []).forEach((pc, i) => pushBox(pc, 'metalon', 'met', i));
      (((q.emenda  || {}).pecas) || []).forEach((pc, i) => pushBox(pc, 'emenda',  'em',  i));
      (((q.fita    || {}).pecas) || []).forEach((pc, i) => pushBox(pc, 'fita',    'fita',i));
    }
    return polys;
  },

  // Função principal de render — painter's algorithm
  draw3D() {
    const c = document.getElementById('aac_preview3d');
    if (!c) return;
    const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
    if (!m) return;

    if (c.offsetParent === null || c.clientWidth < 50) {
      requestAnimationFrame(() => AutoAcmCurvo.draw3D());
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    let cssW = c.clientWidth  || 800;
    let cssH = c.clientHeight || 520;
    if (cssW < 100) cssW = 800;
    if (cssH < 100) cssH = 520;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (c.width  !== targetW) c.width  = targetW;
    if (c.height !== targetH) c.height = targetH;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = cssW, H = cssH;

    // Fundo gradiente claro
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#eef1f5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const bw = m.w, bh = m.h, bd = m.d;
    if (!bw || !bh || !bd) return;
    const maxDim = Math.max(bw, bh, bd);
    const sc = (Math.min(W, H) * 0.75) / maxDim;

    // Centro de rotação = bbox center (previsível, igual ao plugin antigo
    // de colunas/avanço). Centroide do envelope distorcia em estruturas
    // asimétricas porque base e topo têm centros diferentes.
    const st = {
      cx: bw / 2, cy: bd / 2, cz: bh / 2,
      ox: W / 2, oy: H / 2 + 10,
      s:  sc < 0.001 ? 0.001 : sc
    };
    // Cache pro hit-test do modo Adicionar (clique no 3D)
    AutoAcmCurvo.state.lastSt3D = st;

    const acmVisible  = AutoAcmCurvo._chk('aac3d_acm');
    const metVisible  = AutoAcmCurvo._chk('aac3d_met');
    const emVisible   = AutoAcmCurvo._chk('aac3d_em');
    const fitaVisible = AutoAcmCurvo._chk('aac3d_fita');

    const p = m.params || {};
    let acmRgb = [200, 200, 200];
    if (p.cor_acm) {
      for (const cat in AutoAcmCurvo.state.cores) {
        const found = (AutoAcmCurvo.state.cores[cat] || []).find(x => x.nome === p.cor_acm);
        if (found) { acmRgb = found.rgb; break; }
      }
    }

    const allF = [];

    // ── 1) ENVELOPE: polígonos base + topo + N facetas laterais ──
    const env = m.envelope || { base: [], topo: [] };
    const baseIn = env.base || [];
    const topoIn = env.topo || [];
    const N = Math.min(baseIn.length, topoIn.length);

    if (N >= 3) {
      const baseP = baseIn.map(pt => AutoAcmCurvo._proj3D(pt[0], pt[1], pt[2], st));
      const topoP = topoIn.map(pt => AutoAcmCurvo._proj3D(pt[0], pt[1], pt[2], st));

      // Helper pra calcular normal de um quad (simplificado)
      const polyNormalRotY = (pts3d) => {
        // pega 2 vetores (e0=v1-v0, e1=v2-v0) e calcula cross product, retorna ny rotacionado
        const v0 = pts3d[0], v1 = pts3d[1], v2 = pts3d[pts3d.length - 1];
        const e0 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
        const e1 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
        const nx = e0[1]*e1[2] - e0[2]*e1[1];
        const ny = e0[2]*e1[0] - e0[0]*e1[2];
        const nz = e0[0]*e1[1] - e0[1]*e1[0];
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
        return AutoAcmCurvo._normalY3D(nx/len, ny/len, nz/len);
      };

      // ── BBOX DE REFERÊNCIA (caixa máxima envolvente, tracejada bem leve) ──
      // Dá contexto visual do "tamanho máximo" pra contraste com o envelope real
      const bbCorners = [
        [0, 0, 0],     [bw, 0, 0],     [bw, bd, 0],     [0, bd, 0],
        [0, 0, bh],    [bw, 0, bh],    [bw, bd, bh],    [0, bd, bh]
      ].map(c => AutoAcmCurvo._proj3D(c[0], c[1], c[2], st));
      ctx.strokeStyle = 'rgba(150, 160, 180, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      const bbEdges = [
        [0,1],[1,2],[2,3],[3,0],     // base bbox
        [4,5],[5,6],[6,7],[7,4],     // topo bbox
        [0,4],[1,5],[2,6],[3,7]      // verticais
      ];
      bbEdges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(bbCorners[a].x, bbCorners[a].y);
        ctx.lineTo(bbCorners[b].x, bbCorners[b].y);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // ── Polígonos completos das facetas laterais (multi-segmento) ──
      // Quando o Ruby envia envelope.polygons, cada faceta pode ter > 4 vértices
      // (steps, shoulders). Senão fallback usa o quad base[i]→base[i+1]→topo[i+1]→topo[i].
      const polysIn = (m.envelope && m.envelope.polygons) || [];
      const sideFacets = []; // {poly3D, projP, normal, role}
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        let poly3D = polysIn[i];
        if (!Array.isArray(poly3D) || poly3D.length < 3) {
          poly3D = [baseIn[i], baseIn[j], topoIn[j], topoIn[i]];
        }
        const projP = poly3D.map(p => AutoAcmCurvo._proj3D(p[0], p[1], p[2], st));
        sideFacets.push({ poly3D, projP, idx: i });
      }

      // ── WIREFRAME DO ENVELOPE REAL — sólido e nítido ──
      ctx.strokeStyle = 'rgba(40, 50, 70, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      baseP.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      topoP.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.stroke();
      // Cada faceta lateral: traça o polígono completo (preserva steps)
      sideFacets.forEach(sf => {
        ctx.beginPath();
        sf.projP.forEach((p, k) => k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
      });

      if (acmVisible) {
        const rolesEnv = (m.envelope && m.envelope.roles) || [];

        // Topo (face superior — normal +Z) com cor do role 'topo'
        const ny_topo = AutoAcmCurvo._normalY3D(0, 0, 1);
        if (ny_topo <= 0.05) {
          const ptsT = topoP.slice();
          const depth = ptsT.reduce((s, p) => s + p.d, 0) / ptsT.length;
          const shade = Math.abs(ny_topo) * 0.4 + 0.7;
          const col = AutoAcmCurvo._roleColor3D('topo', shade);
          allF.push({ pts: ptsT, depth, shade, fill: col.fill, stroke: col.stroke, lw: 1.4 });
        }
        // Base (normal -Z) — invertida para CCW visto de baixo
        const ny_base = AutoAcmCurvo._normalY3D(0, 0, -1);
        if (ny_base <= 0.05) {
          const ptsB = baseP.slice().reverse();
          const depth = ptsB.reduce((s, p) => s + p.d, 0) / ptsB.length;
          const shade = Math.abs(ny_base) * 0.4 + 0.65;
          const col = AutoAcmCurvo._roleColor3D('base', shade);
          allF.push({ pts: ptsB, depth, shade, fill: col.fill, stroke: col.stroke, lw: 1.4 });
        }
        // Facetas laterais — polígono completo c/ cor do role
        sideFacets.forEach(sf => {
          // Normal calculada a partir do primeiro triângulo do polígono
          const nyR = polyNormalRotY(sf.poly3D);
          if (nyR > 0.05) return; // back-face cull
          const pts = sf.projP;
          const depth = pts.reduce((s, p) => s + p.d, 0) / pts.length;
          const shade = Math.abs(nyR) * 0.4 + 0.75;
          const role = (rolesEnv[sf.idx] && rolesEnv[sf.idx].role) || 'frontal';
          const col = AutoAcmCurvo._roleColor3D(role, shade);
          allF.push({ pts, depth, shade, fill: col.fill, stroke: col.stroke, lw: 1.4 });
        });
      }
    }

    // ── 2) PEÇAS GERADAS (polígonos reais — 8 vértices + 6 faces por solid6) ──
    const polys = AutoAcmCurvo._buildPolys3D(m);
    const edits = m.edits || null;
    // Reconstrói os retângulos de hit-test a cada render (Tesoura/Mover na
    // estrutura gerada) — espelha o hitRects3D do Auto-ACM normal.
    AutoAcmCurvo.state.hitRects3D = [];
    const hovId = AutoAcmCurvo.state.hoverId3D;
    polys.forEach(poly => {
      const ly = poly.ly;
      if (ly === 'emenda'  && !emVisible) return;
      if (ly === 'fita'    && !fitaVisible) return;
      if (ly === 'metalon' && !metVisible) return;
      // Peça marcada pra deletar (Tesoura) — não renderiza nem hit-testa
      if (edits && edits.del && edits.del[poly.id]) return;

      // Bbox local (mm) + eixo dominante (pra centro/eixo do Mover)
      let mnx = Infinity, mny = Infinity, mnz = Infinity;
      let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      poly.verts.forEach(v => {
        if (v[0] < mnx) mnx = v[0]; if (v[0] > mxx) mxx = v[0];
        if (v[1] < mny) mny = v[1]; if (v[1] > mxy) mxy = v[1];
        if (v[2] < mnz) mnz = v[2]; if (v[2] > mxz) mxz = v[2];
      });
      const dW = mxx - mnx, dD = mxy - mny, dH = mxz - mnz;
      let eixo = 'z';
      if (dW >= dD && dW >= dH) eixo = 'x';
      else if (dD >= dW && dD >= dH) eixo = 'y';
      else eixo = 'z';

      // Offset de arraste ao vivo (Mover H/V) — translada os verts antes de projetar
      let verts = poly.verts;
      const ofs = edits && edits.ofs && edits.ofs[poly.id];
      let offX = 0, offY = 0, offZ = 0;
      if (ofs) {
        const v = AutoAcmCurvo._ofsVec(ofs, ofs.eixo || eixo);
        offX = v[0]; offY = v[1]; offZ = v[2];
        verts = poly.verts.map(p => [p[0]+offX, p[1]+offY, p[2]+offZ]);
      }
      const box = { x: mnx+offX, y: mny+offY, z: mnz+offZ, w: dW, d: dD, h: dH };

      const colors = AutoAcmCurvo._layerColor3D(ly);
      const isHover = (poly.id && poly.id === hovId);
      // Projeta TODOS os vértices uma vez
      const projV = verts.map(v => AutoAcmCurvo._proj3D(v[0], v[1], v[2], st));

      // Centroide do prisma (pra forçar normal apontar pra fora se houver dúvida)
      let cxP = 0, cyP = 0, czP = 0;
      verts.forEach(v => { cxP += v[0]; cyP += v[1]; czP += v[2]; });
      cxP /= verts.length; cyP /= verts.length; czP /= verts.length;

      // Acumuladores do hit-test desta peça
      let hMnX = Infinity, hMnY = Infinity, hMxX = -Infinity, hMxY = -Infinity;
      let hDepth = Infinity;
      const hFaces = [];

      // Renderiza cada face do prisma
      poly.faces.forEach(faceIdx => {
        if (faceIdx.length < 3) return;
        const v0 = verts[faceIdx[0]];
        const v1 = verts[faceIdx[1]];
        const v2 = verts[faceIdx[faceIdx.length - 1]];
        // Normal (cross product das 2 arestas a partir de v0)
        const e0 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
        const e1 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
        let nx = e0[1]*e1[2] - e0[2]*e1[1];
        let ny = e0[2]*e1[0] - e0[0]*e1[2];
        let nz = e0[0]*e1[1] - e0[1]*e1[0];
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (len < 1e-6) return;
        nx /= len; ny /= len; nz /= len;
        // Garante que a normal aponta pra FORA do prisma (away from centroid)
        const cf = faceIdx.reduce((acc, i) => {
          acc[0] += verts[i][0]; acc[1] += verts[i][1]; acc[2] += verts[i][2];
          return acc;
        }, [0,0,0]).map(v => v / faceIdx.length);
        const dotOut = (cf[0]-cxP)*nx + (cf[1]-cyP)*ny + (cf[2]-czP)*nz;
        if (dotOut < 0) { nx = -nx; ny = -ny; nz = -nz; }

        const ny2 = AutoAcmCurvo._normalY3D(nx, ny, nz);
        if (ny2 > 0.05) return; // back-face cull
        const pts = faceIdx.map(i => projV[i]);
        const depth = pts.reduce((s, p) => s + p.d, 0) / pts.length;
        const shade = Math.abs(ny2) * 0.4 + 0.6;
        let fill = colors.fill, stroke = colors.stroke;
        if (isHover) {
          // Realça a peça sob o cursor (Tesoura = vermelho, Mover = âmbar)
          const isCut = AutoAcmCurvo.state.tool3D === 'cut';
          fill   = isCut ? 'rgba(255,80,80,0.92)'  : 'rgba(255,200,60,0.92)';
          stroke = isCut ? 'rgba(190,20,20,1)'     : 'rgba(190,120,0,1)';
        }
        allF.push({ pts, depth, shade, fill, stroke, lw: isHover ? 1.6 : (colors.w || 0.8) });

        // Hit-test: agrega bbox de tela + polígono da face + menor profundidade
        pts.forEach(pp => {
          if (pp.x < hMnX) hMnX = pp.x; if (pp.x > hMxX) hMxX = pp.x;
          if (pp.y < hMnY) hMnY = pp.y; if (pp.y > hMxY) hMxY = pp.y;
        });
        if (depth < hDepth) hDepth = depth;
        hFaces.push(pts);
      });

      if (hFaces.length && poly.id) {
        AutoAcmCurvo.state.hitRects3D.push({
          id: poly.id, ly, box, eixo,
          minX: hMnX, maxX: hMxX, minY: hMnY, maxY: hMxY,
          faces: hFaces, zdepth: hDepth
        });
      }
    });

    // Painter's algorithm — ordena por depth descendente (mais longe primeiro)
    allF.sort((a, b) => b.depth - a.depth);

    allF.forEach(f => {
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
      ctx.closePath();
      if (f.fill) { ctx.fillStyle = f.fill; ctx.fill(); }
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = f.lw || 1;
      ctx.stroke();
    });

    // ── CUSTOM PIECES — renderiza peças adicionadas via "Adicionar" ──
    AutoAcmCurvo._drawCustomPieces3D(ctx, m, st);

    // ── GHOST PREVIEW (modo Adicionar armado) ──
    if (AutoAcmCurvo.state.tool3D === 'add' && AutoAcmCurvo._addState.armed) {
      AutoAcmCurvo._drawGhostPiece(ctx, m, st);
    }

    // HUD
    ctx.fillStyle = 'rgba(75, 85, 99, 0.7)';
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = 'left';
    const degX = Math.round(AutoAcmCurvo.state.rx * 180 / Math.PI);
    const degY = Math.round(AutoAcmCurvo.state.ry * 180 / Math.PI);
    ctx.fillText(`rotX=${degX}°  rotY=${degY}°  zoom=${AutoAcmCurvo.state.zoom3D.toFixed(2)}x`, 12, 16);
    // diagnóstico — quantos cantos/peças + dimensões base/topo (pra confirmar afunilamento)
    const _polys = AutoAcmCurvo._buildPolys3D(m);
    const bbXY = (pts) => {
      if (!pts || pts.length === 0) return { w: 0, d: 0 };
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      pts.forEach(p => {
        if (p[0] < xMin) xMin = p[0];
        if (p[0] > xMax) xMax = p[0];
        if (p[1] < yMin) yMin = p[1];
        if (p[1] > yMax) yMax = p[1];
      });
      return { w: Math.round(xMax - xMin), d: Math.round(yMax - yMin) };
    };
    const bb = bbXY(baseIn), bt = bbXY(topoIn);
    const tapered = (bb.w !== bt.w) || (bb.d !== bt.d);
    const _envInfo = `env base ${bb.w}×${bb.d} → topo ${bt.w}×${bt.d}${tapered ? ' (afunilada)' : ''}`;
    const _polyInfo = `polys: ${_polys.length}`;
    ctx.fillText(`${_envInfo}  ·  ${_polyInfo}`, 12, 30);
    if (m.quant) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(23, 23, 23, 0.75)';
      ctx.fillText('estrutura gerada', W - 12, 16);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(150, 150, 150, 0.75)';
      ctx.fillText('só captura (clique Gerar pra ver peças)', W - 12, 16);
    }
  },

  // Vistas e câmera
  rot3D(dxDeg, dyDeg) {
    AutoAcmCurvo.state.ry += (dxDeg || 0) * Math.PI / 180;
    AutoAcmCurvo.state.rx += (dyDeg || 0) * Math.PI / 180;
    AutoAcmCurvo.scheduleRedraw3D();
  },
  zoom3D(f) {
    AutoAcmCurvo.state.zoom3D *= f;
    AutoAcmCurvo.state.zoom3D = Math.max(0.1, Math.min(5.0, AutoAcmCurvo.state.zoom3D));
    AutoAcmCurvo.scheduleRedraw3D();
  },
  reset3D() {
    AutoAcmCurvo.state.rx = -0.6155;        // iso clássico SketchUp
    AutoAcmCurvo.state.ry = Math.PI / 4;
    AutoAcmCurvo.state.zoom3D = 1.0;
    AutoAcmCurvo.state.panX3D = 0;
    AutoAcmCurvo.state.panY3D = 0;
    AutoAcmCurvo._setActiveView('iso');
    AutoAcmCurvo.scheduleRedraw3D();
  },
  setView3D(view) {
    const s = AutoAcmCurvo.state;
    if (view === 'front')      { s.rx = 0;             s.ry = 0; }
    else if (view === 'side')  { s.rx = 0;             s.ry = -Math.PI / 2; }
    else if (view === 'top')   { s.rx = -Math.PI / 2;  s.ry = 0; }
    else if (view === 'iso')   { s.rx = -0.6155;       s.ry = Math.PI / 4; }
    // 'fit' mantém rotação
    s.zoom3D = 1.0; s.panX3D = 0; s.panY3D = 0;
    AutoAcmCurvo._setActiveView(view);
    AutoAcmCurvo.scheduleRedraw3D();
  },
  _setActiveView(view) {
    document.querySelectorAll('.aac__view-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
  },

  // Bind de eventos do canvas (mouse drag = orbit/pan, wheel = zoom)
  bind3D() {
    const c = document.getElementById('aac_preview3d');
    if (!c || c._aacBound) return;
    c._aacBound = true;

    c.addEventListener('mousedown', e => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const tool = AutoAcmCurvo.state.tool3D;

      // ── SHIFT ou botão do meio = NAVEGAR (pan) independente da ferramenta ──
      // Permite arrastar a tela mesmo no Tesoura/Mover/Adicionar.
      if (e.shiftKey || e.button === 1) {
        AutoAcmCurvo.state.lastX3D = e.clientX;
        AutoAcmCurvo.state.lastY3D = e.clientY;
        AutoAcmCurvo.state.dragging3D = true;
        if (e.button === 1) AutoAcmCurvo.state.middleDrag = true;
        c.classList.add('is-dragging');
        return;
      }

      // ── ADD: clique posiciona nova peça via hit-test ──
      if (e.button === 0 && tool === 'add' && AutoAcmCurvo._addState && AutoAcmCurvo._addState.armed) {
        AutoAcmCurvo._handleAddClick3D(e);
        return;
      }

      // ── TESOURA: peça custom OU peça da estrutura gerada = deletar ──
      if (e.button === 0 && tool === 'cut') {
        const hitC = AutoAcmCurvo._hitTestCustomPiece(px, py);
        if (hitC) {
          AutoAcmCurvo.removeCustomPiece(hitC.piece.id);
          if (window.Toast) Toast.success('Ferragem #' + (hitC.idx+1) + ' removida.');
          return;
        }
        const hit = AutoAcmCurvo._hitTest3D(px, py);
        if (hit) {
          AutoAcmCurvo._aplicarCutCurvo(hit);
          return;
        }
        if (window.Toast) Toast.info('Clique sobre uma peça da estrutura pra remover.', { duration: 2000 });
        return;
      }

      // ── MOVER H/V: peça custom (posU/posV) OU estrutura gerada (translação) ──
      if (e.button === 0 && (tool === 'moveH' || tool === 'moveV')) {
        const hitC = AutoAcmCurvo._hitTestCustomPiece(px, py);
        if (hitC) {
          AutoAcmCurvo.state.movingPiece = { id: hitC.piece.id, kind: tool };
          c.classList.add('is-dragging');
          return;
        }
        const hit = AutoAcmCurvo._hitTest3D(px, py);
        const st  = AutoAcmCurvo.state.lastSt3D;
        if (hit && hit.box && st) {
          const p = hit.box;
          const cx = p.x + p.w/2, cy = p.y + p.d/2, cz = p.z + p.h/2;
          const mode = (tool === 'moveV') ? 'V' : 'H';
          // Vetor 2D do eixo de movimento (drag 1:1 com o mouse)
          const pStart = AutoAcmCurvo._proj3D(cx, cy, cz, st);
          let pMove;
          if (mode === 'V')          pMove = AutoAcmCurvo._proj3D(cx, cy, cz + 100, st);
          else if (hit.eixo === 'x') pMove = AutoAcmCurvo._proj3D(cx, cy + 100, cz, st);
          else if (hit.eixo === 'y') pMove = AutoAcmCurvo._proj3D(cx + 100, cy, cz, st);
          else                       pMove = AutoAcmCurvo._proj3D(cx + 100, cy, cz, st);
          const ax = pMove.x - pStart.x, ay = pMove.y - pStart.y;
          let axLen = Math.hypot(ax, ay); if (axLen < 1e-4) axLen = 1e-4;
          const mod = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
          if (!mod.edits) mod.edits = { del: {}, ofs: {} };
          const existing = mod.edits.ofs[hit.id];
          const startDelta = (existing && existing.mode === mode) ? (existing.delta || 0) : 0;
          AutoAcmCurvo.state.dragPiece = {
            id: hit.id, item: hit,
            startClientX: e.clientX, startClientY: e.clientY,
            startDelta, mode, eixo: hit.eixo,
            axisX: ax / axLen, axisY: ay / axLen, pxPerMm: axLen / 100
          };
          c.classList.add('is-dragging');
          return;
        }
        if (window.Toast) Toast.info('Clique sobre uma peça da estrutura pra mover.', { duration: 2000 });
        return;
      }

      // ── ORBIT (default) — drag pra rotacionar/pan ──
      AutoAcmCurvo.state.lastX3D = e.clientX;
      AutoAcmCurvo.state.lastY3D = e.clientY;
      AutoAcmCurvo.state.dragging3D = true;
      if (e.button === 1) AutoAcmCurvo.state.middleDrag = true;
      c.classList.add('is-dragging');
    });
    c.addEventListener('mousemove', e => {
      // ── Drag de peça da ESTRUTURA gerada (Mover H/V por translação) ──
      const dp = AutoAcmCurvo.state.dragPiece;
      if (dp) {
        const mdx = e.clientX - dp.startClientX;
        const mdy = e.clientY - dp.startClientY;
        const delta = (mdx * dp.axisX + mdy * dp.axisY) / dp.pxPerMm;
        const mod = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
        if (mod) {
          if (!mod.edits) mod.edits = { del: {}, ofs: {} };
          mod.edits.ofs[dp.id] = { mode: dp.mode, delta: dp.startDelta + delta, eixo: dp.eixo };
          AutoAcmCurvo.scheduleRedraw3D();
        }
        return;
      }

      // ── Drag de peça custom (Mover H/V via posU/posV) ──
      const mp = AutoAcmCurvo.state.movingPiece;
      if (mp) {
        AutoAcmCurvo._handleMovePieceDrag(e, mp);
        return;
      }

      // ── Hover na estrutura (Tesoura/Mover) — realça a peça sob o cursor ──
      const t3d = AutoAcmCurvo.state.tool3D;
      if (!AutoAcmCurvo.state.dragging3D &&
          (t3d === 'cut' || t3d === 'moveH' || t3d === 'moveV')) {
        const rectH = c.getBoundingClientRect();
        const hit = AutoAcmCurvo._hitTest3D(e.clientX - rectH.left, e.clientY - rectH.top);
        const newHover = hit ? hit.id : null;
        if (AutoAcmCurvo.state.hoverId3D !== newHover) {
          AutoAcmCurvo.state.hoverId3D = newHover;
          AutoAcmCurvo.scheduleRedraw3D();
        }
      }

      // ── GHOST do modo Adicionar (segue o cursor antes do click) ──
      if (AutoAcmCurvo.state.tool3D === 'add' &&
          AutoAcmCurvo._addState && AutoAcmCurvo._addState.armed) {
        const rect = c.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const m  = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
        if (m) {
          const ghost = AutoAcmCurvo._cursorBoxCurvo(m, px, py);
          // mantém ghost anterior se cursor sair da facet (preview "pegajoso")
          if (ghost) AutoAcmCurvo._addState.ghost = ghost;
        }
        AutoAcmCurvo.scheduleRedraw3D();
        // não return — orbit não deve rodar em modo add de qualquer forma
        // (orbit precisa de dragging3D=true que só vem com mousedown válido)
      }

      if (!AutoAcmCurvo.state.dragging3D) return;
      const dx = e.clientX - AutoAcmCurvo.state.lastX3D;
      const dy = e.clientY - AutoAcmCurvo.state.lastY3D;
      AutoAcmCurvo.state.lastX3D = e.clientX;
      AutoAcmCurvo.state.lastY3D = e.clientY;
      if (e.shiftKey || AutoAcmCurvo.state.middleDrag) {
        AutoAcmCurvo.state.panX3D += dx;
        AutoAcmCurvo.state.panY3D += dy;
      } else {
        AutoAcmCurvo.state.ry += dx * 0.008;
        AutoAcmCurvo.state.rx += dy * 0.008;
      }
      AutoAcmCurvo.scheduleRedraw3D();
    });
    c.addEventListener('mouseup', async () => {
      // ── Finaliza drag da ESTRUTURA gerada → aplica no SketchUp ──
      const dp = AutoAcmCurvo.state.dragPiece;
      if (dp) {
        AutoAcmCurvo.state.dragPiece = null;
        c.classList.remove('is-dragging');
        const mod = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
        const ofs = mod && mod.edits && mod.edits.ofs && mod.edits.ofs[dp.id];
        if (ofs && Math.abs((ofs.delta || 0) - dp.startDelta) > 0.5) {
          await AutoAcmCurvo._aplicarMoveCurvo(dp.item, ofs.delta, dp.mode);
        } else if (mod && mod.edits && mod.edits.ofs) {
          delete mod.edits.ofs[dp.id];   // movimento desprezível — descarta
          AutoAcmCurvo.scheduleRedraw3D();
        }
        return;
      }

      const wasMoving = !!AutoAcmCurvo.state.movingPiece;
      if (wasMoving) {
        AutoAcmCurvo.state.movingPiece = null;
        AutoAcmCurvo._scheduleSave();
      }
      AutoAcmCurvo.state.dragging3D = false;
      AutoAcmCurvo.state.middleDrag = false;
      c.classList.remove('is-dragging');
      // Re-gera no SketchUp imediatamente após mover (igual ao Auto-ACM normal)
      if (wasMoving) {
        const m = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
        if (m) {
          try {
            const r = await Bridge.call('autoacm_curvo_gerar', {
              entity_id: m.entity_id,
              params:    m.params
            });
            if (r && r.ok && r.quant) {
              m.quant = r.quant;
              AutoAcmCurvo.scheduleRedraw3D();
              if (window.Toast) Toast.success('Posição atualizada no SketchUp.', { duration: 2000 });
            }
          } catch (_) {}
        }
      }
    });
    c.addEventListener('mouseleave', () => {
      if (AutoAcmCurvo.state.movingPiece) {
        AutoAcmCurvo.state.movingPiece = null;
        AutoAcmCurvo._scheduleSave();
      }
      // Cancela drag de peça da estrutura em andamento (descarta offset visual)
      const dp = AutoAcmCurvo.state.dragPiece;
      if (dp) {
        AutoAcmCurvo.state.dragPiece = null;
        const mod = AutoAcmCurvo.state.modulos[AutoAcmCurvo.state.activeIdx];
        if (mod && mod.edits && mod.edits.ofs) delete mod.edits.ofs[dp.id];
      }
      let needRedraw = false;
      if (AutoAcmCurvo.state.hoverId3D) { AutoAcmCurvo.state.hoverId3D = null; needRedraw = true; }
      AutoAcmCurvo.state.dragging3D = false;
      AutoAcmCurvo.state.middleDrag = false;
      // Limpa ghost — não queremos preview "fantasma" parado quando saiu do canvas
      if (AutoAcmCurvo._addState && AutoAcmCurvo._addState.ghost) {
        AutoAcmCurvo._addState.ghost = null;
        needRedraw = true;
      }
      if (needRedraw) AutoAcmCurvo.scheduleRedraw3D();
      c.classList.remove('is-dragging');
    });
    c.addEventListener('auxclick', e => {
      if (e.button === 1) e.preventDefault();
    });
    // Right-click cancela o modo Adicionar
    c.addEventListener('contextmenu', e => {
      if (AutoAcmCurvo.state.tool3D === 'add' && AutoAcmCurvo._addState && AutoAcmCurvo._addState.armed) {
        e.preventDefault();
        AutoAcmCurvo.cancelAdd();
        if (window.Toast) Toast.info('Adicionar cancelado.', { duration: 1500 });
      }
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      AutoAcmCurvo.zoom3D(f);
    }, { passive: false });

    // ESC global cancela o modo Adicionar
    if (!AutoAcmCurvo._escBound) {
      AutoAcmCurvo._escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && AutoAcmCurvo.state.tool3D === 'add' && AutoAcmCurvo._addState && AutoAcmCurvo._addState.armed) {
          AutoAcmCurvo.cancelAdd();
          if (window.Toast) Toast.info('Adicionar cancelado.', { duration: 1500 });
        }
      });
    }

    // SHIFT segurado = cursor de navegação (pan) no canvas 3D, independente
    // da ferramenta ativa. Classe is-shift-nav controla o cursor via CSS.
    if (!AutoAcmCurvo._shiftNavBound) {
      AutoAcmCurvo._shiftNavBound = true;
      const setNav = (on) => {
        const cv = document.getElementById('aac_preview3d');
        if (cv) cv.classList.toggle('is-shift-nav', on);
      };
      document.addEventListener('keydown', (e) => { if (e.key === 'Shift') setNav(true); });
      document.addEventListener('keyup',   (e) => { if (e.key === 'Shift') setNav(false); });
      window.addEventListener('blur', () => setNav(false));
    }

    // Ctrl+Z (ou Cmd+Z) = desfazer última alteração, quando o módulo curvo
    // está visível e o foco não está num campo de texto.
    if (!AutoAcmCurvo._undoKeyBound) {
      AutoAcmCurvo._undoKeyBound = true;
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey &&
            (e.key === 'z' || e.key === 'Z')) {
          const cv = document.getElementById('aac_preview3d');
          if (!cv || cv.offsetParent === null) return;   // módulo não visível
          const tag = (document.activeElement && document.activeElement.tagName) || '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
          e.preventDefault();
          AutoAcmCurvo.desfazer();
        }
      });
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // Bind do canvas 2D — wheel = zoom, shift+drag = pan
  // ──────────────────────────────────────────────────────────────────────
  bind2D() {
    const c = document.getElementById('aac_preview2d');
    if (!c || c._aac2dBound) return;
    c._aac2dBound = true;

    c.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const s = AutoAcmCurvo.state;
      s.zoom2D = Math.max(0.2, Math.min(8.0, s.zoom2D * factor));
      AutoAcmCurvo.scheduleRedraw2D();
    }, { passive: false });

    c.addEventListener('mousedown', e => {
      // Shift+esquerdo OU botão do meio = pan
      if (e.shiftKey || e.button === 1) {
        e.preventDefault();
        AutoAcmCurvo.state.dragging2D = true;
        AutoAcmCurvo.state.lastX2D = e.clientX;
        AutoAcmCurvo.state.lastY2D = e.clientY;
        c.classList.add('is-dragging');
      }
    });
    c.addEventListener('mousemove', e => {
      if (!AutoAcmCurvo.state.dragging2D) return;
      const dx = e.clientX - AutoAcmCurvo.state.lastX2D;
      const dy = e.clientY - AutoAcmCurvo.state.lastY2D;
      AutoAcmCurvo.state.lastX2D = e.clientX;
      AutoAcmCurvo.state.lastY2D = e.clientY;
      AutoAcmCurvo.state.panX2D += dx;
      AutoAcmCurvo.state.panY2D += dy;
      AutoAcmCurvo.scheduleRedraw2D();
    });
    const stopDrag = () => {
      AutoAcmCurvo.state.dragging2D = false;
      c.classList.remove('is-dragging');
    };
    c.addEventListener('mouseup', stopDrag);
    c.addEventListener('mouseleave', stopDrag);
    c.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  },

  reset2DView() {
    AutoAcmCurvo.state.zoom2D = 1.0;
    AutoAcmCurvo.state.panX2D = 0;
    AutoAcmCurvo.state.panY2D = 0;
    AutoAcmCurvo.scheduleRedraw2D();
  },

  _chk(id) {
    const el = document.getElementById(id);
    return el ? !!el.checked : false;
  },

  // ──────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────
  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },
  _escAttr(s) {
    return String(s == null ? '' : s).replace(/'/g, "\\'");
  },
  _truncar(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
};
