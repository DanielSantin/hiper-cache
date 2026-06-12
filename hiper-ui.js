// ═══════════════════════════════════════════════════════════════════════════════
// hiper-ui.js — Centralizador de UI para a barra do pedido-venda
//
// Responsabilidade única: encontrar o anchor .parte-4 > div e montar
// todos os widgets registrados pelos outros módulos, na ordem certa.
//
// API pública (window.__hiperUI):
//   .registrar({ id, ordem, render })
//     → id      : string única do widget (ex: 'orcamento', 'kits', 'db')
//     → ordem   : número — menor = mais acima na barra
//     → render  : função () => HTMLElement   (chamada uma única vez)
//
// Os módulos chamam registrar() a qualquer momento.
// hiper-ui.js tenta montar tudo assim que o anchor aparecer no DOM.
// Se um módulo registrar depois que o anchor já existe, o widget é
// inserido imediatamente na posição correta.
// ═══════════════════════════════════════════════════════════════════════════════

const ROTA_FORMULARIO = /pedido-venda\/(novo|editar|duplicar|visualizar)(\/|$)/;

function _estaNoFormulario() {
  return ROTA_FORMULARIO.test(location.hash);
}

(function () {
  'use strict';

  // ── Seletores do anchor (do mais específico ao mais genérico) ────────────────
  const ANCHOR_SELECTORS = [
    '#CadastroPedidoVenda .corpo-pedido-venda .parte-4 > div',
    '.corpo-pedido-venda .parte-4 > div',
    '.parte-4 > div',
  ];

  // ── Estado interno ────────────────────────────────────────────────────────────
  const _widgets   = [];   // { id, ordem, render, mounted }
  let   _anchor    = null;
  let   _hashAtual = location.hash;

  // ── Encontra o anchor ─────────────────────────────────────────────────────────
  function _getAnchor() {
    if (!_estaNoFormulario()) return null;
    for (const sel of ANCHOR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // ── Monta um widget no anchor ─────────────────────────────────────────────────
  function _mountWidget(w) {
    if (w.mounted && document.getElementById(w.id)) return; // já existe no DOM

    let el;
    try { el = w.render(); } catch (e) {
      console.error('[HiperUI] Erro ao renderizar widget "' + w.id + '":', e);
      return;
    }
    if (!el) return;
    el.id = w.id;

    // Insere na posição certa (por ordem crescente)
    const irmãos = _anchor.querySelectorAll(':scope > [data-hiper-widget]');
    let inseridoAntes = false;
    for (const irmao of irmãos) {
      const ordemIrmao = parseInt(irmao.dataset.hiperOrdem || '0', 10);
      if (w.ordem < ordemIrmao) {
        _anchor.insertBefore(el, irmao);
        inseridoAntes = true;
        break;
      }
    }
    if (!inseridoAntes) _anchor.appendChild(el);

    el.dataset.hiperWidget = '1';
    el.dataset.hiperOrdem  = String(w.ordem);
    w.mounted = true;

    console.info('[HiperUI] ✅ Widget "' + w.id + '" montado (ordem ' + w.ordem + ').');
  }

  // ── Tenta montar todos os widgets pendentes ───────────────────────────────────
  function _tentarMontar() {
    _anchor = _getAnchor();
    if (!_anchor) return false;

    // Ordena pelo campo ordem antes de montar
    _widgets.sort((a, b) => a.ordem - b.ordem);
    _widgets.forEach(w => _mountWidget(w));
    return true;
  }

  // ── Desmonta tudo (mudança de rota) ───────────────────────────────────────────
  function _desmontar() {
    _widgets.forEach(w => { w.mounted = false; });
    _anchor = null;
    console.info('[HiperUI] 🔄 Rota mudou — widgets desmontados.');
  }

  // ── Observer do DOM (detecta quando Angular renderiza a rota) ────────────────
  let _retryTimer = null;

  function _iniciarRetry() {
    if (_retryTimer) return;
    let tentativas = 0;
    _retryTimer = setInterval(() => {
      tentativas++;
      if (_tentarMontar() || tentativas >= 60) { // até 15s
        clearInterval(_retryTimer);
        _retryTimer = null;
        if (tentativas >= 60) console.warn('[HiperUI] ⚠ Anchor não encontrado após 15s.');
      }
    }, 250);
  }

 new MutationObserver(() => {
    const hash = location.hash;

    if (hash !== _hashAtual) {
      _hashAtual = hash;
      _desmontar();
      if (ROTA_FORMULARIO.test(hash)) _iniciarRetry();
      return;
    }

    // Mesmo hash — verifica se algum widget desmontou (Angular re-renderizou)
    if (ROTA_FORMULARIO.test(hash)) {
      const algumFaltando = _widgets.some(
        w => w.mounted && !document.getElementById(w.id)
      );
      if (algumFaltando) {
        _widgets.forEach(w => { w.mounted = false; });
        _anchor = null;
        _iniciarRetry();
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Tentativa imediata se já estiver na rota
  if (ROTA_FORMULARIO.test(location.hash)) _iniciarRetry();

  // ── API pública ───────────────────────────────────────────────────────────────
  window.__hiperUI = {
    /**
     * Registra um widget para ser injetado na barra do pedido-venda.
     * @param {{ id: string, ordem: number, render: () => HTMLElement }} cfg
     */
    registrar(cfg) {
      if (!cfg?.id || typeof cfg.render !== 'function') {
        console.warn('[HiperUI] registrar() requer { id, render }.');
        return;
      }
      // Evita duplicata
      if (_widgets.find(w => w.id === cfg.id)) return;

      _widgets.push({ id: cfg.id, ordem: cfg.ordem ?? 50, render: cfg.render, mounted: false });

      // Se o anchor já existe, monta imediatamente
      if (_anchor && document.contains(_anchor)) {
        _widgets.sort((a, b) => a.ordem - b.ordem);
        _mountWidget(_widgets.find(w => w.id === cfg.id));
      }
    },
  };

  console.info('[HiperUI] ✅ Centralizador de UI ativo.');
})();
