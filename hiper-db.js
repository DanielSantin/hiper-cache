// ═══════════════════════════════════════════════════════════════════════════════
// hiper-db.js — Integração com banco de dados local (Oracle Cloud)
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const API_BASE   = 'https://db.superaserver.com';
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
    try { return (window.__hiperVendedor?.text || '').trim(); } catch(e) { return ''; }
  }

  // Delega à função global definida em hiper-orcamento.js (única fonte da verdade).
function getNumeroOrcamento() {
  try {
    // Prioridade: número já gerado no fluxo atual
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
    const kits = serializarKits();

    const payload = {
      codigo,
      vendedor: getVendedor(),
      total:    dados.total    || 0,
      desconto: dados.desconto || 0,
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
    try {
      const res = await fetchComTimeout(`${API_BASE}/pedido`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (res.ok) console.info(`[HiperDB] ✅ Pedido ${codigo} salvo (${kits.length} kit(s)).`);
      else        console.warn(`[HiperDB] Servidor retornou ${res.status}.`);
    } catch(e) {
      console.info('[HiperDB] API indisponível — continuando offline.');
    }
  }

  // ── Hook no botão Orçamento ───────────────────────────────────────────────────

  function hookBotaoOrcamento() {
    const btn = document.getElementById('hiper-btn-orcamento');
    if (!btn || btn._dbHooked) return;
    btn._dbHooked = true;
    btn.addEventListener('click', () => {
      setTimeout(() => {
        const codigo = getNumeroOrcamento();
        const dados  = typeof extrairDadosPedido === 'function' ? extrairDadosPedido() : null;
        if (dados) salvarPedido(codigo, dados);
      }, 100);
    }, true);
  }

  // ── Escuta postMessage vindo do HTML do orçamento (blob: window) ──────────────

  window.addEventListener('message', (ev) => {
    if (ev.data?.type !== 'HIPER_DB_SAVE') return;
    const { codigo, dados } = ev.data;
    if (codigo && dados) salvarPedido(codigo, dados);
  });

  // ── Patch window.open para injetar snippet de save no blob gerado ─────────────

  const _origOpen = window.open.bind(window);
  window.open = function(url, target, features) {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      (async () => {
        try {
          const resp = await fetch(url);
          let html   = await resp.text();

          const titleMatch = html.match(/<title>[^<]*?(\b[A-Z]{1,3}\d{4,5})\b/i);
          const numOrc     = titleMatch ? titleMatch[1].toUpperCase() : getNumeroOrcamento();

          const snippet = `
<script>
(function() {
  var _NR_DB = ${JSON.stringify(numOrc)};
  function _dbPayload() {
    var rows = document.querySelectorAll('.tbl tbody tr:not(.vazia)');
    var itens = [];
    rows.forEach(function(tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 6) return;
      itens.push({
        nome:     tds[3].textContent.trim(),
        qtd:      parseFloat(tds[1].textContent.replace(',','.')) || 0,
        unidade:  tds[2].textContent.trim() || 'UN',
        vlUnit:   parseFloat((tds[4].textContent||'').replace(/[^\\d,]/g,'').replace(',','.')) || 0,
        subtotal: parseFloat((tds[5].textContent||'').replace(/[^\\d,]/g,'').replace(',','.')) || 0,
      });
    });
    var totalEl = document.getElementById('iTotal') || document.querySelector('.tval');
    var total = totalEl ? parseFloat((totalEl.value||totalEl.textContent||'').replace(/[^\\d,]/g,'').replace(',','.')) || 0 : 0;
    return { itens: itens, total: total, desconto: 0 };
  }
  function _dbSave() {
    var payload = _dbPayload();
    if (!payload.itens.length) return;
    window.opener && window.opener.postMessage({ type: 'HIPER_DB_SAVE', codigo: _NR_DB, dados: payload }, '*');
  }
  function _hookBotoes() {
    ['btnPdf','btnCopy','btnPrint'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn && !btn._dbHooked) {
        btn._dbHooked = true;
        btn.addEventListener('click', function() { setTimeout(_dbSave, 200); }, true);
      }
    });
    window.addEventListener('beforeprint', _dbSave);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _hookBotoes);
  else _hookBotoes();
})();
<\/script>`;

          html = html.replace('<body>', '<body>' + snippet);
          const newBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
          const newUrl  = URL.createObjectURL(newBlob);
          setTimeout(() => URL.revokeObjectURL(newUrl), 120000);
          _origOpen(newUrl, target, features);
          return;
        } catch(e) {
          console.warn('[HiperDB] Falha ao patchear blob:', e);
        }
        _origOpen(url, target, features);
      })();
      return null;
    }
    return _origOpen(url, target, features);
  };

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
        // Recria a entrada de parede no Map apontando para as linhas que
        // restaurarItens() já inseriu. Busca as $linhas pelo código do produto.
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

  // ── Repopular pedido completo (itens + kits) ──────────────────────────────────

  async function repovoarPedido(pedido) {
    const totalOriginal = pedido.itens.reduce((s, it) => s + it.subtotal, 0);
    const desconto      = totalOriginal - pedido.total;

    let lista = pedido.itens.map((it, i) =>
      `${i+1}. ${it.nome}\n   ${it.qtd} ${it.unidade} × R$ ${it.vlUnit.toFixed(2).replace('.',',')} = R$ ${it.subtotal.toFixed(2).replace('.',',')}`
    ).join('\n');
    lista += `\n\nTotal: R$ ${pedido.total.toFixed(2).replace('.',',')}`;
    if (desconto > 0.01) lista += `\nDesconto: R$ ${desconto.toFixed(2).replace('.',',')}`;

    const kitsInfo = pedido.kits?.length
      ? `\n\n🧱 ${pedido.kits.length} estrutura(s) de kit salva(s).`
      : '';

    const ok = confirm(
      `📦 Pedido ${pedido.codigo}\nSalvo em: ${pedido.atualizado_em}\n\n${lista}${kitsInfo}\n\nCarregar estes itens no pedido atual?`
    );
    if (!ok) return;

    // Restaura itens primeiro (eles criam as linhas no DOM)
    await restaurarItens(pedido.itens);

    // Depois víncula os kits às linhas já inseridas (sem recalcular)
    if (pedido.kits?.length) {
      await restaurarKits(pedido.kits);
    }

    if (desconto > 0.01) {
      alert(
        `✅ Pedido carregado!\n\n` +
        `💰 Este pedido tinha desconto.\n` +
        `No widget "Valor Final", ajuste para: ${pedido.total.toFixed(2).replace('.',',')}`
      );
    }
  }

  // ── Cria o painel de recuperação ──────────────────────────────────────────────

  function criarPainelRecuperacao() {
    const painel = document.createElement('div');
    painel.id = 'hiper-painel-recuperar';
    painel.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;padding:6px 8px;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;font-size:12px;';
    painel.innerHTML = `
      <span style="white-space:nowrap;color:#6d4c00;font-weight:600;">🔎 Recuperar:</span>
      <input id="hiper-rec-codigo" type="text" placeholder="Ex: A1042"
        style="width:86px;padding:3px 6px;border:1px solid #cca;border-radius:3px;font-size:12px;text-transform:uppercase;letter-spacing:1px;"/>
      <button id="hiper-rec-btn"
        style="padding:3px 10px;background:#f57f17;color:#fff;border:none;border-radius:3px;font-size:12px;cursor:pointer;font-weight:600;">
        Carregar
      </button>
      <span id="hiper-rec-msg" style="color:#888;font-size:11px;"></span>
    `;

    const inp = painel.querySelector('#hiper-rec-codigo');
    const btn = painel.querySelector('#hiper-rec-btn');
    const msg = painel.querySelector('#hiper-rec-msg');

    async function carregar() {
      const codigo = inp.value.trim().toUpperCase();
      if (!codigo) return;
      btn.disabled    = true;
      msg.style.color = '#888';
      msg.textContent = 'Buscando...';
      try {
        const pedido = await recuperarPedido(codigo);
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

    btn.addEventListener('click', carregar);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') carregar(); });

    console.info('[HiperDB] ✅ Painel de recuperação criado.');
    return painel;
  }

  // ── Registro no centralizador de UI ──────────────────────────────────────────
  (function _registrarDB() {
    function _registrar() {
      if (window.__hiperUI) {
        window.__hiperUI.registrar({ id: 'hiper-painel-recuperar', ordem: 30, render: criarPainelRecuperacao });
        hookBotaoOrcamento();
      } else {
        setTimeout(_registrar, 50);
      }
    }
    _registrar();
  })();

  new MutationObserver(() => {
    if (location.hash.includes('pedido-venda')) hookBotaoOrcamento();
  }).observe(document.documentElement, { childList: true, subtree: true });

  console.info('[HiperDB] ✅ Módulo DB carregado. API:', API_BASE);
})();