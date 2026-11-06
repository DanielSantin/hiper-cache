// Service worker.
//
// Chave de acesso da API (estágio 1 da proteção, ver hiper-database/core/chave.py):
// ao instalar/atualizar e ao abrir o Chrome, se o PC ainda não tem chave no
// chrome.storage.local, copia a de `chave-inicial.json`. Esse arquivo NÃO está
// no git (o repositório é público): fica só na pasta local e entra no zip da
// Web Store. No estágio 2 a versão nova sai sem o arquivo; quem já recebeu
// continua com a chave guardada, e o popup permite digitar/trocar.
async function semearChave() {
  try {
    const { hiper_api_key } = await chrome.storage.local.get('hiper_api_key');
    if (hiper_api_key) return;
    const r = await fetch(chrome.runtime.getURL('chave-inicial.json'));
    if (!r.ok) return;
    const { chave } = await r.json();
    if (chave) {
      await chrome.storage.local.set({ hiper_api_key: chave });
      console.log('[HiperCache] Chave de acesso guardada.');
    }
  } catch (_) {
    // sem chave-inicial.json (estágio 2 em diante): nada a fazer
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[HiperCache] Extensão instalada/atualizada.');
  semearChave();
});
chrome.runtime.onStartup.addListener(semearChave);
