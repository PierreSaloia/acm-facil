/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Auth (tela de login)
   ══════════════════════════════════════════════════════════════════════════ */

const Auth = {
  state: {
    user: null,
    license: null,
    loading: false
  },

  /**
   * Inicializa a tela de login.
   * Pré-preenche o email salvo (se houver).
   */
  async init() {
    try {
      const r = await Bridge.call('auth_saved_email');
      if (r && r.ok && r.email) {
        const input = document.getElementById('auth_email');
        if (input) input.value = r.email;
        const pwd = document.getElementById('auth_pwd');
        if (pwd) pwd.focus();
      } else {
        const input = document.getElementById('auth_email');
        if (input) input.focus();
      }
    } catch (e) {
      console.warn('auth_saved_email falhou:', e);
    }
    // Se o user foi deslogado por bloqueio (trial expirou, PC bloqueado,
    // limite de máquinas), o Ruby persistiu a mensagem. Lê e mostra
    // pré-preenchida em vermelho na tela de login pra ele entender.
    try {
      const b = await Bridge.call('auth_get_block_msg');
      if (b && b.ok && b.msg && b.msg.length > 0) {
        Auth._showError(b.msg);
      }
    } catch (e) {}
  },

  togglePassword() {
    const input = document.getElementById('auth_pwd');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  },

  async handleSubmit(event) {
    event.preventDefault();
    if (Auth.state.loading) return false;

    const email    = document.getElementById('auth_email').value.trim();
    const pwd      = document.getElementById('auth_pwd').value;
    const remember = document.getElementById('auth_remember').checked;
    const btn      = document.getElementById('auth_submit');

    Auth._clearError();
    Auth._setLoading(true, btn);

    try {
      const result = await Bridge.call('auth_login', { email, pwd, remember });

      if (result && result.ok) {
        Auth.state.user = result.user;
        Auth.state.license = result.license || null;
        Auth._updateUserChrome(result.user, result.license);
        if (typeof Toast !== 'undefined') {
          Toast.success(I18n.t('auth.login.welcome', 'Bem-vindo, {n}!')
            .replace('{n}', (result.user.nome || '').split(' ')[0] || '—'),
            { duration: 2000 });
        }
        setTimeout(() => {
          // entra no módulo pendente da toolbar (se houver) ou no dashboard
          if (typeof App !== 'undefined' && App.gotoStart) App.gotoStart();
          else Router.goto('dashboard');
          Auth._setLoading(false, btn);
          // Inicia gates de licença (heartbeat 10min + tick local 30s).
          if (typeof App !== 'undefined' && App._startGates) {
            App._startGates();
          }
        }, 250);
      } else {
        const code = (result && result.code) || 'auth.error.comm';
        Auth._showError(I18n.t(code));
        Auth._setLoading(false, btn);
      }
    } catch (e) {
      Auth._showError(I18n.t('auth.error.comm') + ': ' + e.message);
      Auth._setLoading(false, btn);
    }

    return false;
  },

  async logout() {
    try { await Bridge.call('auth_logout'); } catch (e) {}
    Auth.state.user = null;
    Auth.state.license = null;
    const pwd = document.getElementById('auth_pwd');
    if (pwd) pwd.value = '';
    Router.goto('auth');
  },

  async recuperarSenha(event) {
    if (event) event.preventDefault();
    const emailInput = document.getElementById('auth_email');
    const email = emailInput ? emailInput.value.trim() : '';
    try {
      const r = await Bridge.call('auth_recuperar', { email });
      if (r && r.ok && typeof Toast !== 'undefined') {
        Toast.success(I18n.t('auth.recover.sent',
          'Email de recuperação enviado. Confere sua caixa de entrada.'));
      } else if (r && !r.ok && typeof Toast !== 'undefined') {
        Toast.error(I18n.t(r.code || 'auth.recover.error',
          'Não foi possível enviar o email.'));
      }
    } catch (e) {
      if (typeof Toast !== 'undefined') Toast.error(e.message);
    }
  },

  // ─── helpers internos ────────────────────────────────────────

  _setLoading(on, btn) {
    Auth.state.loading = on;
    if (!btn) return;
    btn.disabled = on;
    const label = on ? I18n.t('auth.submit.loading') : I18n.t('auth.submit');
    btn.innerHTML = on
      ? `<span>${label}</span>`
      : `<span>${label}</span><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>`;
  },

  _showError(msg) {
    const box = document.getElementById('auth_error');
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
  },

  _clearError() {
    const box = document.getElementById('auth_error');
    if (!box) return;
    box.textContent = '';
    box.hidden = true;
  },

  _updateUserChrome(user, license) {
    const topUser = document.getElementById('topbar_user');
    const dashNom = document.getElementById('dash_nome');
    if (topUser) topUser.textContent = user.nome || user.email;
    if (dashNom) {
      const first = (user.nome || '').split(' ')[0] || '—';
      dashNom.textContent = first;
    }

    // Badge de licença na topbar
    let badge = document.getElementById('license_badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'license_badge';
      badge.className = 'license-badge';
      const actions = document.querySelector('.topbar__actions');
      if (actions) actions.insertBefore(badge, actions.firstChild);
    }
    if (license) {
      const planLabels = {
        admin:      I18n.t('license.admin', 'Admin'),
        trial:      I18n.t('license.trial', 'Trial'),
        pro:        I18n.t('license.pro', 'Pro'),
        enterprise: I18n.t('license.enterprise', 'Empresa'),
        expired:    I18n.t('license.expired', 'Expirado')
      };
      const label = planLabels[license.plan] || license.plan;
      const daysLeft = license.days_left;
      let text = label;

      // Formata ISO → "DD/MM"
      const fmtShort = (iso) => {
        try {
          const d = new Date(iso);
          if (isNaN(d.getTime())) return '';
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          return dd + '/' + mm;
        } catch (e) { return ''; }
      };

      if (license.plan === 'trial' && daysLeft != null && daysLeft < 99999) {
        text += ' · ' + I18n.t('license.days_left', '{n}d').replace('{n}', daysLeft);
      } else if ((license.plan === 'pro' || license.plan === 'enterprise') && license.paid) {
        // Plano pago Stripe: mostra "até DD/MM"
        const short = fmtShort(license.renews_on || license.expires_at);
        if (short) text += ' · ' + I18n.t('license.until', 'até {d}').replace('{d}', short);
      } else if (license.plan === 'admin') {
        text += ' · ∞';
      }

      badge.textContent = text;
      badge.className = 'license-badge license-badge--' + (license.plan || 'trial');
      badge.title = license.paid
        ? I18n.t('license.paid.tooltip', 'Assinatura ativa. Renova em {d}').replace('{d}', fmtShort(license.renews_on) || '—')
        : (license.plan === 'trial' ? I18n.t('license.trial.tooltip', 'Período de teste') : label);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
};

window.Auth = Auth;
