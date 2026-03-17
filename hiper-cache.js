// ═══════════════════════════════════════════════════════════════════════════════
// hiper-cache.js — Cache de produtos (fetch + XHR) e bridge de custos
// ═══════════════════════════════════════════════════════════════════════════════

const TARGET_PATH = '/produtos/GetSelect2ParaPedido';
const TTL_MS      = 60 * 60 * 1000; // 1h
const REVAL_MS    = 10 * 60 * 1000; // revalida em background após 10min
const MASTER_KEY  = 'hc:master';

const PRELOAD_TERMS = [
  "alçapão","arame","arremate","bucha","cantoneira","chapa","cola",
  "fita","forro","gesso","lixa","manta","massa","metalon","painel",
  "parafuso","perfil","pino","piso","placa","rodapé","suporte",
  "junção","conector","sisal","cordão","portal","pendural","vidro",
  "roda","alcool","eletrodo","broca","cimento","multichapisco",
  "seladora","tinta","textura","presilha","kit","rebite","regulador",
  "prego","fincapino","aumark","hgesso","xgesso"
];

// ── Cache em memória ──────────────────────────────────────────────────────────
const memCache  = {};
let preloadDone = false;
let preloading  = false;

// Solicita todos os dados do storage ao iniciar
window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');
window.postMessage({ type: 'HIPER_CUSTO_LOAD_ALL' }, '*');

window.addEventListener('message', (ev) => {
  // Aceita mensagens da própria janela OU da janela de orçamento (blob:) via opener
  const fromSelf   = ev.source === window;
  const fromOpened = ev.data?.type === 'HIPER_CUSTO_SAVE'; // blob envia para window.opener

  if (!fromSelf && !fromOpened) return;

  // Custos carregados do storage → disponibiliza globalmente
  if (ev.data?.type === 'HIPER_CUSTO_LOADED') {
    window.__hiperCustos = ev.data.custos;
    console.info('[HiperCache] ✅ Custos carregados do storage:', Object.keys(ev.data.custos).length, 'itens');
  }

  // HIPER_CUSTO_SYNC: confirmação do interceptor.js após salvar no storage
  if (ev.data?.type === 'HIPER_CUSTO_SYNC') {
    window.__hiperCustos = window.__hiperCustos || {};
    window.__hiperCustos[ev.data.id] = ev.data.val;
  }

  // HIPER_VENDEDOR_LOAD: página de orçamento pede dados do vendedor salvo
  if (ev.data?.type === 'HIPER_VENDEDOR_LOAD') {
    window.postMessage({ type: 'HIPER_VENDEDOR_LOAD' }, '*'); // relay to interceptor
  }

  // Cache de produtos carregado do storage → popula memCache
// No handler de HIPER_CACHE_ALL, só dispara preload se realmente precisar
  if (ev.data?.type === 'HIPER_CACHE_ALL') {
    const entries = ev.data.entries || {};
    for (const [k, v] of Object.entries(entries)) memCache[k] = v;
    if (memCache[MASTER_KEY]) {
      preloadDone = true;
      window.__hiperMaster = memCache[MASTER_KEY].data;
      console.info(`[HiperCache] ✅ Master restaurado: ${window.__hiperMaster.length} produtos.`);

      // Só revalida se estiver perto de expirar — não força fetch desnecessário
      if (getMasterAge() > REVAL_MS) revalidateInBackground();
    } else {
      // Storage vazio — inicia preload agora
      if (!preloading) preloadDataset();
    }
  }

  if (ev.data?.type === 'HIPER_CACHE_CLEAR_ACK') {
    for (const k of Object.keys(memCache)) delete memCache[k];
    preloadDone = false;
    console.info('[HiperCache] Cache limpo.');
  }
});

// ── BroadcastChannel: atualiza __hiperCustos em memória ─────────────────────
// O interceptor.js (content script) já escuta este canal e salva no storage.
// Aqui apenas mantemos __hiperCustos sincronizado para uso imediato na página.
try {
  const bc = new BroadcastChannel('hiper_custo_channel');
  bc.onmessage = (ev) => {
    const msg = ev.data;
    if (msg?.type === 'HIPER_CUSTO_SAVE') {
      window.__hiperCustos = window.__hiperCustos || {};
      window.__hiperCustos[msg.id] = msg.val;
    }
    if (msg?.type === 'HIPER_VENDEDOR_SAVE') {
      // Repassa ao interceptor.js para salvar no storage
      window.postMessage({ ...msg, _fromBC: true }, '*');
    }
  };
} catch(e) {
  console.warn('[HiperCache] BroadcastChannel não disponível:', e);
}

