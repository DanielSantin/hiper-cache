(function() {
    const TARGET_PATH = '/produtos/GetSelect2ParaPedido';
    const MASTER_KEY  = 'hc:master';
    const MIN_ITEMS_THRESHOLD = 100;

    const NATIVE_FETCH = window.fetch.bind(window);
    const NATIVE_XHR_SEND = window.XMLHttpRequest.prototype.send;
    const NATIVE_XHR_OPEN = window.XMLHttpRequest.prototype.open;

    const PRELOAD_TERMS = ["alçapão","arame","arremate","bucha","cantoneira","chapa","cola","fita","forro","gesso","lixa","manta","massa","metalon","painel","parafuso","perfil","pino","piso","placa","rodapé","suporte","junção","conector","sisal","cordão","portal","pendural","vidro","roda","alcool","eletrodo","broca","cimento","multichapisco","seladora","tinta","textura","presilha","kit","rebite","regulador","prego","fincapino","aumark","hgesso","xgesso"];

    let memMaster = [];
    let preloading = false;

    // Normalização corrigida (remove acentos e caracteres especiais comuns em busca)
    function normalizar(s) { 
        return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ''); 
    }

    // ── Tunagem do Select2 (Motor Instantâneo) ────────────────────────────────
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

    // ── Preload ───────────────────────────────────────────────────────────────
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

    // ── Interceptadores de Rede ───────────────────────────────────────────────
    window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input?.url ?? '');
        if (url.includes(TARGET_PATH) && memMaster.length < MIN_ITEMS_THRESHOLD && !preloading) {
            executarPreload();
        }
        return NATIVE_FETCH(input, init);
    };

    // ── Interceptador XHR (Versão Blindada contra 'apply' undefined) ──────────
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        let _url = '';

        // Só redefine se as funções nativas existirem
        if (typeof NATIVE_XHR_OPEN === 'function') {
            xhr.open = function(m, u) {
                _url = u;
                return NATIVE_XHR_OPEN.apply(this, arguments);
            };
        }

        if (typeof NATIVE_XHR_SEND === 'function') {
            xhr.send = function(b) {
                if (_url && _url.includes(TARGET_PATH) && memMaster.length >= MIN_ITEMS_THRESHOLD) {
                    try {
                        Object.defineProperty(this, 'readyState', { get: () => 4, configurable: true });
                        Object.defineProperty(this, 'status', { get: () => 200, configurable: true });
                        Object.defineProperty(this, 'responseText', { get: () => JSON.stringify(memMaster), configurable: true });
                        this.dispatchEvent(new Event('load'));
                        return;
                    } catch (e) {
                        console.warn("[HiperCache] Erro ao simular resposta, usando rede.");
                    }
                }
                return NATIVE_XHR_SEND.apply(this, arguments);
            };
        }
        return xhr;
    };

  // ── Inicialização e Ponte de Custos (Restaurada) ──────────────────────────
    window.addEventListener('message', (ev) => {
        if (ev.source !== window) return;

        // 1. Escuta carregamento inicial do Cache e de Custos
        if (ev.data?.type === 'HIPER_CACHE_ALL') {
            const master = ev.data.entries?.[MASTER_KEY]?.data;
            if (master && master.length >= MIN_ITEMS_THRESHOLD) {
                memMaster = master;
                window.__hiperMaster = memMaster;
                reconfigurarSelect2sExistentes();
            } else { executarPreload(); }
        }

        if (ev.data?.type === 'HIPER_CUSTO_LOADED') {
            window.__hiperCustos = ev.data.custos;
            console.info(`[HiperCache] ✅ ${Object.keys(ev.data.custos).length} custos carregados.`);
        }

        // 2. ESSA É A PARTE QUE FALTAVA: Salvar custos no banco da extensão
        if (ev.data?.type === 'HIPER_CUSTO_SET') {
            const { id, val } = ev.data;
            if (id) {
                window.__hiperCustos = window.__hiperCustos || {};
                window.__hiperCustos[id] = val;
                // Repassa para o engine salvar no IndexedDB/LocalStorage
                window.postMessage({ type: 'HIPER_CACHE_SET', key: `hc:custo:${id}`, data: val, ts: Date.now() }, '*');
            }
        }
    });

    // Pede para carregar tudo o que já existe
    window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');
    window.postMessage({ type: 'HIPER_CUSTO_LOAD_ALL' }, '*');

    // Correção do erro de observe: Espera o body estar disponível
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

    window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');
    setTimeout(() => { if (memMaster.length < MIN_ITEMS_THRESHOLD) executarPreload(); }, 3000);
})();