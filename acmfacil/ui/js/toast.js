/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Toast notifications
   ══════════════════════════════════════════════════════════════════════════
   Uso:
     Toast.success('Estrutura gerada');
     Toast.error('Falha ao salvar', { title: 'Erro', duration: 6000 });
     Toast.info('Carregando...');
     Toast.warning('Vai sobrescrever a config');
   Opções:
     title     — título em bold acima da mensagem
     duration  — ms (default 4000; 0 = não fecha sozinho)
     action    — { label, onClick } — botão de ação inline
   ══════════════════════════════════════════════════════════════════════════ */

const Toast = {
  _container: null,
  _id: 0,

  _ensureContainer() {
    if (this._container && document.body.contains(this._container)) return this._container;
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    this._container = c;
    return c;
  },

  show(msg, opts = {}) {
    const cont = this._ensureContainer();
    const kind = opts.kind || 'info';
    const duration = opts.duration != null ? opts.duration : 4000;
    const id = 'toast_' + (++this._id);

    const el = document.createElement('div');
    el.className = 'toast toast--' + kind;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.dataset.id = id;

    const actionHtml = opts.action ? `
      <button class="toast__action" type="button">${this._escape(opts.action.label || 'OK')}</button>
    ` : '';

    el.innerHTML = `
      <div class="toast__icon">${this._iconSvg(kind)}</div>
      <div class="toast__content">
        ${opts.title ? `<div class="toast__title">${this._escape(opts.title)}</div>` : ''}
        <div class="toast__message">${this._escape(msg)}</div>
      </div>
      ${actionHtml}
      <button class="toast__close" type="button" aria-label="Fechar">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    const closeBtn = el.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => this._remove(el));

    if (opts.action && opts.action.onClick) {
      const actBtn = el.querySelector('.toast__action');
      actBtn.addEventListener('click', () => {
        try { opts.action.onClick(); } catch (e) { console.error('Toast action:', e); }
        this._remove(el);
      });
    }

    cont.appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('is-visible'));
    });

    if (duration > 0) {
      // Pausa o timer no hover e RETOMA no mouseleave — não cancela
      // permanentemente. Isso garante que o toast sempre fecha sozinho
      // mesmo que o cursor passe por cima por acidente.
      let timer = null;
      let remaining = duration;
      let startedAt = Date.now();

      const start = () => {
        startedAt = Date.now();
        timer = setTimeout(() => this._remove(el), remaining);
      };
      const pause = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          remaining -= (Date.now() - startedAt);
          if (remaining < 800) remaining = 800; // garante 800ms mínimo ao sair
        }
      };
      const resume = () => {
        if (!timer && remaining > 0) start();
      };

      start();
      el.addEventListener('mouseenter', pause);
      el.addEventListener('mouseleave', resume);
      // Cleanup se o elemento for removido de qualquer outra forma
      el._toastCleanup = () => { if (timer) clearTimeout(timer); };
    }

    return id;
  },

  success(msg, opts = {}) { return this.show(msg, { ...opts, kind: 'success' }); },
  error(msg, opts = {})   { return this.show(msg, { ...opts, kind: 'error',   duration: opts.duration || 6000 }); },
  info(msg, opts = {})    { return this.show(msg, { ...opts, kind: 'info' }); },
  warning(msg, opts = {}) { return this.show(msg, { ...opts, kind: 'warning' }); },

  dismiss(id) {
    const el = document.querySelector(`.toast[data-id="${id}"]`);
    if (el) this._remove(el);
  },

  dismissAll() {
    if (!this._container) return;
    this._container.querySelectorAll('.toast').forEach(el => this._remove(el));
  },

  _remove(el) {
    if (!el || !el.parentNode) return;
    el.classList.remove('is-visible');
    el.classList.add('is-leaving');
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 280);
  },

  _iconSvg(kind) {
    const stroke = 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
    const paths = {
      success: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ${stroke}><path d="M20 6 9 17l-5-5"/></svg>`,
      error:   `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ${stroke}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
      info:    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ${stroke}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ${stroke}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>`
    };
    return paths[kind] || paths.info;
  },

  _escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
};

window.Toast = Toast;
