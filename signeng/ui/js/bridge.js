/* ══════════════════════════════════════════════════════════════════════════
   SignEng — Bridge JS ↔ Ruby
   ══════════════════════════════════════════════════════════════════════════
   Toda chamada de JS pra Ruby deve passar por Bridge.call(action, payload).
   Retorna Promise que resolve quando o Ruby chama Bridge._resolve(id, data).

   Fora do SketchUp (preview no navegador via `node server.js`) não existe o
   global `sketchup` — nesse caso Bridge.call cai pro mock HTTP em server.js.
   O plugin real dentro do SketchUp nunca usa esse caminho.
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
    // Fora do SketchUp (preview no navegador) — usa o mock HTTP.
    if (typeof sketchup === 'undefined') {
      return Bridge._callHttp(action, payload);
    }

    return new Promise((resolve, reject) => {
      // Gera um id único pra essa chamada
      const id = 'b' + (++Bridge._lastId) + '_' + Date.now();
      Bridge._callbacks[id] = { resolve, reject, timer: null };

      // Timeout de segurança
      Bridge._callbacks[id].timer = setTimeout(() => {
        if (Bridge._callbacks[id]) {
          delete Bridge._callbacks[id];
          reject(new Error('Timeout: Ruby não respondeu em ' + Math.round(timeoutMs / 1000) + 's (' + action + ')'));
        }
      }, timeoutMs);

      const full = Object.assign({ id }, payload);

      if (!sketchup[action]) {
        clearTimeout(Bridge._callbacks[id].timer);
        delete Bridge._callbacks[id];
        reject(new Error('Callback Ruby não registrado: ' + action));
        return;
      }

      try {
        sketchup[action](JSON.stringify(full));
      } catch (e) {
        clearTimeout(Bridge._callbacks[id].timer);
        delete Bridge._callbacks[id];
        reject(e);
      }
    });
  },

  // Caminho usado só no preview via `node server.js` (sem SketchUp). Mantém
  // o mesmo contrato de retorno do bridge real, incluindo o tratamento de
  // `blocked` — server.js hoje é um mock e não gera geometria de verdade.
  async _callHttp(action, payload) {
    const res = await fetch(`/api/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    Bridge._handleBlocked(data);
    return data;
  },

  _handleBlocked(data) {
    if (data && data.blocked === true &&
        !(typeof Auth !== 'undefined' && Auth.state && Auth.state.user && Auth.state.user.local_id === 'offline-local-user') &&
        typeof App !== 'undefined' && App.handleBlocked) {
      try { App.handleBlocked(data); } catch (e) { console.warn('handleBlocked falhou:', e); }
    }
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
    Bridge._handleBlocked(data);
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