// ── Utilitários ───────────────────────────────────────────────────────────────

function isTarget(url) {
  try   { return new URL(url, location.origin).pathname.startsWith(TARGET_PATH); }
  catch { return url.includes(TARGET_PATH); }
}

function getFiltro(url) {
  try   { return new URL(url, location.origin).searchParams.get('Filtro') ?? ''; }
  catch { return ''; }
}

function getMasterAge() {
  const e = memCache[MASTER_KEY];
  return e ? Date.now() - e.ts : Infinity;
}

function getCachedMaster() {
  const e = memCache[MASTER_KEY];
  if (!e) return null;
  if (Date.now() - e.ts > TTL_MS) { delete memCache[MASTER_KEY]; return null; }
  return e.data;
}

function setCached(key, data) {
  memCache[key] = { data, ts: Date.now() };
  window.postMessage({ type: 'HIPER_CACHE_SET', key, data, ts: Date.now() }, '*');
}

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function filtrarLocal(filtro) {
  const master = getCachedMaster();
  if (!master) return null;
  if (!filtro.trim()) return master;

  // Divide em palavras e exige que TODAS estejam no nome
  const termos = normalizar(filtro).split(/\s+/).filter(Boolean);

  return master.filter(item => {
    const nome = normalizar(item.Nome || item.text || '');
    return termos.every(t => nome.includes(t));
  });
}

// ── Pré-carregamento inteligente ──────────────────────────────────────────────
function reconfigurarSelect2sExistentes() {
  if (typeof $ === 'undefined') return;
  if (!window.__hiperMaster?.length) return;

  let count = 0;
  $('input.produto.select2-offscreen').each(function() {
    const s2 = $(this).data('select2');
    if (!s2) return;

    s2.opts.query = function(query) {
      const termos = normalizar(query.term || '').split(/\s+/).filter(Boolean);
      const results = termos.length === 0
        ? window.__hiperMaster
        : window.__hiperMaster.filter(p => {
            const nome = normalizar(p.Nome || p.text || '');
            return termos.every(t => nome.includes(t));
          });
      query.callback({ results: results });
    };

    s2.opts.quietMillis = 0;
    delete s2.opts.ajax;
    count++;
  });

  console.info(`[HiperCache] ✅ ${count} select(s) reconfigurados.`);
}

