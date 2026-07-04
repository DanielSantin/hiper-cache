// hiper-preco-sync.js — Watcher de preço de tabela.
//
// O precoVendaFinal do get-dados-produto-pedido (disparado quando o
// funcionário clica num item) é o preço de tabela REAL do Hiper — bem mais
// confiável que o valor da última venda, que pode carregar ajuste manual.
//
// Fluxo: hiper-sync.js intercepta as respostas (fetch e XHR) e chama
// window.__hiperPrecoCheck(dados). Aqui comparamos com o cache de preços da
// dbApi (carregado via interceptor, TTL 24h) e, se divergir, mandamos o
// update via HIPER_PRECO_UPDATE → POST /ia/precos/hiper (origem confiável).

(() => {
  'use strict';

  const TOLERANCIA = 0.005;   // diferença de centavos por arredondamento não conta

  let precos = null;          // {idProduto: preco} — null até o cache chegar
  const filaAntesDoCache = [];

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    if (ev.data?.type === 'HIPER_PRECOS_LOADED') {
      precos = ev.data.precos || {};
      console.log('[PrecoSync] 📦 Cache de preços carregado:', Object.keys(precos).length, 'itens');
      while (filaAntesDoCache.length) checar(filaAntesDoCache.shift());
    }
  });

  function checar(dados) {
    if (!Array.isArray(dados) || !dados.length) return;
    if (precos === null) { filaAntesDoCache.push(dados); return; }

    const diffs = [];
    for (const d of dados) {
      const id    = String(d?.idProduto ?? '').trim();
      const preco = Number(d?.precoVendaFinal);
      if (!id || !(preco > 0)) continue;

      const atual = Number(precos[id]);
      if (!Number.isFinite(atual) || Math.abs(atual - preco) > TOLERANCIA) {
        precos[id] = preco;   // atualiza local já — evita reenvio no próximo clique
        diffs.push({ idProduto: id, preco });
      }
    }

    if (diffs.length) {
      console.log('[PrecoSync] 💰 Preço novo/divergente detectado:', diffs);
      window.postMessage({ type: 'HIPER_PRECO_UPDATE', precos: diffs }, '*');
    }
  }

  window.__hiperPrecoCheck = checar;

  // Pede o cache ao interceptor (que busca na dbApi se estiver vencido)
  window.postMessage({ type: 'HIPER_PRECOS_LOAD' }, '*');
})();
