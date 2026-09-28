// ═══════════════════════════════════════════════════════════════════════════════
// hiper-db.js — Integração com banco de dados local (Oracle Cloud)
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Captura o parâmetro recuperar= IMEDIATAMENTE — antes do SPA reescrever a URL.
  // Aceita a URL nova (/vendas/pedido-de-venda/cadastro?recuperar=X) e a
  // antiga, com o parâmetro dentro do hash (/v1/#/pedido-venda/novo?recuperar=X),
  // que ainda é o formato dos links já enviados.
  ;(function() {
    const search = new URLSearchParams(location.search);
    const [hashBase, hashQuery = ''] = location.hash.split('?');
    const hashParams = new URLSearchParams(hashQuery);
    const cod = search.get('recuperar') || hashParams.get('recuperar');
    if (cod) {
      window.__hiperRecuperarCodigo = cod.trim().toUpperCase();
      // Remove o parâmetro da URL: senão um F5 re-dispararia a auto-recuperação
      // por cima do pedido em edição.
      search.delete('recuperar');
      hashParams.delete('recuperar');
      const q = search.toString(), h = hashParams.toString();
      history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + hashBase + (h ? '?' + h : ''));
    }
  })();

  const API_BASE   = 'https://api.sistema.santin.tec.br';
  const TIMEOUT_MS = 4000;

  // ── Utilitários ──────────────────────────────────────────────────────────────

  const _nativeFetch = window.__nativeFetch || window.fetch.bind(window);

  function fetchComTimeout(url, opts) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return _nativeFetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  function getVendedor() {
    try {
      const v = (window.__hiperVendedor?.text || '').trim();
      if (!v) console.warn('[HiperDB] ⚠️ Vendedor vazio ao salvar pedido — verifique se o nome foi configurado no popup.');
      return v;
    } catch(e) { return ''; }
  }

  // Delega à função global definida em hiper-orcamento.js (única fonte da verdade).
  function getNumeroOrcamento() {
    try {
      if (window.__hiperNumeroOrcamentoAtual) {
        return window.__hiperNumeroOrcamentoAtual;
      }
      console.warn('[HiperDB] Número de orçamento ainda não foi gerado no fluxo atual');
      return '';
    } catch (e) {
      return '';
    }
  }

  // ── Serialização dos kits ativos ──────────────────────────────────────────────
  // Converte o Map kitsAtivos (kit.js) num array serializável.
  // NÃO salva referências ao DOM ($linha) — apenas os parâmetros de entrada.
  function serializarKits() {
    const kitsAtivos = window.kitsAtivos;
    if (!kitsAtivos?.size) return [];

    const resultado = [];

    kitsAtivos.forEach((estado, id) => {
      if (estado.tipo === 'portas') {
        resultado.push({
          id,
          tipo:   'portas',
          grupos: (estado.grupos || []).map(g => ({
            id:   g.id,
            qtd:  g.qtd,
            larg: g.larg,
            alt:  g.alt,
          })),
        });

      } else if (estado.tipo === 'parede') {
        resultado.push({
          id,
          tipo:   'parede',
          cfg:    { ...estado.cfg },
          A:      estado.A    || 0,
          margem: estado.margem != null ? estado.margem : 0,
        });

      } else {
        // kit normal: aramado, estruturado, cortineiro…
        const nomeKit = estado.nomeKit ?? id;
        const entry = {
          id,
          tipo:    'kit',
          nomeKit,
          A:       estado.A      || 0,
          P:       estado.P      || 0,
          altPend: estado.altPend ?? 0.6,
          margem:  estado.margem != null ? estado.margem : 0,
        };
        // cant é exclusivo do cortineiro (sanca) — não serializar nos demais
        if (nomeKit === 'cortineiro') entry.cant = estado.cant ?? 3.15;
        resultado.push(entry);
      }
    });

    return resultado;
  }

  // ── Fila de retries pendentes ─────────────────────────────────────────────────
  // Map<codigo, timeoutId> — garante no máximo 1 retry agendado por código.
  // Se o mesmo código for enviado de novo antes do retry disparar, o timer
  // antigo é cancelado e o novo envio ocorre imediatamente (preserva a ordem).

  const _retrysPendentes = new Map();
  const RETRY_DELAY_MS   = 15_000; // 15 s antes de tentar novamente

  function _cancelarRetry(codigo) {
    if (_retrysPendentes.has(codigo)) {
      clearTimeout(_retrysPendentes.get(codigo));
      _retrysPendentes.delete(codigo);
      console.info(`[HiperDB] 🔄 Retry cancelado para ${codigo} — novo envio imediato.`);
    }
  }

  function _agendarRetry(codigo, payload) {
    _cancelarRetry(codigo); // nunca empilha dois retries do mesmo código
    const id = setTimeout(async () => {
      _retrysPendentes.delete(codigo);
      console.info(`[HiperDB] 🔁 Retry disparado para ${codigo}…`);
      await _enviarPayload(codigo, payload, /* isRetry */ true);
    }, RETRY_DELAY_MS);
    _retrysPendentes.set(codigo, id);
    console.info(`[HiperDB] ⏳ Retry agendado para ${codigo} em ${RETRY_DELAY_MS / 1000}s.`);
  }

  // ── Toast de status do envio ──────────────────────────────────────────────────
  // Manda postMessage pra janela blob (guardada em window.__hiperBlobWindow por
  // hiper-orcamento.js). O listener dentro do blob renderiza o toast lá.

  function _mostrarToastEnvio(codigo, estado) {
    const blobWin = window.__hiperBlobWindow;
    if (!blobWin || blobWin.closed) return;
    blobWin.postMessage({ type: 'HIPER_DB_TOAST', codigo, estado }, '*');
  }

    // ── Envio atômico (usado tanto no envio inicial quanto no retry) ──────────────

  async function _enviarPayload(codigo, payload, isRetry = false) {
    _mostrarToastEnvio(codigo, 'enviando');
    try {
      const res = await fetchComTimeout(`${API_BASE}/pedido`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        console.info(`[HiperDB] ✅ Pedido ${codigo} salvo${isRetry ? ' (retry)' : ''} (${payload.kits?.length ?? 0} kit(s)).`);
        _mostrarToastEnvio(codigo, 'ok');
        return true;
      }

      // Erro HTTP — agenda retry (o servidor pode estar sobrecarregado)
      console.warn(`[HiperDB] ⚠️ Servidor retornou ${res.status} para ${codigo}${isRetry ? ' (retry)' : ''} — agendando nova tentativa.`);
      _mostrarToastEnvio(codigo, 'retry');
      _agendarRetry(codigo, payload);
      return false;

    } catch (e) {
      // Falha de rede / timeout
      console.info(`[HiperDB] 📡 API indisponível para ${codigo}${isRetry ? ' (retry)' : ''} — agendando nova tentativa.`);
      _mostrarToastEnvio(codigo, 'retry');
      _agendarRetry(codigo, payload);
      return false;
    }
  }

  // ── Salvar pedido na API ──────────────────────────────────────────────────────

  async function salvarPedido(codigo, dados) {
    if (!codigo) {
      console.warn('[HiperDB] ❌ Código vazio');
      return;
    }

    if (!dados?.itens?.length) {
      console.warn('[HiperDB] ❌ Nenhum item encontrado para salvar', dados);
      return;
    }

    // Se havia retry pendente para este código, cancela — este envio é o mais recente
    _cancelarRetry(codigo);

    const kits = serializarKits();

    const payload = {
      codigo,
      vendedor:  getVendedor(),
      total:     dados.total     || 0,
      desconto:  dados.desconto  || 0,
      parcelas:  dados.parcelas  || 1,
      cliente:   dados.cliente   || '',
      descricao: dados.descricao || '',
      itens: dados.itens.map(it => ({
        idProduto:       it.idProduto      || null,
        idProdutoGrade:  it.idProdutoGrade ?? null,
        codigo:          it.codigo         || null,
        nome:            it.nome,
        quantidade:      it.qtd ?? it.quantidade ?? 0,   // aceita legado 'qtd' e novo 'quantidade'
        unidade:         it.unidade        || 'UN',
        vlUnit:          it.vlUnit         || 0,
        vlUnitBruto:     it.vlUnitBruto    ?? it.vlUnit ?? 0,
        subtotal:        it.subtotal != null ? it.subtotal : (it.qtd ?? it.quantidade ?? 0) * (it.vlUnit || 0),
        precoVendaFinal: it.precoVendaFinal ?? null,
        ehKit:           it.ehKit          ?? false,
      })),
      kits,
    };

    await _enviarPayload(codigo, payload);
  }

  // ── Save público — chamado pelos botões da janela do orçamento ───────────────
  // hiper-orcamento.js chama window.__hiperDBSave(codigo, dados) em cada um
  // dos 4 botões (Imprimir, Copiar WhatsApp, Baixar PDF, Resumido).

  window.__hiperDBSave = function(codigo, dados) {
    if (codigo && dados) {
      // Mantém __hiperPedidoAberto sincronizado para que faturarOrcamentoAtual()
      // funcione tanto em orçamentos novos quanto em recuperados do banco.
      window.__hiperPedidoAberto = codigo;
      salvarPedido(codigo, dados);
    }
  };

  // ── Marcar orçamento como faturado (estatística) ─────────────────────────────
  // Fire-and-forget: falha silenciosa se o pedido não existir no banco
  // (caso de vendas diretas que nunca viraram orçamento salvo).
  async function _tentarMarcarFaturado(codigo) {
    if (!codigo) return;
    const totalAtual = window.__hiperPedido?.descontos()?.totalDoPedido ?? 0;

    try {
      const res = await fetchComTimeout(`${API_BASE}/pedido/${encodeURIComponent(codigo)}/faturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_atual: totalAtual }),
      });
      if (res.ok) {
        console.info(`[HiperDB] ✅ Orçamento ${codigo} marcado como faturado.`);
      } else if (res.status === 404) {
        console.info(`[HiperDB] ℹ️ Pedido ${codigo} não existe no banco (venda direta) — faturamento estatístico ignorado.`);
      } else if (res.status === 409) {
        console.info(`[HiperDB] ℹ️ Pedido ${codigo} já estava marcado como faturado.`);
      } else {
        console.warn(`[HiperDB] ⚠️ Faturar ${codigo} retornou ${res.status}.`);
      }
    } catch (e) {
      console.warn('[HiperDB] ⚠️ Erro ao marcar faturado (não bloqueia estoque):', e);
    }
  }



  // ── Recuperação de pedido ─────────────────────────────────────────────────────

  async function recuperarPedido(codigo) {
    codigo = codigo.trim().toUpperCase();
    const res = await fetchComTimeout(`${API_BASE}/pedido/${encodeURIComponent(codigo)}`, {});
    if (!res.ok) {
      if (res.status === 404) throw new Error(`Pedido "${codigo}" não encontrado.`);
      throw new Error(`Erro ${res.status} ao buscar pedido.`);
    }
    return res.json();
  }

  // ── Restaurar itens no pedido (sem recalcular via fórmulas) ──────────────────
  // Insere cada item pela store Pinia do microfrontend (__hiperPedido.novaLinha,
  // ver hiper-pedido-store.js) com a quantidade final gravada no banco — nunca
  // chama recalcularTudo(). O preço é o ATUAL do produto; a diferença pro total
  // salvo vira desconto em aplicarTotalSalvo().

  const delay = ms => new Promise(r => setTimeout(r, ms));

  function _storeProdutos() {
    return window.__hiperPedido?.produtos() ?? null;
  }

  // Devolve os linhaIds criados (na ordem dos itens; null pro que falhou).
  async function restaurarItens(itens) {
    if (!itens?.length) return [];
    const store = _storeProdutos();
    if (!store || !window.__hiperPedido?.obterProduto) {
      console.warn('[HiperDB] Store do pedido não encontrada — itens não restaurados.');
      return [];
    }

    const produtos = await Promise.all(itens.map(it =>
      it.idProduto ? window.__hiperPedido.obterProduto(it.idProduto) : Promise.resolve(null)));

    const linhaIds = itens.map((it, i) => {
      if (!produtos[i]) {
        console.warn(`[HiperDB] Produto não encontrado para item "${it.nome}" (id ${it.idProduto}) — ignorado.`);
        return null;
      }
      return window.__hiperPedido.novaLinha(produtos[i], Number(it.quantidade ?? it.qtd) || 0);
    });
    window.__hiperPedido.removerLinhasVazias();

    const ok = linhaIds.filter(Boolean).length;
    console.info(`[HiperDB] ✅ ${ok}/${itens.length} item(ns) restaurado(s) no pedido.`);
    return linhaIds;
  }

  // ── Restaurar kits (sem recalcular — usa quantidades do banco) ────────────────
  // Recria cada entrada no kitsAtivos e monta o painel de UI, mas NÃO chama
  // recalcularTudo(). As quantidades dos itens já foram preenchidas por
  // restaurarItens() com os valores finais gravados no banco.

  function restaurarKits(kits, linhaIds) {
    if (!kits?.length) return;

    const kitsAtivos = window.kitsAtivos;
    if (!kitsAtivos) {
      console.warn('[HiperDB] kitsAtivos não disponível — kits não restaurados.');
      return;
    }

    const linhasResolver = _resolvedorDeLinhas(linhaIds);

    for (const kit of kits) {
      if (kit.tipo === 'parede') {
        const linhasDoKit = linhasResolver(window.paredeCodigosAtivos?.(kit.cfg) ?? []);
        kitsAtivos.set(kit.id, {
          tipo:        'parede',
          cfg:         { ...kit.cfg },
          A:           kit.A      || 0,
          margem:      kit.margem || 0,
          montante:    _tamanhoMontante(linhasDoKit),
          _restaurado: true,
          linhas:      linhasDoKit,
        });

      } else if (kit.tipo === 'portas') {
        kitsAtivos.set(kit.id, {
          tipo:        'portas',
          nomeKit:     'portas',
          A:           0,
          grupos:      (kit.grupos || []).map(g => ({ ...g })),
          _restaurado: true,
          linhas:      linhasResolver(window.KITS_GESSO?.portas ?? []),
        });

      } else {
        // kit normal
        const estadoKit = {
          tipo:        'kit',
          nomeKit:     kit.nomeKit,
          A:           kit.A       || 0,
          P:           kit.P       || 0,
          altPend:     kit.altPend ?? 0.6,
          margem:      kit.margem  || 0,
          _restaurado: true,
          linhas:      linhasResolver(window.KITS_GESSO?.[kit.nomeKit] ?? []),
        };
        // cant é exclusivo do cortineiro (sanca)
        if (kit.nomeKit === 'cortineiro') estadoKit.cant = kit.cant ?? 3.15;
        kitsAtivos.set(kit.id, estadoKit);
      }
    }

    // Atualiza o painel de UI sem recalcular quantidades
    if (typeof window.renderizarPainel === 'function') {
      window.renderizarPainel();
    }

    console.info(`[HiperDB] ✅ ${kits.length} kit(s) restaurado(s) no painel.`);
  }

  // Liga cada código de um kit à linha restaurada que tem esse produto — ou
  // um equivalente (tier de embalagem, montante 48/90, tabica natural…), já que
  // o banco guarda o produto final da linha, não o código base do kit.
  // Montante/guia (BLACKLIST no kit.js) são uma linha por parede: uma linha
  // desses já ligada a um kit não é reaproveitada pelo próximo.
  function _resolvedorDeLinhas(linhaIds) {
    const store = _storeProdutos();
    const itens = (linhaIds || [])
      .filter(Boolean)
      .map(id => store?.itens.find(i => i.id === id))
      .filter(Boolean);
    const equivalentes = window.codigosEquivalentes ?? (c => new Set([String(c)]));
    const exclusivos   = new Set([
      ...Object.values(window.COD_MONTANTE ?? {}),
      ...Object.values(window.COD_GUIA ?? {}),
    ]);
    const usadas = new Set();

    return (codigos) => codigos.map(codigo => {
      const familia = equivalentes(codigo);
      const item = itens.find(i =>
        familia.has(String(i.idProdutoHiperOnline)) &&
        !(exclusivos.has(String(i.idProdutoHiperOnline)) && usadas.has(i.id)));
      if (!item) return null;
      const atual = String(item.idProdutoHiperOnline);
      if (exclusivos.has(atual)) usadas.add(item.id);
      // Tiers de embalagem ficam com o código base (as fórmulas e o
      // resolverNivel partem dele); montante/guia/tabica ficam com o código
      // real da linha (os toggles do painel e as fórmulas conhecem todos).
      const ehTier = window.CODIGO_PARA_GRUPO?.[atual] != null;
      return { codigo: ehTier ? String(codigo) : atual, linhaId: item.id };
    }).filter(Boolean);
  }

  function _tamanhoMontante(linhasDoKit) {
    const porCodigo = Object.fromEntries(Object.entries(window.COD_MONTANTE ?? {}).map(([t, c]) => [c, t]));
    return linhasDoKit.map(l => porCodigo[l.codigo]).find(Boolean) ?? '70';
  }

  // ── Fecha no total salvo via desconto ─────────────────────────────────────────
  // Os preços do Hiper podem ter mudado desde que o orçamento foi salvo. Se
  // alguma linha estiver com atualização de preço em andamento
  // (isLoadingPrecoDeVenda), espera terminar; depois aplica a diferença como
  // desconto pelo próprio rateio do Hiper (store de descontos).
  async function aplicarTotalSalvo(totalSalvo, linhaIds, timeout = 10000) {
    const store     = _storeProdutos();
    const descontos = window.__hiperPedido?.descontos();
    if (!store || !descontos || !(totalSalvo > 0)) return;

    const ids = new Set((linhaIds || []).filter(Boolean));
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      if (!store.itens.some(i => ids.has(i.id) && i.isLoadingPrecoDeVenda)) break;
      await delay(100);
    }

    const totalAtual = descontos.totalProdutos;
    const diff = Math.round((totalAtual - totalSalvo) * 100) / 100;
    if (Math.abs(diff) <= 0.01) {
      console.info('[HiperDB] Totais idênticos — nenhum desconto necessário.');
    } else if (diff > 0) {
      descontos.setValorDeDesconto(diff);
      console.info(`[HiperDB] Desconto aplicado: total atual R$ ${totalAtual.toFixed(2)} → final R$ ${totalSalvo.toFixed(2)} (diff R$ ${diff.toFixed(2)})`);
    } else {
      console.warn(`[HiperDB] Total atual R$ ${totalAtual.toFixed(2)} é MENOR que o salvo R$ ${totalSalvo.toFixed(2)} — preços caíram; nenhum desconto aplicado.`);
    }
  }

  // ── Toast de confirmação (sem confirm() bloqueante) ───────────────────────────
  function mostrarConfirmacaoImportacao(pedido) {
    return new Promise(resolve => {
      const totalFmt = pedido.total.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });

      const nItens = pedido.itens.length;
      const descricaoHtml = pedido.descricao
        ? `<div style="background:#f6f7f9;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;color:#444;line-height:1.5;word-break:break-word;"><div style="font-size:11px;color:#888;margin-bottom:4px;">Observações</div><div style="white-space:pre-wrap;">${pedido.descricao.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></div>`
        : '';

      const overlay = document.createElement('div');
      overlay.style.cssText = `
        outline: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.25);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
      `;

      const box = document.createElement('div');
      box.style.cssText = `
        background: #fff;
        border-radius: 14px;
        padding: 22px 24px;
        width: 320px;
        box-shadow: 0 10px 30px rgba(0,0,0,.15);
        font-family: sans-serif;
        animation: fadeIn .2s ease;
      `;

      box.innerHTML = `
        <div style="font-size:13px;color:#888;margin-bottom:6px;">
          Confirmar importação
        </div>

        <div style="font-size:18px;font-weight:600;margin-bottom:14px;">
          ${pedido.codigo}
        </div>

        <div style="display:flex;gap:10px;margin-bottom:14px;">
          <div style="flex:1;background:#f6f7f9;border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:#888;">Total</div>
            <div style="font-size:15px;font-weight:500;">${totalFmt}</div>
          </div>

          <div style="flex:1;background:#f6f7f9;border-radius:8px;padding:10px;">
            <div style="font-size:11px;color:#888;">Itens</div>
            <div style="font-size:15px;font-weight:500;">${nItens}</div>
          </div>
        </div>

        ${descricaoHtml}

        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="cancelar"
            style="padding:6px 12px;border:none;background:#eee;border-radius:6px;cursor:pointer;">
            Cancelar
          </button>

          <button id="confirmar"
            style="padding:6px 12px;border:none;background:#2563eb;color:#fff;border-radius:6px;cursor:pointer;">
            Importar
          </button>
        </div>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);
      overlay.tabIndex = -1;
      overlay.focus();

      const btnConfirmar = box.querySelector('#confirmar');
      const btnCancelar  = box.querySelector('#cancelar');

      // 🔥 move o foco pro botão confirmar
      setTimeout(() => btnConfirmar.focus(), 0);

      // 🔥 trata teclado dentro do modal
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnConfirmar.click();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          btnCancelar.click();
        }
      });

      const fechar = (res) => {
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          resolve(res);
        }, 200);
      };

      box.querySelector('#cancelar').onclick = () => fechar(false);
      box.querySelector('#confirmar').onclick = () => fechar(true);
    });
  }

    function mostrarToastRecuperacao(pedido) {
      const el = document.createElement('div');

      el.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #fff;
        color: #111;
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 13px;
        font-family: sans-serif;
        border: 1px solid rgba(0,0,0,.08);
        box-shadow: 0 6px 18px rgba(0,0,0,.10);
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        transform: translateY(10px) scale(.98);
        transition: all .25s ease;
        z-index: 99999;
      `;

      el.innerHTML = `
        <span style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:18px;
          height:18px;
          border-radius:50%;
          background:#e8f0fe;
          color:#1a56db;
          font-size:12px;
          font-weight:600;
        ">✓</span>

        <span>
          Orçamento <strong>${pedido.codigo}</strong> carregado
        </span>
      `;

      document.body.appendChild(el);

      // anima entrada
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0) scale(1)';
      });

      // saída
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px) scale(.98)';
        setTimeout(() => el.remove(), 250);
      }, 2200);
    }

  // ── Repovoar pedido (sem confirm/alert bloqueante) ────────────────────────────

  async function repovoarPedido(pedido) {
    const linhaIds = await restaurarItens(pedido.itens);

    if (pedido.kits?.length) {
      restaurarKits(pedido.kits, linhaIds);
    }

    await aplicarTotalSalvo(pedido.total, linhaIds);

    mostrarToastRecuperacao(pedido);
    window.__hiperPedidoAberto = pedido.codigo;
    console.info(`[HiperDB] 📂 Pedido aberto: ${pedido.codigo}`);
  }

  // ── Cria o painel de recuperação ──────────────────────────────────────────────

  // Uma linha só, logo abaixo do "Gerar orçamento": [ T1234 ][Carregar][📋].
  // O placeholder usa a letra configurada no popup. Códigos têm até 6 dígitos
  // hoje; o input comporta letra + 8 com folga. Se a coluna ficar estreita,
  // o flex-wrap joga o botão pra linha de baixo. A mensagem de status ocupa
  // uma linha própria e só aparece quando tem texto.
  function criarPainelRecuperacao() {
    const letra = window.__hiperOrcLetra || 'T';
    const painel = document.createElement('div');
    painel.id = 'hiper-painel-recuperar';
    painel.style.cssText = 'display:flex;flex-wrap:wrap;align-items:stretch;gap:6px;width:100%;box-sizing:border-box;';
    painel.innerHTML = `
      <input id="hiper-rec-codigo" type="text" placeholder="${letra}1234" maxlength="11"
        autocomplete="off" spellcheck="false" title="Código do orçamento a recuperar"
        style="flex:1 1 11ch;min-width:11ch;height:35px;box-sizing:border-box;padding:0 10px;border:1px solid #cfd4da;border-radius:4px;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;"/>
      <button id="hiper-rec-btn" type="button"
        style="flex:0 0 auto;height:35px;padding:0 14px;background:#f57f17;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">
        Carregar
      </button>
      <a id="hiper-rec-lista" href="https://sistema.santin.tec.br/" target="_blank" title="Lista de orçamentos"
        style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:35px;height:35px;background:#1e4a7a;border-radius:4px;font-size:15px;text-decoration:none;">
        📋
      </a>
      <span id="hiper-rec-msg" style="flex:1 0 100%;display:none;font-size:12px;color:#888;"></span>
    `;

    const inp = painel.querySelector('#hiper-rec-codigo');
    const btn = painel.querySelector('#hiper-rec-btn');
    const msg = painel.querySelector('#hiper-rec-msg');

    function status(texto, cor) {
      msg.textContent   = texto;
      msg.style.color   = cor;
      msg.style.display = texto ? '' : 'none';
    }

    async function carregar(codigoForcado) {
      const codigo = (codigoForcado || inp.value).trim().toUpperCase();
      if (!codigo) return;
      inp.value    = codigo;
      btn.disabled = true;
      btn.style.opacity = '0.6';
      status('Buscando...', '#888');
      try {
        const pedido = await recuperarPedido(codigo);
        const confirmou = await mostrarConfirmacaoImportacao(pedido);
        if (!confirmou) {
          status('Importação cancelada', '#999');
          return;
        }

        const nKits = pedido.kits?.length ? ` + ${pedido.kits.length} kit(s)` : '';
        status(`✅ ${pedido.itens.length} itens${nKits}`, '#1a7a1a');
        await repovoarPedido(pedido);
      } catch(e) {
        status(e.message || 'Erro ao buscar.', '#c00');
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    }

    btn.addEventListener('click', () => carregar());
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') carregar(); });

    // ── Auto-recuperar: usa código capturado no topo do módulo ─────────────────
    // Espera o microfrontend terminar de subir (token da API disponível) e dá
    // uma folga pra inicialização do cadastro não sobrescrever os itens.
    if (window.__hiperRecuperarCodigo) {
      const _tentarAutoRecuperar = async () => {
        const codigo = window.__hiperRecuperarCodigo;
        window.__hiperRecuperarCodigo = null;
        let t = 0;
        while (!window.__hiperPedido?.store('general')?.token && t++ < 50) await delay(200);
        await delay(500);
        carregar(codigo);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _tentarAutoRecuperar);
      else _tentarAutoRecuperar();
    }

    console.info('[HiperDB] ✅ Painel de recuperação criado.');
    return painel;
  }

  (function _registrarDB() {
    function _registrar() {
      if (window.__hiperUI) {
        // Logo abaixo do botão "Gerar orçamento" (hiper-orcamento.js); espera
        // ele estar montado pra não cair antes dele no menu lateral.
        window.__hiperUI.registrar({
          id: 'hiper-painel-recuperar', ordem: 10, render: criarPainelRecuperacao,
          alvo: () => {
            const btnOrc = document.getElementById('hiper-btn-orcamento');
            return btnOrc ? { parent: btnOrc.parentElement, ref: btnOrc.nextSibling } : null;
          },
        });
      } else {
        setTimeout(_registrar, 50);
      }
    }
    _registrar();
  })();

  // ── Saída de estoque por orçamento customizado ────────────────────────────────
  // Chamado pela janela blob via window.opener.__hiperRemoverEstoque(codigo, itens).
  // Faz POST /api/saida-estoque diretamente (CORS liberado para tagdrywall.hiper.com.br).
  // Envia toast de feedback para a janela blob via HIPER_DB_TOAST.

  window.__hiperRemoverEstoque = async function(codigo, itens) {
    if (!codigo || !itens?.length) return { ok: false, erro: 'Dados inválidos.' };

    const blobWin = window.__hiperBlobWindow;
    const _toast  = (estado) => {
      if (blobWin && !blobWin.closed)
        blobWin.postMessage({ type: 'HIPER_DB_TOAST', codigo, estado }, '*');
    };

    _toast('enviando');

    const payload = {
      codigo_orcamento: codigo,
      itens: itens.map(it => ({
        idProduto: String(it.idProduto || it.codigo || ''),
        nome:      it.nome     || '',
        unidade:   it.unidade  || 'UN',
        qtd:       Number(it.qtd ?? it.quantidade ?? 0),
      })).filter(it => it.idProduto && it.qtd > 0),
    };

    try {
      const res  = await fetchComTimeout(`${API_BASE}/saida-estoque`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        console.info(`[HiperDB] ✅ Saída ${codigo} registrada — ${data.movimentos} produto(s).`);
        _toast('ok');
        return { ok: true, data };
      }

      const msg = data?.detail || `Erro ${res.status}`;
      console.warn(`[HiperDB] ⚠️ Saída ${codigo} recusada: ${msg}`);
      if (blobWin && !blobWin.closed)
        blobWin.postMessage({ type: 'HIPER_SAIDA_ERRO', codigo, msg }, '*');
      return { ok: false, erro: msg };

    } catch (e) {
      console.warn('[HiperDB] ❌ Falha ao registrar saída:', e);
      if (blobWin && !blobWin.closed)
        blobWin.postMessage({ type: 'HIPER_SAIDA_ERRO', codigo, msg: 'Sem conexão com o servidor.' }, '*');
      return { ok: false, erro: e.message };
    }
  };

  window._tentarMarcarFaturado = _tentarMarcarFaturado;
  console.info('[HiperDB] ✅ Módulo DB carregado. API:', API_BASE);
})();