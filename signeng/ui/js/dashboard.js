/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Dashboard (lançador de módulos)
   ══════════════════════════════════════════════════════════════════════════ */

const Dashboard = {
  // Catálogo de módulos. Os textos (name/desc/badge) vêm do i18n — cada
  // item aqui só tem o id, ícone SVG e flags de estado.
  modules: [
    {
      id: 'auto_acm',
      badge: { type: 'info', key: 'badge.main' },
      locked: false,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1" opacity="0.4"/></svg>`
    },
    {
      id: 'auto_acm_curvo',
      badge: { type: 'info', key: 'badge.new' },
      locked: false,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21 C5 8, 19 8, 19 21"/><line x1="5" y1="21" x2="19" y2="21"/><path d="M7 18 C7 11, 17 11, 17 18" opacity="0.5"/><path d="M9 15 C9 13, 15 13, 15 15" opacity="0.3"/></svg>`
    },
    {
      id: 'auto_sigame',
      badge: { type: 'info', key: 'badge.new' },
      locked: false,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18 L8 18 L8 11 L14 11 L14 16 L21 16"/><circle cx="3" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="11" r="1.4" fill="currentColor" stroke="none"/><circle cx="14" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="21" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>`
    },
    {
      id: 'textura_sync',
      badge: { type: 'info', key: 'badge.new' },
      locked: false,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/><path d="M3 17l4-4 3 3" opacity="0.5"/></svg>`
    },
    {
      id: 'logo3d',
      badge: { type: 'info', key: 'badge.new' },
      locked: false,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7 L12 3 L21 7 L21 17 L12 21 L3 17 Z"/><path d="M3 7 L12 11 L21 7"/><path d="M12 11 L12 21" opacity="0.6"/><path d="M7 9 L7 15" opacity="0.4"/><path d="M17 9 L17 15" opacity="0.4"/></svg>`
    },
    {
      id: 'planifica',
      badge: { type: 'info', key: 'badge.new' },
      locked: false,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1.5"/><rect x="5.5" y="5.5" width="7" height="5" rx="0.5" opacity="0.6"/><rect x="14" y="5.5" width="4.5" height="9" rx="0.5" opacity="0.6"/><rect x="5.5" y="12" width="7" height="6.5" rx="0.5" opacity="0.4"/></svg>`
    },
    {
      id: 'corte_encaixe',
      badge: { type: 'info', key: 'badge.new' },
      locked: false,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6v3h4V4h6v6h-3v4h3v6h-6v-3h-4v3H4v-6h3v-4H4z"/><path d="M10 10h4v4h-4z" opacity="0.5"/></svg>`
    }
    // Cards "Em breve" (marquise, colunas, caixa_luminosa, letras_caixa,
    // corte_cnc) REMOVIDOS do lançador a pedido do Marcelo (2026-07-22) —
    // voltam quando cada módulo for lançado de verdade.
  ],

  render() {
    const grid = document.getElementById('dash_grid');
    if (!grid) return;

    const user    = Auth.state.user;
    const license = Auth.state.license || null;
    const allowed = (user && user.modules) || [];

    // Admin/master → tudo liberado sem banner
    // Trial ativa > 5 dias → banner não aparece
    // Trial ativa ≤ 5 dias → banner amarelo "trial acabando"
    // Trial/outros expirados → banner vermelho + BLOCKED cards
    const isPrivileged = user && (user.role === 'admin' || user.role === 'master');
    const licActive    = license && license.status === 'active';
    const licExpired   = license && license.status === 'expired';
    const daysLeft     = license ? (license.days_left || 0) : 0;
    const licBlocks    = !isPrivileged && (licExpired || !licActive);

    // ── Renderiza o banner de licença (se aplicável) ──
    Dashboard._renderLicenseBanner(user, license, { licBlocks, daysLeft, isPrivileged });

    // ── Renderiza os cards ──
    grid.innerHTML = Dashboard.modules.map(m => {
      let hasAccess;
      if (isPrivileged) {
        hasAccess = true;
      } else if (licBlocks) {
        // Licença expirada/inexistente → nada liberado
        hasAccess = false;
      } else if (allowed.length > 0) {
        hasAccess = allowed.indexOf(m.id) !== -1;
      } else {
        hasAccess = licActive;
      }

      // Distinção visual:
      //  - card--locked: módulo "coming soon" (permanent, mesmo pra admin)
      //  - card--blocked: bloqueado pela licença (mostra modal de upgrade)
      const isLocked  = m.locked;
      const isBlocked = !isLocked && !hasAccess;
      const classes = ['card'];
      if (isLocked)  classes.push('card--locked');
      if (isBlocked) classes.push('card--blocked');

      let onClick = '';
      if (isLocked) {
        // Não faz nada
      } else if (isBlocked) {
        onClick = `onclick="Dashboard.showUpgradePrompt('${m.id}')"`;
      } else {
        onClick = `onclick="Dashboard.open('${m.id}')"`;
      }

      const name  = I18n.t('mod.' + m.id + '.name', m.id);
      const desc  = I18n.t('mod.' + m.id + '.desc', '');
      const badge = m.badge ? Dashboard._renderBadge(m.badge) : '';
      const lockIcon = isBlocked
        ? `<div class="card__lock-overlay"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>`
        : '';

      return `
        <article class="${classes.join(' ')}" ${onClick}>
          ${lockIcon}
          <div class="card__visual">${m.svg}</div>
          ${badge}
          <h3 class="card__title">${name}</h3>
          <p class="card__desc">${desc}</p>
        </article>
      `;
    }).join('');
  },

  _renderLicenseBanner(user, license, ctx) {
    const host = document.getElementById('dash_license_banner');
    if (!host) return;

    // Admin/master → sem banner
    if (ctx.isPrivileged) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }

    // Sem licença → nada a exibir
    if (!license) {
      host.hidden = true;
      return;
    }

    // Trial expirado ou inválido → banner vermelho
    if (ctx.licBlocks) {
      host.hidden = false;
      host.innerHTML = `
        <div class="lic-banner lic-banner--danger">
          <div class="lic-banner__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="lic-banner__body">
            <div class="lic-banner__title">${I18n.t('lic.expired.title', 'Seu período de teste expirou')}</div>
            <div class="lic-banner__msg">${I18n.t('lic.expired.msg',
              'Renove pra continuar usando o SignEng. Assinatura Pro a partir de R$ 49/mês.')}</div>
          </div>
          <button type="button" class="btn btn--primary" onclick="Dashboard.openUpgrade()">
            ${I18n.t('lic.expired.cta', 'Renovar agora')}
          </button>
        </div>
      `;
      return;
    }

    // Trial ativa ≤ 5 dias → banner amarelo
    if (license.plan === 'trial' && ctx.daysLeft > 0 && ctx.daysLeft <= 5) {
      host.hidden = false;
      host.innerHTML = `
        <div class="lic-banner lic-banner--warning">
          <div class="lic-banner__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="lic-banner__body">
            <div class="lic-banner__title">${I18n.t('lic.ending.title', 'Seu trial acaba em {n} dia(s)').replace('{n}', ctx.daysLeft)}</div>
            <div class="lic-banner__msg">${I18n.t('lic.ending.msg',
              'Aproveita pra assinar agora e não perder o acesso.')}</div>
          </div>
          <button type="button" class="btn btn--secondary" onclick="Dashboard.openUpgrade()">
            ${I18n.t('lic.ending.cta', 'Ver planos')}
          </button>
        </div>
      `;
      return;
    }

    // Tudo ok → sem banner
    host.hidden = true;
    host.innerHTML = '';
  },

  _renderBadge(b) {
    const cls  = 'card__badge--' + b.type;
    const text = I18n.t(b.key);
    return `<div class="card__badge ${cls}">${text}</div>`;
  },

  open(moduleId) {
    Router.goto('module', { moduleName: moduleId });
  },

  // Click num card bloqueado por licença → explica e oferece upgrade
  async showUpgradePrompt(moduleId) {
    const license = Auth.state.license || {};
    const expired = license.status === 'expired';
    const title = expired
      ? I18n.t('lic.expired.title', 'Seu período de teste expirou')
      : I18n.t('lic.needed.title', 'Licença necessária');
    const msg = expired
      ? I18n.t('lic.expired.msg',
          'Renove pra continuar usando o SignEng. Assinatura Pro a partir de R$ 49/mês.')
      : I18n.t('lic.needed.msg',
          'Esse módulo requer uma licença ativa. Ative seu trial ou assine pra começar.');

    if (typeof Modal !== 'undefined') {
      const ok = await Modal.confirm(title, msg, {
        okLabel: I18n.t('lic.expired.cta', 'Renovar agora'),
        cancelLabel: I18n.t('modal.cancel', 'Fechar')
      });
      if (ok) Dashboard.openUpgrade();
    } else {
      alert(title + '\n\n' + msg);
    }
  },

  // Abre a página de upgrade no navegador
  // TODO(SignEng): sem domínio/painel novo ainda — assim que existir,
  // trocar a URL abaixo (infraestrutura antiga desativada de propósito).
  openUpgrade() {
    if (typeof Toast !== 'undefined') {
      Toast.info(I18n.t('lic.upgrade.soon', 'Painel de assinatura em breve.'));
    }
  }
};

window.Dashboard = Dashboard;
