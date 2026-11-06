// Content script em sistema.santin.tec.br: entrega ao site a chave de acesso
// guardada na extensão (chrome.storage.local → localStorage `hiper_chave`),
// para o site não precisar pedir a chave nos PCs que têm a extensão. O
// chave.js do site põe essa chave em toda chamada à API.
chrome.storage.local.get('hiper_api_key', (r) => {
  const chave = r && r.hiper_api_key;
  if (!chave) return;
  try {
    if (localStorage.getItem('hiper_chave') !== chave) {
      localStorage.setItem('hiper_chave', chave);
      window.dispatchEvent(new Event('hiper-chave'));
    }
  } catch (_) { /* storage bloqueado */ }
});
