// Service worker — mantém a extensão ativa
chrome.runtime.onInstalled.addListener(() => {
  console.log('[HiperCache] Extensão instalada.');
});
