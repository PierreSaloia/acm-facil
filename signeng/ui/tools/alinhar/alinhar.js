/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Alinhar (diálogo da ferramenta)
   ══════════════════════════════════════════════════════════════════════════
   Estado do pick (objeto 1/2) vive no Ruby (Generator::Alinhar). Este JS só
   mostra o status (via AlinharUI.onPick, chamado pelo Ruby) e envia a escolha
   de alinhamento/faceamento no Aplicar.
   ══════════════════════════════════════════════════════════════════════════ */

const AlinharUI = {

  state: {
    lang:  'pt',
    fixo:  null,   // nome do objeto 1 (só exibição)
    movel: null,   // nome do objeto 2
    align: null,   // esquerda|direita|superior|inferior|centro|null
    face:  'manter'
  },

  // ── i18n embutido (diálogo autônomo, fora do shell) ──────────────────────
  i18n: {
    pt: {
      title: 'Alinhar', subtitle: 'Alinha o objeto 2 ao objeto 1 (fixo).',
      step1: 'Objeto fixo', step2: 'Objeto móvel', clickModel: 'clique no modelo…',
      secAlign: 'ALINHAMENTO', secFace: 'FACEAMENTO (PROFUNDIDADE)',
      hint: 'Referência: a orientação do objeto 1 (fixo). Face = o lado voltado pra você na hora do Aplicar.',
      reset: 'Recomeçar', apply: 'Aplicar',
      esquerda: 'Esq.', direita: 'Dir.', superior: 'Sup.', inferior: 'Inf.', centro: 'Centro',
      manter: 'Manter profundidade (não mexer)',
      face_face: 'Face × Face — frentes alinhadas',
      face_fundo: 'Face × Fundo — obj. 2 na frente do obj. 1',
      fundo_face: 'Fundo × Face — obj. 2 atrás do obj. 1',
      fundo_fundo: 'Fundo × Fundo — fundos alinhados',
      msgOk: 'Alinhado! Pode aplicar outra opção ou recomeçar.',
      msgNoMove: 'Já estava alinhado — nada foi movido.',
      msgFaltam: 'Clique os 2 objetos no modelo antes de aplicar.',
      msgBlocked: 'Licença inválida. Faça login no painel do SignEng.',
      msgError: 'Erro: '
    },
    es: {
      title: 'Alinear', subtitle: 'Alinea el objeto 2 al objeto 1 (fijo).',
      step1: 'Objeto fijo', step2: 'Objeto móvil', clickModel: 'clic en el modelo…',
      secAlign: 'ALINEACIÓN', secFace: 'ENFRENTADO (PROFUNDIDAD)',
      hint: 'Referencia: la orientación del objeto 1 (fijo). Cara = el lado que mira hacia ti al Aplicar.',
      reset: 'Reiniciar', apply: 'Aplicar',
      esquerda: 'Izq.', direita: 'Der.', superior: 'Sup.', inferior: 'Inf.', centro: 'Centro',
      manter: 'Mantener profundidad (no tocar)',
      face_face: 'Cara × Cara — frentes alineados',
      face_fundo: 'Cara × Fondo — obj. 2 delante del obj. 1',
      fundo_face: 'Fondo × Cara — obj. 2 detrás del obj. 1',
      fundo_fundo: 'Fondo × Fondo — fondos alineados',
      msgOk: '¡Alineado! Puedes aplicar otra opción o reiniciar.',
      msgNoMove: 'Ya estaba alineado — nada se movió.',
      msgFaltam: 'Haz clic en los 2 objetos antes de aplicar.',
      msgBlocked: 'Licencia inválida. Inicia sesión en el panel de SignEng.',
      msgError: 'Error: '
    },
    en: {
      title: 'Align', subtitle: 'Aligns object 2 to object 1 (fixed).',
      step1: 'Fixed object', step2: 'Moving object', clickModel: 'click in the model…',
      secAlign: 'ALIGNMENT', secFace: 'FACING (DEPTH)',
      hint: 'Reference: object 1\'s orientation (fixed). Face = the side looking at you when you Apply.',
      reset: 'Restart', apply: 'Apply',
      esquerda: 'Left', direita: 'Right', superior: 'Top', inferior: 'Bottom', centro: 'Center',
      manter: 'Keep depth (do not touch)',
      face_face: 'Face × Face — fronts flush',
      face_fundo: 'Face × Back — obj. 2 in front of obj. 1',
      fundo_face: 'Back × Face — obj. 2 behind obj. 1',
      fundo_fundo: 'Back × Back — backs flush',
      msgOk: 'Aligned! Apply another option or restart.',
      msgNoMove: 'Already aligned — nothing moved.',
      msgFaltam: 'Click the 2 objects in the model before applying.',
      msgBlocked: 'Invalid license. Log in on the SignEng panel.',
      msgError: 'Error: '
    }
  },

  t(key) {
    const d = AlinharUI.i18n[AlinharUI.state.lang] || AlinharUI.i18n.pt;
    return d[key] || key;
  },

  // ── Ícones (mini diagramas, mesma linguagem visual do dashboard) ─────────
  _svgAlign(kind) {
    // Retângulo grande (obj 1) + pequeno dourado (obj 2) + linha de referência
    const S = 'stroke="currentColor" stroke-width="1.5" fill="none"';
    const G = 'fill="#d4af37"';
    switch (kind) {
      case 'esquerda': return `<svg viewBox="0 0 24 24"><line x1="4" y1="2" x2="4" y2="22" ${S}/><rect x="4" y="4" width="14" height="7" rx="1" ${S}/><rect x="4" y="14" width="8" height="6" rx="1" ${G}/></svg>`;
      case 'direita':  return `<svg viewBox="0 0 24 24"><line x1="20" y1="2" x2="20" y2="22" ${S}/><rect x="6" y="4" width="14" height="7" rx="1" ${S}/><rect x="12" y="14" width="8" height="6" rx="1" ${G}/></svg>`;
      case 'superior': return `<svg viewBox="0 0 24 24"><line x1="2" y1="4" x2="22" y2="4" ${S}/><rect x="4" y="4" width="7" height="14" rx="1" ${S}/><rect x="14" y="4" width="6" height="8" rx="1" ${G}/></svg>`;
      case 'inferior': return `<svg viewBox="0 0 24 24"><line x1="2" y1="20" x2="22" y2="20" ${S}/><rect x="4" y="6" width="7" height="14" rx="1" ${S}/><rect x="14" y="12" width="6" height="8" rx="1" ${G}/></svg>`;
      case 'centro':   return `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22" ${S} stroke-dasharray="2 2"/><rect x="4" y="4" width="16" height="7" rx="1" ${S}/><rect x="8" y="14" width="8" height="6" rx="1" ${G}/></svg>`;
      default: return '';
    }
  },

  _svgFace(kind) {
    // Vista de topo: obj 1 (contorno) e obj 2 (dourado) no eixo da profundidade
    const S = 'stroke="currentColor" stroke-width="1.5" fill="none"';
    const G = 'fill="#d4af37"';
    switch (kind) {
      case 'manter':      return `<svg viewBox="0 0 26 20"><rect x="2" y="7" width="10" height="6" rx="1" ${S}/><rect x="16" y="5" width="8" height="6" rx="1" ${G}/></svg>`;
      case 'face_face':   return `<svg viewBox="0 0 26 20"><line x1="2" y1="16" x2="24" y2="16" ${S}/><rect x="3" y="6" width="10" height="10" rx="1" ${S}/><rect x="17" y="10" width="6" height="6" rx="1" ${G}/></svg>`;
      case 'face_fundo':  return `<svg viewBox="0 0 26 20"><line x1="2" y1="13" x2="24" y2="13" ${S} stroke-dasharray="2 2"/><rect x="3" y="3" width="10" height="10" rx="1" ${S}/><rect x="10" y="13" width="6" height="5" rx="1" ${G}/></svg>`;
      case 'fundo_face':  return `<svg viewBox="0 0 26 20"><line x1="2" y1="8" x2="24" y2="8" ${S} stroke-dasharray="2 2"/><rect x="3" y="8" width="10" height="10" rx="1" ${S}/><rect x="10" y="3" width="6" height="5" rx="1" ${G}/></svg>`;
      case 'fundo_fundo': return `<svg viewBox="0 0 26 20"><line x1="2" y1="4" x2="24" y2="4" ${S}/><rect x="3" y="4" width="10" height="10" rx="1" ${S}/><rect x="17" y="4" width="6" height="6" rx="1" ${G}/></svg>`;
      default: return '';
    }
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    try {
      const ctx = await Bridge.call('alinhar_ctx');
      if (ctx && ctx.ok) {
        AlinharUI.state.lang = ctx.lang || 'pt';
        document.documentElement.dataset.theme = ctx.theme || 'light';
      }
    } catch (e) {
      console.warn('alinhar_ctx falhou:', e);
    }
    AlinharUI.renderTexts();
    AlinharUI.renderOptions();
    document.getElementById('aln_btn_apply').addEventListener('click', AlinharUI.handleApply);
    document.getElementById('aln_btn_reset').addEventListener('click', AlinharUI.handleReset);
  },

  renderTexts() {
    document.querySelectorAll('[data-key]').forEach(el => {
      el.textContent = AlinharUI.t(el.dataset.key);
    });
  },

  renderOptions() {
    const alignGrid = document.getElementById('aln_align_grid');
    alignGrid.innerHTML = '';
    ['esquerda', 'direita', 'superior', 'inferior', 'centro'].forEach(kind => {
      const btn = document.createElement('button');
      btn.className = 'aln__opt';
      btn.dataset.align = kind;
      btn.innerHTML = AlinharUI._svgAlign(kind) + '<span>' + AlinharUI.t(kind) + '</span>';
      btn.addEventListener('click', () => AlinharUI.selectAlign(kind));
      alignGrid.appendChild(btn);
    });

    const faceList = document.getElementById('aln_face_list');
    faceList.innerHTML = '';
    ['manter', 'face_face', 'face_fundo', 'fundo_face', 'fundo_fundo'].forEach(kind => {
      const btn = document.createElement('button');
      btn.className = 'aln__face' + (kind === AlinharUI.state.face ? ' aln__face--sel' : '');
      btn.dataset.face = kind;
      btn.innerHTML = AlinharUI._svgFace(kind) + '<span>' + AlinharUI.t(kind) + '</span>';
      btn.addEventListener('click', () => AlinharUI.selectFace(kind));
      faceList.appendChild(btn);
    });
  },

  selectAlign(kind) {
    // Clicar de novo na opção selecionada desmarca (permite só facear)
    AlinharUI.state.align = (AlinharUI.state.align === kind) ? null : kind;
    document.querySelectorAll('.aln__opt').forEach(el => {
      el.classList.toggle('aln__opt--sel', el.dataset.align === AlinharUI.state.align);
    });
    AlinharUI.refreshApply();
  },

  selectFace(kind) {
    AlinharUI.state.face = kind;
    document.querySelectorAll('.aln__face').forEach(el => {
      el.classList.toggle('aln__face--sel', el.dataset.face === kind);
    });
    AlinharUI.refreshApply();
  },

  refreshApply() {
    const s = AlinharUI.state;
    const pronto = !!(s.fixo && s.movel && (s.align || s.face !== 'manter'));
    document.getElementById('aln_btn_apply').disabled = !pronto;
  },

  // Chamado pelo Ruby quando a ferramenta pega um objeto no modelo
  onPick(n, nome) {
    const s = AlinharUI.state;
    if (n === 1) { s.fixo = nome; } else { s.movel = nome; }
    const step  = document.getElementById('aln_step' + n);
    const value = document.getElementById('aln_step' + n + '_value');
    step.classList.add('aln__step--ok');
    value.textContent = nome;
    AlinharUI.setMsg('', null);
    AlinharUI.refreshApply();
  },

  async handleApply() {
    const btn = document.getElementById('aln_btn_apply');
    btn.disabled = true;
    try {
      const r = await Bridge.call('alinhar_aplicar', {
        align: AlinharUI.state.align || '',
        face:  AlinharUI.state.face
      });
      if (r.ok) {
        AlinharUI.setMsg(AlinharUI.t(r.moved ? 'msgOk' : 'msgNoMove'), 'ok');
      } else if (r.blocked) {
        AlinharUI.setMsg((r.error || AlinharUI.t('msgBlocked')) + (r.code ? ' [' + r.code + ']' : ''), 'error');
      } else if (r.code === 'alinhar.faltam_objetos') {
        AlinharUI.setMsg(AlinharUI.t('msgFaltam'), 'error');
      } else {
        AlinharUI.setMsg(AlinharUI.t('msgError') + (r.error || r.code || '?'), 'error');
      }
    } catch (e) {
      AlinharUI.setMsg(AlinharUI.t('msgError') + e.message, 'error');
    }
    btn.disabled = false;
    AlinharUI.refreshApply();
  },

  async handleReset() {
    try { await Bridge.call('alinhar_reiniciar'); } catch (e) { console.warn(e); }
    const s = AlinharUI.state;
    s.fixo = null; s.movel = null;
    [1, 2].forEach(n => {
      document.getElementById('aln_step' + n).classList.remove('aln__step--ok');
      document.getElementById('aln_step' + n + '_value').textContent = AlinharUI.t('clickModel');
    });
    AlinharUI.setMsg('', null);
    AlinharUI.refreshApply();
  },

  setMsg(text, kind) {
    const el = document.getElementById('aln_msg');
    el.textContent = text;
    el.className = 'aln__msg' + (kind ? ' aln__msg--' + kind : '');
  }
};

window.AlinharUI = AlinharUI;
document.addEventListener('DOMContentLoaded', AlinharUI.init);
