(function() {
    // DEBUG: mude para false para silenciar, ou ative pelo console com:
    //   localStorage.setItem('hc_debug', '1')  →  ativa
    //   localStorage.removeItem('hc_debug')     →  desativa (recarregue a página)
    const DEBUG = localStorage.getItem('hc_debug') === '1';

    const TARGET_PATH = '/produtos/GetSelect2ParaPedido';
    const MASTER_KEY  = 'hc:master';
    const MIN_ITEMS_THRESHOLD = 100;
    const VERSAO_CUSTOS = "2026-02";

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
})();