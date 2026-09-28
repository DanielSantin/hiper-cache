// ═══════════════════════════════════════════════════════════════════════════════
// hiper-lucro-widget.js — Margem do pedido (PIX e Crédito) no resumo do menu lateral
//
// Aparece logo abaixo do card "Valor total" do resumo, como dois cards com as
// mesmas classes do Hiper (fica com cara nativa), dentro de um wrapper
// display:contents pra cada um se comportar como card do resumo. Dados vêm das
// stores Pinia (hiper-pedido-store.js) e o recálculo é disparado pelo
// $subscribe delas — nada de raspar DOM do pedido.
//
//   base     = total dos produtos já com desconto (sem frete)
//   imposto  = base × % da nota (config.nfm_pct, via window.__hiperImpPct)
//   PIX      = (base − imposto − custo) / base
//   Crédito  = (base × PIX_FATOR − imposto − custo) / base   (taxa do cartão)
//
// Só mostra o valor se TODOS os itens tiverem custo cadastrado; senão avisa
// quantos faltam (o botão ↻ força a sync de custos).
// ═══════════════════════════════════════════════════════════════════════════════

(function _registrarLucroWidget() {
  'use strict';

  // % da nota fiscal: fonte única = config.nfm_pct (chega pela sync de custos e
  // fica em window.__hiperImpPct). 10.70 é só fallback se ainda não sincronizou.
  const IMP_DEF = () => (window.__hiperImpPct ?? 10.70);
  // Recebido líquido no cartão (mesmo fator do PIX no orçamento).
  const PIX_FATOR = 0.9523;

  const CLS_CARD    = 'cadastro-pedido-de-venda-menu-lateral__summary-card';
  const CLS_TITULO  = 'cadastro-pedido-de-venda-menu-lateral__summary-title';
  const CLS_VALOR   = 'cadastro-pedido-de-venda-menu-lateral__summary-value';

  // ── Âncora: card "Valor total" do resumo ─────────────────────────────────────
  // Achado pelo texto do título (não pela posição); fallback = último card do
  // resumo. Cards dentro de um widget da extensão nunca contam como âncora.
  function _alvo() {
    const raiz = document.querySelector('#hiper-microfrontend-pedidodevenda');
    if (!raiz) return null;
    const cards = [...raiz.querySelectorAll(`.${CLS_CARD}`)].filter(c => !c.closest('[data-hiper-widget]'));
    if (!cards.length) return null;
    const card = cards.find(c => /valor\s+total/i.test(c.querySelector(`.${CLS_TITULO}`)?.textContent || ''))
              || cards[cards.length - 1];
    return { parent: card.parentElement, ref: card.nextSibling };
  }

  const fmtPct = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const corMargem = (m) => (m < 0 ? '#c00' : m < 15 ? '#c07000' : '#0f5a0f');

  function _calcular() {
    const produtos = window.__hiperPedido?.produtos();
    if (!produtos) return null;
    const itens = produtos.itens.filter(i => !i.cancelado && i.idProdutoHiperOnline != null);
    if (!itens.length) return { vazio: true };

    const custos = window.__hiperCustos || {};
    let custoTotal = 0, semCusto = 0;
    itens.forEach(it => {
      const c = parseFloat(custos[String(it.idProdutoHiperOnline)]);
      if (isNaN(c) || c < 0) semCusto++;
      else custoTotal += c * (Number(it.quantidade) || 0);
    });
    if (semCusto) return { semCusto };

    const base    = Number(produtos.totalPedido) || 0;   // produtos − descontos dos itens
    if (base <= 0) return { vazio: true };
    const imposto = base * IMP_DEF() / 100;
    return {
      pix:     (base - imposto - custoTotal) / base * 100,
      credito: (base * PIX_FATOR - imposto - custoTotal) / base * 100,
    };
  }

  function _criarWidget() {
    const card = document.createElement('div');
    card.style.display = 'contents';
    card.innerHTML = `
      <div class="${CLS_CARD}">
        <span class="${CLS_TITULO}" style="display:flex;align-items:center;gap:6px;">
          Lucro (PIX)
          <button type="button" class="hlw-sync"
            title="Atualizar custos e o catálogo de produtos (preços) agora"
          style="border:none;background:none;padding:0 2px;cursor:pointer;font-size:14px;line-height:1;color:#888;">↻</button>
        </span>
        <span class="${CLS_VALOR} hlw-pix">—</span>
      </div>
      <div class="${CLS_CARD}">
        <span class="${CLS_TITULO}">Lucro (Crédito)</span>
        <span class="${CLS_VALOR} hlw-credito">—</span>
      </div>
    `;
    const valPix     = card.querySelector('.hlw-pix');
    const valCredito = card.querySelector('.hlw-credito');
    const sync       = card.querySelector('.hlw-sync');

    function _mostrar(el, margem, textoAlternativo, cor) {
      el.textContent = margem != null ? fmtPct(margem) : textoAlternativo;
      el.style.color = margem != null ? corMargem(margem) : (cor || '');
    }

    function _render() {
      const r = _calcular();
      if (!r || r.vazio) {
        _mostrar(valPix, null, '—');
        _mostrar(valCredito, null, '—');
      } else if (r.semCusto) {
        const txt = `sem custo (${r.semCusto} ${r.semCusto === 1 ? 'item' : 'itens'})`;
        _mostrar(valPix, null, txt, '#c07000');
        _mostrar(valCredito, null, txt, '#c07000');
      } else {
        _mostrar(valPix, r.pix);
        _mostrar(valCredito, r.credito);
      }
    }

    let _t = null;
    function _deb() {
      if (!card.isConnected) return _desligar();
      clearTimeout(_t);
      _t = setTimeout(_render, 150);
    }

    // ── Gatilhos de recálculo ────────────────────────────────────────────────
    // Stores do pedido (itens, quantidade, preço, desconto) via $subscribe;
    // custos novos (sync do popup/botão, edição na janela do orçamento).
    const desinscrever = [];
    ['produtos', 'descontos'].forEach(nome => {
      const s = window.__hiperPedido?.[nome]();
      if (s?.$subscribe) desinscrever.push(s.$subscribe(_deb));
    });

    const onMsg = (ev) => { if (ev.source === window && ev.data?.type === 'HIPER_CACHE_ALL') _deb(); };
    window.addEventListener('message', onMsg);

    let bc = null;
    try {
      bc = new BroadcastChannel('hiper_custo_channel');
      bc.addEventListener('message', ev => {
        const { id, val } = ev.data || {};
        if (id != null && val != null) {
          if (!window.__hiperCustos) window.__hiperCustos = {};
          window.__hiperCustos[id] = parseFloat(val);
          _deb();
        }
      });
    } catch (e) { /* BroadcastChannel indisponível */ }

    // O hiper-ui recria o card quando o Hiper re-renderiza o resumo; o antigo
    // se desliga na próxima mudança (card.isConnected === false).
    function _desligar() {
      desinscrever.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
      window.removeEventListener('message', onMsg);
      try { bc?.close(); } catch (_) {}
      clearTimeout(_t);
    }

    // ── Botão ↻: força /produtos/sync no servidor (custos, % da nota, produtos)
    // e recarrega o catálogo em cache do seletor de produto (preços do Hiper).
    sync.addEventListener('click', async () => {
      const forcar = window.__hiperForcarAtualizacao || window.__hiperSyncCustos;
      if (typeof forcar !== 'function') { sync.textContent = '✗'; setTimeout(() => { sync.textContent = '↻'; }, 3000); return; }
      sync.disabled = true;
      sync.textContent = '⟳';
      try {
        await Promise.all([forcar(), window.__hiperPedido?.atualizarCatalogo({ forcar: true })]);
        sync.textContent = '✓';
        _render();
      } catch (e) {
        sync.textContent = '✗';
      } finally {
        sync.disabled = false;
        setTimeout(() => { sync.textContent = '↻'; }, 3000);
      }
    });

    _render();
    return card;
  }

  function _registrar() {
    if (window.__hiperUI) {
      window.__hiperUI.registrar({ id: 'hiper-lucro-widget', ordem: 5, render: _criarWidget, alvo: _alvo });
    } else {
      setTimeout(_registrar, 50);
    }
  }

  _registrar();
  console.info('[HiperLucro] ✅ Widget de lucro registrado.');
})();
