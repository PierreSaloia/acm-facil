/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Router (navegação entre views + carregamento dinâmico)
   ══════════════════════════════════════════════════════════════════════════ */

const Router = {
  current: null,
  currentModule: null,
  _mountedModules: {}, // { name: { css_el, js_evaluated } }

  goto(name, opts = {}) {
    const views = document.querySelectorAll('[data-view]');
    views.forEach(v => {
      if (v.dataset.view === name) {
        v.hidden = false;
        v.classList.add('view--active');
      } else {
        v.hidden = true;
        v.classList.remove('view--active');
      }
    });
    Router.current = name;

    if (name === 'dashboard' && typeof Dashboard !== 'undefined') {
      Dashboard.render();
    }
    if (name === 'module' && opts.moduleName) {
      Router.currentModule = opts.moduleName;
      Router.mountModule(opts.moduleName);
    }
    if (name === 'auth' && typeof Auth !== 'undefined') {
      Auth.init();
    }

    if (typeof I18n !== 'undefined') I18n.applyToDOM();
  },

  /**
   * Carrega o painel de um módulo dinamicamente via Ruby callback.
   * Injeta HTML/CSS/JS e chama o init() do módulo.
   */
  async mountModule(name) {
    const title = document.getElementById('module_title');
    const body  = document.getElementById('module_body');
    if (!title || !body) return;

    title.textContent = I18n.t('mod.' + name + '.name', name);

    // Loading
    body.innerHTML = `
      <div class="module-loading">
        <div class="module-loading__spinner"></div>
        <p class="module-loading__text" data-i18n="module.loading">Carregando módulo...</p>
      </div>
    `;
    I18n.applyToDOM();

    try {
      const r = await Bridge.call('ui_load_module', { name });
      if (!r || !r.ok) {
        Router._mountError(body, r && r.code ? r.code : 'ui.load_error');
        return;
      }

      // 1. Injeta CSS se ainda não foi injetado
      if (!Router._mountedModules[name]) {
        if (r.css) {
          const styleEl = document.createElement('style');
          styleEl.id = 'module-css-' + name;
          styleEl.textContent = r.css;
          document.head.appendChild(styleEl);
        }
        Router._mountedModules[name] = { cssInjected: true, jsLoaded: false };
      }

      // 2. Injeta HTML no body
      body.innerHTML = r.html || '';

      // 3. Avalia JS (só uma vez por sessão)
      if (r.js && !Router._mountedModules[name].jsLoaded) {
        try {
          // Usa Function() ao invés de eval() pra scope isolado
          (new Function(r.js))();
          Router._mountedModules[name].jsLoaded = true;
        } catch (e) {
          console.error('Erro avaliando JS do módulo ' + name + ':', e);
          Router._mountError(body, 'ui.js_error', e.message);
          return;
        }
      }

      // 4. Aplica i18n no HTML injetado
      I18n.applyToDOM();

      // 5. Chama módulo.init() se existir
      const modNamespace = Router._getModuleNamespace(name);
      if (modNamespace && typeof modNamespace.init === 'function') {
        try { modNamespace.init(); } catch (e) { console.error('init() erro:', e); }
      }
    } catch (e) {
      Router._mountError(body, 'ui.comm_error', e.message);
    }
  },

  _getModuleNamespace(name) {
    // auto_acm → AutoAcm, corte_cnc → CorteCnc
    const cls = name.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    return window[cls];
  },

  _mountError(body, code, detail) {
    const msg = I18n.t(code, code);
    body.innerHTML = `
      <div class="module-empty">
        <div class="module-empty__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2 class="module-empty__title">${msg}</h2>
        ${detail ? `<p class="module-empty__text">${detail}</p>` : ''}
      </div>
    `;
  }
};

window.Router = Router;
