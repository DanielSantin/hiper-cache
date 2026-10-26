// ═══════════════════════════════════════════════════════════════════════════════
// hiper-orcamento.js — Botão "Gerar orçamento"
//
// O orçamento (e o resumido) agora são páginas do site, que leem e salvam no
// banco: sistema.santin.tec.br/v2/orcamento?id=X (repo hiper-sites, pasta v2/).
// Aqui fica só o que precisa da página do Hiper: ler o pedido da store, gerar
// o número, salvar (hiper-db.js, com o rateio dos kits) e abrir a página.
// ═══════════════════════════════════════════════════════════════════════════════

const URL_ORCAMENTO_SITE = 'https://sistema.santin.tec.br/v2/orcamento';

// ── Config de vendedor + letra do orçamento (persistidas via chrome.storage.local,
// só chegam à página via broadcast do interceptor — page-world não tem chrome.*) ──
(function _bootVendedorConfig() {
  window.addEventListener('message', function _onVendedorConfig(ev) {
    if (ev.source !== window) return;
    const msg = ev.data;

    if (msg?.type === 'HIPER_CACHE_ALL') {
      const entries = msg.entries || {};
      const vendedorText    = entries['vendedor']?.text    ?? null;
      const vendedorChecked = entries['vendedor']?.checked ?? null;
      if (!window.__hiperVendedor) window.__hiperVendedor = { checked: false, text: '' };
      if (vendedorText    != null) window.__hiperVendedor.text    = String(vendedorText);
      if (vendedorChecked != null) window.__hiperVendedor.checked = vendedorChecked === true || vendedorChecked === 'true';

      const letra = (entries['hiper_orc_letra'] || '').toString().trim().toUpperCase();
      if (/^[A-Z]{1,3}$/.test(letra)) window.__hiperOrcLetra = letra;
    }
  });
})();

// ── Geração do número de orçamento — requisição direta ao backend ────────────
// O CORS do backend já libera https://tagdrywall.hiper.com.br diretamente
// (main.py), e a atomicidade do contador é garantida no servidor (BEGIN
// IMMEDIATE em sync_meta.orc_seq).
async function gerarNumeroOrcamentoAsync() {
  const letra = window.__hiperOrcLetra || 'T';
  let res;
  try {
    res = await fetch(`https://api.sistema.santin.tec.br/pedido/proximo-numero?letra=${encodeURIComponent(letra)}`, { method: 'POST' });
  } catch {
    throw new Error('Não foi possível gerar o número de orçamento. Verifique sua conexão e tente novamente.');
  }
  if (!res.ok) throw new Error(`Não foi possível gerar o número de orçamento (HTTP ${res.status}). Tente novamente.`);
  const data = await res.json();
  if (!data?.numero) throw new Error('Não foi possível gerar o número de orçamento. Tente novamente.');
  return data.numero;
}

// Itens vêm direto da store Pinia do microfrontend (ver hiper-pedido-store.js) —
// linhas sem produto escolhido ou canceladas ficam de fora, igual ao Hiper.
function obterItensPedido() {
  const store = window.__hiperPedido?.produtos();
  if (!store) {
    console.warn('[HiperOrc] Store de produtos do pedido não encontrada.');
    return [];
  }
  return store.itens.filter(it => !it.cancelado && it.idProdutoHiperOnline != null);
}

function extrairDadosPedido() {
  const descontos = window.__hiperPedido?.descontos();

  const itens = obterItensPedido().map(it => {
    const p           = it.produto || {};
    const qtd         = Number(it.quantidade) || 0;
    const vlUnitBruto = Number(it.valorUnitario) || 0;
    const vlUnit      = Math.round(vlUnitBruto * 0.9523 * 100) / 100;   // preço PIX

    return {
      linhaId:         it.id ?? null,   // id da linha na store — liga o item ao rateio dos kits
      idProduto:       String(it.idProdutoHiperOnline),
      idProdutoGrade:  it.idProdutoGradeHiperOnline ?? null,
      nome:            it.produtoNome || p.nome || '',
      codigo:          p.codigo != null ? String(p.codigo) : null,
      qtd,
      quantidade:      qtd,
      unidade:         p.unidadeDeMedida?.sigla ?? p.siglaUnidadeDeMedida ?? p.siglaDaUnidadeDeMedida ?? 'UN',
      vlUnit,
      vlUnitBruto,
      subtotal:        qtd * vlUnitBruto,
      precoVendaFinal: it.valorUnitarioBase ?? null,
      ehKit:           p.ehKit ?? false,
    };
  });

  return {
    itens,
    desconto: descontos?.valorDeDescontoAplicado ?? 0,
    frete:    descontos?.valorDoFrete ?? 0,
    total:    descontos?.totalDoPedido ?? 0,
  };
}

