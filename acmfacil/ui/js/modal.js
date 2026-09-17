/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Modal customizado (substitui alert/confirm/prompt nativos)
   ══════════════════════════════════════════════════════════════════════════
   Uso:
     await Modal.alert('Estrutura gerada com sucesso.');
     const ok = await Modal.confirm('Apagar este módulo?', 'Isso não pode ser desfeito.');
     const name = await Modal.prompt('Nome do preset', 'Digite um nome:', 'Padrão');
     await Modal.show({ title, body, buttons: [...] });
   ══════════════════════════════════════════════════════════════════════════ */

const Modal = {
  _open:       null,
  _escHandler: null,

  /**
   * Modal genérico totalmente customizável.
   * @param {object} opts
   * @param {string} opts.title    - título em bold no topo (opcional)
   * @param {string|HTMLElement} opts.body - corpo (HTML string ou elemento)
   * @param {Array<{label, variant, value, onClick}>} opts.buttons - botões do rodapé
   * @param {string} opts.kind     - 'default' | 'danger' (muda o accent)
   * @returns {Promise<any>}       - resolve com value do botão clicado, null se cancelar
   */
  show({ title = '', body = '', buttons = [], kind = 'default' } = {}) {
    return new Promise((resolve) => {
      // Fecha modal anterior se houver
      if (this._open) this._closeSilent();

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal modal--${kind}" role="dialog" aria-modal="true">
          ${title ? `<header class="modal__header"><h2 class="modal__title">${this._escape(title)}</h2></header>` : ''}
          <div class="modal__body"></div>
          <footer class="modal__footer"></footer>
        </div>
      `;
      document.body.appendChild(backdrop);

      const modal   = backdrop.querySelector('.modal');
      const bodyEl  = backdrop.querySelector('.modal__body');
      const footer  = backdrop.querySelector('.modal__footer');

      if (typeof body === 'string') {
        bodyEl.innerHTML = this._escapeLines(body);
      } else if (body instanceof HTMLElement) {
        bodyEl.appendChild(body);
      }

      const closeWith = (val) => {
        this._close(backdrop);
        resolve(val);
      };

      buttons.forEach(btn => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--' + (btn.variant || 'secondary');
        b.textContent = btn.label || 'OK';
        b.addEventListener('click', () => {
          let res = btn.value;
          if (btn.onClick) {
            try {
              const v = btn.onClick(bodyEl, modal);
              if (v !== undefined) res = v;
            } catch (e) {
              console.error('Modal button handler:', e);
            }
          }
          closeWith(res !== undefined ? res : null);
        });
        footer.appendChild(b);
      });

      // Click no backdrop fecha (mas não se clicar dentro do modal)
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeWith(null);
      });

      // ESC fecha
      this._escHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeWith(null);
        }
      };
      document.addEventListener('keydown', this._escHandler);

      this._open = backdrop;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
      });

      // Foca o primeiro elemento focável (input > button)
      setTimeout(() => {
        const input  = modal.querySelector('input, textarea, select');
        const button = modal.querySelector('.modal__footer .btn--primary, .modal__footer button:last-child');
        (input || button || modal).focus();
      }, 150);
    });
  },

  alert(title, message) {
    // Overload: Modal.alert('mensagem só') ou Modal.alert('Título', 'mensagem')
    if (arguments.length === 1) {
      return this.show({
        title: '',
        body: title,
        buttons: [{ label: (typeof I18n !== 'undefined' ? I18n.t('modal.ok', 'OK') : 'OK'), variant: 'primary', value: true }]
      });
    }
    return this.show({
      title,
      body: message,
      buttons: [{ label: (typeof I18n !== 'undefined' ? I18n.t('modal.ok', 'OK') : 'OK'), variant: 'primary', value: true }]
    });
  },

  confirm(title, message, opts = {}) {
    return this.show({
      title,
      body: message,
      kind: opts.kind || 'default',
      buttons: [
        {
          label: opts.cancelLabel || (typeof I18n !== 'undefined' ? I18n.t('modal.cancel', 'Cancelar') : 'Cancelar'),
          variant: 'secondary',
          value: false
        },
        {
          label: opts.okLabel || (typeof I18n !== 'undefined' ? I18n.t('modal.confirm', 'Confirmar') : 'Confirmar'),
          variant: opts.kind === 'danger' ? 'danger' : 'primary',
          value: true
        }
      ]
    });
  },

  prompt(title, message, defaultValue = '', opts = {}) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      ${message ? `<p class="modal__message">${this._escape(message)}</p>` : ''}
      <input type="text" class="modal__input" value="${this._escape(defaultValue)}" ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ''}>
    `;
    const inputEl = wrap.querySelector('input');

    // Enter submete
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const okBtn = wrap.closest('.modal')?.querySelector('.btn--primary');
        if (okBtn) okBtn.click();
      }
    });

    return this.show({
      title,
      body: wrap,
      buttons: [
        {
          label: opts.cancelLabel || (typeof I18n !== 'undefined' ? I18n.t('modal.cancel', 'Cancelar') : 'Cancelar'),
          variant: 'secondary',
          value: null
        },
        {
          label: opts.okLabel || (typeof I18n !== 'undefined' ? I18n.t('modal.ok', 'OK') : 'OK'),
          variant: 'primary',
          onClick: () => inputEl.value
        }
      ]
    });
  },

  _close(backdrop) {
    if (!backdrop || !backdrop.parentNode) {
      this._cleanup();
      return;
    }
    backdrop.classList.remove('is-open');
    backdrop.classList.add('is-closing');
    this._cleanup();
    setTimeout(() => {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }, 260);
  },

  _closeSilent() {
    if (!this._open) return;
    const b = this._open;
    this._cleanup();
    if (b.parentNode) b.parentNode.removeChild(b);
  },

  _cleanup() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    this._open = null;
  },

  _escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  },

  _escapeLines(s) {
    return this._escape(s).replace(/\n/g, '<br>');
  }
};

window.Modal = Modal;
