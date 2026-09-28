// ═══════════════════════════════════════════════════════════════════════════════
// hiper-pedido-store.js — Acesso às stores Pinia do microfrontend do pedido
//
// A tela nova do pedido (/vendas/pedido-de-venda/cadastro) é um app Vue 3 +
// Pinia empacotado em hiper-microfrontend-pedidodevenda.umd.cjs (minificado).
// Em vez de raspar o DOM, lemos/escrevemos direto nas stores — a mesma fonte
// que o próprio Hiper usa pra montar o request de salvar.
//
// Stores relevantes (ids reais, ver referencias/hiper_javascript):
//   'cadastro-pedido-de-venda-produtos'  → itens[], totalPedido, totalBrutoPedido,
//                                           adicionarItem(), setProduto(id, produto),
//                                           setQuantidade(id, qtd), removerItem(id)...
//   'cadastro-pedido-de-venda-descontos' → valorDeDescontoAplicado, valorDoFrete,
//                                           totalProdutos, totalDoPedido
//
// Cada item de produtos.itens: { id (guid da linha), produto, produtoNome,
//   idProdutoHiperOnline, idProdutoGradeHiperOnline, quantidade, valorUnitario,
//   valorUnitarioBase, descontoUnitario, subtotal, cancelado, ... }.
// idProdutoHiperOnline é o mesmo id usado como `idProduto` no resto da extensão.
// ═══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const SEL_MICROFRONT = '#hiper-microfrontend-pedidodevenda';

  // O app Vue fica montado em algum descendente do container do microfrontend
  // (não necessariamente no próprio container) — procura quem tem __vue_app__.
  function _pinia() {
    const raiz = document.querySelector(SEL_MICROFRONT);
    if (!raiz) return null;
    const appEl = raiz.__vue_app__ ? raiz : [...raiz.querySelectorAll('*')].find(el => el.__vue_app__);
    return appEl?.__vue_app__?.config?.globalProperties?.$pinia ?? null;
  }

  function store(id) {
    return _pinia()?._s.get(id) ?? null;
  }

  function produtos() {
    return store('cadastro-pedido-de-venda-produtos');
  }

  // ── Catálogo de produtos em cache ───────────────────────────────────────────
  // O seletor de produto do Hiper faz, a cada tecla, GET produtos-list?search=…
  // (~450 ms), e ao escolher um produto ainda GET produtos/{id} e POST
  // calcular-preco-venda. O catálogo inteiro são ~124 produtos (5 páginas de
  // 30 — o servidor ignora pageSize), então guardamos tudo no localStorage do
  // Hiper e o XHRProxy (hiper-sync.js) responde esses requests daqui via
  // responderDoCache(). Qualquer coisa que o cache não saiba responder cai no
  // request normal do Hiper.
  //
  // Frescor: atualiza em segundo plano quando o cache passa de 10 min (checado
  // a cada 30 s enquanto a tela do pedido estiver aberta) e na hora pelo ↻.
  // Preço vem só daqui (o calcular-preco-venda sem tabela de preço/categoria
  // só devolve o precoDeVenda recebido — verificado em 30/30 produtos), então
  // uma alteração de preço no Hiper leva até ~10 min pra chegar, ou clica no ↻.
  const CATALOGO_KEY   = 'hiperCache:catalogoPedido:v1';
  const CATALOGO_TTL   = 10 * 60 * 1000;
  const PARAMS_BUSCA   = new Set(['search', 'page', 'naoMostrarNasVendas']);
  const POR_PAGINA     = 30;

  let _catalogo = null;            // { ts, itens: [produto no formato do Hiper] }
  let _porId    = new Map();       // "id" e "id_grade" → produto
  let _textos   = new Map();       // produto → texto normalizado pra busca
  let _atualizando = null;

  const _norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function _indexar(itens) {
    _porId = new Map();
    _textos = new Map();
    for (const p of itens) {
      _porId.set(String(p.idProdutoHiperOnline), p);
      _porId.set(`${p.idProdutoHiperOnline}_${p.idProdutoGradeHiperOnline ?? 0}`, p);
      const sin = (p.sinonimos || []).filter(s => !s.excluido).map(s => s.sinonimo).join(' ');
      _textos.set(p, _norm(`${p.codigo ?? ''} ${p.nome ?? ''} ${sin}`));
    }
  }

  (function _carregarDoStorage() {
    try {
      const c = JSON.parse(localStorage.getItem(CATALOGO_KEY) || 'null');
      if (c?.itens?.length) { _catalogo = c; _indexar(c.itens); }
    } catch (_) { /* storage bloqueado/corrompido → segue sem cache */ }
  })();

  async function atualizarCatalogo({ forcar = false } = {}) {
    if (_atualizando) return _atualizando;
    if (!forcar && _catalogo && Date.now() - _catalogo.ts < CATALOGO_TTL) return true;
    const g = store('general');
    if (!g?.apiBaseUrl || !g?.token) return false;

    const H = { Authorization: `Bearer ${g.token}`, Accept: 'application/json' };
    const url = (p) => `${g.apiBaseUrl}/v1/seletores-do-pedido-de-venda/produtos-list?search=&page=${p}&naoMostrarNasVendas=true`;
    const pagina = async (p) => {
      const r = await fetch(url(p), { headers: H });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()).data;
    };

    _atualizando = (async () => {
      try {
        const primeira = await pagina(1);
        const resto = await Promise.all(
          Array.from({ length: Math.max(0, (primeira.totalPages || 1) - 1) }, (_, i) => pagina(i + 2)));
        const itens = [primeira, ...resto].flatMap(d => d?.list || []);
        // Só troca o cache por uma carga completa — nunca por uma parcial.
        if (!itens.length || itens.length !== primeira.totalItems) {
          throw new Error(`carga incompleta (${itens.length}/${primeira.totalItems})`);
        }
        _catalogo = { ts: Date.now(), itens };
        _indexar(itens);
        _cacheProduto.clear();
        try { localStorage.setItem(CATALOGO_KEY, JSON.stringify(_catalogo)); } catch (_) {}
        console.info(`[HiperPedido] 📦 Catálogo em cache: ${itens.length} produtos.`);
        return true;
      } catch (e) {
        console.warn('[HiperPedido] Falha ao atualizar o catálogo (segue com o cache anterior):', e);
        return false;
      } finally {
        _atualizando = null;
      }
    })();
    return _atualizando;
  }

  // ── Debounce da busca: 1000 ms → 200 ms ─────────────────────────────────────
  // Os seletores do Hiper esperam 1 s sem digitar antes de buscar
  // (`st(R, () => { clearTimeout(A); A = setTimeout(() => W(), 1e3) })` no
  // bundle). Com o catálogo em cache a resposta é instantânea, então esse 1 s
  // vira a única espera. Encurtamos SÓ esse timer, reconhecido por tudo junto:
  // atraso exato de 1000 ms, callback no formato `() => X()` e agendado até
  // 100 ms depois de uma digitação num campo de busca do microfrontend do
  // pedido. Qualquer outro setTimeout passa intacto. 200 ms (não 0) mantém o
  // debounce pra quando a busca cair no Hiper de verdade (fora do cache).
  const DEBOUNCE_HIPER = 1000;
  const DEBOUNCE_NOVO  = 200;
  const RE_CALLBACK_DEBOUNCE = /^\(\)\s*=>\s*[\w$]+\(\)$/;
  let _ultimaDigitacaoBusca = 0;

  // Campo de busca = ids que o bundle dá aos seletores (hc-input-modo-leitor-
  // search-<guid>, hc-select-data-search-…), que podem estar num popover fora
  // do container; ou input type=search dentro do microfrontend.
  const RE_ID_BUSCA = /^hc-(input-modo-leitor-search|select-data-search)/;
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el?.tagName !== 'INPUT') return;
    if (RE_ID_BUSCA.test(el.id || '') || (el.type === 'search' && el.closest(SEL_MICROFRONT))) {
      _ultimaDigitacaoBusca = Date.now();
    }
  }, true);

  const _setTimeoutOriginal = window.setTimeout;
  window.setTimeout = function (fn, delay, ...args) {
    if (delay === DEBOUNCE_HIPER && typeof fn === 'function'
        && Date.now() - _ultimaDigitacaoBusca < 100
        && window.__hiperOtim?.select !== false
        && RE_CALLBACK_DEBOUNCE.test(Function.prototype.toString.call(fn))) {
      delay = DEBOUNCE_NOVO;
    }
    return _setTimeoutOriginal.call(this, fn, delay, ...args);
  };

  // Atualização em segundo plano enquanto a tela do pedido estiver aberta.
  setInterval(() => { if (store('general')?.token) atualizarCatalogo(); }, 30 * 1000);
  setTimeout(() => { if (store('general')?.token) atualizarCatalogo(); }, 2000);

  const _envelope = (data) => ({ data, fieldMessages: [], fieldMessagesDictionary: {}, messagesWithoutField: [], success: true });

  // ── Estoque do NOSSO sistema ────────────────────────────────────────────────
  // O "Disponível" da linha vem de GET obter-estoque-produto?produtoId=<GUID>.
  // Respondemos com o saldo do nosso backend (tabela `estoque`, a confiável —
  // o Hiper diverge, ex.: alçapão −21 no Hiper × 51 no nosso), mesmo
  // comportamento que o "otimização de preço" tinha na tela antiga. O GUID é
  // o integration_id do backend. Memo de 30 s por produto; backend fora do ar
  // ou lento (> 2,5 s) → null → request normal do Hiper.
  const API_NOSSA       = 'https://api.sistema.santin.tec.br';
  const ESTOQUE_TTL     = 30 * 1000;
  const ESTOQUE_TIMEOUT = 2500;
  const _estoques = new Map();   // GUID → { ts, p: Promise<number|null> }

  function _estoqueNosso(guid) {
    const memo = _estoques.get(guid);
    if (memo && Date.now() - memo.ts < ESTOQUE_TTL) return memo.p;
    const ctrl = new AbortController();
    const timer = _setTimeoutOriginal(() => ctrl.abort(), ESTOQUE_TIMEOUT);
    const p = fetch(`${API_NOSSA}/produtos/dados/${encodeURIComponent(guid)}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const q = j?.dados?.[0]?.quantidadeEmEstoqueDisponivel;
        if (typeof q !== 'number') { _estoques.delete(guid); return null; }
        return q;
      })
      .catch(() => { _estoques.delete(guid); return null; })
      .finally(() => clearTimeout(timer));
    _estoques.set(guid, { ts: Date.now(), p });
    return p;
  }

  // Decide se um request do Hiper pode ser respondido pelo cache. O XHRProxy
  // decide no send(). Devolve { status, corpo }, uma Promise disso (estoque,
  // que vem do nosso backend), ou null (= deixa o request seguir pro Hiper).
  function responderDoCache(metodo, url, body) {
    if (typeof url !== 'string') return null;
    let u;
    try { u = new URL(url, location.origin); } catch (_) { return null; }
    const otim = window.__hiperOtim || {};

    if (metodo === 'GET' && u.pathname.endsWith('/v1/pedidos-de-venda/obter-estoque-produto')) {
      if (otim.preco === false) return null;
      const guid = u.searchParams.get('produtoId');
      if (!guid) return null;
      return _estoqueNosso(guid).then(q => (q == null ? null : { status: 200, corpo: _envelope(q) }));
    }

    if (!_catalogo) return null;

    // Busca do seletor de produto
    if (metodo === 'GET' && u.pathname.endsWith('/v1/seletores-do-pedido-de-venda/produtos-list')) {
      if (otim.select === false) return null;
      // Só a busca da tela de cadastro (mesmos filtros com que o cache foi montado).
      const params = [...u.searchParams.keys()];
      if (params.some(k => !PARAMS_BUSCA.has(k)) || u.searchParams.get('naoMostrarNasVendas') !== 'true') return null;

      const termos = _norm(u.searchParams.get('search')).split(/\s+/).filter(Boolean);
      const achados = _catalogo.itens
        .filter(p => termos.every(t => _textos.get(p).includes(t)))
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' }));
      // Nada no cache → pode ser produto cadastrado depois da última carga.
      if (!achados.length) return null;

      const page = Math.max(1, parseInt(u.searchParams.get('page'), 10) || 1);
      const totalPages = Math.ceil(achados.length / POR_PAGINA);
      return { status: 200, corpo: _envelope({
        done: page >= totalPages,
        filter: { search: u.searchParams.get('search') || '', page, pageSize: POR_PAGINA, naoMostrarNasVendas: true, orderBy: 'Nome', orderByDesc: false },
        list: achados.slice((page - 1) * POR_PAGINA, page * POR_PAGINA),
        totalItems: achados.length,
        totalPages,
      }) };
    }

    // Produto por id (campo "Nome do produto" da linha): "93938763" ou "93938763_1"
    const mId = metodo === 'GET' && u.pathname.match(/\/v1\/seletores-do-pedido-de-venda\/produtos\/(\d+(?:_\d+)?)$/);
    if (mId) {
      if (otim.select === false) return null;
      const p = _porId.get(mId[1]);
      return p ? { status: 200, corpo: _envelope(p) } : null;
    }

    // Preço calculado: sem tabela de preço nem categoria o Hiper só devolve o
    // precoDeVenda recebido. Com qualquer um dos dois, deixa o Hiper calcular.
    if (metodo === 'POST' && u.pathname.endsWith('/v1/pedidos-de-venda/calcular-preco-venda')) {
      if (otim.preco === false) return null;
      let b;
      try { b = JSON.parse(body); } catch (_) { return null; }
      if (b?.tabelaDePrecoId != null || b?.categoriaId != null || typeof b?.precoDeVenda !== 'number') return null;
      return { status: 200, corpo: _envelope(b.precoDeVenda) };
    }

    return null;
  }

  // ── Dados mínimos de um produto pra montar uma linha ────────────────────────
  // Formato próprio e enxuto — é tudo que preencherLinha() precisa:
  //   { idProdutoHiperOnline, idProdutoGradeHiperOnline, nome, precoDeVenda, casasDecimais }
  // Hoje vem da API do próprio microfrontend (token do usuário, store 'general');
  // a fonte pode virar o nosso backend cacheado sem mudar quem chama.
  const _cacheProduto = new Map();   // idProdutoHiperOnline → Promise<dados|null>

  function _dadosDoProdutoHiper(p) {
    return {
      idProdutoHiperOnline:      p.idProdutoHiperOnline,
      idProdutoGradeHiperOnline: p.idProdutoGradeHiperOnline ?? 0,
      nome:                      p.nome ?? '',
      precoDeVenda:              p.precos?.precoDeVenda ?? 0,
      casasDecimais:             p.unidadeDeMedida?.quantidadeDeCasasDecimais ?? 0,
    };
  }

  function obterProduto(idProdutoHiperOnline) {
    const id = String(idProdutoHiperOnline);
    const doCatalogo = _porId.get(id);
    if (doCatalogo) return Promise.resolve(_dadosDoProdutoHiper(doCatalogo));
    if (_cacheProduto.has(id)) return _cacheProduto.get(id);

    const g = store('general');
    if (!g?.apiBaseUrl || !g?.token) return Promise.resolve(null);

    const p = fetch(`${g.apiBaseUrl}/v1/seletores-do-pedido-de-venda/produtos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${g.token}`, Accept: 'application/json' },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!j?.data) { _cacheProduto.delete(id); return null; }   // não cacheia falha
        return _dadosDoProdutoHiper(j.data);
      })
      .catch(e => {
        console.warn('[HiperPedido] Falha ao buscar produto', id, e);
        _cacheProduto.delete(id);
        return null;
      });
    _cacheProduto.set(id, p);
    return p;
  }

  // ── Montar uma linha do pedido ──────────────────────────────────────────────
  // NÃO usa setProduto(). Monta a linha do mesmo jeito que o initEdit do Hiper
  // (abrir pedido salvo): produto = null + ids + nome + preço + quantidade, e
  // produtoId = id numérico ("93938763", ou "93938763_2" com grade — mesmo pL()
  // do bundle). O campo "Nome do produto" então busca /produtos/{produtoId}
  // sozinho e devolve o objeto via setProduto(); como a linha tinha
  // produto === null com os mesmos ids, o Hiper só completa o que falta e
  // PRESERVA quantidade e preço.
  // Chamar setProduto() direto não serve: o campo busca pelo GUID (400) e, se
  // a busca funcionar, re-dispara setProduto() com a linha já preenchida — que
  // aí reseta quantidade pra 1 e o preço.
  function preencherLinha(linhaId, dados, quantidade) {
    const s = produtos();
    const item = s?.itens.find(i => i.id === linhaId);
    if (!item || !dados) return false;
    const id = dados.idProdutoHiperOnline, grade = dados.idProdutoGradeHiperOnline ?? 0;
    Object.assign(item, {
      produto:                    null,
      produtoId:                  grade > 0 ? `${id}_${grade}` : String(id),
      idProdutoHiperOnline:       id,
      idProdutoGradeHiperOnline:  grade,
      produtoNome:                dados.nome,
      codigoDeBarras:             '',
      quantidadeCasasDecimais:    dados.casasDecimais ?? 0,
      valorUnitarioBase:          dados.precoDeVenda,
      valorUnitario:              dados.precoDeVenda,
      descontoUnitario:           0,
      precoDeAtacadoAplicado:     false,
      precoAtacadoOriginal:       null,
      idUsuarioDesconto:          null,
      nomeDoUsuarioDesconto:      null,
      numeroDeSerieSelecionadoId: null,
      numeroDeSerieSelecionado:   null,
      modoDoInput:                'search',
      lancadoViaModoLeitor:       false,
    });
    s.setQuantidade(linhaId, quantidade);   // recalcula o subtotal
    return true;
  }

  // Cria uma linha nova no fim do pedido e devolve o id dela. Síncrono do
  // adicionarItem até ler o id: nenhuma outra linha entra no meio.
  function novaLinha(dados, quantidade) {
    const s = produtos();
    if (!s || !dados) return null;
    s.adicionarItem();
    const linhaId = s.itens[s.itens.length - 1].id;
    preencherLinha(linhaId, dados, quantidade);
    return linhaId;
  }

  // Linhas sem produto escolhido (o pedido novo já nasce com uma). Itens já
  // salvos (pedidoItemId) nunca são tocados — removerItem() os cancelaria.
  function removerLinhasVazias() {
    const s = produtos();
    if (!s) return;
    s.itens
      .filter(i => i.idProdutoHiperOnline == null && !i.pedidoItemId)
      .map(i => i.id)
      .forEach(id => s.removerItem(id));
  }

  window.__hiperPedido = {
    store,
    produtos,
    descontos: () => store('cadastro-pedido-de-venda-descontos'),
    obterProduto,
    atualizarCatalogo,
    responderDoCache,
    preencherLinha,
    novaLinha,
    removerLinhasVazias,
  };
})();
