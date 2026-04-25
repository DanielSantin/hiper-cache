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