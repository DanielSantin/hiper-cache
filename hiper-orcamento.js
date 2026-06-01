// ═══════════════════════════════════════════════════════════════════════════════
// hiper-orcamento.js — Geração do HTML de orçamento
// ═══════════════════════════════════════════════════════════════════════════════

// ── Extrai o código do produto (4 primeiros dígitos do nome) ──────────────────
function extrairCodigoProduto(nome) {
  const m = (nome || '').match(/^(\d{4})\b/);
  return m ? m[1] : null;
}

function parseMoedaOrc(str) {
  if (!str) return 0.00;
  const s = str.replace(/[^\d,\.]/g, '');
  const commas = (s.match(/,/g)||[]).length, dots = (s.match(/\./g)||[]).length;
  if (commas===1 && dots===0) return parseFloat(s.replace(',','.')) || 0;
  if (dots===1 && commas===0) return parseFloat(s) || 0.00;
  return parseFloat(s.replace(/\./g,'').replace(',','.')) || 0.00;
}


// ── Geração de número de orçamento sequencial ─────────────────────────────────
(function _bootOrcConfig() {
  window.addEventListener('message', function _onOrcConfig(ev) {
    if (ev.source !== window) return;
    const msg = ev.data;

    if (msg?.type === 'HIPER_CACHE_ALL') {
      const entries = msg.entries || {};
      const letra   = entries['hiper_orc_letra']   || 'A';
      const counter = entries['hiper_orc_counter'] ?? 999;
      window.__hiperOrcConfig = {
        letra:   String(letra).toUpperCase(),
        counter: parseInt(counter, 10) || 999,
      };
      const vendedorText    = entries['vendedor']?.text    ?? null;
      const vendedorChecked = entries['vendedor']?.checked ?? null;
      if (!window.__hiperVendedor) window.__hiperVendedor = { checked: false, text: '' };
      if (vendedorText    != null) window.__hiperVendedor.text    = String(vendedorText);
      if (vendedorChecked != null) window.__hiperVendedor.checked = vendedorChecked === true || vendedorChecked === 'true';
    }

    if (msg?.type === 'HIPER_ORC_CONFIG_CHANGED') {
      if (!window.__hiperOrcConfig) window.__hiperOrcConfig = { letra: 'A', counter: 999 };
      if (msg.letra   != null) window.__hiperOrcConfig.letra   = String(msg.letra).toUpperCase();
      if (msg.counter != null) window.__hiperOrcConfig.counter = parseInt(msg.counter, 10) || 999;
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['hiper_orc_letra', 'hiper_orc_counter', 'hiper_vendedor_text', 'hiper_vendedor_checked'], (r) => {
      window.__hiperOrcConfig = {
        letra:   ((r.hiper_orc_letra)   || 'A').toUpperCase(),
        counter: parseInt(r.hiper_orc_counter ?? '999', 10) || 999,
      };
      window.__hiperVendedor = {
        text:    r.hiper_vendedor_text    || '',
        checked: r.hiper_vendedor_checked || false,
      };
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (!window.__hiperOrcConfig) window.__hiperOrcConfig = { letra: 'A', counter: 999 };
      if (changes.hiper_orc_letra)   window.__hiperOrcConfig.letra   = (changes.hiper_orc_letra.newValue   || 'A').toUpperCase();
      if (changes.hiper_orc_counter) window.__hiperOrcConfig.counter = parseInt(changes.hiper_orc_counter.newValue ?? '999', 10) || 999;
      if (!window.__hiperVendedor) window.__hiperVendedor = { checked: false, text: '' };
      if (changes.hiper_vendedor_text)    window.__hiperVendedor.text    = changes.hiper_vendedor_text.newValue    || '';
      if (changes.hiper_vendedor_checked) window.__hiperVendedor.checked = changes.hiper_vendedor_checked.newValue || false;
    });
  }
})();

function gerarNumeroOrcamento() {
  // ATENÇÃO: mantido apenas para compatibilidade — use gerarNumeroOrcamentoAsync()
  // Este caminho local pode gerar duplicatas em múltiplas abas simultâneas.
  const cfg = window.__hiperOrcConfig || { letra: 'A', counter: 999 };
  let next = cfg.counter + 1;
  if (next > 999999) next = 1000;
  cfg.counter = next;
  window.__hiperOrcConfig = cfg;
  window.postMessage({ type: 'HIPER_CACHE_SET', key: 'hiper_orc_counter', data: next, ts: Date.now() }, '*');
  return cfg.letra + String(next);
}

// ── Geração atômica via background (serializada, sem colisão entre abas) ─────
// O interceptor faz até 5 retries com backoff (~3 s no total) para acordar o
// service worker. Aguardamos 5 s aqui para cobrir esse ciclo com folga.
// Não há fallback local — o background é a única fonte da verdade.
function gerarNumeroOrcamentoAsync() {
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      if (ev.source !== window) return;

      if (ev.data?.type === 'HIPER_ORC_NEXT_NUM_ACK') {
        cleanup();
        resolve(ev.data.numero);
      }

      if (ev.data?.type === 'HIPER_ORC_NEXT_NUM_ERR') {
        cleanup();
        reject(new Error('Não foi possível gerar o número de orçamento. Verifique a extensão e tente novamente.'));
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Tempo esgotado ao gerar número de orçamento. Tente novamente.'));
    }, 5000); // cobre os ~3 s de retries do interceptor com folga

    function cleanup() {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
    }

    window.addEventListener('message', onMsg);
    window.postMessage({ type: 'HIPER_ORC_NEXT_NUM' }, '*');
  });
}

function obterItensPedido() {
  return $('.linha-produto').map((i, linhaEl) => {
    const linha = $(linhaEl);
    const produto =
      linha.data('produtoAtualizado') ||
      linha.data('produtoAtualizadoEdit');
    // ignora linhas inválidas
    if (!produto?.idProduto) return null;

    const quantidadeInput = linha.find('input.form-control.text-right')
      .filter((i, el) => el.placeholder === '0' || el.placeholder === '0,00')
      .first();
    const valorUnitarioInput = linha.find('.input-valor-unitario-produto').first();
    const nome = linha.find('.select2-chosen').first().text().trim();

    return {
      quantidade:      quantidadeInput.val(),
      valorUnitario:   valorUnitarioInput.val(),
      nome,
      produtoCompleto: structuredClone(produto),
    };
  }).get().filter(Boolean);
}

