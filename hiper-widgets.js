// ═══════════════════════════════════════════════════════════════════════════════
// hiper-widgets.js — "Valor total" editável no resumo do menu lateral
//
// Clicar no valor do card "Valor total" abre um campo; digitar o total desejado
// e dar Enter (ou sair do campo) gera o desconto necessário. Esc cancela.
//
// Por que não usar o desconto agregado do Hiper (descontos.setValorDeDesconto):
// ele reparte o valor proporcionalmente e DEPOIS soma os subtotais de cada
// linha já arredondados pra 2 casas — o total final é a soma de N
// arredondamentos independentes e às vezes erra por centavos. Em vez disso,
// calculamos aqui o subtotal alvo de CADA linha em centavos (método dos maiores
// restos: a soma bate no centavo) e gravamos o descontoUnitario exato de cada
// uma via store (setDescontoUnitario — o mesmo caminho de digitar o desconto na
// linha). Dados/ações pelas stores Pinia (hiper-pedido-store.js).
// ═══════════════════════════════════════════════════════════════════════════════

(function _valorTotalEditavel() {
  'use strict';

  const CLS_CARD   = 'cadastro-pedido-de-venda-menu-lateral__summary-card';
  const CLS_TITULO = 'cadastro-pedido-de-venda-menu-lateral__summary-title';
  const CLS_VALOR  = 'cadastro-pedido-de-venda-menu-lateral__summary-value';

  const centavos = (v) => Math.round(v * 100);

  // Span do valor no card "Valor total" (achado pelo título, não pela posição).
  function _spanValorTotal() {
    const raiz = document.querySelector('#hiper-microfrontend-pedidodevenda');
    if (!raiz) return null;
    const card = [...raiz.querySelectorAll(`.${CLS_CARD}`)]
      .filter(c => !c.closest('[data-hiper-widget]'))
      .find(c => /valor\s+total/i.test(c.querySelector(`.${CLS_TITULO}`)?.textContent || ''));
    return card?.querySelector(`.${CLS_VALOR}`) ?? null;
  }

  const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function _contexto() {
    const produtos  = window.__hiperPedido?.produtos();
    const descontos = window.__hiperPedido?.descontos();
    if (!produtos || !descontos) return null;
    const linhas = produtos.itens.filter(i =>
      !i.cancelado && i.idProdutoHiperOnline != null && i.quantidade > 0 && i.valorUnitario > 0);
    const frete = Number(descontos.valorDoFrete) || 0;
    // Base de cada linha sem desconto, em centavos (= subtotal do Hiper com d=0).
    const bases  = linhas.map(l => centavos(l.quantidade * l.valorUnitario));
    const totalB = bases.reduce((a, b) => a + b, 0);
    return { produtos, descontos, linhas, frete, bases, totalB };
  }

  // ── Aplica o total desejado ──────────────────────────────────────────────────
  // Devolve { ok, msg } — ou { ok:false, precisaConfirmar:true } quando o alvo
  // é MAIOR que o total sem desconto e `permitirAumento` não foi passado (a UI
  // pede confirmação explícita do funcionário antes de subir preços).
  function aplicarValorTotal(alvo, { permitirAumento = false } = {}) {
    const ctx = _contexto();
    if (!ctx) return { ok: false, msg: 'Pedido não encontrado.' };
    if (!(alvo > 0)) return { ok: false, msg: 'Valor inválido.' };
    if (!ctx.linhas.length) return { ok: false, msg: 'Nenhum item no pedido.' };

    const alvoC = centavos(alvo - ctx.frete);   // soma desejada dos subtotais
    if (alvoC <= 0) {
      return { ok: false, msg: `O valor digitado (${fmtBRL(alvo)}) é menor ou igual ao frete (${fmtBRL(ctx.frete)}).` };
    }
    if (alvoC > ctx.totalB) {
      if (!permitirAumento) return { ok: false, precisaConfirmar: true };
      _aumentarPrecos(ctx, alvoC);
    }
    return _aplicarDesconto(alvo);
  }

  // Sobe o preço unitário de todas as linhas na mesma proporção, arredondando
  // PRA CIMA em 2 casas — o total fica no alvo ou uns centavos acima, e o
  // _aplicarDesconto em seguida tira esses centavos pra bater exato.
  function _aumentarPrecos(ctx, alvoC) {
    const { produtos, descontos, linhas } = ctx;
    descontos.limparDescontos();
    const fator = alvoC / ctx.totalB;
    linhas.forEach(l => {
      produtos.setValorUnitario(l.id, Math.ceil(l.valorUnitario * fator * 100 - 1e-6) / 100);
    });
    // Garantia contra arredondamento do subtotal: se ainda faltar, sobe 1
    // centavo no preço da linha de maior base até passar do alvo.
    const soma = () => linhas.reduce((a, l) => a + centavos(l.quantidade * l.valorUnitario), 0);
    const maior = linhas.reduce((m, l) => (l.quantidade * l.valorUnitario > m.quantidade * m.valorUnitario ? l : m));
    for (let n = 0; soma() < alvoC && n < 1000; n++) {
      produtos.setValorUnitario(maior.id, Math.round((maior.valorUnitario + 0.01) * 100) / 100);
    }
    console.info(`[HiperWidgets] Preços aumentados em ${((fator - 1) * 100).toFixed(2)}%.`);
  }

  function _aplicarDesconto(alvo) {
    const ctx = _contexto();
    const { produtos, descontos, linhas, frete, bases, totalB } = ctx;
    const alvoC = centavos(alvo - frete);
    if (alvoC > totalB) return { ok: false, msg: 'Não foi possível chegar no valor.' };

    // Zera qualquer desconto anterior (inclusive o agregado em modo "valor"/
    // "percentual", que se re-ratearia sozinho quando os itens mudassem).
    descontos.limparDescontos();

    // Subtotal alvo por linha: proporcional à base, maiores restos pro centavo.
    const ideais  = bases.map(b => alvoC * b / totalB);
    const alvos   = ideais.map(Math.floor);
    let sobra     = alvoC - alvos.reduce((a, b) => a + b, 0);
    ideais
      .map((v, i) => ({ i, resto: v - Math.floor(v) }))
      .sort((a, b) => b.resto - a.resto)
      .forEach(({ i }) => { if (sobra > 0 && alvos[i] < bases[i]) { alvos[i]++; sobra--; } });

    // descontoUnitario exato que faz round2(q × (v − d)) = alvo da linha.
    linhas.forEach((l, i) => {
      const d = l.valorUnitario - (alvos[i] / 100) / l.quantidade;
      produtos.setDescontoUnitario(l.id, Math.max(0, Math.round(d * 1e6) / 1e6));
    });

    const final = Number(descontos.totalDoPedido) || 0;
    if (Math.abs(final - alvo) > 0.005) {
      console.warn(`[HiperWidgets] Total ficou R$ ${final.toFixed(2)} (alvo R$ ${alvo.toFixed(2)}).`);
      return { ok: false, msg: `O total ficou ${fmtBRL(final)} em vez de ${fmtBRL(alvo)} — diferença de centavos.` };
    }
    console.info(`[HiperWidgets] ✅ Total ajustado para R$ ${alvo.toFixed(2)}.`);
    return { ok: true };
  }

  // ── Edição inline ────────────────────────────────────────────────────────────
  // Genérica: troca o span por um input com `valorAtual`; Enter/blur chama
  // aoConfirmar(numero) se o valor mudou, Esc cancela.
  function _editarInline(span, valorAtual, aoConfirmar, { sufixo = '' } = {}) {
    if (span.parentElement.querySelector('.hwv-input')) return;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = 'decimal';
    inp.className = 'hwv-input';
    inp.value = valorAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    inp.title = 'Enter aplica · Esc cancela';
    inp.style.cssText = 'width:110px;padding:2px 6px;font:inherit;font-weight:bold;text-align:right;border:1px solid #1a73e8;border-radius:4px;outline:none;';

    const suf = sufixo ? Object.assign(document.createElement('span'), { textContent: sufixo }) : null;
    if (suf) suf.style.cssText = 'margin-left:4px;font-weight:bold;';

    span.style.display = 'none';
    span.after(inp);
    if (suf) inp.after(suf);
    inp.focus();
    inp.select();

    let fechado = false;
    function fechar() {
      if (fechado) return;
      fechado = true;
      inp.remove();
      suf?.remove();
      span.style.display = '';
    }
    function confirmar() {
      if (fechado) return;
      const v = parseNumeroBR(inp.value.replace(/[^\d,.-]/g, ''));
      fechar();
      if (isNaN(v) || Math.abs(v - valorAtual) < 0.005) return;
      aoConfirmar(v);
    }

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirmar(); }
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    });
    inp.addEventListener('blur', confirmar);
  }

  // Leva o pedido ao total `alvo` — com a confirmação de aumento quando precisa.
  // Ponto único usado pelos três campos (valor total, desconto R$, desconto %).
  async function _irParaTotal(alvo) {
    const atual = Number(window.__hiperPedido?.descontos()?.totalDoPedido) || 0;
    let r = aplicarValorTotal(alvo);
    if (r.precisaConfirmar) {
      if (!(await _confirmarAumento(atual, alvo))) return;
      r = aplicarValorTotal(alvo, { permitirAumento: true });
    }
    if (!r.ok) _avisar(r.msg);
  }

  function _abrirEdicaoTotal(span) {
    const atual = Number(window.__hiperPedido?.descontos()?.totalDoPedido) || 0;
    _editarInline(span, atual, _irParaTotal);
  }

  // ── Confirmação de AUMENTO de preços ─────────────────────────────────────────
  // Propositalmente chata: faixa laranja, foco inicial em "Cancelar", e o botão
  // de confirmar só habilita depois que o funcionário digita o novo total de
  // novo — pega erro de digitação (ex: 3200 em vez de 320) antes de subir preço.
  function _confirmarAumento(atual, alvo) {
    return new Promise(resolve => {
      const pct = atual > 0 ? ((alvo / atual) - 1) * 100 : 0;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;width:400px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,.3);">
          <div style="background:#e65100;color:#fff;padding:14px 20px;font-size:17px;font-weight:bold;">
            ⚠️ Você está AUMENTANDO os preços
          </div>
          <div style="padding:18px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
              <div><div style="font-size:12px;color:#777;">Total atual</div><div style="font-size:18px;font-weight:bold;">${fmtBRL(atual)}</div></div>
              <div style="font-size:22px;color:#e65100;">→</div>
              <div style="text-align:right;"><div style="font-size:12px;color:#777;">Novo total</div><div style="font-size:18px;font-weight:bold;color:#e65100;">${fmtBRL(alvo)}</div></div>
            </div>
            <div style="background:#fff3e0;border:1px solid #ffb74d;border-radius:8px;padding:10px 12px;font-size:14px;color:#6d3200;margin-bottom:14px;line-height:1.4;">
              O preço unitário de <b>todos os itens</b> vai subir <b>${pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</b>.
            </div>
            <label style="display:block;font-size:13px;color:#333;margin-bottom:6px;">Para confirmar, digite o novo total de novo:</label>
            <input class="hwv-conf" type="text" inputmode="decimal" autocomplete="off" placeholder="${alvo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}"
              style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:16px;font-weight:bold;border:2px solid #ccc;border-radius:6px;outline:none;">
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
              <button class="hwv-cancelar" type="button" style="padding:8px 16px;border:none;background:#e0e0e0;border-radius:6px;font-size:14px;cursor:pointer;">Cancelar</button>
              <button class="hwv-ok" type="button" disabled style="padding:8px 16px;border:none;background:#e65100;color:#fff;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer;opacity:.4;">Aumentar preços</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const inp = overlay.querySelector('.hwv-conf');
      const ok  = overlay.querySelector('.hwv-ok');
      const cancelar = overlay.querySelector('.hwv-cancelar');

      const confere = () => {
        const v = parseNumeroBR(inp.value.replace(/[^\d,.-]/g, ''));
        const bate = !isNaN(v) && Math.abs(v - alvo) < 0.005;
        ok.disabled = !bate;
        ok.style.opacity = bate ? '1' : '.4';
        inp.style.borderColor = bate ? '#2e7d32' : (inp.value ? '#e65100' : '#ccc');
        return bate;
      };
      const fechar = (res) => { overlay.remove(); resolve(res); };

      inp.addEventListener('input', confere);
      ok.addEventListener('click', () => { if (confere()) fechar(true); });
      cancelar.addEventListener('click', () => fechar(false));
      overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); fechar(false); }
        if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); if (confere()) fechar(true); }
      });
      setTimeout(() => cancelar.focus(), 0);
    });
  }

  // ── Aviso de erro — caixa própria no canto da tela ──────────────────────────
  function _avisar(texto) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:24px;bottom:24px;max-width:360px;background:#fff;border:1px solid #f5c2c2;border-left:5px solid #c62828;border-radius:8px;padding:12px 36px 12px 14px;font-family:sans-serif;font-size:14px;color:#222;line-height:1.4;box-shadow:0 6px 18px rgba(0,0,0,.15);z-index:99999;';
    el.innerHTML = '<div style="font-weight:bold;color:#c62828;margin-bottom:2px;">Não foi possível ajustar o total</div><div class="hwv-msg"></div><button type="button" title="Fechar" style="position:absolute;top:6px;right:8px;border:none;background:none;font-size:16px;cursor:pointer;color:#888;">✕</button>';
    el.querySelector('.hwv-msg').textContent = texto;
    el.querySelector('button').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  // Delegação no document: o Hiper re-renderiza o resumo à vontade, então nada
  // de listener preso no span.
  document.addEventListener('click', (ev) => {
    const span = ev.target.closest?.(`.${CLS_VALOR}`);
    if (span && span === _spanValorTotal()) _abrirEdicaoTotal(span);
  });

  // Visual de "editável" só por CSS em cima do atributo: o Vue reescreve o
  // texto do span a cada mudança de total, então qualquer filho inserido nele
  // (ícone etc.) sumiria — atributo e ::after sobrevivem.
  (function _injetarEstilo() {
    if (document.getElementById('hwv-style')) return;
    const s = document.createElement('style');
    s.id = 'hwv-style';
    s.textContent = `
      [data-hiper-editavel] {
        cursor: pointer;
        border-bottom: 2px dashed #1a73e8;
        border-radius: 4px 4px 0 0;
        padding: 0 4px;
        transition: background .15s;
      }
      [data-hiper-editavel]:hover { background: #e8f0fe; }
      [data-hiper-editavel]::after {
        content: '✏️';
        font-size: .75em;
        margin-left: 6px;
        opacity: .75;
      }
      [data-hiper-editavel]:hover::after { opacity: 1; }
    `;
    (document.head || document.documentElement).appendChild(s);
  })();

  // Marca o span como editável (+ tooltip) sempre que ele for (re)criado.
  let _agendado = null;
  new MutationObserver(() => {
    if (_agendado) return;
    _agendado = setTimeout(() => {
      _agendado = null;
      const span = _spanValorTotal();
      if (span && !span.dataset.hiperEditavel) {
        span.dataset.hiperEditavel = '1';
        span.title = 'Clique para digitar o valor final do pedido';
      }
    }, 200);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── Cards "Desconto (R$)" e "Desconto (%)" — logo acima do "Valor total" ─────
  // Feedback de quanto de desconto foi dado, e editáveis: os dois viram um
  // total alvo e passam pelo mesmo _irParaTotal (mesmo algoritmo exato).
  //   R$ → soma dos descontos dos itens (descontos.valorDeDescontoAplicado)
  //   %  → sobre o total dos produtos sem desconto (percentualDeDescontoAplicado)
  // Cards com as classes nativas dentro de um wrapper display:contents, igual
  // ao hiper-lucro-widget.js.
  function _criarCardsDesconto() {
    const wrap = document.createElement('div');
    wrap.style.display = 'contents';
    wrap.innerHTML = `
      <div class="${CLS_CARD}">
        <span class="${CLS_TITULO}">Desconto (R$)</span>
        <span class="${CLS_VALOR} hwv-desc-valor" data-hiper-editavel="1" title="Clique para digitar o desconto em reais">—</span>
      </div>
      <div class="${CLS_CARD}">
        <span class="${CLS_TITULO}">Desconto (%)</span>
        <span class="${CLS_VALOR} hwv-desc-pct" data-hiper-editavel="1" title="Clique para digitar o desconto em porcentagem">—</span>
      </div>
    `;
    const spanValor = wrap.querySelector('.hwv-desc-valor');
    const spanPct   = wrap.querySelector('.hwv-desc-pct');

    const ler = () => {
      const d = window.__hiperPedido?.descontos();
      return {
        bruto:  Number(d?.totalProdutos) || 0,
        frete:  Number(d?.valorDoFrete) || 0,
        valor:  Number(d?.valorDeDescontoAplicado) || 0,
        pct:    Number(d?.percentualDeDescontoAplicado) || 0,
      };
    };

    function _render() {
      const { valor, pct } = ler();
      spanValor.textContent = fmtBRL(valor);
      spanPct.textContent   = pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
    }

    // Desconto → total alvo. Desconto negativo não existe aqui (aumentar preço
    // é pelo "Valor total"); acima de 100% é recusado.
    function _irParaDesconto(desconto) {
      const { bruto, frete } = ler();
      if (desconto < 0) return _avisar('O desconto não pode ser negativo. Para aumentar o preço, edite o Valor total.');
      if (desconto > bruto + 0.005) return _avisar(`O desconto (${fmtBRL(desconto)}) é maior que o total dos produtos (${fmtBRL(bruto)}).`);
      _irParaTotal(Math.round((bruto + frete - desconto) * 100) / 100);
    }

    spanValor.addEventListener('click', () =>
      _editarInline(spanValor, ler().valor, v => _irParaDesconto(v)));
    spanPct.addEventListener('click', () =>
      _editarInline(spanPct, ler().pct, p => _irParaDesconto(ler().bruto * p / 100), { sufixo: '%' }));

    // Recalcula a cada mudança nas stores; desliga quando o card sai do DOM
    // (o hiper-ui recria no próximo re-render do resumo).
    const desinscrever = [];
    let _t = null;
    const _deb = () => {
      if (!wrap.firstElementChild?.isConnected) {
        desinscrever.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
        return;
      }
      clearTimeout(_t);
      _t = setTimeout(_render, 100);
    };
    ['produtos', 'descontos'].forEach(nome => {
      const s = window.__hiperPedido?.[nome]();
      if (s?.$subscribe) desinscrever.push(s.$subscribe(_deb));
    });

    _render();
    return wrap;
  }

  (function _registrarCardsDesconto() {
    if (!window.__hiperUI) return setTimeout(_registrarCardsDesconto, 50);
    window.__hiperUI.registrar({
      id: 'hiper-cards-desconto', ordem: 4, render: _criarCardsDesconto,
      alvo: () => {
        const card = _spanValorTotal()?.closest(`.${CLS_CARD}`);
        return card ? { parent: card.parentElement, ref: card } : null;
      },
    });
  })();

  window.HiperWidgets = window.HiperWidgets || {};
  window.HiperWidgets.aplicarValorTotal = aplicarValorTotal;

  console.info('[HiperWidgets] ✅ Valor total editável ativo.');
})();
