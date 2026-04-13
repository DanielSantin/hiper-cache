// Content script — ponte entre os módulos de página e chrome.storage
// Roda no contexto privilegiado da extensão (tem acesso ao chrome.*)

async function safeStorage(fn) {
  try { return await fn(); }
  catch (e) {
    if (!e.message?.includes('Extension context invalidated')) console.warn('[HiperCache]', e);
  }
}

// ── Carrega os módulos da página em sequência ─────────────────────────────────
const MODULES = [
  { src: 'unidades_padrao.js' },
  { src: 'hiper-icones.js' },
  { src: 'hiper-cache.js' },
  { src: 'hiper-widgets.js' },
  { src: 'hiper-ui.js' },
  { src: 'hiper-orcamento.js' },
  { src: 'kit.js' },
  { src: 'resumido-dados.js' },
  { src: 'hiper-db.js' },
  { src: 'resumido-runtime.js' },
  { src: 'resumido-gerador.js' },
];

function loadNextModule(modules, index) {
  if (index >= modules.length) return;
  const mod = modules[index];
  const url = chrome.runtime.getURL(mod.src);
  const next = () => loadNextModule(modules, index + 1);
  const s = document.createElement('script');
  s.src = url;
  s.onload  = () => { s.remove(); next(); };
  s.onerror = () => console.error('[HiperCache] Falha ao carregar:', mod.src);
  (document.head || document.documentElement).appendChild(s);
}

chrome.storage.local.get('hiper_ativo', (r) => {
  if (r.hiper_ativo === false) {
    console.info('[HiperCache] ⏸ Extensão desativada pelo usuário.');
    return;
  }
  loadNextModule(MODULES, 0);
});

// ── BroadcastChannel: escuta mensagens vindas da página de orçamento (blob:) ──
// O interceptor escuta o canal diretamente — sem depender de window.postMessage.
try {
  const bc = new BroadcastChannel('hiper_custo_channel');

  bc.onmessage = async (ev) => {
    const msg = ev.data;
    if (!msg?.type) return;

    // ── Salva custo de produto ────────────────────────────────────────────────
    if (msg.type === 'HIPER_CUSTO_SAVE') {
      console.log('[Interceptor] 📡 BC recebeu custo — id:', msg.id, '| val:', msg.val);
      await safeStorage(async () => {
      const key = 'custo:' + msg.id;
      await chrome.storage.local.set({ 
        [key]: { data: msg.val, ts: Date.now() } 
      });
      console.log('[Interceptor] ✅ Custo salvo — chave:', key);
      });
      // Notifica a página principal (para atualizar __hiperCustos em memória)
      window.postMessage({ type: 'HIPER_CUSTO_SYNC', id: msg.id, val: msg.val }, '*');
    }

    // ── Salva cliente via PATCH na API ────────────────────────────────────────
    if (msg.type === 'HIPER_CLIENTE_SAVE') {
      const { numOrc, cliente } = msg;
      console.log('[Interceptor] 📡 BC recebeu cliente — orçamento:', numOrc, '| nome:', cliente);
      try {
        const res = await fetch(`https://db.superaserver.com/api/pedido/${encodeURIComponent(numOrc)}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ cliente }),
        });
        if (res.ok) {
          console.log('[Interceptor] ✅ Cliente salvo no banco — orçamento:', numOrc, '| nome:', cliente);
        } else {
          console.warn('[Interceptor] ⚠️ API retornou', res.status, 'ao salvar cliente');
        }
      } catch(e) {
        console.warn('[Interceptor] ❌ Falha ao salvar cliente na API:', e);
      }
    }

    // ── Salva vendedor ────────────────────────────────────────────────────────
    if (msg.type === 'HIPER_VENDEDOR_SAVE') {
      await safeStorage(async () => {
        await chrome.storage.local.set({ 'vendedor': { checked: msg.checked, text: msg.text } });
        console.log('[Interceptor] ✅ Vendedor salvo:', msg.text);
      });
      // Notifica a página original para atualizar __hiperVendedor em memória
      // (mesmo padrão do HIPER_CUSTO_SYNC)
      window.postMessage({ type: 'HIPER_VENDEDOR_SYNC', text: msg.text, checked: msg.checked }, '*');
      console.log('[Interceptor] 📡 Vendedor sync disparado para página original:', msg.text);
    }

    // ── Carrega vendedor e responde via BC (funciona para blob: também) ───────
    if (msg.type === 'HIPER_VENDEDOR_LOAD') {
      await safeStorage(async () => {
        const result = await chrome.storage.local.get('vendedor');
        const v = result?.vendedor || { checked: false, text: '' };
        const bcReply = new BroadcastChannel('hiper_custo_channel');
        bcReply.postMessage({ type: 'HIPER_VENDEDOR_LOADED', checked: v.checked, text: v.text });
        bcReply.close();
        console.log('[Interceptor] ✅ Vendedor carregado e enviado via BC:', v.text);
      });
    }
  };

  console.info('[Interceptor] 📡 BroadcastChannel ativo.');
} catch(e) {
  console.warn('[Interceptor] BroadcastChannel não disponível:', e);
}

// ── Bridge: messages da página principal → chrome.storage ────────────────────
window.addEventListener('message', async (event) => {
  const msg = event.data;
  if (event.source !== window) return;
  if (!msg?.type?.startsWith('HIPER')) return;

  if (msg.type === 'HIPER_CACHE_LOAD_ALL') {
    await safeStorage(async () => {
      const all = await chrome.storage.local.get(null);
      window.postMessage({ type: 'HIPER_CACHE_ALL', entries: all }, '*');
    });
  }

  if (msg.type === 'HIPER_CACHE_SET') {
    // hiper_orc_* são salvos como primitivos pelo popup — mantém consistência
    const ORC_PLAIN_KEYS = new Set(['hiper_orc_letra', 'hiper_orc_counter']);
    await safeStorage(() =>
      ORC_PLAIN_KEYS.has(msg.key)
        ? chrome.storage.local.set({ [msg.key]: msg.data })
        : chrome.storage.local.set({ [msg.key]: { data: msg.data, ts: msg.ts } })
    );
  }

  if (msg.type === 'HIPER_CACHE_CLEAR') {
    await safeStorage(async () => {
      await chrome.storage.local.clear();
      window.postMessage({ type: 'HIPER_CACHE_CLEAR_ACK' }, '*');
    });
  }

  if (msg.type === 'HIPER_CUSTO_EXPORT_REQ') {
    await safeStorage(async () => {
      const all    = await chrome.storage.local.get(null);
      const custos = {};
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith('custo:')) custos[k.slice(6)] = v;
      }
      window.postMessage({ type: 'HIPER_CUSTO_EXPORT_DATA', custos }, '*');
    });
  }

  if (msg.type === 'HIPER_CUSTO_LOAD_ALL') {
    await safeStorage(async () => {
      const all    = await chrome.storage.local.get(null);
      const custos = {};
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith('custo:')) custos[k.slice(6)] = v.data;
      }
      console.log('[Interceptor] 📦 Carregando custos:', Object.keys(custos).length, 'itens —', JSON.stringify(custos));
      window.postMessage({ type: 'HIPER_CUSTO_LOADED', custos }, '*');
    });
  }

});