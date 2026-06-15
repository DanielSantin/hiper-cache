// Service worker — mantém a extensão ativa e serializa operações críticas
chrome.runtime.onInstalled.addListener(() => {
  console.log('[HiperCache] Extensão instalada.');
});

// ── Geração atômica de número de orçamento ────────────────────────────────────
// O service worker é single-threaded: onMessage processa uma mensagem por vez.
// Isso garante que nunca duas abas obtêm o mesmo número, sem necessidade de lock.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'HIPER_ORC_NEXT_NUM') return false;

  chrome.storage.local.get(['hiper_orc_letra', 'hiper_orc_counter'], (r) => {
    const letra   = ((r.hiper_orc_letra) || 'A').toUpperCase();
    const current = parseInt(r.hiper_orc_counter ?? '999', 10) || 999;
    const next    = current >= 999999 ? 1000 : current + 1;

    chrome.storage.local.set({ hiper_orc_counter: next }, () => {
      console.log('[HiperCache] Número de orçamento gerado:', letra + next, '| aba:', sender.tab?.id);
      sendResponse({ numero: letra + String(next), counter: next });
    });
  });

  return true; // mantém sendResponse ativo até o callback assíncrono responder
});

// ── Suprime window.print() na página de impressão quando tag_view=1 ──────────
// chrome.scripting.executeScript com world:'MAIN' bypassa o CSP da página.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  const url = changeInfo.url || tab.url || '';
  if (!url.includes('/Imprimir') || !url.includes('tag_view=1')) return;

  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    func: () => { window.print = function () {}; },
  }).catch(() => {});
});

// ── Interceptação de rede: atualizar-situacao ─────────────────────────────────
// O Hiper salva referências ao fetch nativo antes dos scripts de extensão
// carregarem. Para o endpoint atualizar-situacao (PUT sem body), usamos
// chrome.webRequest que opera na camada de rede — não pode ser burlado.
//
// Fluxo: background detecta o PUT concluído → envia mensagem para o
// content script da aba → content script faz postMessage para a página →
// hiper-sync.js processa normalmente via HIPER_EVENTO_SEND.

const RE_ATUALIZAR = /api\.hiper\.com\.br\/pedido-venda\/(\d+)\/atualizar-situacao\/(\d+)/i;

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.method !== 'PUT') return;
    if (details.statusCode < 200 || details.statusCode >= 300) return;

    const match = details.url.match(RE_ATUALIZAR);
    if (!match) return;

    const pedidoId   = match[1];
    const situacaoCod = match[2];

    console.log(`[Background] 📡 atualizar-situacao detectado: pedido=${pedidoId} cod=${situacaoCod} status=${details.statusCode}`);

    // Envia para o content script da aba que originou a requisição
    chrome.tabs.sendMessage(details.tabId, {
      type: 'HIPER_ATUALIZAR_SITUACAO',
      pedidoId,
      situacaoCod,
    }, (resp) => {
      if (chrome.runtime.lastError) {
        console.warn('[Background] ⚠️ Não foi possível notificar content script:', chrome.runtime.lastError.message);
      }
    });
  },
  { urls: ['https://api.hiper.com.br/pedido-venda/*/atualizar-situacao/*'] },
  [] // sem 'requestBody' — não precisamos do body para PUT 204
);