// ═══════════════════════════════════════════════════════════════════════════════
// hiper-db.js — Integração com banco de dados local (Oracle Cloud)
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Captura o parâmetro ?recuperar= IMEDIATAMENTE — antes do Hiper reescrever o hash
  ;(function() {
    const hashQuery = location.hash.split('?')[1] || '';
    const cod = new URLSearchParams(hashQuery).get('recuperar');
    if (cod) window.__hiperRecuperarCodigo = cod.trim().toUpperCase();
  })();

  const API_BASE   = 'https://db.superaserver.com/api';
  const TIMEOUT_MS = 4000;

  // ── Utilitários ──────────────────────────────────────────────────────────────

  const _nativeFetch = window.__nativeFetch || window.fetch.bind(window);

  // __hiperOrcConfig é carregado e mantido sincronizado por hiper-orcamento.js.
  // hiper-db.js não duplica essa lógica — apenas consome window.__hiperOrcConfig.

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
        resultado.push({
          id,
          tipo:    'kit',
          nomeKit: estado.nomeKit ?? id,
          A:       estado.A    || 0,
          P:       estado.P    || 0,
          cant:    estado.cant ?? 3.15,
          margem:  estado.margem != null ? estado.margem : 0,
        });
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
        idProduto: it.idProduto || null,
        nome:      it.nome,
        qtd:       it.qtd,
        unidade:   it.unidade  || 'UN',
        vlUnit:    it.vlUnit   || 0,
        subtotal:  it.subtotal || it.qtd * it.vlUnit,
      })),
      kits,
    };

    await _enviarPayload(codigo, payload);
  }

  // ── Save público — chamado pelos botões da janela do orçamento ───────────────
  // hiper-orcamento.js chama window.__hiperDBSave(codigo, dados) em cada um
  // dos 4 botões (Imprimir, Copiar WhatsApp, Baixar PDF, Resumido).

  window.__hiperDBSave = function(codigo, dados) {
    if (codigo && dados) salvarPedido(codigo, dados);
  };

  // ── Marcar orçamento como faturado ───────────────────────────────────────────
  // Chamado quando o operador clica em "Salvar orçamento" ou "Salvar e gerar pedido"
  // no sistema Hiper. O número do orçamento atual fica em __hiperNumeroOrcamentoAtual.

  async function faturarOrcamentoAtual() {
    const codigo = window.__hiperPedidoAberto;
    if (!codigo) {
      console.warn('[HiperDB] faturarOrcamentoAtual: nenhum pedido aberto.');
      return;
    }

    // Lê o total atual diretamente do DOM do Hiper
    const totalEl = document.querySelector('.totais-valor-total strong.valor-total, .valor-total');
    const totalStr = totalEl ? totalEl.textContent.replace(/[^\d,]/g, '').replace(',', '.') : '0';
    const totalAtual = parseFloat(totalStr) || 0;

    try {
      const res = await fetchComTimeout(`${API_BASE}/pedido/${encodeURIComponent(codigo)}/faturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_atual: totalAtual }),
      });
      if (res.ok) {
        console.info(`[HiperDB] ✅ Orçamento ${codigo} marcado como faturado.`);
      } else if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        console.warn(`[HiperDB] ⚠️ Faturamento recusado para ${codigo}: ${err.detail || res.status}`);
      } else {
        console.warn(`[HiperDB] ⚠️ Faturar ${codigo} retornou ${res.status}.`);
      }
    } catch (e) {
      console.warn('[HiperDB] ⚠️ Erro ao marcar faturado:', e);
    }
  }

  // Intercepta os dois botões de salvar do Hiper e dispara o faturamento.
  // Usa captura no document para funcionar mesmo se os botões forem renderizados
  // depois do carregamento do módulo.
  (function _hookBotoesSalvar() {
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.btn-save');
      if (!btn) return;
      // Só age se houver um orçamento ativo gerado pela extensão
      if (!window.__hiperPedidoAberto) return;
      faturarOrcamentoAtual();
    }, /* capture */ true);
    console.info('[HiperDB] 🎯 Hook de faturamento registrado nos botões de salvar.');
  })();

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
  // Insere cada item pelo idProduto / código do nome usando o mesmo mecanismo
  // do kit.js (inserirViaCache + setarQuantidade), mas alimentando os valores
  // já finalizados que vieram do banco — nunca chama recalcularTudo().

  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function restaurarItens(itens) {
    if (!itens?.length) return;

    // Aguarda o master estar pronto (máx 10s)
    let t = 0;
    while (!window.__hiperMaster?.length && t++ < 100) await delay(100);
    if (!window.__hiperMaster?.length) {
      console.warn('[HiperDB] Master não disponível — itens não restaurados.');
      return;
    }

    // Limpa linhas vazias existentes
    $('.linha-produto:not(.default)').each(function() {
      const texto = $(this).find('.select2-chosen').text().trim();
      if (texto === 'Nome, código de barras, código do produto ou referência interna') {
        $(this).find('.btn-remover-linha, .btn-excluir-linha, [ng-click*="remover"], [ng-click*="excluir"]')
               .first().click();
      }
    });

    await delay(200);

    // Adiciona uma linha por item
    const totalAntes = $('.linha-produto:not(.default)').length;
    for (let i = 0; i < itens.length; i++) {
      $('.btn-adicionar-mais-produtos').click();
    }

    // Aguarda as linhas aparecerem
    const inicio = Date.now();
    while (Date.now() - inicio < 5000) {
      if ($('.linha-produto:not(.default)').length >= totalAntes + itens.length) break;
      await delay(50);
    }

    const todasLinhas = $('.linha-produto:not(.default)').toArray();
    const linhasNovas = todasLinhas.slice(totalAntes);

    for (let i = 0; i < itens.length; i++) {
      const it    = itens[i];
      const $linha = $(linhasNovas[i]);
      if (!$linha.length) continue;

      // Resolve o produto: tenta pelo idProduto, depois pelo código no início do nome
      const codigoBusca = it.idProduto || (it.nome || '').match(/^(\d{4})\b/)?.[1] || '';
      const produto = codigoBusca
        ? (window.__hiperMaster.find(p => String(p.id ?? p.idProduto) === String(codigoBusca)) ||
           window.__hiperMaster.find(p => (p.Nome || '').startsWith(codigoBusca + ' ')))
        : null;

      if (produto) {
        const $input = $linha.find('input.produto');
        if ($input.length) {
          // inserirViaCache está exposto por kit.js; se não estiver, fazemos inline
          if (typeof inserirViaCache === 'function') {
            inserirViaCache($input, produto);
          } else {
            const data = { id: String(produto.id ?? produto.idProduto), text: produto.Nome ?? produto.text, ...produto };
            const s2 = $input.data('select2');
            if (s2) {
              const ant = s2.data();
              $input.val(data.id);
              s2.updateSelection(data);
              $input.trigger({ type: 'select2-selected', val: data.id, choice: data });
              s2.triggerChange({ added: data, removed: ant });
            }
          }
          await delay(150);
        }
      } else {
        console.warn(`[HiperDB] Produto não encontrado para item "${it.nome}" — linha ficará em branco.`);
      }

      // Seta quantidade com o valor salvo no banco (sem usar fórmulas)
      const $qtd = $linha.find(
        '.quantidade-produto input, input.quantidade-unitaria, input[ng-model*="quantidade"]'
      ).first();

      if ($qtd.length) {
        const pronto = await _aguardarHabilitado($qtd);
        if (pronto) {
          const nativeInput = $qtd[0];
          const campoDecimal = (nativeInput.value || '').includes(',') || (nativeInput.value || '').includes('.');
          const valorStr = campoDecimal
            ? it.qtd.toFixed(2).replace('.', ',')
            : String(Math.ceil(it.qtd));

          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          setter ? setter.call(nativeInput, valorStr) : (nativeInput.value = valorStr);
          nativeInput.dispatchEvent(new Event('input',  { bubbles: true }));
          nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
          nativeInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          nativeInput.dispatchEvent(new Event('blur',  { bubbles: true }));
        }
      }
    }

    console.info(`[HiperDB] ✅ ${itens.length} item(ns) restaurado(s) no pedido.`);
  }

  async function _aguardarHabilitado($input, timeout = 3000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      const el = $input[0];
      if (el && !el.disabled && !el.readOnly && $.contains(document, el)) return true;
      await delay(50);
    }
    return false;
  }

  // ── Restaurar kits (sem recalcular — usa quantidades do banco) ────────────────
  // Recria cada entrada no kitsAtivos e monta o painel de UI, mas NÃO chama
  // recalcularTudo(). As quantidades dos itens já foram preenchidas por
  // restaurarItens() com os valores finais gravados no banco.

  async function restaurarKits(kits) {
    if (!kits?.length) return;

    const kitsAtivos = window.kitsAtivos;
    if (!kitsAtivos) {
      console.warn('[HiperDB] kitsAtivos não disponível — kits não restaurados.');
      return;
    }

    // Aguarda master
    let t = 0;
    while (!window.__hiperMaster?.length && t++ < 100) await delay(100);
    if (!window.__hiperMaster?.length) {
      console.warn('[HiperDB] Master não disponível — kits não restaurados.');
      return;
    }

    for (const kit of kits) {
      if (kit.tipo === 'parede') {
        const codigos = window.paredeCodigosAtivos?.(kit.cfg) ?? [];
        const linhasDoKit = _resolverLinhasPorCodigos(codigos);

        kitsAtivos.set(kit.id, {
          tipo:   'parede',
          cfg:    { ...kit.cfg },
          A:      kit.A      || 0,
          margem: kit.margem || 0,
          linhas: linhasDoKit,
        });

      } else if (kit.tipo === 'portas') {
        const codigos = Object.keys(window.FORMULAS_GESSO?.portas ?? {});
        const linhasDoKit = _resolverLinhasPorCodigos(codigos);

        kitsAtivos.set(kit.id, {
          tipo:   'portas',
          nomeKit: 'portas',
          A:      0,
          grupos: (kit.grupos || []).map(g => ({ ...g })),
          linhas: linhasDoKit,
        });

      } else {
        // kit normal
        const codigos = window.KITS_GESSO?.[kit.nomeKit] ?? [];
        const linhasDoKit = _resolverLinhasPorCodigos(codigos);

        kitsAtivos.set(kit.id, {
          tipo:    'kit',
          nomeKit: kit.nomeKit,
          A:       kit.A      || 0,
          P:       kit.P      || 0,
          cant:    kit.cant   ?? 3.15,
          margem:  kit.margem || 0,
          linhas:  linhasDoKit,
        });
      }
    }

    // Atualiza o painel de UI sem recalcular quantidades
    if (typeof window.renderizarPainel === 'function') {
      window.renderizarPainel();
    }

    console.info(`[HiperDB] ✅ ${kits.length} kit(s) restaurado(s) no painel.`);
  }

  // Dado um array de códigos de produto, encontra as $linhas no DOM que
  // já foram preenchidas com esses produtos por restaurarItens().
  function _resolverLinhasPorCodigos(codigos) {
    const linhas = [];
    codigos.forEach(codigo => {
      let $linhaEncontrada = null;
      $('.linha-produto:not(.default)').each(function() {
        const s2 = $(this).find('input.produto').data('select2');
        const nomeProduto = s2?.data()?.Nome ?? s2?.data()?.text ?? '';
        if (nomeProduto.startsWith(codigo + ' ') || nomeProduto.startsWith(codigo)) {
          $linhaEncontrada = $(this);
          return false; // break
        }
      });
      linhas.push({ codigo, $linha: $linhaEncontrada || $() });
    });
    return linhas;
  }

  // ── Aguarda o .valor-total estabilizar após restaurar itens ───────────────────
  async function aguardarTotalEstabilizar(timeout = 8000, tolerancia = 100) {
    const inicio = Date.now();
    let valorAnterior = NaN;
    let igualPor = 0;

    while (Date.now() - inicio < timeout) {
      const el = document.querySelector('.valor-total');
      const atual = el ? parseMoeda(el.textContent.trim()) : NaN;

      if (!isNaN(atual) && atual > 0) {
        if (Math.abs(atual - valorAnterior) < 0.01) {
          igualPor += 100;
          if (igualPor >= tolerancia) return atual; // estável por 100ms seguidos
        } else {
          igualPor = 0;
        }
        valorAnterior = atual;
      }
      await delay(100);
    }
    return valorAnterior; // retorna o que tiver, mesmo que não estabilizou
  }

  // ── Aplica desconto via widget Valor Final ────────────────────────────────────
  async function aplicarDescontoWidget(valorFinal) {
    const inp = document.getElementById('hiper-vf-input');
    const btn = document.getElementById('hiper-vf-btn');

    if (!inp || !btn) {
      console.warn('[HiperDB] Widget Valor Final não encontrado — desconto não aplicado.');
      return false;
    }

    inp.value = valorFinal.toFixed(2).replace('.', ',');
    btn.click();
    return true;
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
    await restaurarItens(pedido.itens);

    if (pedido.kits?.length) {
      await restaurarKits(pedido.kits);
    }

    const totalSalvo = pedido.total;
    const totalAtual = await aguardarTotalEstabilizar();

    if (!isNaN(totalAtual) && totalAtual > 0 && Math.abs(totalAtual - totalSalvo) > 0.01) {
      const aplicado = await aplicarDescontoWidget(totalSalvo);
      if (aplicado) {
        const diff = totalAtual - totalSalvo;
        console.info(
          `[HiperDB] Desconto aplicado: total atual R$ ${totalAtual.toFixed(2)} → final R$ ${totalSalvo.toFixed(2)} (diff R$ ${diff.toFixed(2)})`
        );
      }
    } else if (!isNaN(totalAtual) && Math.abs(totalAtual - totalSalvo) <= 0.01) {
      console.info('[HiperDB] Totais idênticos — nenhum desconto necessário.');
    }

    mostrarToastRecuperacao(pedido);
    window.__hiperPedidoAberto = pedido.codigo;
    console.info(`[HiperDB] 📂 Pedido aberto: ${pedido.codigo}`);
  }

  // ── Cria o painel de recuperação ──────────────────────────────────────────────

  function criarPainelRecuperacao() {
    const painel = document.createElement('div');
    painel.id = 'hiper-painel-recuperar';
    painel.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;padding:6px 8px;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;font-size:12px;flex-wrap:wrap;';
    painel.innerHTML = `
      <span style="white-space:nowrap;color:#6d4c00;font-weight:600;">🔎 Recuperar:</span>
      <input id="hiper-rec-codigo" type="text" placeholder="Ex: A1042"
        style="width:86px;padding:3px 6px;border:1px solid #cca;border-radius:3px;font-size:12px;text-transform:uppercase;letter-spacing:1px;"/>
      <button id="hiper-rec-btn"
        style="padding:3px 10px;background:#f57f17;color:#fff;border:none;border-radius:3px;font-size:12px;cursor:pointer;font-weight:600;">
        Carregar
      </button>
      <a id="hiper-rec-lista" href="https://db.superaserver.com/" target="_blank"
        style="padding:3px 10px;background:#1e4a7a;color:#93c5fd;border:none;border-radius:3px;font-size:12px;cursor:pointer;font-weight:600;text-decoration:none;white-space:nowrap;">
        📋 Lista de orçamentos
      </a>
      <span id="hiper-rec-msg" style="color:#888;font-size:11px;"></span>
    `;

    const inp = painel.querySelector('#hiper-rec-codigo');
    const btn = painel.querySelector('#hiper-rec-btn');
    const msg = painel.querySelector('#hiper-rec-msg');

    async function carregar(codigoForcado) {
      const codigo = (codigoForcado || inp.value).trim().toUpperCase();
      if (!codigo) return;
      inp.value       = codigo;
      btn.disabled    = true;
      msg.style.color = '#888';
      msg.textContent = 'Buscando...';
      try {
        const pedido = await recuperarPedido(codigo);
        const confirmou = await mostrarConfirmacaoImportacao(pedido);
        if (!confirmou) {
          msg.style.color = '#999';
          msg.textContent = 'Importação cancelada';
          return;
        }
        
        msg.style.color = '#1a7a1a';
        const nKits = pedido.kits?.length ? ` + ${pedido.kits.length} kit(s)` : '';
        msg.textContent = `✅ ${pedido.itens.length} itens${nKits}`;
        await repovoarPedido(pedido);
      } catch(e) {
        msg.style.color = '#c00';
        msg.textContent = e.message || 'Erro ao buscar.';
      } finally {
        btn.disabled = false;
      }
    }

    btn.addEventListener('click', () => carregar());
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') carregar(); });

    // ── Auto-recuperar: usa código capturado no topo do módulo ─────────────────
    if (window.__hiperRecuperarCodigo) {
      const _tentarAutoRecuperar = async () => {
        let t = 0;
        while (!window.__hiperMaster?.length && t++ < 60) await delay(200);
        carregar(window.__hiperRecuperarCodigo);
        window.__hiperRecuperarCodigo = null;
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
        window.__hiperUI.registrar({ id: 'hiper-painel-recuperar', ordem: 10, render: criarPainelRecuperacao });
      } else {
        setTimeout(_registrar, 50);
      }
    }
    _registrar();
  })();

  console.info('[HiperDB] ✅ Módulo DB carregado. API:', API_BASE);
})();