// ═══════════════════════════════════════════════════════════════════════════════
// hiper-mov-lista.js — Botão suspender/reativar movimentação no dropdown
//                       da lista de pedidos de venda.
//
// Detecta quando um dropdown de pedido abre (MutationObserver em addedNodes)
// e injeta um <li> com o estado atual da movimentação e a ação de toggle.
//
// Fetches delegados ao interceptor.js via window.postMessage (sem CORS).
// ═══════════════════════════════════════════════════════════════════════════════

(function _movLista() {
  'use strict';

  let _seq = 0;

  function _bridge(type, pedidoId) {
    return new Promise((resolve) => {
      const seq    = ++_seq;
      const resType = type + '_RESULT';

      function onMsg(ev) {
        if (ev.source !== window) return;
        if (ev.data?.type !== resType || ev.data?.seq !== seq) return;
        window.removeEventListener('message', onMsg);
        resolve({ ok: ev.data.ok, data: ev.data.data });
      }

      window.addEventListener('message', onMsg);
      window.postMessage({ type, seq, pedidoId }, '*');

      setTimeout(() => {
        window.removeEventListener('message', onMsg);
        resolve({ ok: false, data: null });
      }, 8000);
    });
  }

  function _getPedidoId(dropdown) {
    const li = dropdown.querySelector('li[data-id-pedido-venda]');
    return li ? li.getAttribute('data-id-pedido-venda') : null;
  }

  function _injetarBotao(dropdown) {
    if (dropdown.querySelector('.hml-item')) return;

    const pedidoId = _getPedidoId(dropdown);
    if (!pedidoId) return;

    const li = document.createElement('li');
    li.className = 'hml-item';
    li.setAttribute('data-id-pedido-venda', pedidoId);
    li.style.background = '#f0f4ff';
    li.innerHTML = '<a href="javascript:;" style="white-space:nowrap;">'
                 + '<i class="fa fa-exchange"></i> '
                 + '<span class="hml-txt">verificando…</span>'
                 + '</a>';

    // Insere antes do rastreio (último item útil) ou no final
    const rastreio = dropdown.querySelector('.rastreio-pedido-venda');
    if (rastreio) dropdown.insertBefore(li, rastreio);
    else          dropdown.appendChild(li);

    const txtEl = li.querySelector('.hml-txt');
    let _estado = null; // null = sem ação disponível | { ativo: bool }

    function _render(ativo, existe) {
      if (!existe) {
        txtEl.textContent = 'Sem movimentação';
        _estado = null;
        return;
      }
      _estado = { ativo };
      txtEl.textContent = ativo ? 'Suspender mov. estoque'
                                : 'Reativar mov. estoque';
    }

    // Carrega estado atual
    _bridge('HIPER_MOV_GET', pedidoId).then(({ ok, data }) => {
      if (!ok || !data) { txtEl.textContent = '(offline)'; return; }
      const mov = data.movimento;
      if (!mov) { _render(false, false); return; }
      if (data.situacao === 'cancelado' && !mov.ativo) {
        txtEl.textContent = 'Mov. cancelada';
        return;
      }
      _render(mov.ativo, mov.existe);
    });

    // Click — realiza o toggle de movimentação
    li.querySelector('a').addEventListener('click', async (e) => {
      e.stopPropagation(); // mantém o dropdown aberto para o usuário ver o resultado
      if (!_estado) return;

      txtEl.textContent = 'Processando…';
      _estado = null;

      const { ok, data } = await _bridge('HIPER_MOV_PATCH', pedidoId);
      if (!ok || !data) {
        txtEl.textContent = '✗ Erro';
        return;
      }
      _render(data.ativo, true);
      // Flash de confirmação
      const label = txtEl.textContent;
      txtEl.textContent = data.ativo ? '✓ Reativado' : '✓ Suspenso';
      setTimeout(() => { txtEl.textContent = label; }, 2500);
    });
  }

  // Observa novos dropdowns sendo adicionados ao DOM
  new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('.dropdown-menu.dropdown-body')) {
          _injetarBotao(node);
        } else {
          node.querySelectorAll?.('.dropdown-menu.dropdown-body').forEach(_injetarBotao);
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Trata dropdowns já abertos no momento da carga
  document.querySelectorAll('.dropdown-menu.dropdown-body').forEach(_injetarBotao);

  console.info('[HiperCache] ✅ Mov-Lista ativo.');
})();
