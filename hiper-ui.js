// ═══════════════════════════════════════════════════════════════════════════════
// hiper-ui.js — Centralizador de UI para o pedido-venda
//
// Responsabilidade única: encontrar onde cada widget deve ser montado e
// mantê-lo montado enquanto o ponto de ancoragem existir no DOM.
//
// API pública (window.__hiperUI):
//   .registrar({ id, ordem, render, alvo?, aoDesmontar? })
//     → id          : string única do widget (ex: 'orcamento', 'kits', 'db')
//     → ordem       : número — menor = mais acima (só vale entre widgets que
//                     dividem o mesmo container sem `ref`)
//     → render      : função () => HTMLElement (chamada a cada montagem)
//     → alvo        : função () => { parent, ref? } | null — onde inserir.
//                     `ref` = nó antes do qual inserir (null → append).
//                     Retornar null significa "âncora não existe agora": se o
//                     widget estiver no DOM, ele é removido.
//                     Sem `alvo`, usa o anchor legado (.parte-4 > div).
//     → aoDesmontar : função (el) chamada quando o widget é removido por
//                     falta de âncora (restaurar DOM alheio que foi alterado).
//
// Os módulos chamam registrar() a qualquer momento. Um MutationObserver
// (com throttle) reavalia todos os widgets a cada mudança do DOM — cobre
// SPA mudando de rota, microfrontend carregando tarde e re-render do Angular.
// ═══════════════════════════════════════════════════════════════════════════════

const ROTA_FORMULARIO = /pedido-venda\/(novo|editar|duplicar|visualizar)(\/|$)/;

function _estaNoFormulario() {
  return ROTA_FORMULARIO.test(location.hash);
}

(function () {
  'use strict';

  // ── Anchor legado (tela antiga do pedido-venda) ──────────────────────────────
  const ANCHOR_SELECTORS = [
    '#CadastroPedidoVenda .corpo-pedido-venda .parte-4 > div',
    '.corpo-pedido-venda .parte-4 > div',
    '.parte-4 > div',
  ];

  function _alvoLegado() {
    if (!_estaNoFormulario()) return null;
    for (const sel of ANCHOR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return { parent: el, ref: null };
    }
    return null;
  }

  // ── Estado interno ────────────────────────────────────────────────────────────
  const _widgets = [];   // { id, ordem, render, alvo, aoDesmontar }

  // ── Monta um widget na posição indicada ──────────────────────────────────────
  function _mountWidget(w, pos) {
    let el;
    try { el = w.render(); } catch (e) {
      console.error('[HiperUI] Erro ao renderizar widget "' + w.id + '":', e);
      return;
    }
    if (!el) return;
    el.id = w.id;
    el.dataset.hiperWidget = '1';
    el.dataset.hiperOrdem  = String(w.ordem);

    const { parent } = pos;
    let ref = pos.ref ?? null;

    // Sem ref explícito: ordena entre os outros widgets do mesmo container
    if (!ref) {
      for (const irmao of parent.querySelectorAll(':scope > [data-hiper-widget]')) {
        if (w.ordem < parseInt(irmao.dataset.hiperOrdem || '0', 10)) { ref = irmao; break; }
      }
    }
    parent.insertBefore(el, ref);

    console.info('[HiperUI] ✅ Widget "' + w.id + '" montado (ordem ' + w.ordem + ').');
  }

  // ── Reavalia todos os widgets ────────────────────────────────────────────────
  function _tick() {
    for (const w of _widgets) {
      let pos = null;
      try { pos = w.alvo ? w.alvo() : _alvoLegado(); } catch (e) {
        console.error('[HiperUI] Erro no alvo do widget "' + w.id + '":', e);
      }
      const existente = document.getElementById(w.id);

      if (pos?.parent) {
        if (!existente) _mountWidget(w, pos);
      } else if (existente && w.alvo) {
        // Âncora sumiu mas o widget ficou (ex: montado num container global
        // como o #footer) — remove e deixa o módulo restaurar o que alterou.
        existente.remove();
        try { w.aoDesmontar?.(existente); } catch (e) {
          console.error('[HiperUI] Erro no aoDesmontar de "' + w.id + '":', e);
        }
        console.info('[HiperUI] 🔄 Widget "' + w.id + '" desmontado (âncora ausente).');
      }
    }
  }

  let _agendado = null;
  function _agendarTick() {
    if (_agendado) return;
    _agendado = setTimeout(() => { _agendado = null; _tick(); }, 100);
  }

  new MutationObserver(_agendarTick)
    .observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', _agendarTick);
  _agendarTick();

  // ── API pública ───────────────────────────────────────────────────────────────
  window.__hiperUI = {
    /**
     * Registra um widget para ser injetado na página do pedido-venda.
     * @param {{ id: string, ordem?: number, render: () => HTMLElement,
     *           alvo?: () => ({ parent: Element, ref?: Node|null } | null),
     *           aoDesmontar?: (el: HTMLElement) => void }} cfg
     */
    registrar(cfg) {
      if (!cfg?.id || typeof cfg.render !== 'function') {
        console.warn('[HiperUI] registrar() requer { id, render }.');
        return;
      }
      if (_widgets.find(w => w.id === cfg.id)) return; // evita duplicata

      _widgets.push({
        id:          cfg.id,
        ordem:       cfg.ordem ?? 50,
        render:      cfg.render,
        alvo:        typeof cfg.alvo === 'function' ? cfg.alvo : null,
        aoDesmontar: typeof cfg.aoDesmontar === 'function' ? cfg.aoDesmontar : null,
      });
      _widgets.sort((a, b) => a.ordem - b.ordem);
      _agendarTick();
    },
  };

  console.info('[HiperUI] ✅ Centralizador de UI ativo.');
})();
