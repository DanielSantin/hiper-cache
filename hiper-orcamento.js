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

function formatMoeda(n) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Geração de número de orçamento sequencial ─────────────────────────────────
// Formato: A1000, A1001 … A9999, B1000, B1001 … Z9999, AA1000, …
// Armazenado em localStorage com chave 'hiper_orc_counter'
function gerarNumeroOrcamento() {
  const CHAVE = 'hiper_orc_counter';
  let raw = 0;
  try { raw = parseInt(localStorage.getItem(CHAVE) || '0', 10) || 0; } catch(e) {}
  const novo = raw + 1;
  try { localStorage.setItem(CHAVE, String(novo)); } catch(e) {}

  // Converte índice numérico em código alfanumérico
  // Bloco de letras: cada letra cobre 9000 números (1000–9999)
  // Índice 1 → A1000, 9000 → A9999, 9001 → B1000, 18000 → B9999 …
  const idx0   = novo - 1;            // base-zero
  const bloco  = Math.floor(idx0 / 9000); // qual bloco de letras
  const dentro = (idx0 % 9000) + 1000;   // número dentro do bloco (1000–9999)

  // Converte bloco em letra(s): 0→A, 1→B … 25→Z, 26→AA, 27→AB …
  function blocoParaLetras(b) {
    let letras = '';
    b = b + 1; // 1-based para facilitar o módulo
    while (b > 0) {
      b--;
      letras = String.fromCharCode(65 + (b % 26)) + letras;
      b = Math.floor(b / 26);
    }
    return letras;
  }

  return blocoParaLetras(bloco) + String(dentro);
}

