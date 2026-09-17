/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Bridge JS ↔ Ruby
   ══════════════════════════════════════════════════════════════════════════
   Toda chamada de JS pra Ruby deve passar por Bridge.call(action, payload).
   Retorna Promise que resolve quando o Ruby chama Bridge._resolve(id, data).
   ══════════════════════════════════════════════════════════════════════════ */

const Bridge = {
  _callbacks: {},
  _lastId: 0,

  /**
   * Chama um callback Ruby registrado via add_action_callback.
   * @param {string} action — nome do callback (ex: "auth_login")
   * @param {object} payload — dados extras (email, senha, etc)
   * @param {number} timeoutMs — prazo máximo (default 60s: os módulos agora
   *   calculam no servidor SignEng e a 1ª chamada pode pegar cold start +
   *   rede lenta; o HTTP do Ruby estoura antes, em 45s, com mensagem clara.
   *   Passar maior em operações com savepanel/captura, onde o Ruby espera
   *   o usuário)
   * @returns {Promise<object>}
   */
  call(action, payload = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const bridge = window.sketchup;

      // HtmlDialog do SketchUp expõe callbacks Ruby em window.sketchup.
      // O fallback HTTP existe apenas para o preview web do projeto.
      if (bridge && typeof bridge[action] === 'function') {
        const id = `bridge_${++Bridge._lastId}`;
        const full = { ...payload, id };
        const timer = setTimeout(() => {
          delete Bridge._callbacks[id];
          reject(new Error(`Tempo esgotado ao executar ${action}`));
        }, timeoutMs);
        Bridge._callbacks[id] = { resolve, reject, timer };
        try {
          bridge[action](JSON.stringify(full));
        } catch (e) {
          clearTimeout(timer);
          delete Bridge._callbacks[id];
          reject(e);
        }
        return;
      }

      fetch(`/api/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(data => {
          if (data && data.blocked === true && !(typeof Auth !== 'undefined' && Auth.state && Auth.state.user && Auth.state.user.local_id === 'offline-local-user') && typeof App !== 'undefined' && App.handleBlocked) {
            try { App.handleBlocked(data); } catch (e) { console.warn('handleBlocked falhou:', e); }
          }
          resolve(data);
        })
        .catch(reject);
    });
  },

  /**
   * Chamado pelo Ruby via dialog.execute_script("Bridge._resolve('abc', {...})").
   * Não usar direto no JS da UI — é interno do Bridge.
   */
  _resolve(id, data) {
    const cb = Bridge._callbacks[id];
    if (!cb) return;
    clearTimeout(cb.timer);
    delete Bridge._callbacks[id];
    // Intercepta respostas marcadas como bloqueadas pelo gate de licença
    // (assert_valid! no Ruby). Aciona o fluxo global de logout antes de
    // resolver a Promise, pra que o caller já receba o erro tratado.
    if (data && data.blocked === true && !(typeof Auth !== 'undefined' && Auth.state && Auth.state.user && Auth.state.user.local_id === 'offline-local-user') && typeof App !== 'undefined' && App.handleBlocked) {
      try { App.handleBlocked(data); } catch (e) { console.warn('handleBlocked falhou:', e); }
    }
    cb.resolve(data);
  },

  _reject(id, error) {
    const cb = Bridge._callbacks[id];
    if (!cb) return;
    clearTimeout(cb.timer);
    delete Bridge._callbacks[id];
    cb.reject(new Error(error));
  }
};

// Deixa disponível globalmente pro Ruby chamar
window.Bridge = Bridge;
