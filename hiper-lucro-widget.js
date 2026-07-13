// ═══════════════════════════════════════════════════════════════════════════════
// hiper-lucro-widget.js — Indicador de margem inline (compacto, uma linha)
// Registrado com ordem 99 (final da barra do pedido-venda).
// Só exibe se TODOS os itens com código tiverem custo preenchido.
// ═══════════════════════════════════════════════════════════════════════════════

(function _registrarLucroWidget() {
  'use strict';

  const PIX     = 0.9523;
  // % da nota fiscal: fonte única = config.nfm_pct (chega pela sync de custos e
  // fica em window.__hiperImpPct). 10.70 é só fallback se ainda não sincronizou.
  const IMP_DEF = () => (window.__hiperImpPct ?? 10.70);

  function _injetarEstilos() {
    if (document.getElementById('hiper-lucro-style')) return;
    const s = document.createElement('style');
    s.id = 'hiper-lucro-style';
    s.textContent = `
      #hiper-lucro-widget {
        display: none; 
        margin-top: 6px;
        padding: 4px 8px;
        background: #f0fff4;
        border: 1px solid #6dbf8a;
        border-radius: 5px;
        font-size: 10px;
        font-family: Arial, sans-serif;
        align-items: center;
        gap: 8px;
        flex-wrap: nowrap;
      }
      #hiper-lucro-widget.hlw-visivel { display: flex; }
      #hiper-lucro-widget .hlw-label {
        font-size: 10px;
        color: #555;
        flex-shrink: 0;
      }
      #hiper-lucro-widget .hlw-imp-inp {
        width: 46px;
        padding: 1px 3px;
        border: 1px solid #aaa;
        border-radius: 3px;
        font-size: 11px;
        text-align: right;
        background: #fff;
      }
      #hiper-lucro-widget .hlw-sep {
        color: #aaa;
        flex-shrink: 0;
      }
      #hiper-lucro-widget .hlw-badge {
        font-size: 11px;
        font-weight: bold;
        padding: 1px 7px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      #hiper-lucro-widget .hlw-ok   { background: #d4f0dc; color: #1a7a1a; }
      #hiper-lucro-widget .hlw-warn { background: #fff0cc; color: #c07000; }
      #hiper-lucro-widget .hlw-neg  { background: #fdd;    color: #c00;    }

      /* ── Botão de sync de custos ── */
      #hiper-lucro-widget .hlw-sync-btn {
        margin-left: auto;
        padding: 1px 6px;
        border: 1px solid #aaa;
        border-radius: 3px;
        background: #fff;
        font-size: 10px;
        color: #555;
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.15s;
        white-space: nowrap;
      }
      #hiper-lucro-widget .hlw-sync-btn:hover:not(:disabled) { background: #e8f5e9; border-color: #6dbf8a; }
      #hiper-lucro-widget .hlw-sync-btn:disabled { opacity: 0.5; cursor: default; }
      #hiper-lucro-widget .hlw-sync-btn.hlw-sync-ok   { border-color: #6dbf8a; color: #1a7a1a; }
      #hiper-lucro-widget .hlw-sync-btn.hlw-sync-err  { border-color: #e57373; color: #c00; }
      #hiper-lucro-widget .hlw-sync-btn.hlw-sync-spin { border-color: #90caf9; color: #1565c0; }
    `;
    document.head.appendChild(s);
  }

  function _criarWidget() {
    _injetarEstilos();

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <span class="hlw-label">imposto</span>
      <input class="hlw-imp-inp" id="hlw-imp" type="number" min="0" max="100"
             step="0.01" value="${IMP_DEF()}" title="% imposto sobre nota">
      <span class="hlw-label">%</span>
      <span class="hlw-sep">|</span>
      <span class="hlw-label">margem</span>
      <span class="hlw-badge" id="hlw-badge">—</span>
      <button class="hlw-sync-btn" id="hlw-sync-btn" title="Força atualizar custos e lista de produtos (puxa do Hiper na hora)">↻ Atualizar</button>
    `;

    // ── Botão de atualização manual de custos ─────────────────────────────────
    const syncBtn = wrap.querySelector('#hlw-sync-btn');

    function _setSyncStatus(estado) {
      // estado: 'idle' | 'loading' | 'ok' | 'err'
      syncBtn.className = 'hlw-sync-btn';
      syncBtn.disabled  = false;
      if (estado === 'loading') {
        syncBtn.classList.add('hlw-sync-spin');
        syncBtn.disabled  = true;
        syncBtn.textContent = '⟳ Atualizando…';
      } else if (estado === 'ok') {
        syncBtn.classList.add('hlw-sync-ok');
        syncBtn.textContent = '✓ atualizado';
        setTimeout(() => _setSyncStatus('idle'), 3000);
      } else if (estado === 'err') {
        syncBtn.classList.add('hlw-sync-err');
        syncBtn.textContent = '✗ sem conexão';
        setTimeout(() => _setSyncStatus('idle'), 4000);
      } else {
        syncBtn.textContent = '↻ Atualizar';
      }
    }

    syncBtn.addEventListener('click', async () => {
      // Força o servidor a rodar /produtos/sync antes de responder → traz custos,
      // % da nota e a lista de produtos novos/renomeados na hora.
      const forcar = window.__hiperForcarAtualizacao || window.__hiperSyncCustos;
      if (typeof forcar !== 'function') {
        _setSyncStatus('err');
        return;
      }
      _setSyncStatus('loading');
      try {
        await forcar();
        _setSyncStatus('ok');
        _deb(); // recalcula margens com custos novos
      } catch (e) {
        _setSyncStatus('err');
      }
    });

    function _recalc() {
      const dados = (typeof extrairDadosPedido === 'function')
        ? extrairDadosPedido() : null;

      if (!dados || dados.itens.length === 0) {
        wrap.classList.remove('hlw-visivel');
        return;
      }

      const { itens } = dados;
      const custosMap = window.__hiperCustos || {};

      // Se QUALQUER item com código não tiver custo → não exibe nada
      const todosTêmCusto = itens.every(it => {
        if (!it.idProduto) return true; // sem código, ignora
        const c = parseFloat(custosMap[it.idProduto]);
        return !isNaN(c) && c >= 0;
      });

      if (!todosTêmCusto) {
        // Mostra widget mesmo sem custos — só para o botão de sync ficar acessível
        wrap.classList.add('hlw-visivel');
        const badge = document.getElementById('hlw-badge');
        if (badge) {
          badge.style.cssText = '';
          badge.className = 'hlw-badge hlw-warn';
          badge.textContent = 'sem custos';
        }
        return;
      }

      const totalEl = document.querySelector('.totais-valor-total p strong, .valor-total strong');
      
      // Limpa a string (remove "R$", pontos de milhar e troca vírgula por ponto)
      const totalTexto = totalEl ? totalEl.innerText : "0";
      const totalNota = parseFloat(totalTexto.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

      if (totalNota === 0 || itens.length === 0) {
        wrap.classList.remove('hlw-visivel');
        return;
      }
      
      const pctImp     = parseFloat(document.getElementById('hlw-imp')?.value) || IMP_DEF();
      const imposto    = totalNota * pctImp / 100; // Imposto sobre o valor bruto da nota
      
      let custoTotal = 0;
      itens.forEach(it => {
        const c = parseFloat(custosMap[it.idProduto]);
        if (!isNaN(c)) custoTotal += c * it.qtd;
      });

      // Cálculo Margem À Vista
      const lucroVista  = totalNota - imposto - custoTotal;
      const margemVista = totalNota > 0 ? (lucroVista / totalNota) * 100 : 0;

      // Cálculo Margem Cartão (Usando a constante PIX 0.9523)
      const receitaCartao = totalNota * PIX;
      const lucroCartao   = receitaCartao - imposto - custoTotal;
      const margemCartao  = totalNota > 0 ? (lucroCartao / totalNota) * 100 : 0;

      const badge = document.getElementById('hlw-badge');
      if (!badge) return;

      // Função auxiliar para definir a cor da badge
      const getClasse = (m) => (m < 0 ? 'hlw-neg' : m < 15 ? 'hlw-warn' : 'hlw-ok');

      badge.style.display = 'flex';
      badge.style.flexDirection = 'row';
      badge.style.gap = '4px';
      badge.style.background = 'transparent'; // Remove o fundo do container pai
      badge.style.padding = '0';
      badge.style.alignItems = 'center';

      badge.innerHTML = `
        <div class="hlw-badge ${getClasse(margemVista)}" style="font-size: 10px; padding: 2px 6px;">
          <small style="opacity: 0.8; font-weight: normal;">PIX</small> ${margemVista.toFixed(1)}%
        </div>
        <span style="color: #ccc; font-weight: 100;">|</span>
        <div class="hlw-badge ${getClasse(margemCartao)}" style="font-size: 10px; padding: 2px 6px;">
          <small style="opacity: 0.8; font-weight: normal;">CARTÃO</small> ${margemCartao.toFixed(1)}%
        </div>
      `;
      wrap.classList.add('hlw-visivel');
    }

    // Imposto editável
    wrap.querySelector('#hlw-imp').addEventListener('input', _recalc);

    // Observer na tabela de itens
let _t = null;
    function _deb() { clearTimeout(_t); _t = setTimeout(_recalc, 400); }

    const tabela = document.getElementById('ItensPedidoDeVendaTabela');
    if (tabela) {
      new MutationObserver(_deb).observe(tabela, {
        childList: true, subtree: true, characterData: true, attributes: true,
      });
    }

    // 2. NOVO: Observer no container do Valor Total
    // Monitora mudanças no texto do total (descontos, fretes, etc)
    const containerTotal = document.querySelector('.totais-valor-total');
    if (containerTotal) {
      new MutationObserver(_deb).observe(containerTotal, {
        childList: true, subtree: true, characterData: true
      });
    }

    // 3. Evento de input geral para capturar mudanças manuais em campos de desconto
    document.addEventListener('input', ev => {
      const target = ev.target;
      // Se mudar qualquer input dentro da área de totais ou da tabela, recalcula
      if (target?.closest('.totais') || target?.closest('#ItensPedidoDeVendaTabela')) {
        _deb();
      }
    }, true);

    // Atualiza quando custo é salvo na página do orçamento
    try {
      const bc = new BroadcastChannel('hiper_custo_channel');
      bc.addEventListener('message', ev => {
        const { id, val } = ev.data || {};
        if (id != null && val != null) {
          if (!window.__hiperCustos) window.__hiperCustos = {};
          window.__hiperCustos[id] = parseFloat(val);
          _deb();
        }
      });
    } catch (e) { /* BroadcastChannel indisponível */ }

    setTimeout(_recalc, 600);
    return wrap;
  }

  function _registrar() {
    if (window.__hiperUI) {
      window.__hiperUI.registrar({ id: 'hiper-lucro-widget', ordem: 5, render: _criarWidget });
    } else {
      setTimeout(_registrar, 50);
    }
  }

  _registrar();
  console.info('[HiperLucro] ✅ Widget de margem registrado.');
})();