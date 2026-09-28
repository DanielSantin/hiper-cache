// ═══════════════════════════════════════════════════════════════════════════════
// hiper-sync.js — Ponte entre as requisições do Hiper e o nosso backend
// ═══════════════════════════════════════════════════════════════════════════════
//
// Três responsabilidades, todas via interceptação de fetch/XHR do Hiper:
//
// 1. PEDIDOS — só AVISA o backend (POST /hiper-pedido-mudou) que um pedido
//    mudou, NO MOMENTO em que o Hiper recebe uma destas requisições da API nova
//    (prd-ms-pedidodevenda-api):
//      • POST v1/pedidos-de-venda/salvar                 (body: { id, situacao, … })
//      • POST v1/atualizar-situacao-pedido-de-venda      (body: { selecao, situacao })
//      • POST v1/faturamento/faturar-pedidos             (body: { modoSelecao, pedidosIds })
//    Avisar antes da resposta (com fetch keepalive) garante que o aviso sai
//    mesmo se o usuário fechar a página; o backend espera ~10 s antes de ler o
//    pedido (o Hiper é lento pra refletir) e, se a operação tiver falhado,
//    simplesmente lê o estado de sempre. Pedido novo (id null) ainda não tem
//    GUID → aviso { recentes: true }, e o GUID segue quando a resposta chega.
//    Seleção em lote por FILTRO (modoSelecao = 1) também vira { recentes: true }.
//    O backend lê o pedido no Hiper ele mesmo e reconcilia o estoque
//    (hiper-database/routers/pedidos_sync.py). A extensão não monta mais
//    itens/estado — isso quebrava a cada mudança de tela do Hiper. Aviso
//    perdido não é fatal: o check geral do backend pega divergências.
//
// 2. ENTRADA DE ESTOQUE por NF-e (confirmar-importacao) — inalterado.
//
// 3. CATÁLOGO EM CACHE — o XHRProxy responde busca/produto/preço/estoque do
//    seletor de produto pelo cache (responderDoCache, hiper-pedido-store.js).
//
// A sincronização antiga (api.hiper.com.br/pedido-venda + atualizar-situacao
// via webRequest do background.js) foi removida: a tela nova não usa mais
// essa API.
// ═══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Configuração ─────────────────────────────────────────────────────────────

  const API_BASE   = 'https://api.sistema.santin.tec.br';
  const RETRY_MS   = 5_000;

  // grupo 1 = rota (salvar | atualizar-situacao | faturar)
  const RE_API_PEDIDOS = /prd-ms-pedidodevenda-api\.hiper\.com\.br\/v1\/(pedidos-de-venda\/salvar|atualizar-situacao-pedido-de-venda|faturamento\/faturar-pedidos)(?:[/?#]|$)/i;
  const RE_CONFIRMAR_IMPORTACAO = /fiscal\/importacao-de-xml-de-documento-fiscal\/api\/confirmar-importacao/i;

  const MODO_SELECAO_IDS = 0;   // enum Vl do bundle: 0 = Ids, 1 = Filtro
  const SITUACAO_PEDIDO  = 2;   // enum At do bundle

  // ── Utilitários ───────────────────────────────────────────────────────────────

  // Usa fetch nativo (salvo antes de qualquer interceptação)
  const _nativeFetch = window.__nativeFetch || window.fetch.bind(window);

  function _log(msg, ...args)  { console.info(`[HiperSync] ${msg}`, ...args); }
  function _warn(msg, ...args) { console.warn(`[HiperSync] ⚠️ ${msg}`, ...args); }

  function _json(texto) {
    if (!texto || typeof texto !== 'string') return null;
    try { return JSON.parse(texto); } catch (_) { return null; }
  }

  // ── 1. Aviso de pedido alterado ──────────────────────────────────────────────

  /** Extrai do REQUEST quais pedidos mudaram (o aviso sai antes da resposta). */
  function _montarAviso(rota, reqBody) {
    const req = _json(reqBody) || {};
    rota = rota.toLowerCase();

    if (rota === 'pedidos-de-venda/salvar') {
      // Pedido novo (id null): o GUID só existe na resposta — avisa "recentes"
      // agora e o GUID quando a resposta chegar (_avisarGuidNovo).
      return req.id
        ? { ids: [String(req.id)], recentes: false, situacao: req.situacao }
        : { ids: [], recentes: true, situacao: req.situacao };
    }

    // Mudança de situação / faturamento em lote (listagem): não tem relação
    // com o orçamento aberto na extensão, então não leva `situacao`.
    const sel = rota === 'atualizar-situacao-pedido-de-venda' ? req.selecao : req;
    if (!sel) return null;
    const porIds = sel.modoSelecao === MODO_SELECAO_IDS && Array.isArray(sel.pedidosIds);
    return {
      ids:      porIds ? sel.pedidosIds.filter(Boolean).map(String) : [],
      recentes: !porIds,
      situacao: null,
    };
  }

  // keepalive: o navegador termina de enviar mesmo se a página fechar logo
  // depois do clique. text/plain de propósito: request "simples", sem preflight
  // de CORS (o backend aceita o JSON com qualquer Content-Type).
  async function _enviarAviso(aviso, tentativa = 1) {
    try {
      const r = await _nativeFetch(`${API_BASE}/hiper-pedido-mudou`, {
        method:    'POST',
        headers:   { 'Content-Type': 'text/plain' },
        body:      JSON.stringify({ ids: aviso.ids, recentes: aviso.recentes }),
        keepalive: true,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      _log(`Aviso enviado: ${aviso.ids.length} pedido(s)${aviso.recentes ? ' + recentes' : ''}.`);
    } catch (e) {
      if (tentativa < 2) {
        setTimeout(() => _enviarAviso(aviso, tentativa + 1), RETRY_MS);
      } else {
        // O check geral do backend pega esse pedido depois.
        _warn('Aviso de pedido não entregue ao backend:', e?.message || e);
      }
    }
  }

  /** Chamado no send() — antes do Hiper responder. */
  function _pedidoEnviado(rota, reqBody) {
    const aviso = _montarAviso(rota, reqBody);
    if (!aviso || (!aviso.ids.length && !aviso.recentes)) return;
    _enviarAviso(aviso);
  }

  /** Chamado quando o Hiper responde com sucesso. */
  function _pedidoConfirmado(rota, reqBody, respBody) {
    if (rota.toLowerCase() !== 'pedidos-de-venda/salvar') return;
    const req = _json(reqBody) || {};

    // Pedido novo: agora o GUID existe — aviso preciso (o "recentes" do envio
    // já cobre, este só evita depender da listagem).
    if (!req.id && typeof respBody?.data === 'string' && respBody.data) {
      _enviarAviso({ ids: [respBody.data], recentes: false });
    }

    // Orçamento da extensão salvo como pedido na tela de cadastro → marca como
    // faturado na estatística. Usa __hiperPedidoAberto (código do orçamento
    // salvo/carregado pela extensão), não o código do pedido no Hiper.
    if (req.situacao === SITUACAO_PEDIDO && window.__hiperPedidoAberto
        && typeof window._tentarMarcarFaturado === 'function') {
      window._tentarMarcarFaturado(window.__hiperPedidoAberto);
    }
  }

  // ── 2. Entrada de estoque por NF-e ───────────────────────────────────────────

  function _processarNfe(bodyStr) {
    const body = _json(bodyStr);
    if (!body) { _warn('confirmar-importacao: body ausente ou inválido'); return; }
    const itens = (body.SugestoesDeProduto || [])
      .filter(p => p.IdProduto && p.Quantidade > 0)
      .map(p => ({
        idProduto: String(p.IdProduto),
        nome:      p.NomeProdutoGrade || '',
        unidade:   p.SiglaUnidadeMedida || 'UN',
        // Quantidade vem antes do Multiplicador que a Hiper aplica na
        // importação (ex: 60 chapas × 2,88 = 172,80m²) — o produto é
        // sempre cadastrado no Hiper na menor unidade de venda, e o
        // Multiplicador converte a unidade da NF (caixa, milheiro, etc.)
        // pra essa unidade — vale 1 quando a NF já vem na própria unidade
        // (compra de outro fornecedor). O backend faz a conversão inversa
        // pra unidade interna via estoque_divisor (ex: unidade → caixa).
        qtd:       p.Quantidade * (p.Multiplicador || 1),
      }));
    if (!itens.length) { _warn('confirmar-importacao: nenhum item encontrado'); return; }
    window.postMessage({
      type: 'HIPER_ENTRADA_ESTOQUE',
      payload: {
        id_nfe:      String(body.IdNfe),
        itens,
        valor_total: body.InformacoesFiscais?.ValorTotalNfe || 0,
        descricao:   `Entrada NF-e ${body.IdNfe}`,
      },
    }, '*');
    _log(`NF-e ${body.IdNfe} — ${itens.length} produto(s) para entrada de estoque.`);
  }

  // ── Interceptação de fetch ────────────────────────────────────────────────────

  function _interceptarFetch() {
    const fetchOriginal = window.__nativeFetch || window.fetch;

    window.fetch = async function (...args) {
      const [input, init] = args;
      const url    = typeof input === 'string' ? input : (input?.url || '');
      const metodo = (init?.method || input?.method || 'GET').toUpperCase();
      const body   = typeof init?.body === 'string' ? init.body : null;

      if (metodo !== 'POST') return fetchOriginal.apply(this, args);

      const mPedido = url.match(RE_API_PEDIDOS);
      const ehNfe   = RE_CONFIRMAR_IMPORTACAO.test(url);
      if (!mPedido && !ehNfe) return fetchOriginal.apply(this, args);

      if (mPedido) _pedidoEnviado(mPedido[1], body);

      const response = await fetchOriginal.apply(this, args);
      if (response.ok) {
        if (ehNfe) {
          _processarNfe(body);
        } else {
          response.clone().json()
            .then(resp => { if (resp?.success !== false) _pedidoConfirmado(mPedido[1], body, resp); })
            .catch(e => _warn('Resposta de pedido ilegível:', e));
        }
      }
      return response;
    };
  }

  // ── Interceptação de XHR ──────────────────────────────────────────────────────

  // Entrega uma resposta JSON pronta num XHR sem ir à rede. O axios (usado
  // pelo microfrontend) lê readyState/status/responseText/response/headers e
  // é avisado por 'loadend' (ou 'readystatechange' com readyState 4).
  // Assíncrono de propósito: o chamador espera a resposta depois do send().
  function _simularResposta(xhr, url, { status, corpo }) {
    const texto = JSON.stringify(corpo);
    const def = (k, get) => Object.defineProperty(xhr, k, { get, configurable: true });
    setTimeout(() => {
      def('readyState',   () => 4);
      def('status',       () => status);
      def('statusText',   () => 'OK');
      def('responseURL',  () => url);
      def('responseText', () => texto);
      def('response',     () => (xhr.responseType === 'json' ? corpo : texto));
      xhr.getAllResponseHeaders = () => 'content-type: application/json; charset=utf-8\r\n';
      xhr.getResponseHeader = (n) => (String(n).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null);
      ['readystatechange', 'load', 'loadend'].forEach(t => xhr.dispatchEvent(new Event(t)));
    }, 0);
  }

  function _interceptarXHR() {
    const XHROriginal = window.XMLHttpRequest;

    function XHRProxy() {
      const xhr    = new XHROriginal();
      let _url     = '';
      let _metodo  = 'GET';

      const openOriginal = xhr.open.bind(xhr);
      xhr.open = function (method, url, ...rest) {
        _metodo = (method || 'GET').toUpperCase();
        _url    = url;
        return openOriginal(method, url, ...rest);
      };

      const sendOriginal = xhr.send.bind(xhr);
      xhr.send = function (body) {
        const requestBody = typeof body === 'string' ? body : null;

        // 3. Catálogo em cache (busca/produto/preço/estoque do seletor de
        // produto da tela nova do pedido) — ver responderDoCache em
        // hiper-pedido-store.js.
        let doCache = null;
        try { doCache = window.__hiperPedido?.responderDoCache?.(_metodo, _url, requestBody); } catch (e) { _warn('responderDoCache falhou:', e); }
        if (doCache && typeof doCache.then === 'function') {
          // Resposta assíncrona (estoque do nosso backend): null → segue pro Hiper.
          doCache
            .then(r => (r ? _simularResposta(xhr, _url, r) : sendOriginal(body)))
            .catch(() => sendOriginal(body));
          return;
        }
        if (doCache) {
          _simularResposta(xhr, _url, doCache);
          return;
        }

        if (_metodo === 'POST') {
          const mPedido = typeof _url === 'string' && _url.match(RE_API_PEDIDOS);
          if (mPedido) {
            _pedidoEnviado(mPedido[1], requestBody);
            xhr.addEventListener('load', () => {
              if (xhr.status < 200 || xhr.status >= 300) return;
              const resp = xhr.responseType === 'json' ? xhr.response : _json(xhr.responseText);
              if (resp?.success === false) return;
              _pedidoConfirmado(mPedido[1], requestBody, resp);
            });
          } else if (RE_CONFIRMAR_IMPORTACAO.test(_url)) {
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) _processarNfe(requestBody);
            });
          }
        }

        return sendOriginal(body);
      };

      // Proxy transparente de todas as outras propriedades e métodos
      return new Proxy(xhr, {
        get(target, prop) {
          const val = target[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        },
        set(target, prop, val) {
          target[prop] = val;
          return true;
        },
      });
    }

    // Copia propriedades estáticas (DONE, LOADING, etc.)
    Object.assign(XHRProxy, XHROriginal);
    XHRProxy.prototype = XHROriginal.prototype;
    window.XMLHttpRequest = XHRProxy;
  }

  // ── Inicialização ─────────────────────────────────────────────────────────────

  _interceptarFetch();
  _interceptarXHR();
  _log('✅ Ativo. API:', API_BASE);

  // Diagnóstico no console: força o aviso de um pedido (GUID do Hiper).
  window.__hiperSync = {
    avisar: (...ids) => _enviarAviso({ ids: ids.map(String), recentes: false }),
    avisarRecentes: () => _enviarAviso({ ids: [], recentes: true }),
  };
})();
