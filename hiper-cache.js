(function() {
    const TARGET_PATH = '/produtos/GetSelect2ParaPedido';
    const MASTER_KEY  = 'hc:master';
    const VERSAO_CUSTOS = "2026-03"; // Mude aqui para forçar atualização em todos

    const CUSTOS_PADRAO = {
        "3073": 60.26, "3076": 25.93, "3006": 11.27, "3007": 12.89, "3008": 15.12,
        "3010": 11.20, "3014": 12.16, "3017": 0.92, "3018": 9.48, "3019": 0.24,
        "3020": 0.02, "3021": 0.02, "3022": 10.36, "3023": 14.61, "3029": 0.69,
        "3032": 21.85, "3035": 9.79, "3037": 39.74, "3058": 0.02, "3113": 72.59, "3132": 6.21
    };

    const REAL_XML_HTTP = window.XMLHttpRequest;
    const NATIVE_FETCH = window.fetch.bind(window);

    let memMaster = [];
    window.__hiperCustos = {};
    let inicializado = false;

    function normalizar(s) { 
        return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ''); 
    }

    // ── 1. Lógica de Custos (Integrada) ──────────────────────────────────────
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

    window.addEventListener('message', (ev) => {
        if (ev.source !== window) return;

        msg = ev.data;
        // A) Quando o banco de dados da extensão responde
        if (msg?.type === 'HIPER_CACHE_ALL') {
            const entries = ev.data.entries || {};
            
            // Produtos
            if (entries[MASTER_KEY]?.data) {
                memMaster = entries[MASTER_KEY].data;
                window.__hiperMaster = memMaster;
            }

            // Custos (Lê o que está no banco físico)
            Object.keys(entries).forEach(key => {
                if (key.includes('custo:')) {
                    const id = key.split(':').pop();
                    window.__hiperCustos[id] = entries[key].data;
                }
            });

            // Se for a primeira carga, verifica se precisa injetar os padrões
            if (!inicializado) {
                aplicarCustosPadrao();
                inicializado = true;
                console.info(`[HiperCache] ✅ Pronto: ${Object.keys(window.__hiperCustos).length} custos ativos.`);
            }

            // Avisa o hiper-orcamento.js que os dados estão prontos
            window.postMessage({ type: 'HIPER_CUSTO_LOADED', custos: window.__hiperCustos }, '*');
        }

        // B) Quando o Orçamento salva um custo novo
        if (msg?.type === 'HIPER_CUSTO_SET') {
            const { id, val } = msg;
            if (id) {
                window.__hiperCustos[id] = val;
                window.postMessage({ type: 'HIPER_CACHE_SET', key: `custo:${id}`, data: val, ts: Date.now() }, '*');
            }
        }

        // C) Quando o botão "Gerar Orçamento" pede os dados
        if (msg?.type === 'HIPER_CUSTO_EXPORT_REQ') {
            window.postMessage({ type: 'HIPER_CUSTO_EXPORT_DATA', custos: window.__hiperCustos }, '*');
        }

        if (msg?.type === 'HIPER_CUSTO_SYNC') {
            const { id, val } = msg;
            if (id != null) {
                window.__hiperCustos[id] = val;
                console.log('[HiperCache] 🔄 Custo sincronizado em memória — id:', id, '| val:', val);
            }
        }
    });

    // ── 2. Interceptadores de Rede (Busca Instantânea) ───────────────────────
    window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input?.url ?? '');
        if (url.includes(TARGET_PATH) && memMaster.length > 0) {
            try {
                const term = new URL(url, location.origin).searchParams.get('Filtro') || '';
                const res = normalizar(term).split(/\s+/).filter(Boolean).reduce((acc, t) => acc.filter(p => normalizar(p.Nome||p.text).includes(t)), memMaster);
                return new Response(JSON.stringify(res), { status: 200, headers: {'Content-Type':'application/json'} });
            } catch(e) {}
        }
        return NATIVE_FETCH(input, init);
    };

    window.XMLHttpRequest = function() {
        const xhr = new REAL_XML_HTTP();
        let _url = '';
        const origOpen = xhr.open;
        xhr.open = function() { _url = arguments[1]; return origOpen.apply(this, arguments); };
        const origSend = xhr.send;
        xhr.send = function() {
            if (_url && _url.includes(TARGET_PATH) && memMaster.length > 0) {
                const term = new URL(_url, location.origin).searchParams.get('Filtro') || '';
                const res = normalizar(term).split(/\s+/).filter(Boolean).reduce((acc, t) => acc.filter(p => normalizar(p.Nome||p.text).includes(t)), memMaster);
                Object.defineProperty(this, 'readyState', { get: () => 4, configurable: true });
                Object.defineProperty(this, 'status', { get: () => 200, configurable: true });
                Object.defineProperty(this, 'responseText', { get: () => JSON.stringify(res), configurable: true });
                this.dispatchEvent(new Event('load'));
                return;
            }
            return origSend.apply(this, arguments);
        };
        return xhr;
    };

    // ── 3. Inicialização ─────────────────────────────────────────────────────
    window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');

})();