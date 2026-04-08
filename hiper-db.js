// ═══════════════════════════════════════════════════════════════════════════════
// hiper-db.js — Integração com banco de dados local (Oracle Cloud)
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const API_BASE   = 'https://147.15.4.240:8000';
  const TIMEOUT_MS = 4000;

  // ── Utilitários ──────────────────────────────────────────────────────────────

  // Usa o fetch nativo guardado pelo hiper-cache.js — evita o monkey-patch
  // que intercepta apenas as rotas do Select2 mas pode causar efeitos colaterais.
  const _nativeFetch = window.__nativeFetch || window.fetch.bind(window);

  function fetchComTimeout(url, opts) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return _nativeFetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  function getVendedor() {
    try { return (window.__hiperVendedor?.text || '').trim(); } catch(e) { return ''; }
  }

  function getNumeroOrcamento() {
    try {
      const raw    = parseInt(localStorage.getItem('hiper_orc_counter') || '0', 10);
      const idx0   = raw - 1;
      const bloco  = Math.floor(idx0 / 9000);
      const dentro = (idx0 % 9000) + 1000;
      function blocoParaLetras(b) {
        let letras = ''; b = b + 1;
        while (b > 0) { b--; letras = String.fromCharCode(65 + (b % 26)) + letras; b = Math.floor(b / 26); }
        return letras;
      }
      return blocoParaLetras(bloco) + String(dentro);
    } catch(e) { return ''; }
  }

  // ── Salvar pedido na API ──────────────────────────────────────────────────────

  async function salvarPedido(codigo, dados) {
    if (!codigo || !dados?.itens?.length) return;
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
    };
    try {
      const res = await fetchComTimeout(`${API_BASE}/pedido`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (res.ok) console.info(`[HiperDB] ✅ Pedido ${codigo} salvo.`);
      else        console.warn(`[HiperDB] Servidor retornou ${res.status}.`);
    } catch(e) {
      console.info('[HiperDB] API indisponível — continuando offline.');
    }
  }

  // ── Hook no botão Orçamento (página mãe) ─────────────────────────────────────

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

          const titleMatch = html.match(/<title>[^<]*?(\b[A-Z]{1,3}\d{4})\b/i);
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

  async function repovoarPedido(pedido) {
    const totalOriginal = pedido.itens.reduce((s, it) => s + it.subtotal, 0);
    const desconto      = totalOriginal - pedido.total;

    let lista = pedido.itens.map((it, i) =>
      `${i+1}. ${it.nome}\n   ${it.qtd} ${it.unidade} × R$ ${it.vlUnit.toFixed(2).replace('.',',')} = R$ ${it.subtotal.toFixed(2).replace('.',',')}`
    ).join('\n');
    lista += `\n\nTotal: R$ ${pedido.total.toFixed(2).replace('.',',')}`;
    if (desconto > 0.01) lista += `\nDesconto: R$ ${desconto.toFixed(2).replace('.',',')}`;

    const ok = confirm(
      `📦 Pedido ${pedido.codigo}\nSalvo em: ${pedido.atualizado_em}\n\n${lista}\n\nCarregar estes itens como referência?`
    );
    if (!ok) return;

    sessionStorage.setItem('hiper_recuperar_pedido', JSON.stringify(pedido));

    alert(
      `✅ Dados salvos em sessionStorage!\n\n` +
      `Para ver os itens, abra o console (F12) e rode:\n` +
      `  JSON.parse(sessionStorage.hiper_recuperar_pedido).itens\n\n` +
      (desconto > 0.01
        ? `💰 Para o desconto: no widget "Valor Final", coloque ${pedido.total.toFixed(2).replace('.',',')}`
        : '')
    );
  }

  // ── Cria o painel de recuperação (sem inserir no DOM — hiper-ui.js faz isso) ──

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
        msg.textContent = `✅ ${pedido.itens.length} itens`;
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

  // ── Registro no centralizador de UI (hiper-ui.js) ─────────────────────────────
  // ordem 30 — painel de recuperação fica abaixo dos kits
  // hookBotaoOrcamento() continua sendo chamado pelo centralizador via MutationObserver
  // interno, pois depende de #hiper-btn-orcamento que já é gerenciado pelo hiper-ui.js.
  (function _registrarDB() {
    function _registrar() {
      if (window.__hiperUI) {
        window.__hiperUI.registrar({ id: 'hiper-painel-recuperar', ordem: 30, render: criarPainelRecuperacao });
        // Hook no botão de orçamento — tenta agora e monitora via observer do hiper-ui.js
        hookBotaoOrcamento();
      } else {
        setTimeout(_registrar, 50);
      }
    }
    _registrar();
  })();

  // Garante o hook no botão mesmo após re-renderizações do Angular
  new MutationObserver(() => {
    if (location.hash.includes('pedido-venda')) hookBotaoOrcamento();
  }).observe(document.documentElement, { childList: true, subtree: true });

  console.info('[HiperDB] ✅ Módulo DB carregado. API:', API_BASE);
})();