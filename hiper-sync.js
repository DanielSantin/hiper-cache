// ═══════════════════════════════════════════════════════════════════════════════
// hiper-sync.js — Sincronização de pedidos-venda Hiper ↔ banco externo
// ═══════════════════════════════════════════════════════════════════════════════
//
// Arquitetura orientada a eventos. Intercepta fetch/XHR do Hiper e dispara
// ações de estoque no backend conforme a transição de estado detectada.
//
// Mapeamento de estados (campo `situacao` na response do Hiper):
//   1  → orçamento
//   2  → pedido
//   3  → cancelado (padrão)
//   99 → cancelado (menu rápido / cancelamento direto)
//   DELETE 204 → cancelado (inferido pelo método HTTP)
//
// Tabela de transições → ação de estoque:
//   none/orc → pedido    : POST /estoque/faturar          (debita)
//   pedido   → pedido    : POST /estoque/ajuste-pedido    (reconcilia delta)
//   pedido   → cancelado : DELETE /estoque/op/L{id}       (estorna)
//   cancelado→ pedido    : POST /estoque/faturar          (re-debita)
//   qualquer → orc/canc  : nenhuma ação de estoque
//
// Deduplicação (ETAPA 3):
//   Movida para o backend via idempotency_key (hash do pedido + estado + itens).
//   Se o mesmo evento chegar 2x em menos de 30s, o servidor retorna 200 ok 
//   e marca como duplicado — transparente para o cliente.
//   O cliente dispara sem barreira — o servidor garante idempotência.
//
// ═══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Configuração ─────────────────────────────────────────────────────────────

  const API_BASE   = 'https://api.sistema.santin.tec.br';
  const TIMEOUT_MS = 8_000;

  // Regex que reconhece endpoints relevantes do Hiper
  // Captur2a grupo 1 = pedidoId, grupo 2 = cod de situacao (atualizar-situacao/{cod})
  const RE_PEDIDO_VENDA         = /api\.hiper\.com\.br\/pedido-venda(?:\/(\d+)(?:\/atualizar-situacao\/(\d+))?)?(?:[?#]|$)/i;
  const RE_CONFIRMAR_IMPORTACAO = /fiscal\/importacao-de-xml-de-documento-fiscal\/api\/confirmar-importacao/i;

  // Nomes legíveis para logging
  const NOME_SITUACAO = { 1: 'orçamento', 2: 'pedido', 3: 'cancelado', 9: 'entregue', 99: 'cancelado' };


  // Estado local removido — o backend é a única fonte da verdade.
  // A extensão envia apenas o que viu; o servidor determina a transição.

  // Cache de filial por pedidoId — necessário para atualizar-situacao (204, sem body)
  const _filialCache = new Map();

  // ── Utilitários ───────────────────────────────────────────────────────────────

  // Usa fetch nativo (salvo antes de qualquer interceptação)
  const _nativeFetch = window.__nativeFetch || window.fetch.bind(window);

  function _log(msg, ...args) {
    console.info(`[HiperSync] ${msg}`, ...args);
  }
  function _warn(msg, ...args) {
    console.warn(`[HiperSync] ⚠️ ${msg}`, ...args);
  }

  function _fetchComTimeout(url, opts = {}) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return _nativeFetch(url, { ...opts, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  /** Extrai params de um body application/x-www-form-urlencoded */
  function _parseFormBody(body) {
    if (!body || typeof body !== 'string') return {};
    const out = {};
    for (const [k, v] of new URLSearchParams(body)) {
      out[k] = v;
    }
    return out;
  }

  /**
   * Extrai itens do body form-urlencoded do Hiper.
   * Campos relevantes por item: IdProduto, NomeProduto, Quantidade, Cancelado
   * Retorna array de { idProduto, nome, quantidade } filtrando cancelados.
   */
  function _extrairItensDoBody(params) {
    const itens = {};

    for (const [chave, valor] of Object.entries(params)) {
      // ex: "ListaItemPedidoVenda[0][IdProduto]" → índice 0, campo IdProduto
      const m = chave.match(/^ListaItemPedidoVenda\[(\d+)\]\[(\w+)\]$/);
      if (!m) continue;
      const idx   = m[1];
      const campo = m[2];
      if (!itens[idx]) itens[idx] = {};
      itens[idx][campo] = valor;
    }

    // Monta índice de nomes por IdProduto usando os itens que têm NomeProduto
    // (o Hiper omite NomeProduto em itens que não foram editados na requisição)
    const nomesPorId = {};
    for (const it of Object.values(itens)) {
      if (it.IdProduto && it.NomeProduto) nomesPorId[it.IdProduto] = it.NomeProduto;
    }

    return Object.values(itens)
      .filter(it => it.Cancelado !== 'true' && it.IdProduto)
      .map(it => {
        const nomeRaw = it.NomeProduto || nomesPorId[it.IdProduto] || '';
        // Extrai código do padrão "3112 - Alçapão..." → "3112"
        const codigoMatch = nomeRaw.match(/^(\S+)\s+-\s+/);
        const vlUnitBruto = parseFloat((it.ValorUnitario || '').replace(',', '.')) || 0;
        return {
          // campos canônicos (ItemPedido)
          idProduto:       String(it.IdProduto),
          idProdutoGrade:  it.IdProdutoGrade ? parseInt(it.IdProdutoGrade, 10) : null,
          codigo:          codigoMatch ? codigoMatch[1] : '',
          nome:            nomeRaw,
          quantidade:      parseFloat(it.Quantidade) || 0,
          unidade:         it.SiglaDaUnidadeDeMedida || 'UN',
          vlUnit:          Math.round(vlUnitBruto * 0.9523 * 100) / 100,
          vlUnitBruto,
          subtotal:        (parseFloat(it.Quantidade) || 0) * vlUnitBruto,
          ehKit:           false,
        };
      })
      .filter(it => it.quantidade > 0);
  }


  /**
   * Registra o evento bruto no histórico do backend.
   * Independente da ação de estoque — garante rastreabilidade completa.
   */
  async function _registrarEvento(evento) {
    // Em vez de fetch direto, envia para o interceptor que tem permissões de extensão
    window.postMessage({ 
      type: 'HIPER_EVENTO_SEND', 
      payload: evento 
    }, '*');
  }
  // ── Ações de estoque ──────────────────────────────────────────────────────────

  // ── Máquina de estados ────────────────────────────────────────────────────────

  /**
   * Processa a transição de estado e executa a ação de estoque correta.
   * É o coração do sistema — toda lógica de negócio passa aqui.
   */
  async function _processarTransicao(pedidoId, _ignorado, estadoNovo, itens, meta) {
    _log(`Evento pedido ${pedidoId}: → ${estadoNovo}`);

    // Atualiza cache mesclando — nunca sobrescreve um campo bom com vazio
    const _existing = _filialCache.get(pedidoId) || {};
    const _merged   = { ..._existing };
    if (meta.responseBody?.idFilial)              _merged.idFilial   = meta.responseBody.idFilial;
    if (meta.responseBody?.nomeFilial)            _merged.nomeFilial = meta.responseBody.nomeFilial;
    if ((meta.responseBody?.valorTotalPedido) > 0) _merged.valorTotal = meta.responseBody.valorTotalPedido;
    _filialCache.set(pedidoId, _merged);
    const filialCached = _merged;

    const evento = {
      pedido_id:        String(pedidoId),
      codigo_pedido:    meta.codigoPedidoVenda || '',
      estado_novo:      estadoNovo,
      itens,
      valor_total:      meta.responseBody?.valorTotalPedido || filialCached.valorTotal || 0,
      id_filial:        meta.responseBody?.idFilial   ?? filialCached.idFilial   ?? null,
      nome_filial:      meta.responseBody?.nomeFilial ?? filialCached.nomeFilial ?? null,
      timestamp:        new Date().toISOString(),
      origem_url:       location.href,
      payload_request:  meta.requestBody  || null,
      payload_response: meta.responseBody || null,
    };

    // O backend determina a transição e executa a ação de estoque.
    // Marca o orçamento customizado como faturado se for → pedido (fire-and-forget).
    // Usa __hiperPedidoAberto (código do orçamento salvo/carregado), não o código do Hiper PV.
    if (estadoNovo === 'pedido' && typeof window._tentarMarcarFaturado === 'function' && window.__hiperPedidoAberto) {
      window._tentarMarcarFaturado(window.__hiperPedidoAberto);
    }

    _registrarEvento(evento);
  }

  // ── Núcleo do interceptor ─────────────────────────────────────────────────────

  /**
   * Ponto de entrada chamado para cada requisição relevante que completou com sucesso.
   *
   * @param {object} p
   *   pedidoId      — ID numérico do pedido (string)
   *   metodo        — 'POST' | 'PUT' | 'DELETE'
   *   requestBody   — body original (string form-urlencoded)
   *   responseBody  — objeto JSON parseado da response (ou null para DELETE)
   *   statusHttp    — código HTTP retornado
   */
  async function _handleRequisicao({ pedidoId, metodo, requestBody, responseBody, statusHttp, situacaoUrl }) {
    // ── Determina estado novo ───────────────────────────────────────────────────
    let estadoNovo;

    if (metodo === 'DELETE' && (statusHttp === 204 || statusHttp === 200)) {
      estadoNovo = 'cancelado';
    } else if (situacaoUrl != null) {
      // PUT .../atualizar-situacao/{cod} — estado vem da URL (response é 204 vazio)
      // Códigos rastreados: 1=orçamento, 2=pedido, 3=cancelado, 99=cancelado (menu rápido)
      // Demais (ex: 9=entregue, faturado, etc.) são ignorados — sem ação de estoque.
      const s = Number(situacaoUrl);
      if      (s === 1) estadoNovo = 'orçamento';
      else if (s === 2) estadoNovo = 'pedido';
      else if (s === 3 || s === 99) estadoNovo = 'cancelado';
      else {
        _log(`atualizar-situacao: código ${s} (${NOME_SITUACAO[s] ?? 'desconhecido'}) para pedido ${pedidoId} — não rastreado, ignorando.`);
        return;
      }
    } else if (responseBody && responseBody.situacao != null) {
      const s = Number(responseBody.situacao);
      if      (s === 1) estadoNovo = 'orçamento';
      else if (s === 2) estadoNovo = 'pedido';
      else {
        _warn(`situacao desconhecida (${s}) para pedido ${pedidoId} — ignorando.`);
        return;
      }
    } else {
      // Sem body e não é DELETE relevante → ignorar (ex: OPTIONS preflight)
      return;
    }


    // ── Extrai itens do request ─────────────────────────────────────────────────
    const params = _parseFormBody(requestBody);
    const itens   = _extrairItensDoBody(params);

    // ── Envia evento para o backend (backend decide a transição e ação) ──────────
    await _processarTransicao(
      pedidoId,
      null,   // estado_anterior não gerenciado pelo cliente
      estadoNovo,
      itens,
      {
        codigoPedidoVenda: responseBody?.codigoPedidoVenda || '',
        requestBody,
        responseBody,
      }
    );
  }


  // ── Interceptação de fetch ────────────────────────────────────────────────────

  function _interceptarFetch() {
  const fetchOriginal = window.__nativeFetch || window.fetch;

  window.fetch = async function (...args) {
    const [input, init] = args;

    const url = typeof input === 'string'
      ? input
      : input?.url || '';

    const metodo = (init?.method || 'GET').toUpperCase();

    console.log('[FETCH] Interceptado:', {
      metodo,
      url,
      body: init?.body
    });

    // Ignora métodos sem alteração
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(metodo)) {
      console.log('[FETCH] Método ignorado:', metodo);
      return fetchOriginal.apply(this, args);
    }

    // =========================
    // GET
    // =========================
    if (metodo === 'GET') {

      console.log('[FETCH][GET] Executando request...');

      const resp = await fetchOriginal.apply(this, args);

      console.log('[FETCH][GET] Status:', resp.status);

      const matchGet = url.match(/api\.hiper\.com\.br\/pedido-venda\/(\d+)(?:[?#]|$)/i);

      console.log('[FETCH][GET] Match regex:', matchGet);

      if (matchGet) {

        const clone = resp.clone();

        (async () => {
          try {

            const body = await clone.json().catch((e) => {
              console.warn('[FETCH][GET] Erro parse JSON:', e);
              return null;
            });

            console.log('[FETCH][GET] Body recebido:', body);

            if (!body?.idPedidoVenda || body.situacao == null) {
              console.warn('[FETCH][GET] Body sem id/situacao');
              return;
            }

            const s = Number(body.situacao);

            const estado =
              s === 1 ? 'orçamento'
              : s === 2 ? 'pedido'
              : null;

            console.log('[FETCH][GET] Estado detectado:', estado);

            if (estado) {
              // GET captura estado atual — garante existência do registro no backend.
              // Itens ficam vazios (não disponíveis no GET); idempotência no servidor
              // garante que ops já corretas não são alteradas.
              await _processarTransicao(
                String(body.idPedidoVenda),
                null,
                estado,
                [],
                {
                  codigoPedidoVenda: body.codigoPedidoVenda || '',
                  requestBody:       null,
                  responseBody:      body,
                }
              );
            }

          } catch (e) {
            console.warn('[FETCH][GET] Erro geral:', e);
          }
        })();

        return resp;
      }

      console.log('[FETCH][GET] URL não corresponde ao pedido-venda');

      return resp;
    }

    // ── Confirmação de NF-e → entrada de estoque ─────────────────────────────
    if (metodo === 'POST' && RE_CONFIRMAR_IMPORTACAO.test(url)) {
      _log('confirmar-importacao interceptada via fetch, aguardando resposta...');
      const response = await fetchOriginal.apply(this, args);
      _log('confirmar-importacao respondeu — status:', response.status);
      if (response.ok) {
        (async () => {
          try {
            const bodyStr = typeof init?.body === 'string' ? init.body : null;
            if (!bodyStr) { _warn('confirmar-importacao: body não é string'); return; }
            const body  = JSON.parse(bodyStr);
            const itens = (body.SugestoesDeProduto || [])
              .filter(p => p.IdProduto && p.Quantidade > 0)
              .map(p => ({
                idProduto: String(p.IdProduto),
                nome:      p.NomeProdutoGrade || '',
                unidade:   p.SiglaUnidadeMedida || 'UN',
                qtd:       p.Quantidade,
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
          } catch (e) {
            _warn('Erro ao processar confirmar-importacao:', e);
          }
        })();
      }
      return response;
    }

    // =========================
    // POST / PUT / DELETE
    // =========================

    const match = url.match(RE_PEDIDO_VENDA);

    console.log('[FETCH] Match RE_PEDIDO_VENDA:', match);

    if (!match) {
      console.log('[FETCH] URL ignorada');
      return fetchOriginal.apply(this, args);
    }

    console.log('[FETCH] Executando request original...');

    const response = await fetchOriginal.apply(this, args);

    console.log('[FETCH] Response status:', response.status);

    const responseClone = response.clone();

    ;(async () => {
      try {

        let pedidoId     = match[1] || null;
        const situacaoUrl = match[2] != null ? match[2] : null;

        console.log('[FETCH] pedidoId inicial:', pedidoId, '| situacaoUrl:', situacaoUrl);

        // atualizar-situacao (PUT sem body) já é capturado de forma confiável
        // pelo chrome.webRequest em background.js (mensagem HIPER_ATUALIZAR_SITUACAO_PAGE,
        // ver listener no fim deste arquivo). Processar de novo aqui envia o
        // mesmo evento duas vezes ao backend — causa raiz de pedidos duplicados
        // no estoque (faturamento aplicado 2x para o mesmo op_id).
        if (situacaoUrl != null) {
          console.log('[FETCH] atualizar-situacao — ignorado aqui, tratado via background bridge.');
          return;
        }

        const contentType =
          responseClone.headers.get('content-type') || '';

        console.log('[FETCH] content-type:', contentType);

        const temJson =
          contentType.includes('application/json');

        console.log('[FETCH] temJson:', temJson);

        const responseBody =
          temJson && responseClone.status !== 204
            ? await responseClone.json().catch((e) => {
                console.warn('[FETCH] Erro parse response JSON:', e);
                return null;
              })
            : null;

        console.log('[FETCH] responseBody:', responseBody);

        if (!pedidoId && responseBody?.idPedidoVenda) {
          pedidoId = String(responseBody.idPedidoVenda);

          console.log('[FETCH] pedidoId obtido da response:', pedidoId);
        }

        if (!pedidoId) {
          console.warn('[FETCH] Não encontrou pedidoId');
          return;
        }

        if (responseClone.status < 200 || responseClone.status >= 300) {
          console.warn('[FETCH] Status ignorado:', responseClone.status);
          return;
        }

        const requestBody =
          typeof init?.body === 'string'
            ? init.body
            : null;

        console.log('[FETCH] requestBody:', requestBody);

        console.log('[FETCH] Chamando _handleRequisicao...');

        await _handleRequisicao({
          pedidoId,
          metodo,
          requestBody,
          responseBody,
          statusHttp:   responseClone.status,
          situacaoUrl,
        });

        console.log('[FETCH] _handleRequisicao concluído');

      } catch (e) {
        console.warn('[FETCH] Erro interceptor:', e);
      }
    })();

    return response;
  };

  console.log('[FETCH] Interceptor instalado com sucesso.');
  }

  // ── Interceptação de XHR ──────────────────────────────────────────────────────

  function _interceptarXHR() {
    const XHROriginal = window.XMLHttpRequest;

    function XHRProxy() {
      const xhr       = new XHROriginal();
      let _url        = '';
      let _metodo     = 'GET';
      let _requestBody = null;

      const openOriginal = xhr.open.bind(xhr);
      xhr.open = function (method, url, ...rest) {
        _metodo = (method || 'GET').toUpperCase();
        _url    = url;
        return openOriginal(method, url, ...rest);
      };

      const sendOriginal = xhr.send.bind(xhr);
      xhr.send = function (body) {
        _requestBody = typeof body === 'string' ? body : null;

        // Preço de tabela: mesma checagem do fetch, para o caminho XHR

        if (['POST', 'PUT', 'DELETE'].includes(_metodo) && RE_PEDIDO_VENDA.test(_url)) {
          xhr.addEventListener('load', async function () {
            try {
              const match = _url.match(RE_PEDIDO_VENDA);
              if (!match) return;

              let pedidoId     = match[1] || null;
              const situacaoUrl = match[2] != null ? match[2] : null;

              // atualizar-situacao já é tratado via background bridge (webRequest) —
              // ver comentário equivalente em _interceptarFetch.
              if (situacaoUrl != null) {
                _log('[XHR] atualizar-situacao — ignorado aqui, tratado via background bridge.');
                return;
              }

              let responseBody  = null;

              try {
                responseBody = JSON.parse(xhr.responseText);
              } catch (_) { /* DELETE 204 não tem body */ }

              if (!pedidoId && responseBody?.idPedidoVenda) {
                pedidoId = String(responseBody.idPedidoVenda);
              }

              if (!pedidoId) return;
              if (xhr.status < 200 || xhr.status >= 300) return;

              await _handleRequisicao({
                pedidoId,
                metodo:       _metodo,
                requestBody:  _requestBody,
                responseBody,
                statusHttp:   xhr.status,
                situacaoUrl,
              });
            } catch (e) {
              _warn('Erro no interceptor XHR:', e);
            }
          });
        }

        if (_metodo === 'POST' && RE_CONFIRMAR_IMPORTACAO.test(_url)) {
          xhr.addEventListener('load', async function () {
            try {
              _log('confirmar-importacao interceptada via XHR — status:', xhr.status);
              if (xhr.status < 200 || xhr.status >= 300) return;
              if (!_requestBody) { _warn('confirmar-importacao XHR: body vazio'); return; }
              const body  = JSON.parse(_requestBody);
              const itens = (body.SugestoesDeProduto || [])
                .filter(p => p.IdProduto && p.Quantidade > 0)
                .map(p => ({
                  idProduto: String(p.IdProduto),
                  nome:      p.NomeProdutoGrade || '',
                  unidade:   p.SiglaUnidadeMedida || 'UN',
                  qtd:       p.Quantidade,
                }));
              if (!itens.length) { _warn('confirmar-importacao XHR: nenhum item'); return; }
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
            } catch (e) {
              _warn('Erro no interceptor XHR confirmar-importacao:', e);
            }
          });
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

    _log('Interceptor XHR instalado.');
  }

  // ── Inicialização ─────────────────────────────────────────────────────────────

  function _init() {
    _interceptarFetch();
    _interceptarXHR();
    _log('✅ Módulo de sincronização ativo. API:', API_BASE);
  }

  // Executa imediatamente — content script roda antes do Hiper
  _init();

  // ── Escuta eventos do background (via interceptor.js) ────────────────────────
  // O background detecta atualizar-situacao via webRequest e notifica o content
  // script, que repassa aqui via postMessage.
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const msg = ev.data;
    if (msg?.type !== 'HIPER_ATUALIZAR_SITUACAO_PAGE') return;

    const { pedidoId, situacaoCod } = msg;
    _log(`atualizar-situacao recebido do background: pedido=${pedidoId} cod=${situacaoCod}`);

    _handleRequisicao({
      pedidoId:     String(pedidoId),
      metodo:       'PUT',
      requestBody:  null,
      responseBody: null,
      statusHttp:   204,
      situacaoUrl:  String(situacaoCod),
    });
  });

  // Expõe utilitários de diagnóstico no console
  window.__hiperSync = {
    /** Força envio manual de um evento para um pedido (debug) */
    enviar: async (pedidoId, estadoNovo, itens) => {
      await _processarTransicao(String(pedidoId), null, estadoNovo, itens || [], {});
    },
  };

})();