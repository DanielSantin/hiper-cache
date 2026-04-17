(function() {
    // DEBUG: mude para false para silenciar, ou ative pelo console com:
    //   localStorage.setItem('hc_debug', '1')  →  ativa
    //   localStorage.removeItem('hc_debug')     →  desativa (recarregue a página)
    const DEBUG = localStorage.getItem('hc_debug') === '1';

    const TARGET_PATH = '/produtos/GetSelect2ParaPedido';
    const MASTER_KEY  = 'hc:master';
    const MIN_ITEMS_THRESHOLD = 100;
    const VERSAO_CUSTOS = "16-04-2026";

    const CUSTOS_PADRAO = {
        3068: 45.102, 
        3073: 61.332, 
        3111: 63.737, 
        3075: 84.983, 
        3039: 78.412, 
        3016: 99.580, 
        3042: 13.914, 
        3060: 11.649, 
        3008: 16.453, 
        3007: 14.190, 
        3043: 20.316, 
        3044: 19.254, 
        3018: 10.735, 
        3009: 6.699, 
        3051: 5.623, 
        3006: 11.389, 
        3010: 11.197, 
        3089: 20.600, 
        3090: 51.149, 
        3113: 78.446, 
        3184: 74.791, 
        3143: 30.025, 
        3185: 84.928, 
        3107: 98.480, 
        3084: 64.054, 
        3122: 179.245, 
        3019: 0.240, 
        3017: 0.918, 
        3077: 1.020, 
        3029: 0.690, 
        3022: 10.360, 
        3023: 14.610, 
        3132: 6.210, 
        3014: 12.146, 
        3126: 16.515, 
        3169: 15.210, 
        3026: 37.454, 
        3013: 44.637, 
        3027: 26.545, 
        3154: 12.507, 
        3035: 9.787, 
        3037: 43.712, 
        3086: 4.990, 
        3087: 19.970, 
        3061: 250.887, 
        3112: 42.080, 
        3124: 50.110, 
        3128: 55.740, 
        3142: 3.289, 
        3032: 21.529, 
        3021: 0.022, 
        3058: 0.061, 
        3171: 30.575, 
        3020: 0.019, 
        3173: 18.576, 
        3046: 33.230, 
        3045: 0.042, 
        3174: 34.330, 
        3052: 0.037, 
        3187: 23.418, 
        3064: 0.047, 
        3172: 32.385, 
        3012: 0.032, 
        3176: 36.470, 
        3030: 0.045, 
        3176: 45.060, 
        3038: 0.082,
    }

    const PRELOAD_TERMS = ["alçapão","arame","arremate","bucha","cantoneira","chapa","cola","fita","forro","gesso","lixa","manta","massa","metalon","painel","parafuso","perfil","pino","piso","placa","rodapé","suporte","junção","conector","sisal","cordão","portal","pendural","vidro","roda","alcool","eletrodo","broca","cimento","multichapisco","seladora","tinta","textura","presilha","kit","rebite","regulador","prego","fincapino","aumark","hgesso","xgesso"];

    const REAL_XML_HTTP = window.XMLHttpRequest;
    const NATIVE_FETCH = window.fetch.bind(window);

    let memMaster = [];
    let preloading = false;
    let inicializado = false;
    window.__hiperCustos = {};
    window.__hiperUnidades = (typeof UNIDADES_PADRAO !== 'undefined') ? UNIDADES_PADRAO : {};

    // ── Utilitário de Log ─────────────────────────────────────────────────────
    const S = 'font-weight:bold;padding:1px 4px;border-radius:3px;';
    const dbg = {
        s2:   () => DEBUG && console.log('%c ⚡ S2 %c Select2 otimizado (motor instantâneo ativo)', S+'background:#155e75;color:#a5f3fc', 'color:inherit'),
        erro: (e) => DEBUG && console.warn('[HiperCache] erro:', e),
    };

    function normalizar(s) {
        return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
    }

    // ── 1. Select2 ───────────────────────────────────────────────────────────
    function reconfigurarSelect2sExistentes() {
        if (typeof $ === 'undefined') return;
        if (!window.__hiperMaster || window.__hiperMaster.length < MIN_ITEMS_THRESHOLD) return;

        $('input.produto.select2-offscreen').each(function() {
            const s2 = $(this).data('select2');
            if (!s2 || !s2.opts.ajax) return;

            s2.opts.query = function(query) {
                const term = query.term || '';
                const termos = normalizar(term).split(/\s+/).filter(Boolean);
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
            dbg.s2();
        });
    }

    // ── 2. Preload ────────────────────────────────────────────────────────────
    async function executarPreload() {
        if (preloading) return;
        preloading = true;
        try {
            const ts = Date.now();
            const promises = PRELOAD_TERMS.map(t =>
                NATIVE_FETCH(`${location.origin}${TARGET_PATH}?Filtro=${encodeURIComponent(t)}&_=${ts}`)
                .then(r => r.ok ? r.json() : [])
                .catch(() => [])
            );
            const resultados = await Promise.all(promises);
            const unico = new Map();
            for (const lista of resultados) {
                if (!Array.isArray(lista)) continue;
                lista.forEach(item => {
                    const id = item.idProduto ?? item.id ?? item.Codigo;
                    if (id && !unico.has(id)) {
                        item.text = item.Nome;
                        const cod4 = (item.Nome || '').match(/^(\d{4})\b/)?.[1];
                        item.und = (cod4 && window.__hiperUnidades[cod4]) ? window.__hiperUnidades[cod4] : 'UN';
                        unico.set(id, item);
                    }
                });
            }
            if (unico.size >= MIN_ITEMS_THRESHOLD) {
                memMaster = Array.from(unico.values()).sort((a, b) => {
                    // Criamos versões para comparação ignorando os 7 primeiros caracteres
                    // O .substring(7) pega do 8º caractere em diante
                    const comparadorA = (a.Nome || '').substring(7).trim();
                    const comparadorB = (b.Nome || '').substring(7).trim();

                    // Comparamos as versões cortadas, mas o objeto 'a' e 'b' permanece intacto
                    return comparadorA.localeCompare(comparadorB, 'pt-BR');
                });  
                window.__hiperMaster = memMaster;            
                window.postMessage({ type: 'HIPER_CACHE_SET', key: MASTER_KEY, data: memMaster, ts: Date.now() }, '*');
                reconfigurarSelect2sExistentes();
            }
        } finally { preloading = false; }
    }

    // ── 3. Lógica de Custos ───────────────────────────────────────────────────
    function aplicarCustosPadrao() {
        const salva = localStorage.getItem('hc_versao_custos');
        if (salva !== VERSAO_CUSTOS) {
            console.log(`[HiperCache] Nova versão ${VERSAO_CUSTOS}. Atualizando base...`);
            Object.entries(CUSTOS_PADRAO).forEach(([id, val]) => {
                window.__hiperCustos[id] = val;
                window.postMessage({ type: 'HIPER_CACHE_SET', key: `custo:${id}`, data: val, ts: Date.now() }, '*');
            });
            localStorage.setItem('hc_versao_custos', VERSAO_CUSTOS);
        }
    }

    // ── 4. Interceptador de Rede (apenas Select2) ─────────────────────────────
    window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input?.url ?? '');

        if (url.includes(TARGET_PATH)) {
            if (memMaster.length > 0) {
                try {
                    const term = new URL(url, location.origin).searchParams.get('Filtro') || '';
                    const res = normalizar(term).split(/\s+/).filter(Boolean)
                        .reduce((acc, t) => acc.filter(p => normalizar(p.Nome || p.text).includes(t)), memMaster);
                    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } });
                } catch(e) { dbg.erro(e); }
            } else if (!preloading) {
                executarPreload();
            }
        }

        return NATIVE_FETCH(input, init);
    };

    window.XMLHttpRequest = function() {
        const xhr = new REAL_XML_HTTP();
        let _url = '';

        const origOpen = xhr.open;
        xhr.open = function() {
            _url = arguments[1];
            return origOpen.apply(this, arguments);
        };

        const origSend = xhr.send;
        xhr.send = function() {
            // Apenas intercepta Select2 — deixa tudo mais passar normalmente
            if (_url && _url.includes(TARGET_PATH) && memMaster.length > 0) {
                try {
                    const term = new URL(_url, location.origin).searchParams.get('Filtro') || '';
                    const res = normalizar(term).split(/\s+/).filter(Boolean)
                        .reduce((acc, t) => acc.filter(p => normalizar(p.Nome || p.text).includes(t)), memMaster);
                    Object.defineProperty(this, 'readyState',   { get: () => 4,                   configurable: true });
                    Object.defineProperty(this, 'status',       { get: () => 200,                 configurable: true });
                    Object.defineProperty(this, 'responseText', { get: () => JSON.stringify(res), configurable: true });
                    this.dispatchEvent(new Event('load'));
                    return;
                } catch(e) {
                    console.warn("[HiperCache] Erro ao simular resposta Select2, usando rede.");
                }
            }

            return origSend.apply(this, arguments);
        };

        return xhr;
    };

    // ── 5. Listener de Mensagens ──────────────────────────────────────────────
    window.addEventListener('message', (ev) => {
        if (ev.source !== window) return;
        const msg = ev.data;

        // A) Banco de dados da extensão responde com tudo
        if (msg?.type === 'HIPER_CACHE_ALL') {
            const entries = msg.entries || {};

            if (entries[MASTER_KEY]?.data?.length >= MIN_ITEMS_THRESHOLD) {
                memMaster = entries[MASTER_KEY].data;
                window.__hiperMaster = memMaster;
                reconfigurarSelect2sExistentes();
            } else {
                executarPreload();
            }

            Object.keys(entries).forEach(key => {
                if (key.includes('custo:')) {
                    const id = key.split(':').pop();
                    window.__hiperCustos[id] = entries[key].data;
                }
            });

            // Propaga config de orçamento para __hiperOrcConfig (consumido por hiper-orcamento.js)
            // Essas chaves chegam como primitivos (o popup e interceptor não usam wrapper { data, ts })
            const letra   = entries['hiper_orc_letra']   ?? null;
            const counter = entries['hiper_orc_counter'] ?? null;
            if (letra != null || counter != null) {
                if (!window.__hiperOrcConfig) window.__hiperOrcConfig = { letra: 'A', counter: 999 };
                if (letra   != null) window.__hiperOrcConfig.letra   = String(letra).toUpperCase();
                if (counter != null) window.__hiperOrcConfig.counter = parseInt(counter, 10) || 999;
            }

            // Propaga vendedor salvo para __hiperVendedor (consumido por hiper-orcamento.js e hiper-db.js)
            // IMPORTANTE: sempre sobrescreve — o objeto pode ter sido criado vazio por hiper-orcamento.js
            // antes do storage responder, e o `if (!window.__hiperVendedor)` antigo impedia a atualização.
            const vendedorText    = entries['vendedor']?.text    ?? null;
            const vendedorChecked = entries['vendedor']?.checked ?? null;
            if (!window.__hiperVendedor) window.__hiperVendedor = { checked: false, text: '' };
            if (vendedorText    != null) window.__hiperVendedor.text    = String(vendedorText);
            if (vendedorChecked != null) window.__hiperVendedor.checked = vendedorChecked === true || vendedorChecked === 'true';

            if (!inicializado) {
                aplicarCustosPadrao();
                inicializado = true;
                console.info(`[HiperCache] ✅ Pronto: ${Object.keys(window.__hiperCustos).length} custos em cache.`);
                DEBUG && console.log('%c 💡 DEBUG %c ativo — desative com localStorage.removeItem(\'hc_debug\') e recarregue', S+'background:#1c1917;color:#fef3c7', 'color:gray');
            }

            window.postMessage({ type: 'HIPER_CUSTO_LOADED', custos: window.__hiperCustos }, '*');
        }

        // B) Orçamento salva um custo novo
        if (msg?.type === 'HIPER_CUSTO_SET') {
            const { id, val } = msg;
            if (id) {
                window.__hiperCustos[id] = val;
                window.postMessage({ type: 'HIPER_CACHE_SET', key: `custo:${id}`, data: val, ts: Date.now() }, '*');
            }
        }

        // C) Botão "Gerar Orçamento" pede os dados
        if (msg?.type === 'HIPER_CUSTO_EXPORT_REQ') {
            window.postMessage({ type: 'HIPER_CUSTO_EXPORT_DATA', custos: window.__hiperCustos }, '*');
        }

        // D) Sincronização de custo em memória
        if (msg?.type === 'HIPER_CUSTO_SYNC') {
            const { id, val } = msg;
            if (id != null) {
                window.__hiperCustos[id] = val;
                DEBUG && console.log('[HiperCache] 🔄 Custo sincronizado em memória — id:', id, '| val:', val);
            }
        }

        // E) Sincronização de vendedor em memória (vindo do blob via interceptor)
        if (msg?.type === 'HIPER_VENDEDOR_SYNC') {
            if (!window.__hiperVendedor) window.__hiperVendedor = { checked: false, text: '' };
            if (msg.text    != null) window.__hiperVendedor.text    = String(msg.text);
            if (msg.checked != null) window.__hiperVendedor.checked = Boolean(msg.checked);
            console.log('[HiperCache] 🔄 Vendedor sincronizado em memória:', msg.text);
        }
    });

    // ── 6. Inicialização ──────────────────────────────────────────────────────
    window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');

    const iniciarObserver = () => {
        if (document.body) {
            new MutationObserver(() => {
                if (location.hash.includes('pedido-venda')) reconfigurarSelect2sExistentes();
            }).observe(document.body, { childList: true, subtree: true });
        } else {
            setTimeout(iniciarObserver, 100);
        }
    };
    iniciarObserver();

    setTimeout(() => { if (memMaster.length < MIN_ITEMS_THRESHOLD) executarPreload(); }, 3000);

    window.__hiperReload = executarPreload;
    window.__nativeFetch = NATIVE_FETCH;
})();