function obterTotalPedido() {
  const el = document.querySelector('.valor-total');
  if (!el) return 0;
  return Number(
    el.innerText
      .replace(/[^\d,]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  );
}

function extrairDadosPedido() {
  return _extrairDadosPedidoV2(obterItensPedido());
}

function _extrairDadosPedidoV2(linhas) {
  const itens = linhas.map(linha => {
    const p           = linha.produtoCompleto;
    const qtd         = parseMoedaOrc(linha.quantidade);
    const vlUnitBruto = parseMoedaOrc(linha.valorUnitario);
    const vlUnit      = Math.round(vlUnitBruto * 0.9523 * 100) / 100;

    return {
      idProduto:       String(p.idProduto),
      idProdutoGrade:  p.idProdutoGrade ?? null,
      nome:            linha.nome || p.Nome || p.text || '',
      codigo:          (() => {
        // Tenta extrair do idProduto (IDs legados de 4 dígitos)
        const fromId = String(p.idProduto).match(/^\d{4}$/)?.[0];
        if (fromId) return fromId;
        // Extrai o código numérico do início do nome do produto: "3006 - Tabica branca" → "3006"
        const nome = linha.nome || p.Nome || p.text || '';
        return nome.match(/^(\d{3,6})\s*[-–]/)?.[1] ?? null;
      })(),
      qtd,             // mantido para o template gerarHtmlOrcamento
      quantidade:      qtd,    // campo canônico para a API e estoque
      unidade:         p.siglaDaUnidadeDeMedida ?? 'UN',
      vlUnit,
      vlUnitBruto,
      subtotal:        qtd * vlUnitBruto,
      precoVendaFinal: p.precoVendaFinal ?? null,
      ehKit:           p.ehKit ?? false,
    };
  });

  const descontoEl  = document.querySelector('.totais-desconto .col-xs-9.col-sm-6.col-md-2');
  const freteEl     = document.querySelector('.totais-frete .col-xs-9.col-sm-6.col-md-2 p');
  const parcelasStr = document.getElementById('hiper-select-parcelas')?.value ?? 'Cartão 3X';

  return {
    itens,
    desconto: parseMoedaOrc(descontoEl?.textContent),
    frete:    parseMoedaOrc(freteEl?.textContent),
    total:    obterTotalPedido(),
    parcelas: parseInt((parcelasStr || '').replace(/\D/g, ''), 10) || 1,
  };
}


function gerarHtmlOrcamento(dados, opcoes) {
  const { itens } = dados;
  const { parcelas, incluirEntrega, taxaEntrega, numeroOrcamento } = opcoes;
  const dataHoje      = new Date().toLocaleDateString('pt-BR');
  const subtotalItens = itens.reduce((s, it) => s + it.qtd * it.vlUnit, 0);
  const frete0        = incluirEntrega ? taxaEntrega : 0;

  const custosMap  = window.__hiperCustos || {};
  const vendedor   = window.__hiperVendedor || { checked: false, text: '' };
  const vendedorJSON = JSON.stringify(vendedor);
  const custosJSON = JSON.stringify(custosMap);
  const itensJSON  = JSON.stringify(itens);
  const numOrcJSON = JSON.stringify(numeroOrcamento);
  // Total cartão do sistema = soma dos vlUnitBruto × qtd (valor antes do desconto PIX)
  // Usado para corrigir a diferença causada pelo arredondamento item a item.
  const totalSistemaCartao = itens.reduce((s, it) => s + it.vlUnitBruto * it.qtd, 0);

  const fmtN = (n) => n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  const linhasItens = itens.map((item, i) => {
    const vt = item.qtd * item.vlUnit;
    return '<tr>'+
      '<td class="c">'+(i+1)+'</td>'+
      '<td class="c">'+item.qtd.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>'+
      '<td class="c">'+item.unidade+'</td>'+
      '<td class="desc">'+item.nome+'</td>'+
      '<td class="r" data-base="'+item.vlUnit.toFixed(2)+'">'+
        '<input class="inp-preco" type="number" value="'+item.vlUnit.toFixed(2)+'" step="0.01" min="0" '+
        'oninput="onPrecoCustom(this)" onblur="onPrecoBlur(this)" title="Clique para editar o preço">'+
        '<span class="inp-preco-print">R$ '+fmtN(item.vlUnit)+'</span>'+
      '</td>'+
      '<td class="r">R$ '+fmtN(vt)+'</td>'+
    '</tr>';
  }).join('');

  const vazias = Math.max(0, 8 - itens.length);
  const linhasVazias = Array(vazias).fill(
    '<tr class="vazia"><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  ).join('');

  // ── Coluna de custo — clicável, abre custos.html com código preenchido ───────
  const linhasCusto = itens.map(item => {
    const key = item.idProduto;
    const c   = key != null ? custosMap[key] : undefined;
    const txt = c != null ? parseFloat(c).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';
    const cls = c != null ? 'custo-val ok' : 'custo-val vazio';
    const url = key != null ? 'https://db.superaserver.com/custos/?q=' + encodeURIComponent(key) : 'https://db.superaserver.com/custos/';
    return '<div class="custo-row">' +
      '<a class="custo-link" href="' + url + '" target="_blank" title="Editar custo do produto">' +
        '<span class="' + cls + '">' + txt + '</span>' +
        '<span class="custo-edit-icon">✏️</span>' +
      '</a>' +
    '</div>';
  }).join('');

  const linhasVaziasC = Array(vazias).fill('<div class="custo-row"></div>').join('');

  const LOGO = window.__hiperLogo || window.__hiperLogoBase64 || '';
  const IMG_TEL = window.__hiperIconeTel || '';
  const IMG_WHATS = window.__hiperIconeWhats || '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orçamento TAG ${numeroOrcamento} - ${dataHoje}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#fff}
.page{width:100%;max-width:260mm;margin:0 auto;padding:8mm 10mm}

.header{display:flex;align-items:stretch;border:2px solid #000}
.header-logo{padding:6px 12px;border-right:2px solid #000;display:flex;align-items:center;flex-direction:column;gap:2px}
.header-logo .tag{font-size:32pt;font-weight:900;color:#1a5c1a;line-height:1}
.header-logo .orc-num{font-size:9pt;font-weight:bold;color:#1a5c1a;letter-spacing:0.5px;text-align:center}
.header-empresa{flex:1;padding:6px 14px;display:flex;flex-direction:column;justify-content:center}
.header-empresa .nome{font-size:13pt;font-weight:bold}
.header-empresa .sub{font-size:9pt;color:#555;margin-top:2px}
.header-empresa .sub-cliente{font-size:9pt;color:#555;margin-top:2px}
.header-trevo{padding:4px 8px;border-left:2px solid #000;display:flex;align-items:center;justify-content:center}
.header-trevo img{width:64px;height:64px;object-fit:contain}

/* Wrapper flex: tabela + custo ao lado */
.tbl-wrap{display:flex;align-items:flex-start;gap:8px}

/* Tabela principal */
.tbl{flex:1;border-collapse:collapse}
.tbl,.tbl th,.tbl td{border:1px solid #000}
.tbl thead tr{background:#d0d0d0}
.tbl th{padding:4px 5px;font-size:9pt;text-align:center}
.tbl td{padding:4px 5px;font-size:9pt;vertical-align:middle}
.tbl td.c{text-align:center}.tbl td.r{text-align:right}.tbl td.desc{text-align:left}
.tbl tr.vazia td{height:20px}
.inp-preco{width:68px;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;padding:0;color:#000;cursor:text}
.inp-preco:focus{outline:1px solid #1a73e8;background:#e8f0fe;border-radius:2px;padding:0 2px;width:72px}
.inp-preco-print{display:none}
@media print{.inp-preco{display:none!important}.inp-preco-print{display:inline!important}}

/* Coluna de custo — somente leitura */
.custo-col{width:88px;flex-shrink:0;border:1px solid #e0c040;background:#fffbe6}
.custo-header{background:#fffbe6;border-bottom:1px solid #e0c040;padding:4px 4px;font-size:9pt;text-align:center;font-weight:bold;color:#7a6000;display:flex;align-items:center;justify-content:center;}
.custo-body{display:flex;flex-direction:column}
.custo-row{border-bottom:1px solid #e0c040;display:flex;align-items:center;padding:2px 6px;overflow:hidden;}
.custo-row:last-child{border-bottom:none}
.custo-link{display:flex;align-items:center;gap:4px;width:100%;text-decoration:none;cursor:pointer;border-radius:3px;transition:background 0.12s}
.custo-link:hover{background:#fff0b3}
.custo-val{flex:1;text-align:right;font-size:9pt;font-family:Arial;color:#333}
.custo-val.ok{color:#1a7a1a}
.custo-val.vazio{color:#bbb}
.custo-edit-icon{flex-shrink:0;font-size:9pt;opacity:0.45;transition:opacity 0.12s;line-height:1}
.custo-link:hover .custo-edit-icon{opacity:1}

/* Totais */
.totais-wrap{border:1px solid #000;border-top:none}
.trow{display:grid;grid-template-columns:1fr 110px 110px;border-bottom:1px solid #000}
.trow:last-child{border-bottom:none}
.trow .tlabel{padding:4px 8px;font-size:9pt;display:flex;align-items:center}
.trow .ttag{font-weight:bold;font-size:9.5pt;background:#e8e8e8;border-left:1px solid #000;display:flex;align-items:center;justify-content:center;padding:2px 4px;text-align:center}
.trow .ttag.pix{background:transparent}
.trow .ttag.cartao{background:transparent}
.trow .ttag select{border:none;background:transparent;font-size:9pt;font-weight:bold;font-family:Arial;cursor:pointer;text-align:right;width:auto;-webkit-appearance:auto}
.trow .tval{border-left:1px solid #000;display:flex;align-items:center;justify-content:flex-end;padding:2px 8px;font-weight:bold;font-size:10pt;}

.val-inp{width:100%;border:none;background:transparent;text-align:right;font-weight:bold;font-size:10pt;font-family:Arial;padding:0;color:#000;cursor:text}
.val-inp:focus{outline:1px solid #1a73e8;background:#e8f0fe;border-radius:2px;padding:0 2px}
.val-prefix{font-size:9pt;color:#888;margin-right:2px;flex-shrink:0}
.val-print{display:none;font-weight:bold;font-size:10pt;color:#000}

/* Linha entrega */
.trow-entrega{display:flex;border-bottom:1px solid #000}
.trow-entrega .tlabel{flex:1;padding:4px 8px;font-size:9pt;font-weight:bold;display:flex;align-items:center}
.trow-entrega .tval{padding:4px 10px;font-weight:bold;font-size:10pt;color:#c00;border-left:1px solid #000;width:110px;text-align:right;display:flex;align-items:center;justify-content:flex-end}

/* Painel de margem */
.margem-box{margin-top:10px;padding:10px 14px;background:#f0fff4;border:1px solid #6dbf8a;border-radius:6px;font-size:12px}
.margem-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:6px}
.margem-row:last-child{margin-bottom:0}
.m-item{display:flex;flex-direction:column;gap:1px}
.m-lbl{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.3px}
.m-val{font-size:14px;font-weight:bold;color:#1a4a2a}
.m-val.neg{color:#c00}.m-val.warn{color:#c07000}
.m-pct{display:inline-block;font-size:10px;background:#d4f0dc;color:#1a7a1a;border-radius:3px;padding:1px 5px;margin-left:4px;font-weight:bold}
.m-pct.neg{background:#fdd;color:#c00}.m-pct.warn{background:#fff0cc;color:#c07000}
.btn-descmax{padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;font-weight:bold;white-space:nowrap}
.btn-descmax:hover{background:#1558b0}
.btn-descmax:disabled{background:#aaa;cursor:default}

/* Validade */
.validade-row{padding:4px 8px;font-size:8.5pt;color:#c00;font-weight:bold;border-top:1px solid #000}

/* Checkbox de desconto */
.desc-chk-wrap{display:inline-flex;align-items:center}
.desc-chk-wrap input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#1a73e8;flex-shrink:0}
#rowDesc.desc-oculto{opacity:0.45;position:relative}
.trow{position:relative}
@media print{.desc-chk-wrap{display:none!important}#rowDesc.desc-oculto{display:none!important}}

/* Painel topo */
.panel{border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;background:#f4f8ff;border:1px solid #b3d4f5}
.panel h4{font-size:12px;font-weight:bold;color:#1a3a6a;margin-bottom:8px}
.prow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.prow label{display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap}
.prow input[type=number]{padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px}
.prow input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#1a73e8}
.panel-sep{color:#ccc;font-size:14px}

/* Cliente no painel */
.cliente-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #d0ddf0}
.cliente-row label{font-size:12px;font-weight:bold;color:#1a3a6a;white-space:nowrap}
.cliente-inp{flex:1;padding:4px 8px;border:2px solid #7ab3e8;border-radius:4px;font-size:13px;font-weight:bold;color:#1a3a6a;min-width:180px;max-width:360px}
.cliente-inp:focus{outline:none;border-color:#1a73e8;background:#f0f6ff}
.cliente-badge{display:inline-block;font-size:9px;background:#d0e8ff;color:#1a3a6a;border-radius:3px;padding:1px 6px;font-weight:bold;letter-spacing:.3px}

/* PDF downloaded indicator */
.pdf-badge{display:none;align-items:center;gap:6px;padding:4px 12px;background:#d4edda;border:1px solid #6dbf8a;border-radius:20px;font-size:12px;font-weight:bold;color:#1a5c1a}
.pdf-badge.visible{display:flex}

/* Observações */
.obs-label{font-size:11px;font-weight:bold;color:#1a3a6a;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px;display:block}
.obs-box{border:1px solid #000;padding:6px 8px;margin-bottom:10px;background:transparent}
.obs-textarea{width:100%;min-height:36px;max-height:240px;resize:vertical;border:none;outline:none;padding:0;font-size:10pt;font-family:Arial,sans-serif;color:#222;background:transparent;line-height:1.5;overflow-y:auto;box-sizing:border-box;display:block}
.obs-textarea::placeholder{color:#aaa;font-style:italic}
.obs-print{display:none;font-size:9.5pt;color:#333;line-height:1.6;white-space:pre-wrap;word-break:break-word}
@media print{
  .obs-label{display:none!important}
  .obs-textarea{display:none!important}
  .obs-print{display:block!important}
  .obs-box{border-color:#000;background:transparent!important}
  .obs-box.obs-vazia{display:none!important}
}

.toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px;align-items:center;flex-wrap:wrap}
.btn-print{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#1a73e8;transition:background 0.15s}
.btn-print:hover{background:#155bb5}
.btn-print:disabled{background:#aaa;cursor:default}
.btn-copy{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#25d366}
.btn-copy:hover{background:#1da851}
.btn-copy:disabled{background:#aaa;cursor:default}
.btn-pdf{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#e8510a}
.btn-pdf:hover{background:#c44208}
.btn-pdf:disabled{background:#aaa;cursor:default}
.btn-sync-custos{padding:6px 14px;border:1.5px solid #6dbf8a;border-radius:6px;font-size:12px;cursor:pointer;color:#1a5c1a;font-weight:bold;background:transparent;transition:background 0.15s;white-space:nowrap}
.btn-sync-custos:hover:not(:disabled){background:#f0fff4}
.btn-sync-custos:disabled{opacity:0.45;cursor:default}
.btn-sync-custos.sync-spin{border-color:#90caf9;color:#1565c0}
.btn-sync-custos.sync-ok{border-color:#6dbf8a;color:#1a7a1a}
.btn-sync-custos.sync-err{border-color:#e57373;color:#c00}
.btn-edit-custos{padding:6px 14px;border:1.5px solid #e0c040;border-radius:6px;font-size:12px;cursor:pointer;color:#7a6000;font-weight:bold;background:transparent;transition:background 0.15s;white-space:nowrap}
.btn-edit-custos:hover{background:#fffbe6}
.btn-saida{padding:6px 14px;border:1.5px solid #e57373;border-radius:6px;font-size:12px;cursor:pointer;color:#c0392b;font-weight:bold;background:transparent;transition:background 0.15s;white-space:nowrap}
.btn-saida:hover:not(:disabled){background:#fff0f0}
.btn-saida:disabled{opacity:0.45;cursor:default}
.btn-mov{padding:6px 14px;border:1.5px solid #7cb3e8;border-radius:6px;font-size:12px;cursor:pointer;color:#1a5c8a;font-weight:bold;background:transparent;transition:background 0.15s;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center}
.btn-mov:hover{background:#f0f6ff}
.zona-saida{margin-top:24px;padding:10px 14px;background:#fafafa;border:1px solid #e8e8e8;border-radius:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.zona-saida-sep{width:1px;height:22px;background:#ddd;margin:0 2px;flex-shrink:0}

.rodape{border:1px solid #000;border-top:none;padding:5px 8px;font-size:8pt;line-height:1.6}
.rodape .entrega{color:#c00;font-weight:bold;font-size:9pt;margin-top:3px}
.rodape-pix-wrap{display:flex;align-items:center;flex-wrap:wrap}
.rodape-pix-wrap select{border:none;background:transparent;font-size:8pt;font-family:Arial;font-weight:bold;cursor:pointer;-webkit-appearance:auto;padding:0}

@page{margin-bottom:0}
@media print{
  .no-print{display:none!important}
  .margem-box{display:none!important}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:210mm;padding:4mm 6mm}
  .val-inp{display:none!important}
  .val-prefix{display:none!important}
  .val-print{display:inline!important}
  .tbl-wrap{display:block}
  .tbl{width:100%}
  .trow .ttag select{-webkit-appearance:none!important;appearance:none!important}
  .rodape-pix-wrap select{-webkit-appearance:none!important;appearance:none!important}
}
</style>
</head>
<body>
<div class="page">

<div class="toolbar no-print">
  <button class="btn-print" onclick="imprimirFormatado()">🖨️ Imprimir</button>
  <button class="btn-copy" id="btnCopy" onclick="_dbSalvar(); copiarImagem()">📷 Copiar</button>
  <button class="btn-pdf" id="btnPdf" onclick="_dbSalvar(); baixarPdf()">⬇️ Baixar</button>
  <button id="btnResumido"
    onclick="_dbSalvar(); if(window.__gerarResumidoDaAba){window.__gerarResumidoDaAba();} else if(window.abrirOrcamentoResumido){window.abrirOrcamentoResumido();}"
    style="padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#1a5c8a">
    📄 Resumido
  </button>
  <div class="pdf-badge" id="pdfBadge">✅ PDF baixado</div>
</div>

<div class="panel no-print">
  <h4>⚙️ Opções — Orçamento <strong style="color:#1a5c1a">${numeroOrcamento}</strong></h4>
  <div class="prow">
    <label><input type="checkbox" id="chkE" onchange="recalc()"> Entrega R$</label>
    <input type="number" id="iE" value="${frete0>0?frete0:30}" min="0" step="0.01" style="width:72px" oninput="recalc()">
    <span class="panel-sep">|</span>
    <label>% imposto <input type="number" id="iImp" value="10.70" min="0" max="100" step="0.01" style="width:68px" oninput="recalc()"></label>
    <span class="panel-sep">|</span>
    <label style="font-weight:bold;color:#1a3a6a;white-space:nowrap">Vendedor:</label>
    <input type="text" id="iVendedor" placeholder="ex: Daniel Santin" maxlength="80"
           style="flex:1;min-width:140px;padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px"
           oninput="onVendedor()">
  </div>
  <div class="cliente-row">
    <label for="iCliente">Cliente:</label>
    <input type="text" id="iCliente" class="cliente-inp" placeholder="Nome do cliente…" maxlength="80"
           oninput="onCliente()" autocomplete="off">
    <span class="cliente-badge">aparece no cabeçalho e no PDF</span>
  </div>
</div>

<span class="obs-label no-print">📝 Observações</span>
<div class="obs-box obs-vazia" id="obsBox">
  <textarea class="obs-textarea" id="obsTexto" rows="2"
    placeholder="Ex: Produto sob consulta, prazo de entrega previsto para 5 dias úteis…"
    oninput="onObs()" onkeydown="obsAutoResize(this)"></textarea>
  <div class="obs-print" id="obsPrint"></div>
</div>

<div class="header">
  <div class="header-logo">
    <div class="tag">TAG</div>
    <div class="orc-num">${numeroOrcamento}</div>
  </div>
  <div class="header-empresa">
    <div class="nome">Comércio e Serv. Gesso Acartonado Ltda</div>
    <div class="sub">Orçamento gerado em ${dataHoje}</div>
    <div class="sub-cliente" id="subCliente" style="display:none"></div>
    <div class="sub" id="subVendedor" style="display:none"></div>
  </div>
  <div class="header-trevo"><img src="${LOGO}" alt="Trevo Drywall"></div>
</div>

<div class="tbl-wrap no-print-custo">
  <table class="tbl" id="tblPrincipal">
    <thead>
      <tr>
        <th style="width:28px">ITEM</th>
        <th style="width:50px">QUANT</th>
        <th style="width:32px">UND</th>
        <th>DESCRIÇÃO</th>
        <th style="width:88px">VL UNIT.</th>
        <th style="width:88px">VL TOTAL</th>
      </tr>
    </thead>
    <tbody id="tblBody">${linhasItens}${linhasVazias}</tbody>
  </table>
  <div class="custo-col no-print" id="custoCol">
    <div class="custo-header">CUSTO UN</div>
    <div class="custo-body" id="custoBody">${linhasCusto}${linhasVaziasC}</div>
  </div>
</div>


<div class="totais-wrap">
  <div class="trow" id="rowDesc">
    <div class="tlabel"></div>
    <div class="ttag cartao" style="background:transparent;font-size:9pt;font-weight:bold;padding-left:20px;padding-right:20px;justify-content:flex-end;white-space:nowrap;gap:6px">
      <span class="desc-chk-wrap no-print">
        <input type="checkbox" id="chkDesc" onchange="onChkDesc()" title="Exibir desconto no PDF">
      </span>
      Desconto
    </div>
    <div class="tval">
      <span class="val-prefix">R$</span>
    <input class="val-inp" type="number" id="iDescC" value="0.00" step="0.01"
          oninput="onDescC()" onblur="this.value = parseFloat(this.value || 0).toFixed(2)" 
          placeholder="0,00" title="Clique para editar" style="width:75px">
      <span class="val-print" id="iDescC-print">0,00</span>
    </div>
  </div>
  <div class="trow">
    <div class="tlabel" id="lblC">Valor Total – Parcelado em até ${parcelas}x no Cartão de Crédito</div>
    <div class="ttag cartao" style="background:transparent;font-size:9pt;font-weight:bold;justify-content:flex-end;padding-left:20px;padding-right:20px">
      <select id="select-parcelas-input" style="...">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n =>
            `<option value="${n}" ${n === parcelas ? 'selected' : ''}>
                CARTÃO ${n}x
            </option>`
        ).join('')}
      </select>
    </div>
    <div class="tval">
      <span class="val-prefix">R$</span>
      <input class="val-inp" type="number" id="valC" step="0.01"
            oninput="onValC()" onblur="onBlurTotal(this,'C')"
            style="width:75px">
      <span class="val-print" id="valC-print">0,00</span>
    </div>
  </div>
  <div class="trow">
    <div class="tlabel">Valor Total – À vista (PIX)</div>
    <div class="ttag pix" style="justify-content:flex-end;padding-left:20px;padding-right:20px;white-space:nowrap">À VISTA pix</div>
    <div class="tval">
      <span class="val-prefix">R$</span>
      <input class="val-inp" type="number" id="valV" step="0.01"
            oninput="onValV()" onblur="onBlurTotal(this,'V')"
            style="width:75px">
      <span class="val-print" id="valV-print">0,00</span>
    </div>
  </div>
  <div id="rowE" class="trow" style="display:none">
  <div class="tlabel" 
      style="grid-column:1/3;
              text-align:right;
              font-weight:bold;
              font-size:10pt;
              text-transform:uppercase;
              letter-spacing:0.5px;
              justify-content:flex-end;
              padding-left:20px;
              padding-right:20px;
              color:#000;">
      TAXA DE ENTREGA
  </div>
    <div class="tval" style="color:#c00">
      <span class="val-prefix" style="color:#c00">R$</span>
      <input class="val-inp" id="valE" type="number" step="0.01" style="width:75px;color:#c00;font-weight:bold" oninput="onValE()" onblur="this.value = parseFloat(this.value || 0).toFixed(2)">
      <span class="val-print" id="valE-print" style="color:#c00;font-weight:bold">0,00</span>
    </div>
  </div>
  <div class="validade-row">* ORÇAMENTO VÁLIDO POR 10 (DEZ) DIAS</div>
</div>

<div class="rodape">
  <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 5px;">
    
    <div style="display: flex; align-items: center; gap: 6px;">
      <strong>Atendimento Loja: (69) 3213-1072</strong>
      <img src="${IMG_TEL}" style="width:12px; height:12px;">
      <img src="${IMG_WHATS}" style="width:13px; height:13px;">
    </div>

    <div style="display: flex; align-items: center; gap: 6px;">
      <strong>Luciana Santin: (69) 99237-1547</strong>
      <img src="${IMG_TEL}" style="width:12px; height:12px;">
      <img src="${IMG_WHATS}" style="width:13px; height:13px;">
    </div>

  </div>

  <div>Av. Rio de Janeiro, 5075 A - Nova Porto Velho – Em frente ao Sindsef</div>
  <div class="rodape-pix-wrap">
    <span>Chave Pix CNPJ  &ndash; </span>
    <select id="selPixEmpresa" onchange="onPixEmpresa()" style="border:none;background:transparent;font-size:8pt;font-family:Arial;font-weight:bold;cursor:pointer;-webkit-appearance:auto">
      <option value="gs" selected>56.240.315/0001-60 &ndash; Guimarães &amp; Santin</option>
      <option value="tag">18.282.959/0001-22 &ndash; TAG Comercio e Servico</option>
    </select>
  </div>
  <div class="entrega">➡ ENTREGA SOMENTE NO TÉRREO</div>
</div>

<div class="margem-box no-print" id="margemBox" style="margin-top:12px">
  <div class="margem-row">
    <div class="m-item"><span class="m-lbl">Total à vista</span><span class="m-val" id="mTV">—</span></div>
    <div class="m-item"><span class="m-lbl">Imposto (nota)</span><span class="m-val" id="mImp">—</span></div>
    <div class="m-item"><span class="m-lbl">Custo itens</span><span class="m-val" id="mCusto">—</span></div>
    <div class="m-item"><span class="m-lbl">Lucro</span><span class="m-val" id="mLucroR">—<span class="m-pct" id="mLucroP"></span></span></div>
  </div>
  <div class="margem-row">
    <span id="mDescMaxTxt" style="font-size:12px;color:#555"></span>
    <button class="btn-descmax" id="btnDescMax" onclick="aplicarDescMax()" disabled>
      Aplicar desconto para 20% de margem
    </button>
  </div>
</div>


<div class="zona-saida no-print">
  <button class="btn-sync-custos" id="btnSyncCustos" onclick="syncCustos()">↻ Sincronizar custos</button>
  <button class="btn-edit-custos" onclick="window.open('https://db.superaserver.com/custos/', '_blank')">✏️ Editar custos</button>
  <span class="zona-saida-sep"></span>
  <a class="btn-mov" href="https://db.superaserver.com/estoque/#movimentos" target="_blank">📋 Ver movimentações</a>
  <button class="btn-saida" id="btnSaida" onclick="removerDoEstoque()">🏗️ Remover do estoque</button>
</div>

</div><!-- .page -->

<script>
const PIX       = 0.9523;
const BASE_ITEM = ${subtotalItens.toFixed(4)};
const ITENS     = ${itensJSON};
const CUSTOS_IN = ${custosJSON};
const custos    = Object.assign({}, CUSTOS_IN);
const NUM_ORC   = ${numOrcJSON};
// Soma dos vlUnitBruto × qtd: total cartão exato do sistema (sem arredondamento PIX)
const TOTAL_SISTEMA_CARTAO = ${totalSistemaCartao.toFixed(4)};
let _descMaxCartao = NaN;
let _pdfBaixado = false;

// ── Salva no banco via opener (hiper-db.js) ───────────────────────────────────
function _parseTdMoeda(txt) {
  const s = (txt || '').replace(/[^\d,.]/g, '');
  if (/,/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s) || 0;
}

function _dbSalvar() {
  try {
    const rows = document.querySelectorAll('.tbl tbody tr:not(.vazia)');
    const itens = [];

    const itensIdx = {};
    (ITENS || []).forEach(function(it) { itensIdx[it.nome] = it; });

    rows.forEach(function(tr) {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 6) return;
      const nome = tds[3].textContent.trim();
      if (!nome) return;

      const inpPreco = tds[4].querySelector('.inp-preco');
      let vlUnit   = inpPreco ? (parseFloat(inpPreco.value) || 0) : _parseTdMoeda(tds[4].textContent);
      let subtotal = _parseTdMoeda(tds[5].textContent);
      const ref = itensIdx[nome];
      if (ref) {
        if (!vlUnit   && ref.vlUnit)   vlUnit   = ref.vlUnit;
        if (!subtotal && ref.subtotal) subtotal = ref.subtotal;
      }

      const qtd = parseFloat(tds[1].textContent.replace(',', '.')) || 0;
      if (!subtotal && vlUnit && qtd) subtotal = qtd * vlUnit;

      itens.push({
        nome,
        qtd,
        unidade:  tds[2].textContent.trim() || 'UN',
        vlUnit,
        subtotal,
        idProduto: ref?.idProduto || null,
      });
    });
    if (!itens.length) return;

    const totalC   = parseFloat(el('valC')?.value   || '0') || 0;
    const totalV   = parseFloat(el('valV')?.value   || '0') || 0;
    const desconto = parseFloat(el('iDescC')?.value || '0') || 0;
    const total    = totalC > 0 ? totalC : totalV;

    const selParcelas = el('select-parcelas-input');
    const parcelas    = selParcelas ? (parseInt(selParcelas.value, 10) || 1) : 1;

    const clienteInp  = el('iCliente');
    const cliente     = clienteInp ? clienteInp.value.trim() : '';

    const obsInp   = el('obsTexto');
    const descricao = obsInp ? obsInp.value.trim() : '';

    const dados = { itens, total, desconto, parcelas, cliente, descricao };

    if (window.opener && typeof window.opener.__hiperDBSave === 'function') {
      window.opener.__hiperDBSave(NUM_ORC, dados);
    }
  } catch(e) {
    console.warn('[HiperOrc] _dbSalvar falhou:', e);
  }
}


window.addEventListener('beforeunload', function(e) {
  if (_pdfBaixado) return;
  const msg = 'O PDF do orçamento ' + NUM_ORC + ' ainda não foi baixado. Tem certeza que deseja fechar?';
  e.preventDefault();
  e.returnValue = msg;
  return msg;
});

console.log('[HiperOrc] Orçamento', NUM_ORC, '| Custos carregados:', JSON.stringify(custos));

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n){
  if(isNaN(n)||n==null) return '—';
  return 'R$ ' + fmtNum(n);
}
  
function fmtNum(n) {
    return Number(n).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function fmtP(n){
  return isNaN(n)?'':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
}
function el(id){return document.getElementById(id);}
function num(id){
  const e=el(id);
  if(!e) return 0;
  const v=parseFloat(e.value);
  return isNaN(v)?0:v;
}
function silent(id,v){
  const e=el(id);
  if(!e) return;
  if(document.activeElement!==e) {
    e.value = parseFloat(v || 0).toFixed(2);
  }
}
function syncPrint(id, n){
  const sp=el(id+'-print');
  if(sp) sp.textContent = fmtNum(n);
}

// ── Nome do cliente ───────────────────────────────────────────────────────────
function onCliente() {
  const inp  = el('iCliente');
  const span = el('subCliente');
  if (!inp || !span) return;
  const nome = inp.value.trim();
  if (nome) {
    span.style.display = '';
    span.textContent   = 'Cliente: ' + nome;
  } else {
    span.style.display = 'none';
    span.textContent   = '';
  }
}

function primeiroNomeCliente() {
  const inp = el('iCliente');
  if (!inp || !inp.value.trim()) return 'Cliente';
  const primeiro = inp.value.trim().split(/\s+/)[0];
  return primeiro
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
}

// ── Sync de custos ────────────────────────────────────────────────────────────
async function syncCustos() {
  const btn = el('btnSyncCustos');
  if (!btn) return;

  function _setStatus(estado) {
    btn.className = 'btn-sync-custos';
    btn.disabled  = false;
    if (estado === 'loading') {
      btn.classList.add('sync-spin');
      btn.disabled = true;
      btn.textContent = '⟳ buscando…';
    } else if (estado === 'ok') {
      btn.classList.add('sync-ok');
      btn.textContent = '✓ atualizado';
      setTimeout(() => _setStatus('idle'), 3000);
    } else if (estado === 'err') {
      btn.classList.add('sync-err');
      btn.textContent = '✗ sem conexão';
      setTimeout(() => _setStatus('idle'), 4000);
    } else {
      btn.textContent = '↻ Custos';
    }
  }

  if (typeof window.opener?.__hiperSyncCustos !== 'function' &&
      typeof window.__hiperSyncCustos !== 'function') {
    _setStatus('err');
    return;
  }

  _setStatus('loading');
  try {
    const fn = window.__hiperSyncCustos ?? window.opener.__hiperSyncCustos;
    await fn();
    // Atualiza o mapa local de custos com o cache atualizado
    const novo = window.__hiperCustos ?? window.opener?.__hiperCustos ?? {};
    Object.assign(custos, novo);
    // Re-renderiza a coluna de custo
    _atualizarColunaCusto();
    recalcMargem();
    _setStatus('ok');
  } catch (e) {
    _setStatus('err');
  }
}

// Re-renderiza os valores da coluna de custo após sync
function _atualizarColunaCusto() {
  const body = el('custoBody');
  if (!body) return;
  const rows = body.querySelectorAll('.custo-row');
  ITENS.forEach((item, i) => {
    const row = rows[i];
    if (!row) return;
    const c   = item.idProduto != null ? custos[item.idProduto] : undefined;
    const txt = c != null
      ? parseFloat(c).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : '—';
    const cls = c != null ? 'custo-val ok' : 'custo-val vazio';
    row.innerHTML = '<span class="' + cls + '">' + txt + '</span>';
  });
}

// ── Base dinâmica ──────────────────────────────────────────────────────────────
function getBase(){
  let soma = 0;
  document.querySelectorAll('.tbl tbody tr:not(.vazia)').forEach(function(tr) {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 5) return;
    const qtd = parseFloat(tds[1].textContent.replace(',','.')) || 0;
    const inp = tds[4].querySelector('.inp-preco');
    const vl  = inp ? (parseFloat(inp.value) || 0) : _parseTdMoeda(tds[4].textContent);
    soma += qtd * vl;
  });
  return soma || BASE_ITEM;
}

// ── Preço customizado por linha ────────────────────────────────────────────────
function onPrecoCustom(inp) {
  const tr  = inp.closest('tr');
  const tds = tr.querySelectorAll('td');
  const qtd = parseFloat(tds[1].textContent.replace(',','.')) || 0;
  const vl  = parseFloat(inp.value) || 0;
  const vt  = qtd * vl;
  tds[5].textContent = 'R$ ' + vt.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const span = inp.nextElementSibling;
  if (span) span.textContent = 'R$ ' + vl.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  recalc();
}

function onPrecoBlur(inp) {
  const v = parseFloat(inp.value);
  inp.value = (isNaN(v) || v < 0 ? parseFloat(inp.closest('td').dataset.base) : v).toFixed(2);
  onPrecoCustom(inp);
}

// ── Recalcula totais ───────────────────────────────────────────────────────────
function recalc(){
  const base   = getBase();
  const descC  = num('iDescC');
  const totalV = base - descC;
  const totalC = totalV / PIX;
  silent('valC', totalC.toFixed(2));
  silent('valV', totalV.toFixed(2));
  syncPrint('iDescC', descC);
  syncPrint('valC',   totalC);
  syncPrint('valV',   totalV);
  el('rowE').style.display = el('chkE').checked ? 'grid' : 'none';
  const valEEl = el('valE');
  if (valEEl && document.activeElement !== valEEl) {
    valEEl.value = num('iE').toFixed(2);
  }
  const valEPrint = el('valE-print');
  if (valEPrint) valEPrint.textContent = fmtNum(num('iE'));
  recalcMargem(totalC, totalV);
}

function onValC(){
  const base   = getBase();
  const totalC = num('valC');
  const totalV = totalC * PIX;
  silent('iDescC', Math.max(0, base - totalV).toFixed(2));
  silent('valV',   totalV.toFixed(2));
  syncPrint('iDescC', Math.max(0, base - totalV));
  syncPrint('valC',   totalC);
  syncPrint('valV',   totalV);
  recalcMargem(totalC, totalV);
  atualizarChkDesc();
}

function onValV(){
  const base   = getBase();
  const totalV = num('valV');
  const totalC = totalV / PIX;
  silent('iDescC', Math.max(0, base - totalV).toFixed(2));
  silent('valC',   totalC.toFixed(2));
  syncPrint('iDescC', Math.max(0, base - totalV));
  syncPrint('valC',   totalC);
  syncPrint('valV',   totalV);
  recalcMargem(totalC, totalV);
  atualizarChkDesc();
}

function onDescC(){ recalc(); atualizarChkDesc(); }

// ── Redistribuição de preços ───────────────────────────────────────────────────
function onBlurTotal(inp, tipo) {
  inp.value = parseFloat(inp.value || 0).toFixed(2);

  const novoTotalV = tipo === 'C'
    ? parseFloat(inp.value) * PIX
    : parseFloat(inp.value);
  const baseAtual = getBase();

  if (novoTotalV > baseAtual + 0.005) {
    const ratio    = novoTotalV / baseAtual;
    const pct      = ((ratio - 1) * 100).toFixed(1);
    const novoTotalC = (novoTotalV / PIX).toFixed(2);
    const fmtR     = (v) => v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    const confirma = confirm(
      'O valor informado (R$ ' + fmtR(novoTotalV / PIX) + ' cartao / R$ ' + fmtR(novoTotalV) + ' pix) ' +
      'e ' + pct + '% maior que o total atual.\\n\\n' +
      'Redistribuir o aumento proporcionalmente entre todos os produtos?'
    );
    if (confirma) {
      document.querySelectorAll('.tbl tbody tr:not(.vazia)').forEach(function(tr) {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;
        const inp = tds[4].querySelector('.inp-preco');
        if (!inp) return;
        inp.value = (Math.round(parseFloat(inp.value) * ratio * 100) / 100).toFixed(2);
        onPrecoCustom(inp);
      });
      // Zera o desconto e deixa recalc ajustar os totais
      const iDescEl = el('iDescC');
      if (iDescEl) { iDescEl.value = '0.00'; syncPrint('iDescC', 0); }
      recalc();
      atualizarChkDesc();
      return;
    }
  }

  // Sem redistribuição: comportamento normal
  if (tipo === 'C') onValC(); else onValV();
}

// ── Checkbox de desconto ───────────────────────────────────────────────────────
function atualizarChkDesc() {
  const chk    = el('chkDesc');
  const row    = el('rowDesc');
  if (!chk || !row) return;
  const descC  = num('iDescC');
  const base   = getBase();
  const pct    = base > 0 ? (descC / base) * 100 : 0;
  const visivel = pct >= 0.5;
  chk.checked = visivel;
  if (visivel) {
    row.classList.remove('desc-oculto');
  } else {
    row.classList.add('desc-oculto');
  }
}

function onChkDesc() {
  const chk = el('chkDesc');
  const row = el('rowDesc');
  if (!chk || !row) return;
  if (chk.checked) {
    row.classList.remove('desc-oculto');
  } else {
    row.classList.add('desc-oculto');
  }
}

// ── Frete editado diretamente na tabela → sincroniza com o painel ─────────────
function onValE(){
  const v = parseFloat(el('valE')?.value) || 0;
  const iEEl = el('iE');
  if (iEEl && document.activeElement !== iEEl) iEEl.value = v.toFixed(2);
  const valEPrint = el('valE-print');
  if (valEPrint) valEPrint.textContent = fmtNum(v);
}

// ── Margem ─────────────────────────────────────────────────────────────────────
function recalcMargem(totalC, totalV){
  if(totalC===undefined){
    const base = getBase();
    totalV = Math.max(0, base - num('iDescC'));
    totalC = totalV / PIX;
  }
  const pctImp  = num('iImp');
  const imposto = totalV * pctImp / 100;
  let custoTotal = 0;
  ITENS.forEach(item => {
    const c = parseFloat(custos[item.idProduto]);
    if(!isNaN(c)) custoTotal += c * item.qtd;
  });
  const temCusto = custoTotal > 0;
  const lucro   = totalV - imposto - custoTotal;
  const margemP = totalV > 0 ? (lucro / totalV) * 100 : NaN;
  el('mTV').textContent    = fmt(totalV);
  el('mImp').textContent   = fmt(imposto);
  el('mCusto').textContent = temCusto ? fmt(custoTotal) : '— (preencha a tabela)';
  const lrEl = el('mLucroR'), lpEl = el('mLucroP');
  if(temCusto){
    const cls = margemP<0?'neg':margemP<15?'warn':'';
    lrEl.className = 'm-val '+cls;
    lpEl.className = 'm-pct '+cls;
    lrEl.childNodes[0].textContent = fmt(lucro)+' ';
    lpEl.textContent = fmtP(margemP);
  } else {
    lrEl.className = 'm-val';
    lrEl.childNodes[0].textContent = '— ';
    lpEl.textContent = '';
  }
  const k     = 0.80 - pctImp/100;
  const tvMin = temCusto && k>0 ? custoTotal/k : NaN;
  const tcMin = !isNaN(tvMin) ? tvMin/PIX : NaN;
  _descMaxCartao = !isNaN(tvMin) ? Math.max(0, getBase() - tvMin) : NaN;
  const btn = el('btnDescMax'), txt = el('mDescMaxTxt');
  if(!temCusto){
    txt.textContent = 'Preencha os custos para calcular a margem.';
    btn.disabled = true;
  } else if(isNaN(tcMin)||tcMin<0){
    txt.textContent = '⚠ Margem de 20% não é atingível com os custos atuais.';
    btn.disabled = true;
  } else if(_descMaxCartao<=0){
    txt.textContent = '✅ Margem já igual ou acima de 20%.';
    btn.disabled = true;
  } else {
    txt.innerHTML = 'Para 20% de margem: total cartão mínimo <strong>'+fmt(tcMin)+'</strong>';
    btn.disabled = false;
  }
}

function aplicarDescMax(){
  if(isNaN(_descMaxCartao)) return;
  el('iDescC').value = _descMaxCartao.toFixed(2);
  recalc();
  atualizarChkDesc();
}

if(${frete0>0?'true':'false'}) el('chkE').checked=true;
recalc();
atualizarChkDesc();

// ── Ajuste inicial de arredondamento ─────────────────────────────────────────
// Após aplicar vlUnit = round(vlUnitBruto × PIX, 2) em cada item, o total
// cartão do orçamento (BASE_ITEM / PIX) pode ficar diferente do total do
// sistema (TOTAL_SISTEMA_CARTAO). Se o orçamento ficou MAIOR que o sistema,
// aplica um desconto mínimo no valor à vista para igualar os totais.
(function _ajustarArredondamento() {
  if (TOTAL_SISTEMA_CARTAO <= 0) return;
  const totalCAtual = BASE_ITEM / PIX;
  // Só corrige se o orçamento ficou acima do sistema (situação problemática)
  if (totalCAtual <= TOTAL_SISTEMA_CARTAO + 0.005) return;

  // Queremos: (BASE_ITEM - descC) / PIX = TOTAL_SISTEMA_CARTAO
  // Logo:      descC = BASE_ITEM - TOTAL_SISTEMA_CARTAO × PIX
  const descNecessario = BASE_ITEM - TOTAL_SISTEMA_CARTAO * PIX;
  const iDescEl = el('iDescC');
  if (!iDescEl) return;
  iDescEl.value = descNecessario.toFixed(2);
  recalc();
  atualizarChkDesc();
  console.info('[HiperOrc] Ajuste arredondamento aplicado: desconto à vista =',
    descNecessario.toFixed(2), '→ totalC =', (BASE_ITEM - descNecessario) / PIX);
})();

// ── Enter desfoca o campo ativo ───────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'TEXTAREA') {
    document.activeElement.blur();
  }
});

el('select-parcelas-input').addEventListener('change', function() {
  const n = parseInt(this.value, 10) || 1;
  el('lblC').textContent = n <= 1
    ? 'Valor Total – À vista no Cartão de Crédito'
    : 'Valor Total – Parcelado em até ' + n + 'x no Cartão de Crédito';
});
el('select-parcelas-input').dispatchEvent(new Event('change'));

// ── Sincroniza altura das linhas de custo ─────────────────────────────────────
function sincronizarAlturasLinhas() {
  const rows      = document.querySelectorAll('#tblBody tr');
  const custoRows = document.querySelectorAll('#custoBody .custo-row');
  const header    = document.querySelector('.custo-header');
  const thead     = document.querySelector('#tblPrincipal thead');
  if(thead && header){
    header.style.height    = thead.offsetHeight + 'px';
    header.style.minHeight = thead.offsetHeight + 'px';
  }
  rows.forEach((row, i) => {
    const cr = custoRows[i];
    if(!cr) return;
    cr.style.height    = row.offsetHeight + 'px';
    cr.style.minHeight = row.offsetHeight + 'px';
  });
}
window.addEventListener('load', sincronizarAlturasLinhas);
window.addEventListener('resize', sincronizarAlturasLinhas);
document.addEventListener('input', () => setTimeout(sincronizarAlturasLinhas, 50));
setTimeout(sincronizarAlturasLinhas, 100);

// ── Vendedor ──────────────────────────────────────────────────────────────────
function onVendedor() {
  const inp  = el('iVendedor');
  const span = el('subVendedor');
  if (!inp) return;
  const texto = inp.value.trim();
  if (span) {
    span.style.display = texto ? '' : 'none';
    span.textContent   = texto ? 'Vendedor: ' + texto : '';
  }
  try {
    const bc = new BroadcastChannel('hiper_custo_channel');
    bc.postMessage({ type: 'HIPER_VENDEDOR_SAVE', text: inp.value, checked: !!texto });
    bc.close();
  } catch(e) { console.error('[HiperOrc] ❌ BroadcastChannel vendedor falhou:', e); }
}

// ── Observações ──────────────────────────────────────────────────────────────
function onObs() {
  const ta  = el('obsTexto');
  const pre = el('obsPrint');
  const box = el('obsBox');
  if (!ta || !pre) return;
  pre.textContent = ta.value;
  obsAutoResize(ta);
  if (box) box.classList.toggle('obs-vazia', !ta.value.trim());
}

function obsAutoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
}

// ── Seletor empresa PIX ───────────────────────────────────────────────────────
function onPixEmpresa() {
  // Sem lógica adicional — o select exibe o texto correto diretamente.
}

(function() {
  const v = ${vendedorJSON};
  if (!v.text) return;
  el('iVendedor').value = v.text || '';
  onVendedor();
})();

// ── Gera nome do arquivo PDF ───────────────────────────────────────────────────
function nomePdf() {
  const data  = new Date().toISOString().slice(0,10);
  const nome  = primeiroNomeCliente();
  return 'orcamento-' + NUM_ORC + '-' + nome + '-' + data + '.pdf';
}

function ocultarDescontoZeroNoClone(clone) {
  const chkDesc  = document.getElementById('chkDesc');
  const mostrar  = chkDesc && chkDesc.checked;
  if (!mostrar) {
    const rowDesc = clone.querySelector('#rowDesc');
    if (rowDesc) rowDesc.style.display = 'none';
  }
}

function congelarSelectEmClone(clone) {
  document.querySelectorAll('.page select').forEach(function(selectOriginal) {
    const id = selectOriginal.id;
    if (!id) return;
    const selectNoClone = clone.querySelector('#' + id);
    if (!selectNoClone) return;
    const val = selectOriginal.value;
    selectNoClone.querySelectorAll('option').forEach(function(opt) {
      opt.removeAttribute('selected');
      if (opt.value === val) { opt.setAttribute('selected', 'selected'); selectNoClone.value = val; }
    });
  });
}

function congelarInputsNoClone(clone) {
    clone.querySelectorAll('.inp-preco').forEach(function(inp) {
      const v = parseFloat(inp.value) || 0;
      const span = inp.nextElementSibling;
      if (span) {
        span.style.display = 'inline';
        span.textContent = 'R$ ' + v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      }
      inp.style.display = 'none';
    });

    const ids = ['valC', 'valV', 'iDescC'];
    
    ids.forEach(id => {
        const inputOriginal = document.getElementById(id);
        const spanNoClone = clone.querySelector('#' + id + '-print');
        
        if (inputOriginal && spanNoClone) {
            let valor = parseFloat(inputOriginal.value) || 0;
            
            spanNoClone.textContent = valor.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            
            const inputNoClone = clone.querySelector('#' + id);
            if (inputNoClone) inputNoClone.style.display = 'none';
            spanNoClone.style.display = 'inline-block';
        }
    });

    // Congela o campo de observações: oculta textarea, mostra texto estático
    const obsOriginal = document.getElementById('obsTexto');
    const taClone     = clone.querySelector('#obsTexto');
    const preClone    = clone.querySelector('#obsPrint');
    if (obsOriginal && taClone && preClone) {
        const txt = obsOriginal.value.trim();
        if (txt) {
            preClone.textContent  = txt;
            preClone.style.display = 'block';
        } else {
            // Se não há obs, esconde o bloco inteiro para não gerar espaço em branco
            const boxClone = clone.querySelector('#obsBox');
            if (boxClone) boxClone.style.display = 'none';
        }
        taClone.style.display = 'none';
        // Oculta o header "edição" (badge) no clone
        // label fica fora do box e já tem classe no-print — removido do clone antes desta função
    }
}

// ── Copiar imagem ─────────────────────────────────────────────────────────────
async function copiarImagem() {
  const btn = el('btnCopy');
  btn.disabled = true;
  btn.textContent = '⏳ Gerando imagem...';
  const MARGEM = 5;
  const A4_MM_W = 210, MARGIN_MM = 8;
  const MM_TO_PX = 3.7795275591;
  const A4_PX_W  = Math.round(A4_MM_W * MM_TO_PX);
  const ocultar = document.querySelectorAll('.no-print, .margem-box');
  ocultar.forEach(e => { e.dataset.prevDisplay = e.style.display; e.style.display = 'none'; });
  const page    = document.querySelector('.page');
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed','top:0','left:-9999px','background:#fff',
    'width:'+A4_PX_W+'px',
    'padding:'+Math.round(MARGIN_MM*MM_TO_PX)+'px',
    'box-sizing:border-box',
  ].join(';');
  const clone = page.cloneNode(true);
  clone.style.cssText = 'width:100%;max-width:none;padding:0;margin:0';
  clone.querySelectorAll('.no-print, .margem-box').forEach(e => e.remove());
  congelarSelectEmClone(clone);
  congelarInputsNoClone(clone);
  ocultarDescontoZeroNoClone(clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  await new Promise(r => setTimeout(r, 150));
  try {
    const inner = await html2canvas(wrapper, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: wrapper.offsetWidth, height: wrapper.offsetHeight, windowWidth: wrapper.offsetWidth,
    });
    document.body.removeChild(wrapper);
    ocultar.forEach(e => { e.style.display = e.dataset.prevDisplay || ''; });
    const m   = MARGEM * 2;
    const out = document.createElement('canvas');
    out.width  = inner.width  + m * 2;
    out.height = inner.height + m * 2;
    const ctx  = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(inner, m, m);
    out.toBlob(async (blob) => {
      try {
        window.focus();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        btn.textContent = '✅ Copiado! Cole no WhatsApp';
        btn.style.background = '#1a73e8';
        setTimeout(() => { btn.disabled = false; btn.textContent = '📋 Copiar para WhatsApp'; btn.style.background = '#25d366'; }, 3000);
      } catch (clipErr) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'orcamento.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        btn.disabled = false;
        btn.textContent = '⚠️ Não foi possível copiar — imagem baixada';
        btn.style.background = '#e8510a';
        setTimeout(() => { btn.textContent = '📋 Copiar para WhatsApp'; btn.style.background = '#25d366'; }, 4000);
      }
    }, 'image/png');
  } catch (e) {
    console.error('[HiperOrc] html2canvas falhou:', e);
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
    ocultar.forEach(e => { e.style.display = e.dataset.prevDisplay || ''; });
    btn.disabled = false;
    btn.textContent = '❌ Erro — tente novamente';
    setTimeout(() => { btn.textContent = '📋 Copiar para WhatsApp'; }, 3000);
  }
}

// ── Imprimir com cabeçalho ────────────────────────────────────────────────────
function imprimirFormatado() {
  _dbSalvar();
  const clienteNome  = el('iCliente')?.value.trim()  || '';
  const vendedorNome = el('iVendedor')?.value.trim() || '';

  const header = document.createElement('div');
  header.className = 'print-inject';
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0 2px 8px;border-bottom:1px solid #ddd;margin-bottom:12px;font-family:Arial,sans-serif;font-size:9pt;color:#888';
  header.innerHTML =
    '<span style="font-weight:bold;color:#888;font-size:10pt">Orçamento ' + NUM_ORC + '</span>' +
    '<span>' + (clienteNome ? 'Cliente: <strong style="color:#666">' + clienteNome + '</strong> &nbsp;|&nbsp; ' : '') +
    'Emitido em ' + new Date().toLocaleDateString('pt-BR') + '</span>';

  const footer = document.createElement('div');
  footer.className = 'print-inject';
  footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 2px 0;border-top:1px solid #ccc;margin-top:8px;font-family:Arial,sans-serif;font-size:8pt;color:#888';
  footer.innerHTML =
    '<span>Comércio e Serv. Gesso Acartonado Ltda &nbsp;|&nbsp; CNPJ 56.240.315/0001-60</span>' +
    '<span>' + (vendedorNome ? 'Vendedor: ' + vendedorNome + ' &nbsp;|&nbsp; ' : '') +
    '* Orçamento válido por 10 dias</span>';

  const page = document.querySelector('.page');
  page.insertBefore(header, page.firstChild);
  page.appendChild(footer);

  window.addEventListener('afterprint', function cleanup() {
    document.querySelectorAll('.print-inject').forEach(e => e.remove());
  }, { once: true });

  window.print();
}

// ── Baixar PDF ────────────────────────────────────────────────────────────────
async function baixarPdf() {
  const btn = el('btnPdf');
  btn.disabled = true;
  btn.textContent = '⏳ Gerando PDF...';
  const A4_MM_W = 210, A4_MM_H = 297, MARGIN_MM = 8;
  const MM_TO_PX = 3.7795275591;
  const A4_PX_W  = Math.round(A4_MM_W * MM_TO_PX);
  const ocultar  = document.querySelectorAll('.no-print, .margem-box');
  ocultar.forEach(e => { e.dataset.prevDisplay = e.style.display; e.style.display = 'none'; });
  const page    = document.querySelector('.page');
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed','top:0','left:-9999px','background:#fff',
    'width:'+A4_PX_W+'px',
    'padding:'+Math.round(MARGIN_MM*MM_TO_PX)+'px',
    'box-sizing:border-box',
  ].join(';');
  const clone = page.cloneNode(true);
  clone.style.cssText = 'width:100%;max-width:none;padding:0;margin:0';
  clone.querySelectorAll('.no-print, .margem-box').forEach(e => e.remove());
  congelarSelectEmClone(clone);
  congelarInputsNoClone(clone);
  ocultarDescontoZeroNoClone(clone);

  const clienteNome  = el('iCliente')?.value.trim()  || '';
  const vendedorNome = el('iVendedor')?.value.trim() || '';

  const pdfHeader = document.createElement('div');
  pdfHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0 2px 8px;border-bottom:1px solid #ddd;margin-bottom:12px;font-family:Arial,sans-serif;font-size:9pt;color:#888';
  pdfHeader.innerHTML =
    '<a href="https://tagdrywall.hiper.com.br/v1/#/pedido-venda/novo?recuperar=' + NUM_ORC + '" ' +
    'style="font-weight:bold;color:#888;font-size:10pt;text-decoration:none">Or\u00e7amento ' + NUM_ORC + '</a>' +
    '<span>' + (clienteNome ? 'Cliente: <strong style="color:#666">' + clienteNome + '</strong> &nbsp;|&nbsp; ' : '') +
    'Emitido em ' + new Date().toLocaleDateString('pt-BR') + '</span>';

  const pdfFooter = document.createElement('div');
  pdfFooter.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 2px 0;border-top:1px solid #ccc;margin-top:8px;font-family:Arial,sans-serif;font-size:8pt;color:#888';
  pdfFooter.innerHTML =
    '<span>Com\u00e9rcio e Serv. Gesso Acartonado Ltda &nbsp;|&nbsp; CNPJ 56.240.315/0001-60</span>' +
    '<span>' + (vendedorNome ? 'Vendedor: ' + vendedorNome + ' &nbsp;|&nbsp; ' : '') +
    '* Or\u00e7amento v\u00e1lido por 10 dias</span>';

  wrapper.appendChild(pdfHeader);
  wrapper.appendChild(clone);
  wrapper.appendChild(pdfFooter);
  document.body.appendChild(wrapper);
  await new Promise(r => setTimeout(r, 150));

  const headerPxReal = pdfHeader.offsetHeight;

  try {
    const SCALE = 2;
    const canvas = await html2canvas(wrapper, {
      scale: SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: wrapper.offsetWidth, height: wrapper.offsetHeight, windowWidth: wrapper.offsetWidth,
    });
    document.body.removeChild(wrapper);
    ocultar.forEach(e => { e.style.display = e.dataset.prevDisplay || ''; });
    const { jsPDF } = window.jspdf;
    const imgMmW     = (canvas.width  / SCALE) / MM_TO_PX;
    const imgMmH     = (canvas.height / SCALE) / MM_TO_PX;
    const contentMmW = A4_MM_W - MARGIN_MM * 2;
    const ratio      = contentMmW / imgMmW;
    const finalMmW   = imgMmW * ratio;
    const finalMmH   = imgMmH * ratio;
    const pageH = finalMmH <= (A4_MM_H - MARGIN_MM * 2) ? A4_MM_H : finalMmH + MARGIN_MM * 2;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:[A4_MM_W, pageH] });
    pdf.addImage(canvas.toDataURL('image/png',1.0),'PNG',MARGIN_MM,MARGIN_MM,finalMmW,finalMmH,undefined,'FAST');

    const wrapperPxH = canvas.height / SCALE;
    const headerMmH  = (headerPxReal / wrapperPxH) * finalMmH;
    const linkUrl    = 'https://tagdrywall.hiper.com.br/v1/#/pedido-venda/novo?recuperar=' + NUM_ORC;
    pdf.link(MARGIN_MM, MARGIN_MM + 8, 55, headerMmH, { url: linkUrl });

    pdf.save(nomePdf());

    _pdfBaixado = true;
    const badge = el('pdfBadge');
    if (badge) badge.classList.add('visible');
    btn.disabled = false;
    btn.textContent = '✅ ' + nomePdf();
    btn.style.background = '#1a7a1a';
    setTimeout(() => { btn.textContent = '⬇️ Baixar PDF novamente'; btn.style.background = '#e8510a'; }, 4000);
  } catch (e) {
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
    ocultar.forEach(e => { e.style.display = e.dataset.prevDisplay || ''; });
    console.error('Erro ao gerar PDF:', e);
    btn.disabled = false;
    btn.textContent = '❌ Erro — tente novamente';
    setTimeout(() => { btn.textContent = '⬇️ Baixar PDF'; btn.style.background = '#e8510a'; }, 3000);
  }
}

// ── Remover do estoque ────────────────────────────────────────────────────────
async function removerDoEstoque() {
  const btn = el('btnSaida');
  if (!btn || btn.disabled) return;

  const itensValidos = ITENS.filter(it => it.idProduto && (it.qtd ?? it.quantidade) > 0);
  if (!itensValidos.length) {
    alert('Nenhum item válido para remover do estoque.');
    return;
  }

  const confirmado = confirm(
    'Remover do estoque — orçamento ' + NUM_ORC + '\\n\\n' +
    itensValidos.map(it => '• ' + (it.nome || it.idProduto) + ' x ' + (it.qtd ?? it.quantidade)).join('\\n') +
    '\\n\\nOperação irreversível. Confirma?'
  );
  if (!confirmado) return;

  _dbSalvar();

  if (!window.opener || typeof window.opener.__hiperRemoverEstoque !== 'function') {
    alert('Extensão não disponível. Recarregue a página do Hiper e tente novamente.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = '⏳ Removendo…';

  const res = await window.opener.__hiperRemoverEstoque(NUM_ORC, itensValidos);

  if (res?.ok) {
    btn.textContent = '✅ Removido';
    btn.style.background = '#1a7a1a';
  } else if (res?.erro?.includes('já foi registrada')) {
    btn.textContent = '⚠️ Já removido';
    btn.style.background = '#c07000';
  } else {
    // erro tratado pelo listener HIPER_SAIDA_ERRO
  }
}

// ── Toast de status do DB (recebido via postMessage do hiper-db.js) ───────────
(function() {
  const _toastMap = new Map();

  function mostrarToastDB(codigo, estado) {
    const cfg = {
      enviando: { icon: '⏳', msg: 'Salvando ' + codigo + '…',        cor: '#2563eb', bg: '#eff6ff' },
      ok:       { icon: '✓',  msg: codigo + ' salvo',                 cor: '#15803d', bg: '#f0fdf4' },
      retry:    { icon: '⚠️', msg: codigo + ' — nova tentativa',      cor: '#b45309', bg: '#fffbeb' },
    }[estado];
    if (!cfg) return;

    let entry = _toastMap.get(codigo);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'no-print';
      el.style.cssText = [
        'position:fixed', 'bottom:20px', 'right:20px',
        'padding:9px 14px', 'border-radius:10px',
        'font-size:13px', 'font-family:sans-serif',
        'border:1px solid rgba(0,0,0,.07)',
        'box-shadow:0 4px 14px rgba(0,0,0,.10)',
        'display:flex', 'align-items:center', 'gap:8px',
        'opacity:0', 'transform:translateY(8px) scale(.97)',
        'transition:opacity .2s ease,transform .2s ease,background .3s ease',
        'z-index:99999', 'pointer-events:none',
      ].join(';');
      document.body.appendChild(el);
      entry = { el, timer: null };
      _toastMap.set(codigo, entry);
      requestAnimationFrame(() => {
        el.style.opacity   = '1';
        el.style.transform = 'translateY(0) scale(1)';
      });
    }

    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }

    const { el } = entry;
    el.style.background = cfg.bg;
    el.style.color      = cfg.cor;
    el.innerHTML = '<span style="font-size:14px;line-height:1">' + cfg.icon + '</span><span>' + cfg.msg + '</span>';

    if (estado === 'ok' || estado === 'retry') {
      entry.timer = setTimeout(() => {
        el.style.opacity   = '0';
        el.style.transform = 'translateY(8px) scale(.97)';
        setTimeout(() => { el.remove(); _toastMap.delete(codigo); }, 220);
      }, estado === 'ok' ? 3000 : 4000);
    }
  }

  window.addEventListener('message', function(ev) {
    if (ev.data?.type === 'HIPER_DB_TOAST') {
      mostrarToastDB(ev.data.codigo, ev.data.estado);
    }
    if (ev.data?.type === 'HIPER_SAIDA_ERRO') {
      const btn = el('btnSaida');
      if (btn) { btn.disabled = false; btn.textContent = '🏗️ Remover do estoque'; }
      alert('Erro ao registrar saída: ' + (ev.data.msg || 'desconhecido'));
    }
  });
})();
<\/script>
</body>
</html>
`;
}

function calcularParcelasPadrao(total) {
  if (total >= 2250) return 4;
  if (total >= 1500) return 3;
  if (total >= 750)  return 2;
  return 1;
}

async function abrirOrcamento() {
  const dados = extrairDadosPedido();
  const parcelasSelecionadas = calcularParcelasPadrao(dados.total || dados.itens.reduce((s, it) => s + it.qtd * it.vlUnit, 0));

  if (dados.itens.length === 0) {
    alert('Nenhum item encontrado. Adicione pelo menos um produto.');
    return;
  }

  let numeroOrcamento;
  try {
    numeroOrcamento = await gerarNumeroOrcamentoAsync();
  } catch (e) {
    console.error('[HiperOrc] ❌', e.message);
    alert(e.message);
    return;
  }
  window.__hiperNumeroOrcamentoAtual = numeroOrcamento;
  window.__hiperPedidoAberto = numeroOrcamento;

  const opcoes = {
    parcelas: parcelasSelecionadas,
    incluirEntrega: false,
    taxaEntrega: 50,
    numeroOrcamento,
  };
  const html = gerarHtmlOrcamento(dados, opcoes);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.__hiperBlobWindow = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}


// ── Registro no centralizador de UI (hiper-ui.js) ────────────────────────────
(function _registrarOrcamento() {
  function _criarBotao() {
    const btn = document.createElement('button');
    btn.id        = 'hiper-btn-orcamento';
    btn.type      = 'button';
    btn.className = 'btn btn-lg no-margin-bottom btn-block-xs';
    btn.style.cssText = 'background: rgba(46, 204, 113, 0.25); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.4); margin-top: 4px; font-size: 12px; font-weight: bold; border-radius: 4px; backdrop-filter: blur(4px); transition: all 0.2s;';
    btn.innerHTML = '📄 Orçamento';
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.borderColor = '#1a7a1a'; btn.style.color = '#1a7a1a'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.75'; btn.style.borderColor = '#ccc'; btn.style.color = '#555'; });
    btn.addEventListener('click', abrirOrcamento);
    console.info('[HiperCache] Botão de orçamento criado.');
    return btn;
  }

  function _registrar() {
    if (window.__hiperUI) {
      window.__hiperUI.registrar({ id: 'hiper-btn-orcamento', ordem: 0, render: _criarBotao });
    } else {
      setTimeout(_registrar, 50);
    }
  }
  _registrar();
})();

// ── Exportar custos ───────────────────────────────────────────────────────────
window.__hiperExportarCustos = async function() {
  window.postMessage({ type: 'HIPER_CUSTO_EXPORT_REQ' }, '*');
};

window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  if (ev.data?.type === 'HIPER_CUSTO_EXPORT_DATA') {
    const json = JSON.stringify(ev.data.custos, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'custos_tag_' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
});