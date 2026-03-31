(function() {
    const TARGET_PATH = '/produtos/GetSelect2ParaPedido';
    const PRODUTO_API_PATH = 'get-dados-produto-pedido'; // api.hiper.com.br
    const MASTER_KEY  = 'hc:master';
    const MIN_ITEMS_THRESHOLD = 100;
    const VERSAO_CUSTOS = "2026-02";
    const PRODUTO_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

    const CUSTOS_PADRAO = {
        "3073": 60.26, "3076": 25.93, "3006": 11.27, "3007": 12.89, "3008": 15.12,
        "3010": 11.20, "3014": 12.16, "3017": 0.92, "3018": 9.48, "3019": 0.24,
        "3020": 0.02, "3021": 0.02, "3022": 10.36, "3023": 14.61, "3029": 0.69,
        "3032": 21.85, "3035": 9.79, "3037": 39.74, "3058": 0.02, "3113": 72.59, "3132": 6.21
    };

    const PRELOAD_TERMS = ["alçapão","arame","arremate","bucha","cantoneira","chapa","cola","fita","forro","gesso","lixa","manta","massa","metalon","painel","parafuso","perfil","pino","piso","placa","rodapé","suporte","junção","conector","sisal","cordão","portal","pendural","vidro","roda","alcool","eletrodo","broca","cimento","multichapisco","seladora","tinta","textura","presilha","kit","rebite","regulador","prego","fincapino","aumark","hgesso","xgesso"];

    const REAL_XML_HTTP = window.XMLHttpRequest;
    const NATIVE_FETCH = window.fetch.bind(window);

    let memMaster = [];
    let preloading = false;
    let inicializado = false;
    window.__hiperCustos = {};
    window.__hiperUnidades = (typeof UNIDADES_PADRAO !== 'undefined') ? UNIDADES_PADRAO : {};

    // Cache em memória de dados de produto: { [produtoId]: { data, ts } }
    const memProdutos = {};

    function normalizar(s) { 
        return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ''); 
    }

    // ── 0. Cache de Dados de Produto (stale-while-revalidate) ─────────────────

    /**
     * Lê produto do cache em memória.
     * Retorna { data, stale } onde stale=true significa que o cache já passou de 24h.
     */
    function getProdutoCache(produtoId) {
        const entry = memProdutos[produtoId];
        if (!entry) return null;
        const stale = (Date.now() - entry.ts) > PRODUTO_TTL_MS;
        return { data: entry.data, stale };
    }

    /**
     * Salva produto no cache em memória e avisa a extensão para persistir.
     */
    function setProdutoCache(produtoId, data) {
        const ts = Date.now();
        memProdutos[produtoId] = { data, ts };
        window.postMessage({ type: 'HIPER_CACHE_SET', key: `produto:${produtoId}`, data, ts }, '*');
    }

    /**
     * Faz a requisição real ao endpoint e atualiza o cache em background.
     * Retorna a Promise com o dado fresco (usado quando não há cache).
     */
    async function revalidarProduto(produtoId, url, init) {
        try {
            const resp = await NATIVE_FETCH(url, init);
            if (resp.ok) {
                const data = await resp.json();
                setProdutoCache(produtoId, data);
                console.debug(`[HiperCache] 🔄 Produto ${produtoId} revalidado.`);
                return data;
            }
        } catch (e) {
            console.warn(`[HiperCache] Falha ao revalidar produto ${produtoId}:`, e);
        }
        return null;
    }

    // ── 1. Tunagem do Select2 (Motor Instantâneo) ─────────────────────────────
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
            console.debug(`[HiperCache] Select2 otimizado.`);
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
                memMaster = Array.from(unico.values()).sort((a, b) => (a.Nome || '').localeCompare(b.Nome || '', 'pt-BR'));
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

    // ── 4. Interceptadores de Rede ────────────────────────────────────────────
    window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input?.url ?? '');

        // ── 4a. Stale-While-Revalidate: get-dados-produto-pedido ─────────────
        if (url.includes(PRODUTO_API_PATH)) {
            let produtoId;
            try {
                produtoId = new URL(url, location.origin).searchParams.get('produtoId');
            } catch(e) {}

            if (produtoId) {
                const cached = getProdutoCache(produtoId);

                if (cached && !cached.stale) {
                    // Cache fresco: retorna imediatamente, sem revalidar
                    console.debug(`[HiperCache] ✅ Produto ${produtoId} servido do cache (fresco).`);
                    return new Response(JSON.stringify(cached.data), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (cached && cached.stale) {
                    // Cache stale: retorna imediatamente e revalida em background
                    console.debug(`[HiperCache] ⏳ Produto ${produtoId} stale — servindo cache e revalidando.`);
                    revalidarProduto(produtoId, url, init); // fire-and-forget
                    return new Response(JSON.stringify(cached.data), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Sem cache: requisição real, mas já salva o resultado para próxima vez
                console.debug(`[HiperCache] 🌐 Produto ${produtoId} sem cache — buscando na rede.`);
                const data = await revalidarProduto(produtoId, url, init);
                if (data !== null) {
                    return new Response(JSON.stringify(data), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                // Se revalidarProduto falhou, deixa passar normalmente abaixo
            }
        }

        // ── 4b. Cache do Select2 ──────────────────────────────────────────────
        if (url.includes(TARGET_PATH)) {
            if (memMaster.length > 0) {
                try {
                    const term = new URL(url, location.origin).searchParams.get('Filtro') || '';
                    const res = normalizar(term).split(/\s+/).filter(Boolean)
                        .reduce((acc, t) => acc.filter(p => normalizar(p.Nome || p.text).includes(t)), memMaster);
                    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } });
                } catch(e) {}
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
            if (_url && _url.includes(TARGET_PATH) && memMaster.length > 0) {
                try {
                    const term = new URL(_url, location.origin).searchParams.get('Filtro') || '';
                    const res = normalizar(term).split(/\s+/).filter(Boolean)
                        .reduce((acc, t) => acc.filter(p => normalizar(p.Nome || p.text).includes(t)), memMaster);
                    Object.defineProperty(this, 'readyState', { get: () => 4, configurable: true });
                    Object.defineProperty(this, 'status', { get: () => 200, configurable: true });
                    Object.defineProperty(this, 'responseText', { get: () => JSON.stringify(res), configurable: true });
                    this.dispatchEvent(new Event('load'));
                    return;
                } catch (e) {
                    console.warn("[HiperCache] Erro ao simular resposta, usando rede.");
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

            // Produtos (Select2 master list)
            if (entries[MASTER_KEY]?.data?.length >= MIN_ITEMS_THRESHOLD) {
                memMaster = entries[MASTER_KEY].data;
                window.__hiperMaster = memMaster;
                reconfigurarSelect2sExistentes();
            } else {
                executarPreload();
            }

            // Dados de produto individuais (stale-while-revalidate)
            Object.keys(entries).forEach(key => {
                if (key.startsWith('produto:')) {
                    const produtoId = key.slice('produto:'.length);
                    const entry = entries[key];
                    if (entry?.data && entry?.ts) {
                        memProdutos[produtoId] = { data: entry.data, ts: entry.ts };
                    }
                }
            });

            // Custos
            Object.keys(entries).forEach(key => {
                if (key.includes('custo:')) {
                    const id = key.split(':').pop();
                    window.__hiperCustos[id] = entries[key].data;
                }
            });

            if (!inicializado) {
                aplicarCustosPadrao();
                inicializado = true;
                console.info(`[HiperCache] ✅ Pronto: ${Object.keys(window.__hiperCustos).length} custos | ${Object.keys(memProdutos).length} produtos em cache.`);
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
                console.log('[HiperCache] 🔄 Custo sincronizado em memória — id:', id, '| val:', val);
            }
        }
    });

    // ── 6. Inicialização ──────────────────────────────────────────────────────
    window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');
    window.postMessage({ type: 'HIPER_CUSTO_LOAD_ALL' }, '*');

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
    window.__hiperProdutoCache = memProdutos; // exposto para debug
})();