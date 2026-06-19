// ═══════════════════════════════════════════════════════════════════════════════
// hiper-mov-widget.js — Suspensão/reativação de movimentação de estoque
// Registrado com ordem 30 — abaixo dos kits (ordem 20)
//
// Fetches delegados ao interceptor.js via window.postMessage (sem CORS).
// ═══════════════════════════════════════════════════════════════════════════════

(function _registrarMovWidget() {
  'use strict';

  const RE_ID = /pedido-venda\/(?:editar|visualizar)\/(\d+)/;
  let _seq = 0;

  function _getPedidoId() {
    const m = location.hash.match(RE_ID);
    return m ? m[1] : null;
  }

  // Envia mensagem para o interceptor e aguarda a resposta pelo seq único.
  function _bridge(type, pedidoId) {
    return new Promise((resolve) => {
      const seq = ++_seq;
      const resultType = type + '_RESULT';

      function onMsg(ev) {
        if (ev.source !== window) return;
        if (ev.data?.type !== resultType || ev.data?.seq !== seq) return;
        window.removeEventListener('message', onMsg);
        resolve({ ok: ev.data.ok, data: ev.data.data });
      }

      window.addEventListener('message', onMsg);
      window.postMessage({ type, seq, pedidoId }, '*');

      // Timeout de segurança
      setTimeout(() => {
        window.removeEventListener('message', onMsg);
        resolve({ ok: false, data: null });
      }, 8000);
    });
  }

  function _injetarEstilos() {
    if (document.getElementById('hiper-mov-style')) return;
    const s = document.createElement('style');
    s.id = 'hiper-mov-style';
    s.textContent = `
      #hiper-mov-widget {
        margin-top: 6px;
        padding: 5px 10px;
        background: #f8f8f8;
        border: 1px solid #ddd;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      #hiper-mov-widget .hmw-label {
        font-size: 13px;
        color: #555;
        white-space: nowrap;
      }
      #hiper-mov-widget .hmw-status {
        font-size: 13px;
        font-weight: bold;
        padding: 1px 7px;
        border-radius: 3px;
        white-space: nowrap;
      }
      .hmw-ativo   { background: #d4f0dc; color: #1a6e1a; }
      .hmw-inativo { background: #fff0cc; color: #c07000; }
      .hmw-na      { background: #eee;    color: #888; }
      #hiper-mov-widget .hmw-btn {
        padding: 2px 9px;
        border: 1px solid #bbb;
        border-radius: 3px;
        background: #fff;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      #hiper-mov-widget .hmw-btn:hover:not(:disabled) { background: #f0f0f0; }
      #hiper-mov-widget .hmw-btn:disabled { opacity: 0.5; cursor: default; }
      #hiper-mov-widget .hmw-msg { font-size: 13px; color: #e00; }
      #hiper-mov-widget .hmw-ok  { font-size: 13px; color: #1a6e1a; }
    `;
    document.head.appendChild(s);
  }

  function _criarWidget() {
    const pedidoId = _getPedidoId();
    if (!pedidoId) return null;

    _injetarEstilos();

    const wrap = document.createElement('div');
    wrap.id = 'hiper-mov-widget';
    wrap.innerHTML = `
      <span class="hmw-label">📦 Estoque:</span>
      <span class="hmw-status hmw-na" id="hmw-status">verificando…</span>
      <button class="hmw-btn" id="hmw-btn" style="display:none"></button>
      <span id="hmw-msg"></span>
    `;

    const statusEl = wrap.querySelector('#hmw-status');
    const btnEl    = wrap.querySelector('#hmw-btn');
    const msgEl    = wrap.querySelector('#hmw-msg');

    function _render(ativo, existe) {
      btnEl.style.display = 'none';
      btnEl.disabled      = false;
      msgEl.textContent   = '';
      msgEl.className     = 'hmw-msg';

      if (!existe) {
        statusEl.className   = 'hmw-status hmw-na';
        statusEl.textContent = 'sem movimentação';
        return;
      }
      if (ativo) {
        statusEl.className   = 'hmw-status hmw-ativo';
        statusEl.textContent = '● ativo';
        btnEl.textContent    = '⏸ Suspender';
        btnEl.style.display  = '';
      } else {
        statusEl.className   = 'hmw-status hmw-inativo';
        statusEl.textContent = '⏸ suspenso';
        btnEl.textContent    = '▶ Reativar';
        btnEl.style.display  = '';
      }
    }

    // Carrega estado inicial via bridge
    _bridge('HIPER_MOV_GET', pedidoId).then(({ ok, data }) => {
      if (!ok || !data) {
        statusEl.className   = 'hmw-status hmw-na';
        statusEl.textContent = 'offline';
        return;
      }
      const mov = data.movimento;
      if (!mov) { _render(false, false); return; }

      // Se o pedido está cancelado no Hiper e a op está inativa: cancelamento Hiper, sem botão
      if (data.situacao === 'cancelado' && !mov.ativo) {
        statusEl.className   = 'hmw-status hmw-na';
        statusEl.textContent = 'cancelado';
        return;
      }
      _render(mov.ativo, mov.existe);
    });

    btnEl.addEventListener('click', async () => {
      btnEl.disabled    = true;
      msgEl.textContent = '';

      const { ok, data } = await _bridge('HIPER_MOV_PATCH', pedidoId);

      if (!ok || !data) {
        msgEl.className   = 'hmw-msg';
        msgEl.textContent = data?.detail || 'Erro ao alterar.';
        btnEl.disabled    = false;
        return;
      }

      _render(data.ativo, true);
      msgEl.className   = 'hmw-ok';
      msgEl.textContent = data.ativo ? '✓ reativado' : '✓ suspenso';
      setTimeout(() => { msgEl.textContent = ''; }, 3000);
    });

    return wrap;
  }

  function _registrar() {
    if (window.__hiperUI) {
      window.__hiperUI.registrar({ id: 'hiper-mov-widget', ordem: 30, render: _criarWidget });
    } else {
      setTimeout(_registrar, 50);
    }
  }
  _registrar();
})();
