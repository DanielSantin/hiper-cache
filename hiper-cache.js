(function() {
    // DEBUG: mude para false para silenciar, ou ative pelo console com:
    //   localStorage.setItem('hc_debug', '1')  →  ativa
    //   localStorage.removeItem('hc_debug')     →  desativa (recarregue a página)
    const DEBUG = localStorage.getItem('hc_debug') === '1';

    // ── Namespace global ──────────────────────────────────────────────────────
    // Todos os dados compartilhados vivem em window.__hiper.
    // Os nomes legados (window.__hiperCustos, etc.) são mantidos como
    // getters/setters para que kit.js, hiper-orcamento.js e outros módulos
    // continuem funcionando sem alteração.
    if (!window.__hiper) {
        window.__hiper = {
            custos:     {},
            master:     [],
            vendedor:   { checked: false, text: '' },
            custosHash: '',
        };
    }
    Object.defineProperties(window, {
        __hiperCustos:     { get() { return window.__hiper.custos;     }, set(v) { window.__hiper.custos     = v; }, configurable: true },
        __hiperMaster:     { get() { return window.__hiper.master;     }, set(v) { window.__hiper.master     = v; }, configurable: true },
        __hiperVendedor:   { get() { return window.__hiper.vendedor;   }, set(v) { window.__hiper.vendedor   = v; }, configurable: true },
        __hiperCustosHash: { get() { return window.__hiper.custosHash; }, set(v) { window.__hiper.custosHash = v; }, configurable: true },
    });

    const TARGET_PATH  = '/produtos/GetSelect2ParaPedido';
    const MASTER_KEY   = 'hc:master';
    const MIN_ITEMS_THRESHOLD = 100;

    // ── Sincronização de custos com servidor ──────────────────────────────────
    const SYNC_API_BASE       = 'https://api.sistema.santin.tec.br';
    const SYNC_INTERVAL_MS    = 60 * 60 * 1000;  // 1 hora (intervalo normal)
    const SYNC_RETRY_STEPS_MS = [5 * 60 * 1000, 15 * 60 * 1000]; // backoff offline
    const CUSTOS_HASH_KEY     = 'hc:custos_hash';  // chave no chrome.storage
    const NFM_KEY             = 'hc:nfm_pct';       // % da nota fiscal (fonte única)
    const PRODUTOS_HASH_KEY   = 'hc:produtos_hash'; // fingerprint dos nomes de produto

    // ── Scheduler de preload diário ───────────────────────────────────────────
    const MASTER_TS_KEY        = 'hc:master_ts';       // timestamp do último preload
    const PRELOAD_INTERVAL_MS  = 24 * 60 * 60 * 1000;  // 24 horas
    const PRELOAD_RETRY_MS     = 15 * 60 * 1000;        // retry em 15 min se falhar
    let _preloadTimer          = null;

    let _syncRetryIndex  = 0;   // índice no array de backoff (offline)
    let _syncTimer       = null;
    let _syncEmAndamento = false;
    let _produtosHashLocal = '';  // fingerprint de nomes já aplicado (memória)
    let _syncSeq         = 0;   // correlaciona req/resposta da sync (passiva vs botão)

    const REAL_XML_HTTP = window.XMLHttpRequest;
    const NATIVE_FETCH = window.fetch.bind(window);

    let memMaster = [];
    let preloading = false;
    let inicializado = false;
    // Otimizações que o funcionário pode desligar pelo popup (padrão: ligadas).
    // otimSelect = lista/busca de produtos servida do nosso cache (em vez do
    //   GetSelect2ParaPedido do Hiper).
    // otimPreco  = dados do produto (preço/estoque) servidos do nosso cache (em
    //   vez da chamada lenta ao get-dados-produto-pedido).
    // Desligado → cai no comportamento nativo do Hiper. Vale ao recarregar.
    let otimSelect = true;
    let otimPreco  = true;
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
        if (!otimSelect) return;   // otimização do select desligada → Select2 nativo
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

    // ── 2. Master (carregado do servidor) ─────────────────────────────────────
    // Antes: ~50 fetches paralelos ao GetSelect2ParaPedido do Hiper — travava e
    // podia perder produto novo com nome fora dos termos de busca.
    // Agora: 1 fetch ao /produtos/master da dbApi (montado server-side via
    // hiper_client, fonte = bff completo). O fetch cross-origin passa pelo
    // interceptor (contexto privilegiado, sem restrição de CSP).
    function carregarMasterDoServidor() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => { cleanup(); resolve(null); }, 15000);
            function cleanup() {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
            }
            function handler(ev) {
                if (ev.source !== window) return;
                if (ev.data?.type !== 'HIPER_MASTER_LOADED') return;
                cleanup();
                resolve(ev.data.produtos || null);
            }
            window.addEventListener('message', handler);
            window.postMessage({ type: 'HIPER_MASTER_LOAD' }, '*');
        });
    }

    // ── Dados do produto (get-dados-produto-pedido) servidos do nosso cache ───
    // Pede ao interceptor os dados montados server-side (preço/unidade do bff +
    // estoque do NOSSO sistema). Cada chamada tem um seq pra casar a resposta.
    let _dadosSeq = 0;
    function carregarDadosProduto(produtoId) {
        return new Promise((resolve) => {
            const seq = ++_dadosSeq;
            const timeout = setTimeout(() => { cleanup(); resolve(null); }, 8000);
            function cleanup() {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
            }
            function handler(ev) {
                if (ev.source !== window) return;
                if (ev.data?.type !== 'HIPER_DADOS_PRODUTO_LOADED' || ev.data.seq !== seq) return;
                cleanup();
                resolve(ev.data.envelope || null);
            }
            window.addEventListener('message', handler);
            window.postMessage({ type: 'HIPER_DADOS_PRODUTO_LOAD', seq, produtoId }, '*');
        });
    }

    // Aplica um master vindo do servidor: pós-processa (text/und), ordena, salva
    // e reconfigura os Select2 ao vivo. Usado pelo preload e pela sync (passiva/botão).
    function aplicarMaster(produtos) {
        if (!Array.isArray(produtos) || produtos.length < MIN_ITEMS_THRESHOLD) return false;
        produtos.forEach(item => {
            item.text = item.Nome;
            const cod4 = (item.Nome || '').match(/^(\d{4})\b/)?.[1];
            item.und = (cod4 && window.__hiperUnidades[cod4]) ? window.__hiperUnidades[cod4] : 'UN';
        });
        memMaster = produtos.sort((a, b) => {
            // Ordena ignorando os 7 primeiros caracteres ("3112 - "), como antes.
            const comparadorA = (a.Nome || '').substring(7).trim();
            const comparadorB = (b.Nome || '').substring(7).trim();
            return comparadorA.localeCompare(comparadorB, 'pt-BR');
        });
        window.__hiperMaster = memMaster;
        window.postMessage({ type: 'HIPER_CACHE_SET', key: MASTER_KEY, data: memMaster, ts: Date.now() }, '*');
        window.postMessage({ type: 'HIPER_CACHE_SET', key: MASTER_TS_KEY, data: Date.now(), ts: Date.now() }, '*');
        reconfigurarSelect2sExistentes();
        return true;
    }

    async function executarPreload() {
        if (!otimSelect) return;   // otimização do select desligada → não carrega master
        if (preloading) return;
        preloading = true;
        try {
            const produtos = await carregarMasterDoServidor();
            if (!aplicarMaster(produtos)) {
                DEBUG && console.warn('[HiperCache] ⚠️ Master do servidor vazio/insuficiente — mantém cache atual.');
            }
        } finally { preloading = false; }
    }

    // ── 3. Sincronização de Custos com Servidor ───────────────────────────────

    /**
     * Verifica metadados no servidor.
     * Se hash mudou OU force_update == true → baixa dados completos.
     * Se offline → agenda retry com backoff.
     */
    // ── Sincronização via interceptor (content script — sem restrição de CSP) ──
    // O fetch real acontece no interceptor.js (contexto privilegiado).
    // Esta função envia HIPER_SYNC_CUSTOS_REQ e aguarda HIPER_SYNC_CUSTOS_RESULT.
    // Aplica o resultado de uma sync (nfm + custos + nomes de produto). Serve tanto
    // pro ciclo passivo quanto pro botão "Atualizar".
    function aplicarResultadoSync(data) {
        const { custos, hash, nfmPct, produtos, produtosHash } = data;

        if (nfmPct != null && !Number.isNaN(Number(nfmPct))) {
            window.__hiperImpPct = Number(nfmPct);
            window.postMessage({ type: 'HIPER_CACHE_SET', key: NFM_KEY, data: window.__hiperImpPct, ts: Date.now() }, '*');
        }

        if (custos) {
            Object.entries(custos).forEach(([id, val]) => {
                window.__hiperCustos[id] = (typeof val === 'object' && val !== null) ? val.valor : val;
            });
            Object.entries(custos).forEach(([id, val]) => {
                const num = (typeof val === 'object' && val !== null) ? val.valor : val;
                window.postMessage({ type: 'HIPER_CACHE_SET', key: `custo:${id}`, data: num, ts: Date.now() }, '*');
            });
            window.postMessage({ type: 'HIPER_CACHE_SET', key: CUSTOS_HASH_KEY, data: hash, ts: Date.now() }, '*');
            window.__hiperCustosHash = hash;
            window.postMessage({ type: 'HIPER_CUSTO_LOADED', custos: window.__hiperCustos }, '*');
            console.info(`[HiperCache] ✅ ${Object.keys(custos).length} custos atualizados | hash: ${hash}`);
        }

        // Nomes/lista de produtos — só vêm quando o produtos_hash mudou (ou no botão).
        if (Array.isArray(produtos) && aplicarMaster(produtos)) {
            console.info(`[HiperCache] ✅ ${produtos.length} produtos (nomes) atualizados.`);
        }
        if (produtosHash != null) {
            _produtosHashLocal = produtosHash;
            window.postMessage({ type: 'HIPER_CACHE_SET', key: PRODUTOS_HASH_KEY, data: produtosHash, ts: Date.now() }, '*');
        }
    }

    async function verificarAtualizacaoCustos() {
        if (_syncEmAndamento) return;

        // Só uma aba executa o fetch por vez — lock mantido durante toda a operação
        await navigator.locks.request('hiper_custo_sync', { ifAvailable: true }, async lock => {
            if (!lock) {
                DEBUG && console.log('[HiperCache] 🔒 Outra aba já sincronizando — pulando.');
                _agendarProximaVerificacao(SYNC_INTERVAL_MS);
                return;
            }

            _syncEmAndamento = true;
            const hashLocal = await _lerHashLocal();

            await new Promise(resolve => {
                const seq = ++_syncSeq;
                const timer = setTimeout(() => {
                    cleanup();
                    _syncEmAndamento = false;
                    const delay = SYNC_RETRY_STEPS_MS[_syncRetryIndex] ?? SYNC_INTERVAL_MS;
                    _syncRetryIndex = Math.min(_syncRetryIndex + 1, SYNC_RETRY_STEPS_MS.length);
                    console.warn(`[HiperCache] ⚠️ Timeout ao sincronizar custos — retry em ${delay / 60000}min.`);
                    _agendarProximaVerificacao(delay);
                    resolve();
                }, 12000);

                function cleanup() {
                    clearTimeout(timer);
                    window.removeEventListener('message', handler);
                }

                function handler(ev) {
                    if (ev.source !== window) return;
                    if (ev.data?.type !== 'HIPER_SYNC_CUSTOS_RESULT' || ev.data.seq !== seq) return;
                    cleanup();
                    _syncEmAndamento = false;

                    if (ev.data.ok) {
                        aplicarResultadoSync(ev.data);
                        _syncRetryIndex = 0;
                        _agendarProximaVerificacao(SYNC_INTERVAL_MS);
                    } else {
                        const delay = SYNC_RETRY_STEPS_MS[_syncRetryIndex] ?? SYNC_INTERVAL_MS;
                        _syncRetryIndex = Math.min(_syncRetryIndex + 1, SYNC_RETRY_STEPS_MS.length);
                        console.warn(`[HiperCache] ⚠️ Sem conexão — retry em ${delay / 60000}min.`, ev.data.error);
                        _agendarProximaVerificacao(delay);
                    }
                    resolve();
                }

                window.addEventListener('message', handler);
                window.postMessage({ type: 'HIPER_SYNC_CUSTOS_REQ', seq, hashLocal, produtosHashLocal: _produtosHashLocal }, '*');
            });
            // Lock liberado automaticamente ao sair do callback
        });
    }

    /** Lê o hash salvo localmente (memória > chrome.storage) */
    async function _lerHashLocal() {
        if (window.__hiperCustosHash) return window.__hiperCustosHash;

        return new Promise(resolve => {
            const timeout = setTimeout(() => resolve(''), 2000);
            const handler = ev => {
                if (ev.source !== window) return;
                if (ev.data?.type === 'HIPER_CACHE_ALL') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    const entry = ev.data.entries?.[CUSTOS_HASH_KEY];
                    resolve(entry?.data || '');
                }
            };
            window.addEventListener('message', handler);
            window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');
        });
    }

    function _agendarProximaVerificacao(ms) {
        clearTimeout(_syncTimer);
        _syncTimer = setTimeout(verificarAtualizacaoCustos, ms);
    }

    /** Expõe para uso externo (botão manual no widget de lucro) */
    window.__hiper.syncCustos = verificarAtualizacaoCustos;
    window.__hiperSyncCustos  = verificarAtualizacaoCustos;

    // Botão "Atualizar": força o servidor a rodar /produtos/sync antes de responder,
    // e aplica custos + nomes ao vivo. Retorna Promise (o botão mostra "Atualizando…").
    function forcarAtualizacao() {
        return new Promise((resolve, reject) => {
            const seq = ++_syncSeq;
            const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 90000);
            function cleanup() { clearTimeout(timer); window.removeEventListener('message', handler); }
            function handler(ev) {
                if (ev.source !== window) return;
                if (ev.data?.type !== 'HIPER_SYNC_CUSTOS_RESULT' || ev.data.seq !== seq) return;
                cleanup();
                if (ev.data.ok) { aplicarResultadoSync(ev.data); resolve(); }
                else reject(new Error(ev.data.error || 'falha'));
            }
            window.addEventListener('message', handler);
            window.postMessage({ type: 'HIPER_SYNC_CUSTOS_REQ', seq, force: true,
                                 hashLocal: window.__hiperCustosHash || '',
                                 produtosHashLocal: _produtosHashLocal }, '*');
        });
    }
    window.__hiperForcarAtualizacao = forcarAtualizacao;

    // ── 4. Interceptador de Rede (apenas Select2) ─────────────────────────────
    window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input?.url ?? '');

        if (otimSelect && url.includes(TARGET_PATH)) {
            if (memMaster.length > 0) {
                try {
                    const term = new URL(url, location.origin).searchParams.get('Filtro') || '';
                    const res = normalizar(term).split(/\s+/).filter(Boolean)
                        .reduce((acc, t) => acc.filter(p => normalizar(p.Nome || p.text).includes(t)), memMaster);
                    // Resultado vazio → cai no nativo (produto novo não preloadado)
                    if (res.length === 0) {
                        DEBUG && console.log('[HiperCache] 🔍 Cache sem resultado para "' + term + '" — usando API nativa.');
                        return NATIVE_FETCH(input, init);
                    }
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
            const sendArgs = arguments;

            // get-dados-produto-pedido → servido do nosso cache (evita a chamada
            // lenta ao api.hiper.com.br). Async: faz o round-trip ao interceptor
            // e só então simula a resposta do XHR.
            if (otimPreco && _url && /get-dados-produto-pedido/i.test(_url)) {
                let produtoId = null;
                try { produtoId = new URL(_url, location.origin).searchParams.get('produtoId'); } catch(_) {}
                if (produtoId) {
                    const self = this;
                    carregarDadosProduto(produtoId).then((envelope) => {
                        if (!envelope) { origSend.apply(self, sendArgs); return; }  // fallback: Hiper ao vivo
                        try {
                            const corpo = JSON.stringify(envelope);
                            Object.defineProperty(self, 'readyState',   { get: () => 4,     configurable: true });
                            Object.defineProperty(self, 'status',       { get: () => 200,   configurable: true });
                            Object.defineProperty(self, 'statusText',   { get: () => 'OK',  configurable: true });
                            Object.defineProperty(self, 'responseText', { get: () => corpo, configurable: true });
                            // responseType 'json' → o consumidor lê .response já parseado (objeto);
                            // caso contrário devolve a string, como o XHR nativo faria.
                            Object.defineProperty(self, 'response', {
                                get: () => (self.responseType === 'json' ? envelope : corpo),
                                configurable: true,
                            });
                            // jQuery decide se faz JSON.parse pelo Content-Type da resposta.
                            // Sem esse header ele entrega a resposta como STRING → o Hiper lê
                            // response.dados[0].precoVendaFinal numa string → preço 0.
                            self.getResponseHeader = (name) =>
                                (String(name).toLowerCase() === 'content-type'
                                    ? 'application/json; charset=utf-8' : null);
                            self.getAllResponseHeaders = () => 'content-type: application/json; charset=utf-8\r\n';
                            self.dispatchEvent(new Event('readystatechange'));
                            self.dispatchEvent(new Event('load'));
                        } catch(e) {
                            console.warn('[HiperCache] Erro ao simular get-dados, usando rede:', e);
                            origSend.apply(self, sendArgs);
                        }
                    });
                    return;
                }
            }

            // Apenas intercepta Select2 — deixa tudo mais passar normalmente
            if (otimSelect && _url && _url.includes(TARGET_PATH) && memMaster.length > 0) {
                try {
                    const term = new URL(_url, location.origin).searchParams.get('Filtro') || '';
                    const res = normalizar(term).split(/\s+/).filter(Boolean)
                        .reduce((acc, t) => acc.filter(p => normalizar(p.Nome || p.text).includes(t)), memMaster);
                    // Resultado vazio → cai no nativo (produto novo não preloadado)
                    if (res.length === 0) {
                        DEBUG && console.log('[HiperCache] 🔍 Cache sem resultado para "' + term + '" — usando API nativa (XHR).');
                        return origSend.apply(this, arguments);
                    }
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

            // Flags de otimização (booleanos crus no storage; só false desliga).
            otimSelect = entries['otim_select'] !== false;
            otimPreco  = entries['otim_preco']  !== false;
            window.__hiperOtim = { select: otimSelect, preco: otimPreco };

            if (!otimSelect) {
                // Otimização do select desligada → deixa o Hiper carregar a lista nativamente.
                DEBUG && console.log('[HiperCache] ⏸ Otimização do select DESLIGADA (comportamento nativo).');
            } else if (entries[MASTER_KEY]?.data?.length >= MIN_ITEMS_THRESHOLD) {
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

            // % da nota fiscal salvo (disponível já no load, antes do 1º sync)
            const nfmEntry = entries[NFM_KEY];
            if (nfmEntry?.data != null && !Number.isNaN(Number(nfmEntry.data))) {
                window.__hiperImpPct = Number(nfmEntry.data);
            }
            // Hash de produtos já aplicado (pra sync passiva saber se precisa rebaixar).
            const prodHashEntry = entries[PRODUTOS_HASH_KEY];
            if (prodHashEntry?.data) _produtosHashLocal = prodHashEntry.data;

            if (!inicializado) {
                // Lê hash de custos salvo (se houver)
                const hashEntry = entries[CUSTOS_HASH_KEY];
                if (hashEntry?.data) window.__hiperCustosHash = hashEntry.data;

                inicializado = true;
                console.info(`[HiperCache] ✅ Pronto: ${Object.keys(window.__hiperCustos).length} custos em cache.`);
                DEBUG && console.log('%c 💡 DEBUG %c ativo — desative com localStorage.removeItem(\'hc_debug\') e recarregue', S+'background:#1c1917;color:#fef3c7', 'color:gray');

                // Inicia ciclo de sincronização com servidor (primeira verificação imediata)
                verificarAtualizacaoCustos();
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

    // ── 7. Scheduler de preload diário ────────────────────────────────────────
    // Roda executarPreload uma vez por dia. Se falhar, retry em 15 min.
    // Nunca quebra o funcionamento normal — erros são silenciados.
    async function _preloadAgendado() {
        try {
            // Lê o timestamp do último preload bem-sucedido
            const tsEntry = await new Promise(resolve => {
                const timeout = setTimeout(() => resolve(null), 2000);
                const handler = ev => {
                    if (ev.source !== window) return;
                    if (ev.data?.type === 'HIPER_CACHE_ALL') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        resolve(ev.data.entries?.[MASTER_TS_KEY]?.data || null);
                    }
                };
                window.addEventListener('message', handler);
                window.postMessage({ type: 'HIPER_CACHE_LOAD_ALL' }, '*');
            });

            const agora    = Date.now();
            const ultimoTs = tsEntry ? Number(tsEntry) : 0;
            const idade    = agora - ultimoTs;

            if (idade >= PRELOAD_INTERVAL_MS) {
                DEBUG && console.log(`[HiperCache] 🔄 Preload diário — cache com ${Math.round(idade / 3600000)}h de idade.`);
                await executarPreload();
                _agendarPreload(PRELOAD_INTERVAL_MS);
            } else {
                // Ainda não venceu — agenda para quando vencer
                const restante = PRELOAD_INTERVAL_MS - idade;
                DEBUG && console.log(`[HiperCache] ⏰ Preload diário em ${Math.round(restante / 3600000)}h.`);
                _agendarPreload(restante);
            }
        } catch(e) {
            // Qualquer falha → retry em 15 min, cache continua funcionando
            console.warn('[HiperCache] ⚠️ Preload diário falhou — retry em 15min.', e?.message);
            _agendarPreload(PRELOAD_RETRY_MS);
        }
    }

    function _agendarPreload(ms) {
        clearTimeout(_preloadTimer);
        _preloadTimer = setTimeout(_preloadAgendado, ms);
    }

    // Inicia o scheduler após 10s (deixa a página estabilizar primeiro)
    setTimeout(_preloadAgendado, 10_000);

    window.__hiper.reload = executarPreload;
    window.__hiperReload  = executarPreload;
    window.__nativeFetch  = NATIVE_FETCH;
})();