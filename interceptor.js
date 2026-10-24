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
  { src: 'hiper-num-utils.js' },
  { src: 'hiper-pedido-store.js' },
  { src: 'hiper-cache.js' },
  { src: 'hiper-sync.js' },
  { src: 'hiper-widgets.js' },
  { src: 'hiper-ui.js' },
  { src: 'hiper-orcamento.js' },
  { src: "hiper-lucro-widget.js"},
  { src: 'kit.js' },
  { src: 'hiper-mov-widget.js' },
  { src: 'hiper-mov-lista.js' },
  { src: 'hiper-db.js' },
  { src: 'hiper-cpf-autofill.js' },
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
    await safeStorage(() =>
      chrome.storage.local.set({ [msg.key]: { data: msg.data, ts: msg.ts } })
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
      const API   = 'https://api.sistema.santin.tec.br';
      const seq   = msg.seq;
      const force = msg.force === true;
      try {
        // Botão "Atualizar": força o servidor a puxar do Hiper (/produtos/sync)
        // ANTES de responder — por isso é mais lento.
        if (force) {
          const syncRes = await fetch(`${API}/produtos/sync`, {
            method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(80000),
          });
          if (!syncRes.ok) throw new Error(`sync status ${syncRes.status}`);
        }

        const metaRes = await fetch(`${API}/custos/metadata`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (!metaRes.ok) throw new Error(`metadata status ${metaRes.status}`);
        const meta             = await metaRes.json();
        const hashRemoto       = meta.hash          || '';
        const forceUpdate      = meta.force_update === true;
        const produtosRemoto   = meta.produtos_hash || '';
        const hashLocal          = msg.hashLocal         || '';
        const produtosHashLocal  = msg.produtosHashLocal || '';

        const result = { type: 'HIPER_SYNC_CUSTOS_RESULT', ok: true, seq,
                         hash: hashRemoto, produtosHash: produtosRemoto };

        // Custos: baixa quando mudou (ou no force).
        if (force || forceUpdate || hashRemoto !== hashLocal) {
          const dataRes = await fetch(`${API}/custos/data`, {
            cache: 'no-store', signal: AbortSignal.timeout(15000),
          });
          if (!dataRes.ok) throw new Error(`data status ${dataRes.status}`);
          const payload = await dataRes.json();
          result.custos = payload.custos  || {};
          result.hash   = payload.hash    || hashRemoto;
          result.nfmPct = payload.nfm_pct;   // % da nota fiscal (fonte única)
        }

        // Nomes/lista de produtos: baixa quando o produtos_hash mudou (ou no force).
        if (force || produtosRemoto !== produtosHashLocal) {
          const mRes = await fetch(`${API}/produtos/master`, {
            cache: 'no-store', signal: AbortSignal.timeout(15000),
          });
          if (mRes.ok) result.produtos = (await mRes.json()).produtos || [];
        }

        window.postMessage(result, '*');
      } catch(e) {
        window.postMessage({ type: 'HIPER_SYNC_CUSTOS_RESULT', ok: false, seq, error: e.message }, '*');
      }
    })();
  }

  // ── Dados do produto: get-dados-produto-pedido servido do nosso cache ─────
  if (msg.type === 'HIPER_DADOS_PRODUTO_LOAD') {
    (async () => {
      try {
        const res = await fetch(
          'https://api.sistema.santin.tec.br/produtos/dados/' + encodeURIComponent(msg.produtoId),
          { cache: 'no-store', signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) throw new Error('status ' + res.status);
        const envelope = await res.json();
        window.postMessage({ type: 'HIPER_DADOS_PRODUTO_LOADED', seq: msg.seq, envelope }, '*');
      } catch (e) {
        console.warn('[Interceptor] ⚠️ Falha ao carregar dados-produto do servidor:', e.message);
        window.postMessage({ type: 'HIPER_DADOS_PRODUTO_LOADED', seq: msg.seq, envelope: null }, '*');
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
    // TODO: falha aqui (rede caiu, backend fora do ar, 5xx) só vira console.warn —
    // diferente do fluxo de hiper-evento, não fica nada pendente no servidor pra
    // reprocessar depois. Dar a essa entrada a mesma rede de segurança que
    // /hiper-evento tem (persistir com processado=0 + endpoint de reprocessar).
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
