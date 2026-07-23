// Service worker — mantém a extensão ativa e serializa operações críticas
const API_BASE = 'https://api.sistema.santin.tec.br';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[HiperCache] Extensão instalada.');
});

// ── Geração de número de orçamento ────────────────────────────────────────────
// O contador vive no backend (sync_meta.orc_seq:<LETRA>), incrementado
// atomicamente (BEGIN IMMEDIATE) a cada requisição — mesmo que várias pessoas
// usem a mesma letra ao mesmo tempo, em perfis/máquinas diferentes, não há
// colisão nem sobrescrita de orçamento.
//
// A letra é config local por perfil (chrome.storage.local, editável no popup),
// com padrão "T" — só identifica quem gerou o orçamento, não precisa ser única.

const LETRA_PADRAO = 'T';

function obterLetra() {
  return new Promise((resolve) => {
    chrome.storage.local.get('hiper_orc_letra', (r) => {
      const letra = (r?.hiper_orc_letra || '').trim().toUpperCase();
      resolve(/^[A-Z]{1,3}$/.test(letra) ? letra : LETRA_PADRAO);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'HIPER_ORC_NEXT_NUM') return false;

  obterLetra()
    .then((letra) =>
      fetch(`${API_BASE}/pedido/proximo-numero?letra=${encodeURIComponent(letra)}`, { method: 'POST' })
    )
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data) => {
      console.log('[HiperCache] Número de orçamento gerado:', data.numero, '| aba:', sender.tab?.id);
      sendResponse({ numero: data.numero, counter: data.counter });
    })
    .catch((err) => {
      console.error('[HiperCache] Falha ao gerar número de orçamento via API:', err);
      sendResponse({}); // sem 'numero' → interceptor.js entende como falha e faz retry
    });

  return true; // mantém sendResponse ativo até a resposta assíncrona
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