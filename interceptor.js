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
  { src: 'hiper-sync.js' },
  { src: 'hiper-widgets.js' },
  { src: 'hiper-ui.js' },
  { src: 'hiper-orcamento.js' },
  { src: "hiper-lucro-widget.js"},
  { src: 'kit.js' },
  { src: 'hiper-mov-widget.js' },
  { src: 'hiper-mov-lista.js' },
  { src: 'resumido-dados.js' },
  { src: 'hiper-db.js' },
  { src: 'resumido-runtime.js' },
  { src: 'resumido-gerador.js' },
  { src: 'hiper-cpf-autofill.js' },
  { src: 'hiper-ia-widget.js' },
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
        const res = await fetch(`https://api.sistema.santin.tec.br/pedido/${encodeURIComponent(numOrc)}`, {
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

  // ── Geração atômica de número de orçamento via background (serial) ──────────
  // O service worker pode estar dormindo na primeira chamada — fazemos até
  // MAX_TENTATIVAS tentativas com intervalo crescente antes de desistir.
  // Nunca usamos fallback local: o background é a única fonte da verdade,
  // garantindo que nenhum par de abas receba o mesmo número de orçamento.
  if (msg.type === 'HIPER_ORC_NEXT_NUM') {
    const MAX_TENTATIVAS = 5;
    const DELAY_BASE_MS  = 300; // 300 ms → 600 ms → 900 ms → …

    const _tentarGerarNumero = (tentativa) => {
      chrome.runtime.sendMessage({ type: 'HIPER_ORC_NEXT_NUM' }, (resp) => {
        if (!chrome.runtime.lastError && resp?.numero) {
          // Sucesso — mantém __hiperOrcConfig sincronizado na aba
          if (window.__hiperOrcConfig) window.__hiperOrcConfig.counter = resp.counter;
          window.postMessage({ type: 'HIPER_ORC_NEXT_NUM_ACK', numero: resp.numero, counter: resp.counter }, '*');
          return;
        }

        const erro = chrome.runtime.lastError?.message || 'sem resposta';
        if (tentativa < MAX_TENTATIVAS) {
          const delay = DELAY_BASE_MS * tentativa;
          console.warn(`[Interceptor] ⚠️ Background indisponível (tentativa ${tentativa}/${MAX_TENTATIVAS}) — retry em ${delay}ms. Erro: ${erro}`);
          setTimeout(() => _tentarGerarNumero(tentativa + 1), delay);
        } else {
          console.error(`[Interceptor] ❌ Não foi possível gerar número de orçamento após ${MAX_TENTATIVAS} tentativas. Erro: ${erro}`);
          // Notifica a página para que possa exibir feedback ao usuário
          window.postMessage({ type: 'HIPER_ORC_NEXT_NUM_ERR', erro }, '*');
        }
      });
    };

    _tentarGerarNumero(1);
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

  if (msg.type === 'HIPER_STORAGE_GET') {
    await safeStorage(async () => {
      const result = await chrome.storage.local.get(msg.keys);
      // Garante que enviamos um objeto, mesmo que vazio
      window.postMessage({ 
        _hiperStorageSeq: msg._hiperStorageSeq, 
        result: result || {} 
      }, '*');
    });
  }

  if (msg.type === 'HIPER_STORAGE_SET') {
    await safeStorage(async () => {
      await chrome.storage.local.set(msg.obj);
      window.postMessage({ _hiperStorageSeq: msg._hiperStorageSeq, result: undefined }, '*');
    });
  }

  if (msg.type === 'HIPER_STORAGE_REMOVE') {
    await safeStorage(async () => {
      await chrome.storage.local.remove(msg.keys);
      window.postMessage({ _hiperStorageSeq: msg._hiperStorageSeq, result: undefined }, '*');
    });
  }

  // ── Sincronização de custos via interceptor (bypass CSP) ─────────────────
  if (msg.type === 'HIPER_SYNC_CUSTOS_REQ') {
    (async () => {
      try {
        const API = 'https://api.sistema.santin.tec.br';
        const metaRes = await fetch(`${API}/custos/metadata`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (!metaRes.ok) throw new Error(`metadata status ${metaRes.status}`);
        const meta        = await metaRes.json();
        const hashRemoto  = meta.hash        || '';
        const forceUpdate = meta.force_update === true;
        const hashLocal   = msg.hashLocal    || '';

        if (forceUpdate || hashRemoto !== hashLocal) {
          const dataRes = await fetch(`${API}/custos/data`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
          });
          if (!dataRes.ok) throw new Error(`data status ${dataRes.status}`);
          const payload = await dataRes.json();
          const custos  = payload.custos || {};
          const hash    = payload.hash   || hashRemoto;
          window.postMessage({ type: 'HIPER_SYNC_CUSTOS_RESULT', ok: true, custos, hash }, '*');
        } else {
          window.postMessage({ type: 'HIPER_SYNC_CUSTOS_RESULT', ok: true, custos: null, hash: hashRemoto }, '*');
        }
      } catch(e) {
        window.postMessage({ type: 'HIPER_SYNC_CUSTOS_RESULT', ok: false, error: e.message }, '*');
      }
    })();
  }

  // ── Master de produtos: lista montada server-side (substitui o preload) ───
  if (msg.type === 'HIPER_MASTER_LOAD') {
    (async () => {
      try {
        const res = await fetch('https://api.sistema.santin.tec.br/produtos/master', {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error('status ' + res.status);
        const data = await res.json();
        window.postMessage({ type: 'HIPER_MASTER_LOADED', produtos: data.produtos || [] }, '*');
      } catch (e) {
        console.warn('[Interceptor] ⚠️ Falha ao carregar master do servidor:', e.message);
        window.postMessage({ type: 'HIPER_MASTER_LOADED', produtos: null }, '*');
      }
    })();
  }

  if (msg.type === 'HIPER_EVENTO_SEND') {
    try {
      const res = await fetch(`https://api.sistema.santin.tec.br/hiper-evento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg.payload),
      });
      if (res.ok) {
        console.log('[Interceptor] ✅ Evento registrado via bridge');
      } else {
        // Resposta não-2xx (ex: 500) não é exceção — sem isso o erro fica
        // mudo no console e passa despercebido (já aconteceu: bug no backend
        // derrubou TODOS os eventos por ~3 dias sem nenhum aviso aqui).
        const corpo = await res.text().catch(() => '');
        console.error('[Interceptor] ❌ /hiper-evento respondeu', res.status, '—', corpo.slice(0, 300), msg.payload);
      }
    } catch (e) {
      console.warn('[Interceptor] ❌ Falha ao registrar evento:', e);
    }
  }

  if (msg.type === 'HIPER_MOV_GET') {
    try {
      const res  = await fetch(`https://api.sistema.santin.tec.br/pedido-venda/${msg.pedidoId}`);
      const data = res.ok ? await res.json() : null;
      window.postMessage({ type: 'HIPER_MOV_GET_RESULT', seq: msg.seq, ok: res.ok, data }, '*');
    } catch (e) {
      window.postMessage({ type: 'HIPER_MOV_GET_RESULT', seq: msg.seq, ok: false, data: null }, '*');
    }
  }

  if (msg.type === 'HIPER_ENTRADA_ESTOQUE') {
    try {
      const res = await fetch(`https://api.sistema.santin.tec.br/entrada-estoque`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg.payload),
      });
      if (res.ok) {
        console.log('[Interceptor] ✅ Entrada de estoque NF-e registrada:', msg.payload.id_nfe);
      } else {
        console.warn('[Interceptor] ⚠️ Falha ao registrar entrada NF-e:', res.status);
      }
    } catch(e) {
      console.warn('[Interceptor] ❌ Erro ao registrar entrada NF-e:', e);
    }
  }

  if (msg.type === 'HIPER_MOV_PATCH') {
    try {
      const res  = await fetch(`https://api.sistema.santin.tec.br/pedido-venda/${msg.pedidoId}/movimento`, { method: 'PATCH' });
      const data = await res.json();
      window.postMessage({ type: 'HIPER_MOV_PATCH_RESULT', seq: msg.seq, ok: res.ok, data }, '*');
    } catch (e) {
      window.postMessage({ type: 'HIPER_MOV_PATCH_RESULT', seq: msg.seq, ok: false, data: null }, '*');
    }
  }
  
});
// ── Recebe atualizar-situacao do background (webRequest) ─────────────────────
// O background detecta o PUT via chrome.webRequest e notifica o content script.
// Aqui repassamos para a página como se fosse um evento normal do hiper-sync.js.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'HIPER_ATUALIZAR_SITUACAO') return;

  const { pedidoId, situacaoCod } = msg;
  console.log('[Interceptor] 📡 atualizar-situacao recebido do background:', pedidoId, situacaoCod);

  // Injeta um evento sintético na página para o hiper-sync.js processar
  window.postMessage({
    type:        'HIPER_ATUALIZAR_SITUACAO_PAGE',
    pedidoId,
    situacaoCod,
  }, '*');

  sendResponse({ ok: true });
});