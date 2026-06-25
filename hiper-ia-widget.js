// ═══════════════════════════════════════════════════════════════════════════════
// hiper-ia-widget.js — Widget de parsing de pedidos WhatsApp via IA
// ═══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const API_BASE = 'https://api.sistema.santin.tec.br';
  const BTN_ID   = 'hiper-ia-btn-flutuante';
  const PANEL_ID = 'hiper-ia-panel';

  // ── Visibilidade: só aparece em /pedido-venda/novo E se ativado via localStorage ──

  const LS_KEY = 'hiper_ia_ativo';

  function isAtivo()      { return localStorage.getItem(LS_KEY) === '1'; }
  function isNovoPedido() { return location.hash.startsWith('#/pedido-venda/novo'); }

  // Comandos de console para ativar/desativar
  window.hiperIaAtivar   = () => { localStorage.setItem(LS_KEY, '1');  atualizarVisibilidade(); console.log('[IA] Bot ativado.'); };
  window.hiperIaDesativar = () => { localStorage.removeItem(LS_KEY);   atualizarVisibilidade(); console.log('[IA] Bot desativado.'); };

  function atualizarVisibilidade() {
    const btn   = document.getElementById(BTN_ID);
    const panel = document.getElementById(PANEL_ID);
    const visivel = isAtivo() && isNovoPedido();
    if (btn)   btn.style.display   = visivel ? 'flex' : 'none';
    if (panel && !visivel) panel.style.display = 'none';
  }

  window.addEventListener('hashchange', atualizarVisibilidade);

  // ── Importação dos produtos no Hiper ERP ─────────────────────────────────────

  function _buscarProdutoMaster(codigo) {
    const master = window.__hiperMaster;
    if (!master?.length) return null;
    const id = String(codigo);
    // Busca por idProduto (ID longo do Hiper, armazenado no estoque.codigo)
    return (
      master.find(p => String(p.idProduto ?? '') === id) ||
      // Fallback: busca por prefixo no Nome (para códigos curtos tipo "3073")
      master.find(p => (p.Nome ?? '').startsWith(id + ' ')) ||
      master.find(p => (p.Nome ?? '').startsWith(id + ' - ')) ||
      null
    );
  }

  async function importarProdutos(itens) {
    const itensValidos = itens.filter(item => item.codigo);
    if (!itensValidos.length) throw new Error('Nenhum item com código para importar.');

    let t = 0;
    while (!window.__hiperMaster?.length && t++ < 100) await delay(100);
    if (!window.__hiperMaster?.length) throw new Error('Master de produtos não disponível.');

    const totalAntes = $('.linha-produto:not(.default)').length;

    for (let i = 0; i < itensValidos.length; i++) {
      $('.btn-adicionar-mais-produtos').click();
    }

    const inicio = Date.now();
    while (Date.now() - inicio < 3000) {
      if ($('.linha-produto:not(.default)').length >= totalAntes + itensValidos.length) break;
      await delay(50);
    }

    const todasLinhas = $('.linha-produto:not(.default)').toArray();
    const linhasNovas = todasLinhas.slice(totalAntes);

    for (let i = 0; i < itensValidos.length; i++) {
      const item = itensValidos[i];
      const produto = _buscarProdutoMaster(item.codigo);
      if (!produto) {
        console.warn(`[IA] Produto ${item.codigo} não encontrado no master.`);
        continue;
      }

      const $linha = $(linhasNovas[i]);
      const $input = $linha.find('input.produto');
      if (!$input.length) continue;

      inserirViaCache($input, produto);
      await delay(200);

      const $qtd = $linha.find(
        '.quantidade-produto input, input.quantidade-unitaria, input[ng-model*="quantidade"]'
      ).first();
      if ($qtd.length) await setarQuantidade($qtd, item.quantidade);
    }
  }

  // ── Estilos ──────────────────────────────────────────────────────────────────

  const CSS = `
    #${BTN_ID} {
      position: fixed;
      bottom: 80px;
      right: 18px;
      z-index: 99999;
      background: #6c47d1;
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 46px;
      height: 46px;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .2s;
    }
    #${BTN_ID}:hover { background: #5535b8; }

    #${PANEL_ID} {
      position: fixed;
      bottom: 136px;
      right: 18px;
      z-index: 99999;
      width: 360px;
      background: #fff;
      border: 1px solid #d0c4f7;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,.18);
      font-family: sans-serif;
      font-size: 13px;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    #hiper-ia-header {
      background: #6c47d1;
      color: #fff;
      padding: 10px 14px;
      font-weight: 600;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #hiper-ia-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
    }
    #hiper-ia-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    #hiper-ia-textarea {
      width: 100%;
      height: 110px;
      resize: vertical;
      border: 1px solid #ccc;
      border-radius: 5px;
      padding: 7px;
      font-size: 12px;
      font-family: sans-serif;
      box-sizing: border-box;
    }
    #hiper-ia-enviar {
      background: #6c47d1;
      color: #fff;
      border: none;
      border-radius: 5px;
      padding: 7px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: background .2s;
    }
    #hiper-ia-enviar:hover:not(:disabled) { background: #5535b8; }
    #hiper-ia-enviar:disabled { background: #b0a0e0; cursor: not-allowed; }
    #hiper-ia-importar {
      background: #1a7f37;
      color: #fff;
      border: none;
      border-radius: 5px;
      padding: 7px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: background .2s;
      display: none;
    }
    #hiper-ia-importar:hover:not(:disabled) { background: #155d27; }
    #hiper-ia-importar:disabled { background: #8ec99e; cursor: not-allowed; }
    #hiper-ia-resultado {
      margin-top: 4px;
      border-top: 1px solid #eee;
      padding-top: 8px;
      max-height: 260px;
      overflow-y: auto;
    }
    .ia-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 5px 0;
      border-bottom: 1px solid #f0eaf8;
      gap: 6px;
    }
    .ia-item:last-child { border-bottom: none; }
    .ia-item-nome { flex: 1; color: #333; }
    .ia-item-cod  { font-size: 10px; color: #999; }
    .ia-item-sem-cod { font-size: 10px; color: #e07800; }
    .ia-item-qtd  { font-weight: 700; color: #6c47d1; white-space: nowrap; }
    .ia-obs-geral { font-size: 11px; color: #888; margin-top: 6px; font-style: italic; }
    .ia-erro      { color: #c00; font-size: 12px; }
    .ia-carregando { color: #6c47d1; font-size: 12px; text-align: center; padding: 8px 0; }
    .ia-sucesso    { color: #1a7f37; font-size: 12px; text-align: center; padding: 4px 0; font-weight: 600; }
  `;

  function injetarCSS() {
    if (document.getElementById('hiper-ia-css')) return;
    const s = document.createElement('style');
    s.id = 'hiper-ia-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Renderiza resultado e retorna os itens para importação ───────────────────

  let _ultimosItens = [];

  function renderizarResultado(data, container) {
    container.innerHTML = '';
    _ultimosItens = data.itens || [];

    if (!_ultimosItens.length) {
      container.innerHTML = '<div class="ia-erro">Nenhum produto identificado.</div>';
      return false;
    }

    _ultimosItens.forEach(item => {
      const div = document.createElement('div');
      div.className = 'ia-item';
      div.innerHTML = `
        <div class="ia-item-nome">
          ${item.nome || '—'}
          ${item.codigo
            ? `<div class="ia-item-cod">Cód. ${item.codigo}</div>`
            : `<div class="ia-item-sem-cod">⚠ Código não encontrado</div>`}
          ${item.observacao ? `<div class="ia-item-cod">${item.observacao}</div>` : ''}
        </div>
        <div class="ia-item-qtd">${item.quantidade} ${item.unidade || ''}</div>
      `;
      container.appendChild(div);
    });

    if (data.obs_geral) {
      const obs = document.createElement('div');
      obs.className = 'ia-obs-geral';
      obs.textContent = data.obs_geral;
      container.appendChild(obs);
    }

    return _ultimosItens.some(i => i.codigo);
  }

  // ── Monta o painel ────────────────────────────────────────────────────────────

  function criarWidget() {
    if (document.getElementById(PANEL_ID)) return;

    injetarCSS();

    // Botão flutuante
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.title = 'Interpretar pedido WhatsApp';
    btn.textContent = '🤖';
    btn.style.display = (isAtivo() && isNovoPedido()) ? 'flex' : 'none';
    document.body.appendChild(btn);

    // Painel
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div id="hiper-ia-header">
        🤖 Interpretar pedido WhatsApp
        <button id="hiper-ia-close">×</button>
      </div>
      <div id="hiper-ia-body">
        <textarea id="hiper-ia-textarea" placeholder="Cole aqui o pedido do WhatsApp..."></textarea>
        <button id="hiper-ia-enviar">Interpretar</button>
        <button id="hiper-ia-importar">✅ Importar produtos no pedido</button>
        <div id="hiper-ia-resultado"></div>
      </div>
    `;
    document.body.appendChild(panel);

    const enviarBtn   = document.getElementById('hiper-ia-enviar');
    const importarBtn = document.getElementById('hiper-ia-importar');
    const resultado   = document.getElementById('hiper-ia-resultado');
    const textarea    = document.getElementById('hiper-ia-textarea');

    btn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    });

    document.getElementById('hiper-ia-close').addEventListener('click', () => {
      panel.style.display = 'none';
    });

    enviarBtn.addEventListener('click', async () => {
      const mensagem = textarea.value.trim();
      if (!mensagem) {
        resultado.innerHTML = '<div class="ia-erro">Cole uma mensagem primeiro.</div>';
        return;
      }

      enviarBtn.disabled = true;
      enviarBtn.textContent = 'Interpretando...';
      importarBtn.style.display = 'none';
      resultado.innerHTML = '<div class="ia-carregando">⏳ Aguardando IA...</div>';

      try {
        const resp = await fetch(`${API_BASE}/ia/parse-pedido`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensagem }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || `Erro ${resp.status}`);
        }

        const data = await resp.json();
        const temCodigoValido = renderizarResultado(data, resultado);
        if (temCodigoValido) importarBtn.style.display = 'block';

      } catch (e) {
        resultado.innerHTML = `<div class="ia-erro">Erro: ${e.message}</div>`;
      } finally {
        enviarBtn.disabled = false;
        enviarBtn.textContent = 'Interpretar';
      }
    });

    importarBtn.addEventListener('click', async () => {
      importarBtn.disabled = true;
      importarBtn.textContent = 'Importando...';

      try {
        await importarProdutos(_ultimosItens);
        importarBtn.style.display = 'none';
        const ok = document.createElement('div');
        ok.className = 'ia-sucesso';
        ok.textContent = '✅ Produtos importados com sucesso!';
        resultado.prepend(ok);
      } catch (e) {
        const err = document.createElement('div');
        err.className = 'ia-erro';
        err.textContent = `Erro ao importar: ${e.message}`;
        resultado.prepend(err);
        importarBtn.disabled = false;
        importarBtn.textContent = '✅ Importar produtos no pedido';
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', criarWidget);
  } else {
    criarWidget();
  }
})();