function iniciarObserverSelect2() {
  new MutationObserver(() => {
    if (!window.__hiperMaster?.length) return;
    if (!location.hash.includes('pedido-venda')) return;
    reconfigurarSelect2sExistentes();
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
}

iniciarObserverSelect2();

async function preloadDataset() {
  if (preloading) return;
  preloading = true;
  const ts = Date.now();
  console.info(`[HiperCache] 🚀 Pré-carregando dataset com ${PRELOAD_TERMS.length} termos...`);

  const requests = PRELOAD_TERMS.map(termo =>
    _fetch(`${location.origin}${TARGET_PATH}?Filtro=${encodeURIComponent(termo)}&Expansao=&_=${ts}`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
  );

  const results = await Promise.all(requests);
  const seen    = new Set();
  const dataset = [];

  for (const page of results) {
    if (!Array.isArray(page)) continue;
    for (const item of page) {
      const uid = item.idProduto ?? item.id ?? item.Codigo;
      if (uid != null && seen.has(uid)) continue;
      if (uid != null) seen.add(uid);
      dataset.push(item);
    }
  }

  dataset.sort((a, b) => (a.Nome || '').localeCompare(b.Nome || '', 'pt-BR'));
  setCached(MASTER_KEY, dataset);
  window.__hiperMaster = dataset; // ← ADD

  reconfigurarSelect2sExistentes();

  preloadDone = true;
  preloading  = false;

  console.info(`[HiperCache] ✅ Dataset pronto: ${dataset.length} produtos únicos.`);
}

async function revalidateInBackground() {
  if (preloading) return;
  console.debug('[HiperCache] 🔄 Revalidando em background...');
  preloadDone = false;
  await preloadDataset();
}

// ── Lógica central de interceptação ──────────────────────────────────────────

function interceptUrl(url, onHit, onMiss) {
  if (!isTarget(url)) return false;
  const filtro = getFiltro(url);

  if (preloadDone) {
    const resultado = filtrarLocal(filtro);
    if (resultado !== null) {
      console.debug(`[HiperCache] LOCAL "${filtro}" → ${resultado.length} itens`);
      if (getMasterAge() > REVAL_MS) revalidateInBackground();
      onHit(resultado);
      return true;
    }
  }

  if (!preloading) preloadDataset();
  onMiss('hc:tmp:' + filtro);
  return true;
}

// ── Interceptação do fetch ────────────────────────────────────────────────────

const _fetch = window.fetch;
window.fetch = async function (input, init) {
  const url = (typeof input === 'string') ? input : (input?.url ?? '');

  return new Promise((resolve, reject) => {
    let handled = false;

    interceptUrl(url,
      (data) => {
        handled = true;
        resolve(new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }));
      },
      (saveKey) => {
        handled = true;
        _fetch.apply(window, [input, init])
          .then(r => { r.clone().json().then(j => setCached(saveKey, j)).catch(()=>{}); resolve(r); })
          .catch(reject);
      }
    );

    if (!handled) _fetch.apply(window, [input, init]).then(resolve).catch(reject);
  });
};

// ── Interceptação do XMLHttpRequest ──────────────────────────────────────────

const _XHR = window.XMLHttpRequest;

function HiperXHR() {
  const real = new _XHR();
  let _url = '', _resolved = false, _saveKey = '';

  const proxy = new Proxy(real, {
    get(t, prop) {
      if (prop === 'open') return openHandler;
      if (prop === 'send') return sendHandler;
      const v = t[prop];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, prop, val) { t[prop] = val; return true; },
  });

  function openHandler(method, url, async, user, pwd) {
    _url = url ?? '';
    return real.open(method, url, async !== false, user, pwd);
  }

  function sendHandler(body) {
    let handled = false;

    interceptUrl(_url,
      (data) => {
        handled = _resolved = true;
        setTimeout(() => {
          const txt = JSON.stringify(data);
          try {
            Object.defineProperty(real, 'readyState',   { get: () => 4,    configurable: true });
            Object.defineProperty(real, 'status',       { get: () => 200,  configurable: true });
            Object.defineProperty(real, 'statusText',   { get: () => 'OK', configurable: true });
            Object.defineProperty(real, 'responseText', { get: () => txt,  configurable: true });
            Object.defineProperty(real, 'response',     { get: () => txt,  configurable: true });
          } catch {}
          if (typeof real.onreadystatechange === 'function') real.onreadystatechange();
          if (typeof real.onload === 'function') real.onload(new ProgressEvent('load'));
          real.dispatchEvent(new ProgressEvent('readystatechange'));
          real.dispatchEvent(new ProgressEvent('load'));
          real.dispatchEvent(new ProgressEvent('loadend'));
        }, 0);
      },
      (saveKey) => {
        handled = true; _saveKey = saveKey;
        real.addEventListener('load', () => {
          if (real.status === 200 && !_resolved) {
            try { setCached(_saveKey, JSON.parse(real.responseText)); } catch {}
          }
        });
        real.send(body);
      }
    );

    if (!handled) real.send(body);
  }

  return proxy;
}

(function () {

const MASTER_KEY = "hc:master";

function salvarProdutoNoCache(produtoId, dados) {

  const MASTER_KEY = "hc:master";
  const cache = JSON.parse(localStorage.getItem(MASTER_KEY) || "{}");

  const codigo = window.__ultimoCodigoBuscado;

  if (!codigo) return;

  cache["codigo:" + codigo] = {
    timestamp: Date.now(),
    results: [{
      id: produtoId,
      text: codigo,
      codigo: codigo
    }]
  };

  localStorage.setItem(MASTER_KEY, JSON.stringify(cache));

  console.log("[HiperCache] 💾 Produto cacheado:", codigo);
}

function processarResposta(json) {
  if (!json?.dados?.length) return;

  const produto = json.dados[0];
  salvarProdutoNoCache(produto.id, produto);
}

//
// INTERCEPTA FETCH
//
const originalFetch = window.fetch;

window.fetch = async function (...args) {

  const response = await originalFetch.apply(this, args);

  if (typeof args[0] === "string" && args[0].includes("get-dados-produto-pedido")) {

    response.clone().json().then(processarResposta).catch(() => {});
  }

  return response;
};

//
// INTERCEPTA XHR
//
const originalOpen = XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.open = function (method, url) {

  this.addEventListener("load", function () {

    if (url.includes("get-dados-produto-pedido")) {

      try {
        const json = JSON.parse(this.responseText);
        processarResposta(json);
      } catch (e) {}
    }

  });

  return originalOpen.apply(this, arguments);
};

})();

HiperXHR.prototype = _XHR.prototype;
Object.setPrototypeOf(HiperXHR, _XHR);
window.XMLHttpRequest = HiperXHR;