// ── Gerar orçamento ───────────────────────────────────────────────────────────
// A aba abre já no clique (depois dos awaits o Chrome pode bloquear o popup) e
// mostra o andamento; vai para a página do site quando o pedido está salvo.
function _mensagemNaAba(janela, html) {
  if (!janela || janela.closed) return;
  janela.document.open();
  janela.document.write('<meta charset="utf-8"><title>Orçamento</title>' +
    '<div style="font:20px Arial;max-width:620px;margin:60px auto;line-height:1.5">' + html + '</div>');
  janela.document.close();
}

async function abrirOrcamento() {
  const dados = extrairDadosPedido();
  if (dados.itens.length === 0) {
    alert('Nenhum item encontrado. Adicione pelo menos um produto.');
    return;
  }

  const janela = window.open('', '_blank');
  _mensagemNaAba(janela, '<b style="color:#1a5c1a">Gerando orçamento…</b>');

  let numero;
  try {
    numero = await gerarNumeroOrcamentoAsync();
  } catch (e) {
    console.error('[HiperOrc] ❌', e.message);
    _mensagemNaAba(janela, '<b style="color:#c00">' + e.message + '</b><br><br>Feche esta aba e clique em "Gerar orçamento" de novo.');
    return;
  }
  window.__hiperPedidoAberto = numero;   // faturamento estatístico (hiper-sync.js)

  const url = URL_ORCAMENTO_SITE + '?id=' + encodeURIComponent(numero);
  // Cliente, descrição, desconto e parcelas são digitados no site (página v2) —
  // não vão no payload; a API mantém o que já tem. Nasce como rascunho: só
  // aparece na lista do site depois de copiado, baixado ou impresso lá;
  // rascunho esquecido é apagado sozinho (2 dias).
  const payload = { itens: dados.itens, total: dados.total, rascunho: true };

  // Até 3 tentativas; salvarPedido já cancela o reenvio automático anterior
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    if (tentativa > 1) {
      _mensagemNaAba(janela, '<b style="color:#b45309">Sem resposta do servidor — tentando de novo (' + tentativa + '/3)…</b>');
      await new Promise(r => setTimeout(r, 2500));
    }
    if (await window.__hiperSalvarPedido?.(numero, payload)) {
      if (janela && !janela.closed) janela.location.href = url;
      else window.open(url, '_blank');
      return;
    }
  }

  // O hiper-db.js continua tentando sozinho em segundo plano (a cada 15 s)
  _mensagemNaAba(janela,
    '<b style="color:#c00">Não foi possível salvar o orçamento ' + numero + ' agora.</b><br><br>' +
    'O sistema continua tentando sozinho. Deixe a aba do Hiper aberta e, em alguns instantes, ' +
    '<a href="' + url + '">clique aqui para abrir o orçamento ' + numero + '</a>.');
}

// ── Registro no centralizador de UI (hiper-ui.js) ────────────────────────────
// Tela nova (microfrontend): o botão fica logo abaixo do "Salvar orçamento"
// nativo, dentro do menu lateral do cadastro do pedido.
(function _registrarOrcamento() {
  const SEL_BOTOES_MENU = '#hiper-microfrontend-pedidodevenda .cadastro-pedido-de-venda-menu-lateral__buttons';

  function _alvoBotao() {
    const container = document.querySelector(SEL_BOTOES_MENU);
    if (!container) return null;
    const salvar =
      [...container.querySelectorAll('button')].find(b => /salvar\s+or[çc]amento/i.test(b.textContent)) ||
      container.querySelector('button.hc-button.success');
    return { parent: container, ref: salvar ? salvar.nextSibling : null };
  }

  function _criarBotao() {
    const btn = document.createElement('button');
    btn.id        = 'hiper-btn-orcamento';
    btn.type      = 'button';
    btn.className = 'hc-button';
    btn.style.cssText = 'background: rgba(46, 204, 113, 0.15); color: #1a7a1a; border: 1px solid rgba(46, 204, 113, 0.6); font-weight: bold;';
    btn.textContent = '📄 Gerar orçamento';
    btn.addEventListener('click', abrirOrcamento);
    console.info('[HiperCache] Botão de orçamento criado.');
    return btn;
  }

  function _registrar() {
    if (window.__hiperUI) {
      window.__hiperUI.registrar({ id: 'hiper-btn-orcamento', ordem: 0, render: _criarBotao, alvo: _alvoBotao });
    } else {
      setTimeout(_registrar, 50);
    }
  }
  _registrar();
})();

// ── Exportar custos ───────────────────────────────────────────────────────────
window.__hiperExportarCustos = async function() {
  window.postMessage({ type: 'HIPER_CUSTO_EXPORT_REQ' }, '*');
};

window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  if (ev.data?.type === 'HIPER_CUSTO_EXPORT_DATA') {
    const json = JSON.stringify(ev.data.custos, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'custos_tag_' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
});
