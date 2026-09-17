/* ══════════════════════════════════════════════════════════════════════════
   SignEng — App bootstrap
   ══════════════════════════════════════════════════════════════════════════ */

const App = {
  state: {
    uiScale: 'md',  // 'sm' | 'md' | 'lg'
    theme:   'light' // 'light' | 'dark'
  },

  async init() {
    // 1. Tema — aplica antes do resto pra evitar flash
    await App.loadTheme();
    // 1b. UI Scale — aplica antes do idioma pra evitar flash
    await App.loadUiScale();

    // 2. Idioma (traduz tudo)
    await I18n.init();

    // 3. Keyboard shortcuts globais
    App._bindKeyboard();

    // 4. Versão do plugin
    try {
      const info = await Bridge.call('app_info');
      if (info && info.version) {
        const el = document.getElementById('auth_version');
        if (el) el.textContent = info.version;
      }
    } catch (e) { /* ignora */ }

    // Modo local/offline: não depende de sessão online nem de login.
    // O app abre diretamente no painel de módulos.
    const offlineUser = {
      local_id: 'offline-local-user',
      email: 'offline@local',
      nome: 'Local',
      role: 'admin',
      status: 'active',
      modules: ['auto_acm', 'auto_acm_curvo', 'auto_sigame', 'textura_sync', 'logo3d', 'planifica', 'corte_encaixe']
    };
    const offlineLicense = {
      plan: 'admin',
      status: 'active',
      paid: true,
      expires_at: null,
      days_left: 99999,
      max_machines: 999
    };

    Auth.state.user = offlineUser;
    Auth.state.license = offlineLicense;
    Auth._updateUserChrome(offlineUser, offlineLicense);
    await App.gotoStart();
    setTimeout(() => App.checkUpdate(), 1500);
    return;
  },

  /**
   * View inicial pós-login: se um botão de módulo da toolbar abriu o painel,
   * entra DIRETO no módulo pendente (ui_pending_module); senão, dashboard.
   */
  async gotoStart() {
    try {
      const r = await Bridge.call('ui_pending_module');
      if (r && r.ok && r.module) {
        Router.goto('module', { moduleName: r.module });
        return;
      }
    } catch (e) { /* segue pro dashboard */ }
    Router.goto('dashboard');
  },

  // ──────────── LICENSE GATE ────────────

  /**
   * Revalidação silenciosa de licença. Chamada pelo heartbeat (30min),
   * pela reabertura do diálogo (main.rb#abrir), e manualmente quando
   * necessário. force=true ignora o cache de 1h da assert_valid!.
   */
  async revalidate(force = false) {
    try {
      const r = await Bridge.call('auth_revalidate', { force: !!force });
      // Bridge já intercepta blocked:true e chama handleBlocked.
      return r;
    } catch (e) {
      // Erro de bridge não deve bloquear o user (rede ruim, timeout).
      console.warn('revalidate falhou:', e);
      return { ok: true, code: 'revalidate.bridge_err' };
    }
  },

  /**
   * Tratamento centralizado de bloqueio de licença. Aciona um toast
   * vermelho explicando o motivo, espera o user ler, então desloga
   * e manda pra tela de login (que ao montar mostra a msg de novo).
   */
  _blockedHandling: false,
  handleBlocked(data) {
    if (App._blockedHandling) return;
    App._blockedHandling = true;
    const msg = (data && data.error) || 'Sua licença não está mais válida.';
    try {
      if (typeof Toast !== 'undefined') {
        Toast.error(msg, { duration: 6000 });
      }
    } catch (e) {}
    setTimeout(async () => {
      try { await Bridge.call('auth_logout'); } catch (e) {}
      Auth.state.user = null;
      Auth.state.license = null;
      Router.goto('auth');
      App._blockedHandling = false;
    }, 2000);
  },

  // Mantidos como no-ops pra compatibilidade com chamadas existentes.
  // Bloqueio acontece só no clique do Gerar (sem timer em background).
  _startGates() {},
  _stopGates()  {},
  _startHeartbeat() {},
  _stopHeartbeat()  {},

  // ──────────── UI SCALE ────────────

  /**
   * Carrega a preferência salva de UI scale e aplica.
   */
  async loadUiScale() {
    let scale = 'md';
    try {
      const r = await Bridge.call('ui_scale_get');
      if (r && r.scale && ['sm', 'md', 'lg'].includes(r.scale)) {
        scale = r.scale;
      }
    } catch (e) {}
    App._applyUiScale(scale);
  },

  /**
   * Define o UI scale (sm/md/lg), aplica ao DOM, persiste.
   */
  setUiScale(scale) {
    if (!['sm', 'md', 'lg'].includes(scale)) return;
    App._applyUiScale(scale);
    Bridge.call('ui_scale_save', { scale }).catch(() => {});
    if (typeof Toast !== 'undefined') {
      const label = { sm: '75%', md: '100%', lg: '125%' }[scale];
      Toast.info((I18n.t ? I18n.t('scale.changed', 'Tamanho da interface') : 'Tamanho') + ': ' + label, { duration: 2000 });
    }
  },

  _applyUiScale(scale) {
    App.state.uiScale = scale;
    document.documentElement.dataset.uiScale = scale;
    document.querySelectorAll('.scale-switch__btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.scale === scale);
    });
  },

  // ──────────── THEME (light ↔ dark) ────────────

  async loadTheme() {
    let theme = 'light';
    try {
      const r = await Bridge.call('theme_get');
      if (r && r.theme && ['light', 'dark'].includes(r.theme)) {
        theme = r.theme;
      }
    } catch (e) {}
    App._applyTheme(theme);
  },

  toggleTheme() {
    const next = App.state.theme === 'dark' ? 'light' : 'dark';
    App._applyTheme(next);
    Bridge.call('theme_save', { theme: next }).catch(() => {});
    if (typeof Toast !== 'undefined') {
      const label = next === 'dark'
        ? (I18n.t ? I18n.t('theme.dark', 'Tema escuro') : 'Dark')
        : (I18n.t ? I18n.t('theme.light', 'Tema claro') : 'Light');
      Toast.info(label, { duration: 1500 });
    }
  },

  _applyTheme(theme) {
    App.state.theme = theme;
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  },

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // UI Scale shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const next = { sm: 'md', md: 'lg', lg: 'lg' }[App.state.uiScale];
          App.setUiScale(next);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          const next = { lg: 'md', md: 'sm', sm: 'sm' }[App.state.uiScale];
          App.setUiScale(next);
        } else if (e.key === '0') {
          e.preventDefault();
          App.setUiScale('md');
        }
      }
    });
  },

  // ──────────── SETTINGS MODAL ────────────

  openSettings() {
    const wrap = document.createElement('div');
    const ver = (document.getElementById('auth_version')?.textContent) || '—';
    const user = Auth?.state?.user?.email || '—';
    const theme = App.state.theme;
    const scale = App.state.uiScale;
    const lang  = (typeof I18n !== 'undefined' && I18n.lang) ? I18n.lang : 'pt';

    wrap.innerHTML = `
      <div class="settings">
        <div class="settings__row">
          <div class="settings__row-label">${App._esc(I18n.t('settings.theme', 'Tema'))}</div>
          <div class="settings__row-control">
            <button type="button" class="settings__chip ${theme==='light'?'is-active':''}" data-set-theme="light">
              ${App._esc(I18n.t('theme.light', 'Claro'))}
            </button>
            <button type="button" class="settings__chip ${theme==='dark'?'is-active':''}" data-set-theme="dark">
              ${App._esc(I18n.t('theme.dark', 'Escuro'))}
            </button>
          </div>
        </div>

        <div class="settings__row">
          <div class="settings__row-label">${App._esc(I18n.t('settings.scale', 'Tamanho da interface'))}</div>
          <div class="settings__row-control">
            <button type="button" class="settings__chip ${scale==='sm'?'is-active':''}" data-set-scale="sm">75%</button>
            <button type="button" class="settings__chip ${scale==='md'?'is-active':''}" data-set-scale="md">100%</button>
            <button type="button" class="settings__chip ${scale==='lg'?'is-active':''}" data-set-scale="lg">125%</button>
          </div>
        </div>

        <div class="settings__row">
          <div class="settings__row-label">${App._esc(I18n.t('settings.lang', 'Idioma'))}</div>
          <div class="settings__row-control">
            <button type="button" class="settings__chip ${lang==='pt'?'is-active':''}" data-set-lang="pt">PT</button>
            <button type="button" class="settings__chip ${lang==='es'?'is-active':''}" data-set-lang="es">ES</button>
            <button type="button" class="settings__chip ${lang==='en'?'is-active':''}" data-set-lang="en">EN</button>
          </div>
        </div>

        <div class="settings__divider"></div>

        <details class="settings__group" id="empresa_group">
          <summary class="settings__group-summary">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>
            <span class="settings__group-title">${App._esc(I18n.t('empresa.title', 'Cadastro da Empresa'))}</span>
            <span class="settings__group-hint">${App._esc(I18n.t('empresa.hint', 'Aparecerá no relatório'))}</span>
          </summary>

          <div class="settings__group-body">
            <div class="empresa-form">
              <div class="empresa-form__logo">
                <div class="empresa-form__logo-preview" id="empresa_logo_preview">
                  <span class="empresa-form__logo-empty">${App._esc(I18n.t('empresa.logo.none', 'Sem logo'))}</span>
                </div>
                <div class="empresa-form__logo-actions">
                  <input type="file" id="empresa_logo_input" accept="image/png,image/jpeg" hidden>
                  <button type="button" class="btn btn--secondary btn--sm" id="empresa_logo_btn">
                    ${App._esc(I18n.t('empresa.logo.upload', 'Carregar logo'))}
                  </button>
                  <button type="button" class="btn btn--ghost btn--sm" id="empresa_logo_clear" hidden>
                    ${App._esc(I18n.t('empresa.logo.clear', 'Remover'))}
                  </button>
                  <p class="empresa-form__logo-help">${App._esc(I18n.t('empresa.logo.help', 'PNG ou JPEG. Máx 500 KB. Imagens grandes serão redimensionadas.'))}</p>
                </div>
              </div>

              <div class="empresa-form__grid">
                <div class="field">
                  <label class="field__label" for="empresa_nome">${App._esc(I18n.t('empresa.nome', 'Razão social / Nome'))}</label>
                  <input class="field__input field__input--plain" type="text" id="empresa_nome" maxlength="120">
                </div>

                <div class="field">
                  <label class="field__label">${App._esc(I18n.t('empresa.doc.tipo', 'Documento'))}</label>
                  <div class="settings__row-control">
                    <button type="button" class="settings__chip is-active" data-set-doc="cnpj">CNPJ</button>
                    <button type="button" class="settings__chip" data-set-doc="cpf">CPF</button>
                  </div>
                </div>

                <div class="field">
                  <label class="field__label" for="empresa_doc">${App._esc(I18n.t('empresa.doc.num', 'Número'))}</label>
                  <input class="field__input field__input--plain" type="text" id="empresa_doc" maxlength="20" placeholder="00.000.000/0000-00">
                </div>

                <div class="field empresa-form__field-wide">
                  <label class="field__label" for="empresa_endereco">${App._esc(I18n.t('empresa.endereco', 'Endereço'))}</label>
                  <input class="field__input field__input--plain" type="text" id="empresa_endereco" maxlength="200">
                </div>

                <div class="field">
                  <label class="field__label" for="empresa_fone">${App._esc(I18n.t('empresa.fone', 'Telefone / WhatsApp'))}</label>
                  <input class="field__input field__input--plain" type="text" id="empresa_fone" maxlength="40" placeholder="(00) 00000-0000">
                </div>

                <div class="field">
                  <label class="field__label" for="empresa_email">${App._esc(I18n.t('empresa.email', 'Email comercial'))}</label>
                  <input class="field__input field__input--plain" type="email" id="empresa_email" maxlength="120">
                </div>

                <div class="field">
                  <label class="field__label" for="empresa_repr">${App._esc(I18n.t('empresa.repr', 'Representante comercial'))}</label>
                  <input class="field__input field__input--plain" type="text" id="empresa_repr" maxlength="100">
                </div>

                <div class="field">
                  <label class="field__label" for="empresa_cargo">${App._esc(I18n.t('empresa.cargo', 'Cargo'))}</label>
                  <input class="field__input field__input--plain" type="text" id="empresa_cargo" maxlength="80">
                </div>
              </div>

              <div class="empresa-form__footer">
                <span class="empresa-form__status" id="empresa_status"></span>
                <button type="button" class="btn btn--primary btn--sm" id="empresa_save_btn">
                  ${App._esc(I18n.t('empresa.save', 'Salvar empresa'))}
                </button>
              </div>
            </div>
          </div>
        </details>

        <div class="settings__divider"></div>

        <div class="settings__info">
          <div class="settings__info-item">
            <span class="settings__info-label">${App._esc(I18n.t('settings.user', 'Usuário'))}</span>
            <span class="settings__info-value">${App._esc(user)}</span>
          </div>
          <div class="settings__info-item">
            <span class="settings__info-label">${App._esc(I18n.t('settings.version', 'Versão'))}</span>
            <span class="settings__info-value">v${App._esc(ver)}</span>
          </div>
        </div>

        <div class="settings__actions">
          <button type="button" class="btn btn--ghost btn--sm" id="settings_check_update">
            ${App._esc(I18n.t('auth.update.check', 'Buscar atualização'))}
          </button>
        </div>
      </div>
    `;

    // Wire up botões dentro do modal
    wrap.querySelectorAll('[data-set-theme]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.setTheme;
        if (t !== App.state.theme) App.toggleTheme();
        wrap.querySelectorAll('[data-set-theme]').forEach(x =>
          x.classList.toggle('is-active', x.dataset.setTheme === App.state.theme));
      });
    });
    wrap.querySelectorAll('[data-set-scale]').forEach(b => {
      b.addEventListener('click', () => {
        App.setUiScale(b.dataset.setScale);
        wrap.querySelectorAll('[data-set-scale]').forEach(x =>
          x.classList.toggle('is-active', x.dataset.setScale === App.state.uiScale));
      });
    });
    wrap.querySelectorAll('[data-set-lang]').forEach(b => {
      b.addEventListener('click', () => {
        I18n.setLang(b.dataset.setLang);
        wrap.querySelectorAll('[data-set-lang]').forEach(x =>
          x.classList.toggle('is-active', x.dataset.setLang === I18n.lang));
      });
    });
    wrap.querySelector('#settings_check_update')?.addEventListener('click', () => {
      App.buscarAtualizacao();
    });

    // ── Cadastro da Empresa ─────────────────────────────────────
    App._wireEmpresaForm(wrap);

    Modal.show({
      title: I18n.t('settings.title', 'Configurações'),
      body: wrap,
      buttons: [
        { label: I18n.t('modal.ok', 'Fechar'), variant: 'primary', value: true }
      ]
    });
  },

  /**
   * Liga os controles da seção "Cadastro da Empresa" no modal de configurações.
   * Carrega dados do disco via Bridge.empresa_get, faz resize client-side da
   * logo (Canvas) e salva via Bridge.empresa_save.
   */
  _wireEmpresaForm(root) {
    const $ = (sel) => root.querySelector(sel);

    const state = { logoData: '', docTipo: 'cnpj' };

    const preview      = $('#empresa_logo_preview');
    const fileInput    = $('#empresa_logo_input');
    const uploadBtn    = $('#empresa_logo_btn');
    const clearBtn     = $('#empresa_logo_clear');
    const statusEl     = $('#empresa_status');
    const saveBtn      = $('#empresa_save_btn');
    const docChips     = root.querySelectorAll('[data-set-doc]');

    const renderLogo = () => {
      if (state.logoData) {
        preview.innerHTML = `<img src="${state.logoData}" alt="Logo">`;
        clearBtn.hidden = false;
      } else {
        preview.innerHTML = `<span class="empresa-form__logo-empty">${App._esc(I18n.t('empresa.logo.none', 'Sem logo'))}</span>`;
        clearBtn.hidden = true;
      }
    };

    const setStatus = (msg, kind) => {
      statusEl.textContent = msg || '';
      statusEl.dataset.kind = kind || '';
    };

    // ── Carrega dados existentes do disco ─────────
    Bridge.call('empresa_get').then(r => {
      if (!r || !r.ok) return;
      const e = r.empresa || {};
      $('#empresa_nome').value     = e.nome     || '';
      $('#empresa_doc').value      = e.doc      || '';
      $('#empresa_endereco').value = e.endereco || '';
      $('#empresa_fone').value     = e.fone     || '';
      $('#empresa_email').value    = e.email    || '';
      $('#empresa_repr').value     = e.repr     || '';
      $('#empresa_cargo').value    = e.cargo    || '';
      state.logoData = e.logo || '';
      state.docTipo  = e.doc_tipo === 'cpf' ? 'cpf' : 'cnpj';
      docChips.forEach(c => c.classList.toggle('is-active', c.dataset.setDoc === state.docTipo));
      const docInput = $('#empresa_doc');
      docInput.placeholder = state.docTipo === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00';
      renderLogo();
    }).catch(err => {
      console.error('[Empresa] empresa_get:', err);
    });

    // ── Toggle CNPJ/CPF ─────────
    docChips.forEach(c => c.addEventListener('click', () => {
      state.docTipo = c.dataset.setDoc;
      docChips.forEach(x => x.classList.toggle('is-active', x.dataset.setDoc === state.docTipo));
      $('#empresa_doc').placeholder = state.docTipo === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00';
    }));

    // ── Upload da logo (resize client-side) ─────────
    uploadBtn.addEventListener('click', () => fileInput.click());
    clearBtn.addEventListener('click', () => {
      state.logoData = '';
      fileInput.value = '';
      renderLogo();
      setStatus(I18n.t('empresa.logo.cleared', 'Logo removida (lembre de salvar).'), 'info');
    });
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
        setStatus(I18n.t('empresa.logo.err.type', 'Use PNG ou JPEG.'), 'error');
        return;
      }
      try {
        setStatus(I18n.t('empresa.logo.processing', 'Processando…'), 'info');
        const dataUri = await App._resizeImageFile(file, { maxW: 800, maxH: 800, quality: 0.85, maxBytes: 500 * 1024 });
        state.logoData = dataUri;
        renderLogo();
        const kb = Math.round(dataUri.length * 0.75 / 1024);
        setStatus(I18n.t('empresa.logo.ok', 'Logo carregada (~{kb} KB).').replace('{kb}', kb), 'ok');
      } catch (err) {
        console.error('[Empresa] resize:', err);
        setStatus(I18n.t('empresa.logo.err.generic', 'Falha ao processar a imagem.'), 'error');
      }
    });

    // ── Salvar ─────────
    saveBtn.addEventListener('click', async () => {
      const empresa = {
        nome:     $('#empresa_nome').value.trim(),
        doc_tipo: state.docTipo,
        doc:      $('#empresa_doc').value.trim(),
        endereco: $('#empresa_endereco').value.trim(),
        fone:     $('#empresa_fone').value.trim(),
        email:    $('#empresa_email').value.trim(),
        repr:     $('#empresa_repr').value.trim(),
        cargo:    $('#empresa_cargo').value.trim(),
        logo:     state.logoData
      };
      saveBtn.disabled = true;
      setStatus(I18n.t('empresa.saving', 'Salvando…'), 'info');
      try {
        const r = await Bridge.call('empresa_save', { empresa });
        if (r && r.ok) {
          setStatus(I18n.t('empresa.saved', 'Cadastro salvo.'), 'ok');
        } else {
          setStatus((r && r.error) || I18n.t('empresa.save.err', 'Falha ao salvar.'), 'error');
        }
      } catch (err) {
        console.error('[Empresa] save:', err);
        setStatus(I18n.t('empresa.save.err', 'Falha ao salvar.'), 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });
  },

  /**
   * Lê um File de imagem e devolve um data URI redimensionado.
   * - Converte sempre pra JPEG (menor) a menos que original seja PNG pequeno.
   * - Reduz dimensões se ultrapassar maxW/maxH preservando proporção.
   * - Se ainda passar de maxBytes, reduz quality em passos até caber.
   */
  _resizeImageFile(file, opts = {}) {
    const maxW = opts.maxW || 800;
    const maxH = opts.maxH || 800;
    const initialQ = opts.quality != null ? opts.quality : 0.85;
    const maxBytes = opts.maxBytes || 500 * 1024;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode failed'));
        img.onload = () => {
          let { width: w, height: h } = img;
          const scale = Math.min(1, maxW / w, maxH / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; // fundo branco pra PNG transparente em JPEG
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          // Tenta JPEG, reduz quality até caber em maxBytes (ou até q=0.4)
          let q = initialQ;
          let dataUri = canvas.toDataURL('image/jpeg', q);
          while (dataUri.length * 0.75 > maxBytes && q > 0.4) {
            q = Math.max(0.4, q - 0.1);
            dataUri = canvas.toDataURL('image/jpeg', q);
          }
          resolve(dataUri);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  },

  /**
   * Check de update em background (silencioso).
   * Consulta o Firestore via Bridge.app_check_update → se tiver versão nova,
   * renderiza badge dourado no topbar + toast discreto.
   * Chamado no boot após login bem sucedido (delay 1.5s).
   */
  async checkUpdate() {
    try {
      const r = await Bridge.call('app_check_update');
      if (!r || !r.ok) return;

      App.state.updateInfo = r;

      if (r.update === true && r.download_url) {
        // Tem versão nova!
        App._showUpdateBadge(r);
        if (typeof Toast !== 'undefined') {
          Toast.info(
            I18n.t('app.update.toast', 'Nova versão disponível: v{v}').replace('{v}', r.remote),
            {
              duration: 8000,
              action: {
                label: I18n.t('app.update.toast.btn', 'Baixar'),
                onClick: () => App.openUpdateDownload()
              }
            }
          );
        }
      }
    } catch (e) {
      console.error('[App] checkUpdate:', e);
    }
  },

  /**
   * Mostra o badge dourado "Atualização disponível" no topbar.
   * Substitui o badge de licença temporariamente quando há update.
   */
  _showUpdateBadge(info) {
    let badge = document.getElementById('update_badge');
    if (!badge) {
      badge = document.createElement('button');
      badge.id = 'update_badge';
      badge.className = 'update-badge';
      badge.type = 'button';
      badge.title = (info.changelog || '') + '\n\nClique pra baixar a v' + info.remote;
      badge.addEventListener('click', () => App.openUpdateDownload());
      const actions = document.querySelector('.topbar__actions');
      if (actions) actions.insertBefore(badge, actions.firstChild);
    }
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      <span>v${info.remote}</span>
    `;
    badge.hidden = false;
  },

  /** Abre a URL de download no browser do sistema. */
  openUpdateDownload() {
    const info = App.state.updateInfo;
    if (!info || !info.download_url) return;
    Bridge.call('app_open_url', { url: info.download_url }).catch(() => {});
    if (typeof Toast !== 'undefined') {
      Toast.success(
        I18n.t('app.update.downloading',
          'Baixando no seu navegador. Abra SketchUp → Extension Manager → Install.'),
        { duration: 6000 }
      );
    }
  },

  /** Mantido por compatibilidade — abre modal de "buscar atualização". */
  async buscarAtualizacao(event) {
    if (event) event.preventDefault();
    try {
      const r = await Bridge.call('app_check_update');
      if (r && r.update && r.download_url) {
        // Tem atualização
        const ok = await (typeof Modal !== 'undefined' ? Modal.confirm(
          I18n.t('app.update.title', 'Atualização disponível'),
          I18n.t('app.update.msg', 'Nova versão v{v} disponível.\n\n{changelog}\n\nBaixar agora?')
            .replace('{v}', r.remote)
            .replace('{changelog}', r.changelog || ''),
          { okLabel: I18n.t('app.update.download', 'Baixar'), cancelLabel: I18n.t('modal.cancel', 'Cancelar') }
        ) : Promise.resolve(confirm('Nova versão ' + r.remote + '. Baixar?')));
        if (ok) App.openUpdateDownload();
      } else {
        const msg = I18n.t('app.update.uptodate', 'Você já está na versão mais recente.');
        if (typeof Modal !== 'undefined') {
          Modal.alert(I18n.t('app.update.title', 'Atualização'), msg);
        } else {
          alert(msg);
        }
      }
    } catch (e) {
      if (typeof Toast !== 'undefined') {
        Toast.error(I18n.t('auth.error.comm') + ': ' + e.message);
      }
    }
  }
};

window.App = App;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