function extrairDadosPedido() {
  const itens = [];
  const NOME_FANTASMA = 'nome, código de barras, código do produto ou referência interna';

  function unidadeDoItem(linha) {
    const sel = linha.querySelector('[class*="unidade"] .select2-chosen, [class*="unidade"] option:checked');
    if (sel) return sel.textContent.trim();
    const inp = linha.querySelector('[class*="unidade"] input');
    if (inp && inp.value.length <= 4) return inp.value.trim().toUpperCase();
    return 'UN';
  }

  function adicionarItem(linha) {
    const nomeEl = linha.querySelector('.select2-chosen');
    const qtdEl  = linha.querySelector('[class*="quantidade-produto"] input');
    const vlEl   = linha.querySelector('[class*="valor-unitario-produto"] input');
    const stEl   = linha.querySelector('[class*="subtotal-produto"] input');
    if (!nomeEl || !qtdEl) return;
    const nome = nomeEl.textContent.trim();
    if (nome.toLowerCase() === NOME_FANTASMA) return;
    const qtd = parseMoedaOrc(qtdEl.value);
    if (!nome || qtd === 0) return;
    const codigo = extrairCodigoProduto(nome);
    itens.push({
      nome,
      qtd,
      unidade:  unidadeDoItem(linha),
      vlUnit:   parseMoedaOrc(vlEl?.value),
      subtotal: parseMoedaOrc(stEl?.value),
      idProduto: codigo,
    });
  }

  const primeiraLinha = document.querySelector('#ItensPedidoDeVendaTabela .produto-pedido-meli');
  if (primeiraLinha) adicionarItem(primeiraLinha);
  document.querySelectorAll('#ItensPedidoDeVendaTabela .linha-produto:not(.produto-pedido-meli)').forEach(adicionarItem);

  const descontoEl = document.querySelector('.totais-desconto .col-xs-9.col-sm-6.col-md-2');
  const freteEl    = document.querySelector('.totais-frete .col-xs-9.col-sm-6.col-md-2 p');
  const totalEl    = document.querySelector('.totais-valor-total .col-xs-9.col-sm-6.col-md-2 p, .valor-total');

  return {
    itens,
    desconto: parseMoedaOrc(descontoEl?.textContent),
    frete:    parseMoedaOrc(freteEl?.textContent),
    total:    parseMoedaOrc(totalEl?.textContent),
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

  const fmtN = (n) => n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  const linhasItens = itens.map((item, i) => {
    const vt = item.qtd * item.vlUnit;
    return '<tr>'+
      '<td class="c">'+(i+1)+'</td>'+
      '<td class="c">'+item.qtd.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>'+
      '<td class="c">'+item.unidade+'</td>'+
      '<td class="desc">'+item.nome+'</td>'+
      '<td class="r">R$ '+fmtN(item.vlUnit)+'</td>'+
      '<td class="r">R$ '+fmtN(vt)+'</td>'+
    '</tr>';
  }).join('');

  const vazias = Math.max(0, 8 - itens.length);
  const linhasVazias = Array(vazias).fill(
    '<tr class="vazia"><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  ).join('');

  const linhasCusto = itens.map(item => {
    const key = item.idProduto;
    const c   = key ? custosMap[key] : undefined;
    return '<div class="custo-row">'+
      '<input class="custo-inp '+(c!=null?'ok':'novo')+'"'+
      ' type="number" min="0" step="0.01" placeholder="—"'+
      ' data-id="'+(key||'')+'" data-nome="'+item.nome.replace(/"/g,'&quot;')+'"'+
      (c!=null?' value="'+c+'"':'')+'>'+
    '</div>';
  }).join('');

  const linhasVaziasC = Array(vazias).fill('<div class="custo-row"></div>').join('');

  const LOGO = window.__hiperLogo || window.__hiperLogoBase64 || '';

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

/* Coluna de custo */
.custo-col{width:88px;flex-shrink:0;border:1px solid #e0c040;background:#fffbe6}
.custo-header{background:#fffbe6;border-bottom:1px solid #e0c040;padding:4px 4px;font-size:9pt;text-align:center;font-weight:bold;color:#7a6000;display:flex;align-items:center;justify-content:center;}
.custo-body{display:flex;flex-direction:column}
.custo-row{border-bottom:1px solid #e0c040;display:flex;align-items:center;padding:2px 3px;overflow:hidden;}
.custo-row:last-child{border-bottom:none}
.custo-inp{width:100%;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;padding:0 2px;color:#333}
.custo-inp:focus{outline:1px solid #b8940a;background:#fff8dc;border-radius:2px}
.custo-inp.ok{color:#1a7a1a}.custo-inp.novo{color:#c07000}

/* Totais */
.totais-wrap{border:1px solid #000;border-top:none}
.trow{display:grid;grid-template-columns:1fr 110px 110px;border-bottom:1px solid #000}
.trow:last-child{border-bottom:none}
.trow .tlabel{padding:4px 8px;font-size:9pt;display:flex;align-items:center}
.trow .ttag{font-weight:bold;font-size:9.5pt;background:#e8e8e8;border-left:1px solid #000;display:flex;align-items:center;justify-content:center;padding:2px 4px;text-align:center}
.trow .ttag.pix{background:transparent}
.trow .ttag.cartao{background:transparent}
.trow .ttag select{border:none;background:transparent;font-size:9pt;font-weight:bold;font-family:Arial;cursor:pointer;text-align:center;width:100%;-webkit-appearance:auto}
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

.toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px;align-items:center;flex-wrap:wrap}
.btn-print{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#1a73e8}
.btn-copy{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#25d366}
.btn-copy:hover{background:#1da851}
.btn-copy:disabled{background:#aaa;cursor:default}
.btn-pdf{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#e8510a}
.btn-pdf:hover{background:#c44208}
.btn-pdf:disabled{background:#aaa;cursor:default}

.rodape{border:1px solid #000;border-top:none;padding:5px 8px;font-size:8pt;line-height:1.6}
.rodape .entrega{color:#c00;font-weight:bold;font-size:9pt;margin-top:3px}

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
}
</style>
</head>
<body>
<div class="page">

<div class="toolbar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <button class="btn-copy" id="btnCopy" onclick="copiarImagem()">📋 Copiar para WhatsApp</button>
  <button class="btn-pdf" id="btnPdf" onclick="baixarPdf()">⬇️ Baixar PDF</button>
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
    <label><input type="checkbox" id="chkVendedor" onchange="onVendedor()"> Observação:</label>
    <input type="text" id="iVendedor" placeholder="ex: Vendedor: João" maxlength="80"
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
  <div class="trow-entrega" id="rowE" style="display:none">
    <div class="tlabel">TAXA DE ENTREGA</div>
    <div class="tval" id="valE">—</div>
  </div>
  <div class="trow">
    <div class="tlabel"></div>
    <div class="ttag cartao" style="background:transparent;font-size:9pt;font-weight:bold">Desconto</div>
    <div class="tval">
      <span class="val-prefix">R$</span>
      <input class="val-inp" type="number" id="iDescC" value="0" min="0" step="0.01"
             oninput="onDescC()" placeholder="0,00" title="Clique para editar" style="width:75px">
      <span class="val-print" id="iDescC-print">0,00</span>
    </div>
  </div>
  <div class="trow">
    <div class="tlabel" id="lblC">Valor Total – Parcelado em até ${parcelas}x no Cartão de Crédito</div>
    <div class="ttag cartao" style="background:transparent;font-size:9pt;font-weight:bold">
      <select id="select-parcelas-input" style="...">
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n =>
              `<option value="${n}" ${n === parcelas ? 'selected' : ''}>
                  ${n === 1 ? 'CARTÃO 3x' : 'CARTÃO ' + n + 'x'}
              </option>`
          ).join('')}
      </select>
    </div>
    <div class="tval">
      <span class="val-prefix">R$</span>
      <input class="val-inp" type="number" id="valC" step="0.01" oninput="onValC()" style="width:75px">
      <span class="val-print" id="valC-print">0,00</span>
    </div>
  </div>
  <div class="trow">
    <div class="tlabel">Valor Total – À vista (PIX)</div>
    <div class="ttag pix">À VISTA pix</div>
    <div class="tval">
      <span class="val-prefix">R$</span>
      <input class="val-inp" type="number" id="valV" step="0.01" oninput="onValV()" style="width:75px">
      <span class="val-print" id="valV-print">0,00</span>
    </div>
  </div>
  <div class="validade-row">* ORÇAMENTO VÁLIDO POR 10 (DEZ) DIAS</div>
</div>

<div class="rodape">
  <div>Contato Vendas: Luciana Santin – Fone / Watts: +55 (69) 99237-1547</div>
  <div>Av. Rio de Janeiro, 5075 A - Nova Porto Velho – Em frente ao Sindsef</div>
  <div>Chave Pix CNPJ - 56.240.315/0001-60 – Guimarães &amp; Santin</div>
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

</div><!-- .page -->

<script>
const PIX       = 0.9523;
const BASE_ITEM = ${subtotalItens.toFixed(4)};
const ITENS     = ${itensJSON};
const CUSTOS_IN = ${custosJSON};
const custos    = Object.assign({}, CUSTOS_IN);
const NUM_ORC   = ${numOrcJSON};
let _descMaxCartao = NaN;
let _pdfBaixado = false;

// ── Aviso ao fechar sem baixar PDF ───────────────────────────────────────────
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
  return 'R$ '+Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtNum(n){
  if(isNaN(n)||n==null) return '—';
  return Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
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
  if(document.activeElement!==e) e.value=parseFloat(v).toFixed(2);
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

// Retorna o primeiro nome do cliente (para o nome do arquivo PDF)
function primeiroNomeCliente() {
  const inp = el('iCliente');
  if (!inp || !inp.value.trim()) return 'Cliente';
  const primeiro = inp.value.trim().split(/\s+/)[0];
  // Normaliza: remove acentos, caracteres especiais e espaços
  return primeiro
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
}

// ── Custos ────────────────────────────────────────────────────────────────────
function debounce(fn, delay=500){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

document.querySelectorAll('.custo-inp').forEach(inp=>{
  const salvarDebounced = debounce(()=>salvarCusto(inp), 500);
  inp.addEventListener('input', salvarDebounced);
});

function salvarCusto(inp) {
  const v    = parseFloat(inp.value);
  const id   = inp.dataset.id;
  const nome = inp.dataset.nome;
  if(!id) { console.warn('[HiperOrc] ⚠ Item sem código, custo não salvo. Nome:', nome); return; }
  if(isNaN(v) || v < 0) { console.warn('[HiperOrc] ⚠ Valor inválido:', inp.value); return; }
  custos[id] = v;
  inp.className = 'custo-inp ok';
  const msg = { type:'HIPER_CUSTO_SAVE', id, nome, val:v };
  try {
    const bc = new BroadcastChannel('hiper_custo_channel');
    bc.postMessage(msg);
    bc.close();
    console.log('[HiperOrc] 💾 Custo enviado — código:', id, '| valor:', v);
  } catch(e) { console.error('[HiperOrc] ❌ BroadcastChannel falhou:', e); }
  recalcMargem();
}

// ── Base dinâmica ──────────────────────────────────────────────────────────────
function getBase(){
  return BASE_ITEM+(el('chkE').checked?num('iE'):0);
}

// ── Recalcula totais ───────────────────────────────────────────────────────────
function recalc(){
  const base   = getBase();
  const descC  = num('iDescC');
  const totalC = Math.max(0, base - descC);
  const totalV = totalC * PIX;
  silent('valC', totalC.toFixed(2));
  silent('valV', totalV.toFixed(2));
  syncPrint('iDescC', descC);
  syncPrint('valC',   totalC);
  syncPrint('valV',   totalV);
  el('rowE').style.display = el('chkE').checked ? 'flex' : 'none';
  el('valE').textContent   = fmt(num('iE'));
  recalcMargem(totalC, totalV);
}

function onValC(){
  const base   = getBase();
  const totalC = num('valC');
  const totalV = totalC * PIX;
  silent('iDescC', Math.max(0, base - totalC).toFixed(2));
  silent('valV',   totalV.toFixed(2));
  syncPrint('iDescC', Math.max(0, base - totalC));
  syncPrint('valC',   totalC);
  syncPrint('valV',   totalV);
  recalcMargem(totalC, totalV);
}

function onValV(){
  const base   = getBase();
  const totalV = num('valV');
  const totalC = totalV / PIX;
  silent('iDescC', Math.max(0, base - totalC).toFixed(2));
  silent('valC',   totalC.toFixed(2));
  syncPrint('iDescC', Math.max(0, base - totalC));
  syncPrint('valC',   totalC);
  syncPrint('valV',   totalV);
  recalcMargem(totalC, totalV);
}

function onDescC(){ recalc(); }

// ── Margem ─────────────────────────────────────────────────────────────────────
function recalcMargem(totalC, totalV){
  if(totalC===undefined){
    const base = getBase();
    totalC = Math.max(0, base - num('iDescC'));
    totalV = totalC * PIX;
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
  _descMaxCartao = !isNaN(tcMin) ? Math.max(0, getBase() - tcMin) : NaN;
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
}

if(${frete0>0?'true':'false'}) el('chkE').checked=true;
recalc();

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
  const chk  = el('chkVendedor');
  const inp  = el('iVendedor');
  const span = el('subVendedor');
  if (!chk || !inp) return;
  const show = chk.checked && inp.value.trim() !== '';
  if (span) {
    span.style.display = show ? '' : 'none';
    span.textContent   = inp.value.trim();
  }
  try {
    const bc = new BroadcastChannel('hiper_custo_channel');
    bc.postMessage({ type: 'HIPER_VENDEDOR_SAVE', checked: chk.checked, text: inp.value });
    bc.close();
  } catch(e) { console.error('[HiperOrc] ❌ BroadcastChannel falhou:', e); }
}

(function() {
  const v = ${vendedorJSON};
  if (!v.text) return;
  el('chkVendedor').checked = !!v.checked;
  el('iVendedor').value = v.text || '';
  onVendedor();
})();

(function() {
  const bc = new BroadcastChannel('hiper_custo_channel');
  bc.onmessage = (ev) => {
    if (ev.data?.type !== 'HIPER_VENDEDOR_LOADED') return;
    const { checked, text } = ev.data;
    const chk = el('chkVendedor'), inp = el('iVendedor');
    if (!chk || !inp) return;
    chk.checked = !!checked;
    inp.value   = text || '';
    onVendedor();
    bc.close();
  };
  bc.postMessage({ type: 'HIPER_VENDEDOR_LOAD' });
})();

// ── Gera nome do arquivo PDF ───────────────────────────────────────────────────
function nomePdf() {
  const data  = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  const nome  = primeiroNomeCliente();
  return 'orcamento-' + NUM_ORC + '-' + nome + '-' + data + '.pdf';
}

function congelarSelectEmClone(clone) {
  const selectOriginal = document.querySelector('.page select');
  const selectNoClone  = clone.querySelector('select');
  if (selectOriginal && selectNoClone) {
    const val = selectOriginal.value;
    const opc = selectNoClone.querySelector('option[value="' + val + '"]');
    if (opc) { opc.setAttribute('selected', 'selected'); selectNoClone.value = val; }
  }
}

// ── Copiar imagem ─────────────────────────────────────────────────────────────
async function copiarImagem() {
  const btn = el('btnCopy');
  btn.disabled = true;
  btn.textContent = '⏳ Gerando imagem...';
  const MARGEM = 24;
  const ocultar = document.querySelectorAll('.no-print, .margem-box');
  ocultar.forEach(e => { e.dataset.prevDisplay = e.style.display; e.style.display = 'none'; });
  const page    = document.querySelector('.page');
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'background:transparent;display:inline-block;width:' + page.offsetWidth + 'px';
  const clone = page.cloneNode(true);
  clone.style.padding = '0';
  clone.querySelectorAll('.no-print, .margem-box').forEach(e => e.remove());
  congelarSelectEmClone(clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  try {
    const inner = await html2canvas(wrapper, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: wrapper.offsetWidth, height: wrapper.offsetHeight,
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
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  await new Promise(r => setTimeout(r, 150));
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
    pdf.save(nomePdf());

    // Marca como baixado e atualiza UI
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
<\/script>
</body>
</html>
`;
}

function calcularParcelasPadrao(total) {
  return Math.min(6, Math.max(1, Math.round(total / 300)));
}

function abrirOrcamento() {
  const dados = extrairDadosPedido();
  const selectParcelas = document.getElementById('hiper-select-parcelas');
  const parcelasSelecionadas = selectParcelas ? selectParcelas.value : 'Cartão 3X';

  if (dados.itens.length === 0) {
    alert('Nenhum item encontrado. Adicione pelo menos um produto.');
    return;
  }

  // Gera o número sequencial ANTES de abrir (incrementa o contador)
  const numeroOrcamento = gerarNumeroOrcamento();

  const opcoes = {
    parcelas: parcelasSelecionadas,
    incluirEntrega: false,
    taxaEntrega: 30,
    numeroOrcamento,
  };
  const html = gerarHtmlOrcamento(dados, opcoes);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}


function injetarBotaoOrcamento() {
  if (document.getElementById('hiper-btn-orcamento')) return;
  const barra = document.querySelector('#CadastroPedidoVenda .corpo-pedido-venda .parte-4 > div');
  if (!barra) return;

  const btn = document.createElement('button');
  btn.id        = 'hiper-btn-orcamento';
  btn.type      = 'button';
  btn.className = 'btn btn-lg no-margin-bottom btn-block-xs';
  btn.style.cssText = 'background:rgba(207, 124, 255, 0.3);color:rgb(200, 200, 200);border:1px solid #ccc;margin-top:4px;font-size:12px;opacity:0.75;';
  btn.innerHTML = '📄 Orçamento';
  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.borderColor = '#1a7a1a'; btn.style.color = '#1a7a1a'; });
  btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.75'; btn.style.borderColor = '#ccc'; btn.style.color = '#555'; });
  btn.addEventListener('click', abrirOrcamento);

  const ultimo = barra.querySelector('button.btn-gerar-pedido');
  if (ultimo) ultimo.after(btn);
  else barra.appendChild(btn);

  console.info('[HiperCache] Botão de orçamento injetado.');
}

new MutationObserver(() => {
  if (location.hash.includes('pedido-venda') && !document.getElementById('hiper-btn-orcamento')) {
    injetarBotaoOrcamento();
  }
}).observe(document.body || document.documentElement, { childList: true, subtree: true });

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