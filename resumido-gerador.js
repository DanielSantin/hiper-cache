// ═══════════════════════════════════════════════════════════════════════════════
// resumido-gerador.js — Gera o HTML do orçamento resumido e faz o patch
//
// Depende de:
//   • resumido-dados.js   — RESUMIDO_TEXTOS, RESUMIDO_NOMES, funções de cálculo
//   • resumido-runtime.js — carregado como TEXTO em window.RESUMIDO_RUNTIME_SRC
//                           pelo resumido-loader.js (via fetch, não como <script>)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Largura do layout ────────────────────────────────────────────────────────
// Ajuste este valor para controlar a largura da visualização e do PDF/WhatsApp.
// O PDF é sempre gerado em A4 — o layout é escalado automaticamente para caber.
// Valores testados: 600px (compacto), 700px (médio), 794px (largura A4 completa)
var RESUMIDO_LARGURA_PX = 550;

// ── CSS compartilhado ─────────────────────────────────────────────────────────
function _resumido_css() {
  return [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:Arial,sans-serif;font-size:9pt;color:#000;background:#fff}',
    '.page{width:100%;max-width:' + RESUMIDO_LARGURA_PX + 'px;margin:0 auto;padding:4mm 6mm}',
    '.header{display:flex;align-items:stretch;border:2px solid #000}',
    '.header-logo{padding:3px 8px;border-right:2px solid #000;display:flex;align-items:center;flex-direction:column;gap:1px}',
    '.tag-txt{font-size:24pt;font-weight:900;color:#1a5c1a;line-height:1}',
    '.orc-num{font-size:8pt;font-weight:bold;color:#1a5c1a;text-align:center}',
    '.hdr-emp{flex:1;padding:3px 10px;display:flex;flex-direction:column;justify-content:center}',
    '.hdr-emp .nome{font-size:11pt;font-weight:bold}',
    '.hdr-emp .sub{font-size:8pt;color:#555;margin-top:1px}',
    '.hdr-emp .sub-cliente{font-size:8pt;color:#555;margin-top:1px}',
    '.hdr-trevo{padding:3px 6px;border-left:2px solid #000;display:flex;align-items:center;justify-content:center}',
    '.tbl{width:100%;border-collapse:collapse}',
    '.tbl thead tr{background:#d0d0d0}',
    '.tbl th{padding:3px 4px;font-size:8pt;text-align:center;border:1px solid #000}',
    '.th-edit{outline:none;cursor:text;border-radius:2px;padding:1px 3px;display:inline-block;min-width:8px}',
    '.th-edit:focus{background:#fffde7;outline:1px solid #f0c040}',
    '.totais-wrap{border:1px solid #000;border-top:none}',
    '.trow{display:grid;grid-template-columns:1fr 100px 100px;border-bottom:1px solid #000}',
    '.trow:last-child{border-bottom:none}',
    '.trow .tlabel{padding:3px 6px;font-size:8.5pt;display:flex;align-items:center}',
    '.trow .ttag{font-weight:bold;font-size:8.5pt;background:#e8e8e8;border-left:1px solid #000;display:flex;align-items:center;justify-content:center;padding:2px 3px;text-align:center}',
    '.trow .ttag.pix{background:transparent}',
    '.trow .ttag.cartao{background:transparent}',
    '.trow .ttag select{border:none;background:transparent;font-size:8.5pt;font-weight:bold;font-family:Arial;cursor:pointer;text-align:center;width:100%;-webkit-appearance:auto}',
    '.trow .tval{border-left:1px solid #000;display:flex;align-items:center;justify-content:flex-end;padding:2px 6px;font-weight:bold;font-size:9.5pt;text-align:right}',
    '.trow-entrega{display:flex;border-bottom:1px solid #000}',
    '.trow-entrega .tlabel{flex:1;padding:3px 6px;font-size:8.5pt;font-weight:bold;display:flex;align-items:center}',
    '.trow-entrega .tval{padding:3px 8px;font-weight:bold;font-size:9.5pt;color:#c00;border-left:1px solid #000;width:100px;text-align:right;display:flex;align-items:center;justify-content:flex-end}',
    '.val-inp{width:100%;border:none;background:transparent;text-align:right;font-weight:bold;font-size:9.5pt;font-family:Arial;padding:0;color:#000;cursor:text}',
    '.val-inp:focus{outline:1px solid #1a73e8;background:#e8f0fe;border-radius:2px;padding:0 2px}',
    '.val-prefix{font-size:8pt;color:#888;margin-right:2px;flex-shrink:0}',
    '.val-print{display:none;font-weight:bold;font-size:9.5pt;color:#000;text-align:right}',
    '.validade-row{padding:3px 6px;font-size:8pt;color:#c00;font-weight:bold;border-top:1px solid #000}',
    '.rodape{border:1px solid #000;border-top:none;padding:3px 6px;font-size:7.5pt;line-height:1.5}',
    '.rodape .entrega{color:#c00;font-weight:bold;font-size:8pt;margin-top:2px}',
    '.rodape-pix-wrap{display:flex;align-items:center;flex-wrap:wrap}',
    '.rodape-pix-wrap select{border:none;background:transparent;font-size:8pt;font-family:Arial;font-weight:bold;cursor:pointer;-webkit-appearance:auto;padding:0}',
    '.panel{border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;background:#f4f8ff;border:1px solid #b3d4f5}',
    '.panel h4{font-size:12px;font-weight:bold;color:#1a3a6a;margin-bottom:8px}',
    '.panel-mo{background:#fff8f0;border-color:#f5c080}',
    '.panel-mo h4{color:#7a3a00}',
    '.prow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px}',
    '.prow:last-child{margin-bottom:0}',
    '.prow label{display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap}',
    '.prow input[type=number]{padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px}',
    '.prow input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#1a73e8}',
    '.toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px;align-items:center;flex-wrap:wrap}',
    '.btn-print{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#1a73e8}',
    '.btn-copy{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#25d366}',
    '.btn-copy:hover{background:#1da851}',
    '.btn-copy:disabled{background:#aaa;cursor:default}',
    '.btn-pdf{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#e8510a}',
    '.btn-pdf:hover{background:#c44208}',
    '.btn-pdf:disabled{background:#aaa;cursor:default}',
    '.pdf-badge{display:none;align-items:center;gap:6px;padding:4px 12px;background:#d4edda;border:1px solid #6dbf8a;border-radius:20px;font-size:12px;font-weight:bold;color:#1a5c1a}',
    '.pdf-badge.visible{display:flex}',
    '.resumido-tag{display:inline-block;background:#1a5c8a;color:#fff;font-size:8pt;font-weight:bold;padding:2px 6px;border-radius:3px;vertical-align:middle;margin-left:6px}',
    '.panel-sep{color:#ccc;font-size:14px}',
    '.cliente-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #d0ddf0}',
    '.cliente-row label{font-size:12px;font-weight:bold;color:#1a3a6a;white-space:nowrap}',
    '.cliente-inp{flex:1;padding:4px 8px;border:2px solid #7ab3e8;border-radius:4px;font-size:13px;font-weight:bold;color:#1a3a6a;min-width:180px;max-width:360px}',
    '.cliente-inp:focus{outline:none;border-color:#1a73e8;background:#f0f6ff}',
    '.cliente-badge{display:inline-block;font-size:9px;background:#d0e8ff;color:#1a3a6a;border-radius:3px;padding:1px 6px;font-weight:bold;letter-spacing:.3px}',
    /* MO column - hidden when printing */
    '.col-mo-base{background:#fff8f0}',
    '.mo-inp{width:62px;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;font-weight:bold;color:#7a3a00;cursor:text}',
    '.mo-inp:focus{outline:1px solid #e8510a;background:#fff3e0;border-radius:2px;padding:0 2px}',
    '.mo-tag{font-size:7.5pt;color:#e8510a;font-weight:bold;white-space:nowrap}',
    '.tbl-mo-header{background:#ffe4b5!important}',
    '.row-mo{}',
    '@media screen{',
    '  .page{max-width:700px}',   // <- largura desejada só na tela
    '}',
    '@media print{',
    '  .no-print{display:none!important}',
    '  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '  .page{max-width:' + RESUMIDO_LARGURA_PX + 'px;padding:3mm 5mm}',
    '  .val-inp,.val-prefix{display:none!important}',
    '  .val-print{display:inline!important}',
    '  .col-mo-base{display:none!important}',
    '  .tbl-mo-header{display:none!important}',
    '}'
    ,
  ].join('\n');
}

// ── Linhas da tabela de kits ──────────────────────────────────────────────────
function _resumido_linhasTabela(kitsInfo, totalV, varianteTabica) {
  var PIX   = 0.9523;
  var somaC = kitsInfo.reduce(function(s, k) { return s + k.custoRelativo; }, 0) || 1;
  var fmtN  = function(n) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  var linhas = kitsInfo.map(function(kit, i) {
    var prop  = kit.custoRelativo / somaC;
    var tcKit = totalV * prop;  // tcKit aqui = valor à vista por kit (nome histórico mantido)
    var area  = kit.A;

    // Para portas: exibe qtd total de portas como "área" e unidade "un."
    var isPortas = kit.nome === 'portas';
    var unid, areaExibida, nomeLabelExibido;

    if (isPortas && kit.grupos && kit.grupos.length > 0) {
      var qtdTotal = kit.grupos.reduce(function(s, g) { return s + (parseInt(g.qtd) || 0); }, 0);
      areaExibida  = qtdTotal;
      unid         = 'un.';
      // Usa a função do resumido-dados para gerar descrição compacta
      var descPortas = typeof resumido_descricaoPortas === 'function'
        ? resumido_descricaoPortas(kit.grupos)
        : (qtdTotal + ' porta(s)');
      nomeLabelExibido = 'Fechamento de ' + descPortas;
    } else {
      areaExibida      = area;
      unid             = kit.nome === 'cortineiro' ? 'ml' : 'm\u00b2';
      nomeLabelExibido = kit.nomeLabel;
    }

    var vlM2C = areaExibida > 0 ? tcKit / areaExibida : 0;
    var moBase = kit.moBase !== undefined ? kit.moBase : 30;
    var texto = kit.descricao !== undefined
      ? kit.descricao
      : (typeof resumido_resolverTexto === 'function'
          ? resumido_resolverTexto(kit.nome, varianteTabica, kit.cfg || null)
          : ((RESUMIDO_TEXTOS[kit.nome] || {})[varianteTabica] || ''));

    // Linha principal (material ou agrupado)
    var tr = '<tr>' +
      '<td class="td-num" style="text-align:center;border:1px solid #000;padding:3px 4px;vertical-align:middle;font-size:8pt">' + (i + 1) + '</td>' +
      '<td style="text-align:center;border:1px solid #000;padding:2px 3px;vertical-align:middle">' +
        '<input id="area-' + i + '" type="number" min="0" step="0.01" value="' + areaExibida.toFixed(2) + '"' +
        ' style="width:52px;border:none;background:transparent;text-align:right;font-size:8.5pt;font-family:Arial;font-weight:bold;color:#000"' +
        ' oninput="onArea(' + i + ')" title="Editar quantidade">' +
      '</td>' +
      '<td style="text-align:center;border:1px solid #000;padding:2px 3px;vertical-align:middle">' +
        '<span id="und-' + i + '" contenteditable="true" style="font-size:8.5pt;font-weight:bold;outline:none;cursor:text;display:inline-block;min-width:18px;border-radius:2px;padding:1px 2px"' +
        ' onfocus="this.style.background=\'#fffde7\';this.style.outline=\'1px solid #f0c040\'"' +
        ' onblur="this.style.background=\'\';this.style.outline=\'none\'">' + unid + '</span>' +
      '</td>' +
      '<td style="text-align:left;border:1px solid #000;padding:3px 5px;vertical-align:top">' +
        '<div contenteditable="true" id="nomeLabel-' + i + '" ' +
        'style="font-weight:bold;font-size:8.5pt;margin-bottom:2px;outline:none;cursor:text;border-radius:2px;padding:1px 2px" ' +
        'onfocus="this.style.background=\'#fffde7\';this.style.outline=\'1px solid #f0c040\'" ' +
        'onblur="this.style.background=\'\';this.style.outline=\'none\'">' + nomeLabelExibido + '</div>' +
        '<div contenteditable="true" id="desc-' + i + '" style="font-size:8pt;color:#222;line-height:1.4;text-align:justify;outline:none;cursor:text;border-radius:2px;padding:1px 2px" ' +
        'onfocus="this.style.background=\'#fffde7\';this.style.outline=\'1px solid #f0c040\'" ' +
        'onblur="this.style.background=\'\';this.style.outline=\'none\'" ' +
        'class="no-print-border">' + texto + '</div>' +
      '</td>' +
      '<td style="text-align:right;border:1px solid #000;padding:2px 3px;vertical-align:middle">' +
        '<input id="m2c-' + i + '" type="number" min="0" step="0.01" value="' + vlM2C.toFixed(2) + '"' +
        ' style="width:64px;border:none;background:transparent;text-align:right;font-size:8.5pt;font-family:Arial;font-weight:bold;color:#000"' +
        ' oninput="onM2(' + i + ')" title="Editar R$/un">' +
      '</td>' +
      '<td style="text-align:right;border:1px solid #000;padding:2px 3px;vertical-align:middle">' +
        '<input id="totc-' + i + '" type="number" min="0" step="0.01" value="' + tcKit.toFixed(2) + '"' +
        ' style="width:68px;border:none;background:transparent;text-align:right;font-size:8.5pt;font-family:Arial;font-weight:bold;color:#000"' +
        ' oninput="onTotKit(' + i + ')" title="Editar total">' +
      '</td>' +
      // Coluna MO Base (oculta na impressão)
      '<td class="col-mo-base no-print" style="text-align:right;border:1px solid #000;padding:2px 5px;vertical-align:middle;min-width:90px">' +
        '<input id="mobase-' + i + '" class="mo-inp" type="number" min="0" step="0.01" value="' + moBase.toFixed(2) + '"' +
        ' oninput="onMoBase(' + i + ')" title="Custo base MO">' +
        '<div class="mo-tag" id="mo-venda-' + i + '">Venda: R$ ' + fmtN(_calcVendaMo(moBase, 13.53, 30)) + '</div>' +
      '</td>' +
      '</tr>';

    return tr;
  }).join('');

  var vazias = Math.max(0, 4 - kitsInfo.length);
  var linhasVazias = '';
  for (var v = 0; v < vazias; v++) {
    linhasVazias += '<tr>' +
      '<td style="height:16px;border:1px solid #000"></td>' +
      '<td style="border:1px solid #000"></td>' +
      '<td style="border:1px solid #000"></td>' +
      '<td style="border:1px solid #000"></td>' +
      '<td style="border:1px solid #000"></td>' +
      '<td style="border:1px solid #000"></td>' +
      '<td class="col-mo-base no-print" style="border:1px solid #000"></td>' +
      '</tr>';
  }
  return linhas + linhasVazias;
}

// Fórmula: venda = custoBase / (1 - imposto% - lucro%)
// Lucro = venda - custo - imposto*venda  =>  lucro% de venda = 1 - custo/venda - imposto%
// Para lucroMeta% e impostoNF%: venda = custo / (1 - imposto/100 - lucroMeta/100)
function _calcVendaMo(custoBase, impostoNF, lucroMeta) {
  var div = 1 - impostoNF / 100 - lucroMeta / 100;
  if (div <= 0) return 0;
  return custoBase / div;
}

// ── Monta o bloco <script> embutido no HTML gerado ────────────────────────────
// Todos os dados são serializados via JSON.stringify — sem escaping manual.
// O runtime é concatenado como texto puro (já lido pelo loader).
function _resumido_montarScript(kitsInfo, numeroOrcamento, clienteNome, vendedorTexto) {
    console.log('[debug] RESUMIDO_RUNTIME_SRC length:', typeof RESUMIDO_RUNTIME_SRC, 
    typeof RESUMIDO_RUNTIME_SRC === 'string' ? RESUMIDO_RUNTIME_SRC.length : 0);

    var runtimeSrc = (typeof RESUMIDO_RUNTIME_SRC === 'string' && RESUMIDO_RUNTIME_SRC)
    ? RESUMIDO_RUNTIME_SRC
    : 'console.error("[HiperResumido] RESUMIDO_RUNTIME_SRC nao carregado.");';

  runtimeSrc = runtimeSrc.replace(/<\/script>/gi, '<\\/script>');

  var somaPeso = kitsInfo.reduce(function(s, k) { return s + k.custoRelativo; }, 0) || 1;

  var cabecalho = [
    'var _PIX       = 0.9523;',
    'var _LAYOUT_W  = ' + JSON.stringify(RESUMIDO_LARGURA_PX) + ';',
    'var _NR        = ' + JSON.stringify(numeroOrcamento) + ';',
    'var _KI        = ' + JSON.stringify(kitsInfo) + ';',
    'var _SOMA_PESO = ' + JSON.stringify(somaPeso) + ';',
    'var _pdfOK     = false;',
    'var _CLIENTE   = ' + JSON.stringify(clienteNome   || '') + ';',
    'var _VENDEDOR  = ' + JSON.stringify(vendedorTexto || '') + ';',
    '// MO config (editável no painel)',
    'var _MO_IMPOSTO = 13.53;  // % NF serviço',
    'var _MO_LUCRO   = 30;     // % lucro desejado',
    'var _MO_ATIVA   = false;  // checkbox incluir MO',
    'var _MO_AGRUPAR = true;   // agrupar mat+MO na mesma linha',
    '',
    'window.addEventListener("beforeunload", function(e) {',
    '  if (_pdfOK) return;',
    '  var m = "O PDF do or\u00e7amento " + _NR + " ainda n\u00e3o foi baixado.";',
    '  e.preventDefault(); e.returnValue = m; return m;',
    '});',
    '',
    '// === resumido-runtime.js ===',
    runtimeSrc,
  ].join('\n');

  var ABRIR = '<' + 'script>';
  var FECHAR = '</' + 'script>';
  return ABRIR + '\n' + cabecalho + '\n' + FECHAR;
}

// ── Gera o HTML completo do orçamento resumido ────────────────────────────────
function resumido_gerarHtml(payload, opcoes) {
  var kitsInfo        = payload.kitsInfo;
  var totalCartaoBase = payload.totalCartaoBase;
  var varianteTabica  = payload.varianteTabica;
  var avisoMisto      = payload.avisoMisto;
  var LOGO            = payload.LOGO;
  var numeroOrcamento = payload.numeroOrcamento;
  var dataHoje        = payload.dataHoje;
  var clienteNome     = payload.clienteNome || '';
  var vendedorTexto   = payload.vendedorTexto || '';

  var parcelas = (opcoes && opcoes.parcelas) || 3;
  var frete    = (opcoes && opcoes.frete)    || 0;

  var IMG_TEL   = (typeof window !== 'undefined' && window.__hiperIconeTel)   || '';
  var IMG_WHATS = (typeof window !== 'undefined' && window.__hiperIconeWhats) || '';

  var PIX    = 0.9523;
  var fmtN   = function(n) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var totalV = totalCartaoBase + frete;  // à vista é a base
  var totalC = totalV / PIX;             // cartão = à vista / 0.9523 (~5% a mais)

  var corpoTabela = _resumido_linhasTabela(kitsInfo, totalV, varianteTabica);
  var scriptTag   = _resumido_montarScript(kitsInfo, numeroOrcamento, clienteNome, vendedorTexto);

  var avisoHtml = avisoMisto
    ? '<div id="avisoMisto" style="background:#fff3cd;border:1px solid #e0c040;border-radius:4px;padding:7px 12px;margin-bottom:8px;font-size:10pt" class="no-print">' +
      '\u26a0\ufe0f <strong>Aten\u00e7\u00e3o:</strong> detectados dois tipos de tabica (branca 3006 e natural 3010). ' +
      'O texto usa a variante mista. Confirme antes de enviar ao cliente.</div>'
    : '';

  var selectOptions = [1,2,3,4,5,6,7,8,9,10,11,12].map(function(n) {
    return '<option value="' + n + '"' + (n === parcelas ? ' selected' : '') + '>CART\u00c3O ' + n + 'x</option>';
  }).join('');

  var clienteDiv  = '<div class="sub-cliente" id="subCliente"' + (clienteNome   ? '' : ' style="display:none"') + '>' + (clienteNome  ? 'Cliente: '  + clienteNome   : '') + '</div>';
  var vendedorDiv = '<div class="sub" id="subVendedor"'        + (vendedorTexto ? '' : ' style="display:none"') + '>' + (vendedorTexto ? 'Vendedor: ' + vendedorTexto : '') + '</div>';

  var S = '<' + 'script';
  var E = '</' + 'script>';

  // Painel de entrega + cliente + vendedor (estrutura idêntica ao hiper-orcamento)
  var panelEntrega = '<div class="panel no-print">\n' +
    '<h4>\u2699\uFE0F Op\u00e7\u00f5es \u2014 <strong style="color:#1a5c1a">' + numeroOrcamento + '</strong> <span class="resumido-tag">RESUMIDO</span></h4>\n' +
    '<div class="prow">\n' +
    '<label><input type="checkbox" id="chkE" onchange="recalcTotais()"' + (frete > 0 ? ' checked' : '') + '> Entrega R$</label>\n' +
    '<input type="number" id="iE" value="' + (frete > 0 ? frete : 30) + '" min="0" step="0.01" style="width:72px" oninput="recalcTotais()">\n' +
    '<span class="panel-sep">|</span>\n' +
    '<label style="font-weight:bold;color:#1a3a6a;white-space:nowrap">Vendedor:</label>\n' +
    '<input type="text" id="iVendedor" placeholder="ex: Daniel Santin" maxlength="80"\n' +
    '  value="' + (vendedorTexto || '').replace(/"/g, '&quot;') + '"\n' +
    '  style="flex:1;min-width:140px;padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px"\n' +
    '  oninput="onVendedor()">\n' +
    '</div>\n' +
    '<div class="cliente-row">\n' +
    '<label for="iCliente">Cliente:</label>\n' +
    '<input type="text" id="iCliente" class="cliente-inp" placeholder="Nome do cliente\u2026" maxlength="80"\n' +
    '  value="' + (clienteNome || '').replace(/"/g, '&quot;') + '"\n' +
    '  oninput="onCliente()" autocomplete="off">\n' +
    '<span class="cliente-badge">aparece no cabe\u00e7alho e no PDF</span>\n' +
    '</div>\n' +
    '</div>\n';

  var panelMO = '<div class="panel panel-mo no-print">\n' +
    '<h4>\uD83D\uDEE0\uFE0F M\u00e3o de Obra \u2014 configura\u00e7\u00e3o de servi\u00e7o</h4>\n' +
    '<div class="prow">\n' +
    '<label><input type="checkbox" id="chkMO" onchange="onToggleMO()"> Incluir m\u00e3o de obra</label>\n' +
    '<label><input type="checkbox" id="chkAgrupar" checked onchange="onToggleAgrupar()"> Agrupar (mat. + MO juntos)</label>\n' +
    '</div>\n' +
    '<div class="prow">\n' +
    '<label>Imposto NF servi\u00e7o: <input type="number" id="cfgImposto" value="13.53" min="0" max="100" step="0.01" style="width:64px" oninput="onCfgMO()"> %</label>\n' +
    '<label>Lucro servi\u00e7o: <input type="number" id="cfgLucro" value="30" min="0" max="100" step="0.01" style="width:56px" oninput="onCfgMO()"> %</label>\n' +
    '<span style="font-size:11px;color:#888">\u2192 Custo base configur\u00e1vel por item na coluna laranja (oculta na impress\u00e3o)</span>\n' +
    '</div>\n' +
    '<div class="prow">\n' +
    '<button onclick="adicionarLinhaCustom()" style="padding:5px 14px;border:none;border-radius:5px;background:#1a5c8a;color:#fff;font-size:12px;font-weight:bold;cursor:pointer">+ Adicionar linha</button>\n' +
    '<span style="font-size:11px;color:#888">Adiciona um item edit\u00e1vel em branco na tabela</span>\n' +
    '</div>\n' +
    '</div>\n';

  return '<!DOCTYPE html>\n' +
    '<html lang="pt-BR">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<title>Or\u00e7amento Resumido ' + numeroOrcamento + ' \u2014 ' + dataHoje + '</title>\n' +
    S + ' src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js">' + E + '\n' +
    S + ' src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js">' + E + '\n' +
    '<style>\n' + _resumido_css() + '\n</style>\n' +
    '</head>\n<body>\n' +
    S + '>\n' +
    '(function() {\n' +
    '  function ajustarEscala() {\n' +
    '    var page = document.querySelector(".page");\n' +
    '    if (!page) return;\n' +
    '    var vw = window.innerWidth || document.documentElement.clientWidth;\n' +
    '    var LAYOUT = ' + RESUMIDO_LARGURA_PX + ';\n' +
    '    // Só escala se a janela for maior que o layout\n' +
    '    var escala = vw > LAYOUT ? Math.min(vw / LAYOUT, 1.5) : 1;\n' +
    '    page.style.transform = "scale(" + escala + ")";\n' +
    '    page.style.transformOrigin = "top center";\n' +
    '    // Compensa o espaço "perdido" pelo scale\n' +
    '    var h = page.offsetHeight;\n' +
    '    document.body.style.minHeight = Math.round(h * escala) + "px";\n' +
    '  }\n' +
    '  window.addEventListener("load", ajustarEscala);\n' +
    '  window.addEventListener("resize", ajustarEscala);\n' +
    '})();\n' +
    E + '\n' +
    '<div class="page">\n' +

    '<div class="toolbar no-print">\n' +
    '<button class="btn-print" onclick="window.print()">\uD83D\uDDA8\uFE0F Imprimir / Salvar PDF</button>\n' +
    '<button class="btn-copy" id="btnCopy" onclick="copiarImagem()">\uD83D\uDCCB Copiar para WhatsApp</button>\n' +
    '<button class="btn-pdf" id="btnPdf" onclick="baixarPdf()">\u2B07\uFE0F Baixar PDF</button>\n' +
    '<div class="pdf-badge" id="pdfBadge">\u2705 PDF baixado</div>\n' +
    '</div>\n' +

    panelEntrega +
    panelMO +
    avisoHtml + '\n' +

    '<div class="header">\n' +
    '<div class="header-logo"><div class="tag-txt">TAG</div><div class="orc-num">' + numeroOrcamento + '</div></div>\n' +
    '<div class="hdr-emp">\n' +
    '<div class="nome">Com\u00e9rcio e Serv. Gesso Acartonado Ltda</div>\n' +
    '<div class="sub">Or\u00e7amento gerado em ' + dataHoje + ' </div>\n' +
    clienteDiv + '\n' + vendedorDiv + '\n' +
    '</div>\n' +
    '<div class="hdr-trevo"><img src="' + LOGO + '" width="48" height="48" style="object-fit:contain" alt="Trevo"></div>\n' +
    '</div>\n' +

    '<table class="tbl"><thead><tr>\n' +
    '<th style="width:24px">ITEM</th>\n' +
    '<th style="width:68px"><span contenteditable="true" class="th-edit">\u00c1REA</span></th>\n' +
    '<th style="width:32px"><span contenteditable="true" class="th-edit">UND</span></th>\n' +
    '<th><span contenteditable="true" class="th-edit">DESCRI\u00c7\u00c3O</span></th>\n' +
    '<th style="width:76px"><span contenteditable="true" class="th-edit">R$/M\u00b2</span></th>\n' +
    '<th style="width:82px"><span contenteditable="true" class="th-edit">VL TOTAL</span></th>\n' +
    '<th class="col-mo-base tbl-mo-header no-print" style="width:96px">\uD83D\uDEE0\uFE0F CUSTO BASE MO</th>\n' +
    '</tr></thead>\n' +
    '<tbody id="tblBody">' + corpoTabela + '</tbody>\n' +
    '</table>\n' +

    '<div class="totais-wrap">\n' +
    '<div class="trow-entrega" id="rowE" style="display:' + (frete > 0 ? 'flex' : 'none') + '">\n' +
    '<div class="tlabel">TAXA DE ENTREGA</div>\n' +
    '<div class="tval" id="valEntrega">R$ ' + fmtN(frete) + '</div>\n' +
    '</div>\n' +
    '<div class="trow">\n' +
    '<div class="tlabel" id="lblParc">Valor Total \u2013 Parcelado em at\u00e9 ' + parcelas + 'x no Cart\u00e3o de Cr\u00e9dito</div>\n' +
    '<div class="ttag cartao"><select id="selParcelas" onchange="recalcTotais()" style="border:none;background:transparent;font-size:9pt;font-weight:bold;font-family:Arial;cursor:pointer;text-align:center;width:100%;-webkit-appearance:auto">' +
    selectOptions + '</select></div>\n' +
    '<div class="tval"><span class="val-prefix">R$</span>\n' +
    '<input class="val-inp" type="number" id="valC" step="0.01" style="width:75px" value="' + totalC.toFixed(2) + '" oninput="onValC()">\n' +
    '<span class="val-print" id="valC-p">' + fmtN(totalC) + '</span></div>\n' +
    '</div>\n' +
    '<div class="trow">\n' +
    '<div class="tlabel">Valor Total \u2013 \u00c0 vista (PIX)</div>\n' +
    '<div class="ttag pix">\u00c0 VISTA PIX</div>\n' +
    '<div class="tval"><span class="val-prefix">R$</span>\n' +
    '<input class="val-inp" type="number" id="valV" step="0.01" style="width:75px" value="' + totalV.toFixed(2) + '" oninput="onValV()">\n' +
    '<span class="val-print" id="valV-p">' + fmtN(totalV) + '</span></div>\n' +
    '</div>\n' +
    '<div class="validade-row">* OR\u00c7AMENTO V\u00c1LIDO POR 10 (DEZ) DIAS</div>\n' +
    '</div>\n' +

    '<div class="rodape">\n' +
    '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:5px">\n' +
    '<div style="display:flex;align-items:center;gap:6px">\n' +
    '<strong>Atendimento Loja: (69) 3213-1072</strong>' +
    (IMG_TEL   ? '<img src="' + IMG_TEL   + '" style="width:12px;height:12px">' : '') +
    (IMG_WHATS ? '<img src="' + IMG_WHATS + '" style="width:13px;height:13px">' : '') +
    '</div>\n' +
    '<div style="display:flex;align-items:center;gap:6px">\n' +
    '<strong>Luciana Santin: (69) 99237-1547</strong>' +
    (IMG_TEL   ? '<img src="' + IMG_TEL   + '" style="width:12px;height:12px">' : '') +
    (IMG_WHATS ? '<img src="' + IMG_WHATS + '" style="width:13px;height:13px">' : '') +
    '</div>\n' +
    '</div>\n' +
    '<div>Av. Rio de Janeiro, 5075 A - Nova Porto Velho \u2013 Em frente ao Sindsef</div>\n' +
    '<div class="rodape-pix-wrap">' +
    '<span>Chave Pix CNPJ  \u2013 </span>' +
    '<select id="selPixEmpresa" onchange="onPixEmpresa()" style="border:none;background:transparent;font-size:8pt;font-family:Arial;font-weight:bold;cursor:pointer;-webkit-appearance:auto">' +
    '<option value="gs" selected>56.240.315/0001-60 \u2013 Guimar\u00e3es &amp; Santin</option>' +
    '<option value="tag">18.282.959/0001-22 \u2013 TAG Comercio e Servico</option>' +
    '</select>' +
    '</div>\n' +
    '<div class="entrega">\u27a1 ENTREGA SOMENTE NO T\u00c9RREO</div>\n' +
    '</div>\n' +

    '</div><!-- .page -->\n' +
    scriptTag + '\n' +
    '</body>\n</html>';
}

// ── Gera PDF do detalhado em background ───────────────────────────────────────
async function _baixarDetalhadoEmBackground(dados, opcoes) {
  try {
    await _garantirLibs();
    var html = gerarHtmlOrcamento(dados, opcoes);
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;background:#fff;font-family:Arial,sans-serif;font-size:10pt;color:#000;z-index:-1;pointer-events:none';
    var bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    container.innerHTML = bodyMatch ? bodyMatch[1] : html;
    container.querySelectorAll('script, .no-print, .margem-box').forEach(function(e) { e.remove(); });
    document.body.appendChild(container);
    await new Promise(function(r) { setTimeout(r, 50); });
    var page = container.querySelector('.page');
    if (!page) throw new Error('.page nao encontrado no HTML gerado');
    var M = 3.7795275591, A4 = 210, MG = 8;
    var canvas = await window.html2canvas(page, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: page.offsetWidth, height: page.offsetHeight, windowWidth: page.offsetWidth,
    });
    document.body.removeChild(container);
    var jsPDF = window.jspdf.jsPDF;
    var iW = (canvas.width  / 2) / M, iH = (canvas.height / 2) / M;
    var r  = (A4 - MG * 2) / iW;
    var fW = iW * r, fH = iH * r;
    var pH = fH <= 281 ? 297 : fH + MG * 2;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [A4, pH] });
    pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', MG, MG, fW, fH, undefined, 'FAST');
    var nomeArq = 'orcamento-' + opcoes.numeroOrcamento + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
    pdf.save(nomeArq);
    console.info('[HiperResumido] PDF detalhado salvo:', nomeArq);
  } catch (e) {
    console.warn('[HiperResumido] Falha ao gerar PDF detalhado:', e && e.message || e);
  }
}

function _garantirLibs() {
  var promises = [];
  if (!window.html2canvas) {
    promises.push(new Promise(function(res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }));
  }
  if (!window.jspdf) {
    promises.push(new Promise(function(res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }));
  }
  return Promise.all(promises);
}

// ── Abre orçamento resumido (botão dedicado) ──────────────────────────────────
function abrirOrcamentoResumido() {
  var kitsAtivos = window.kitsAtivos;
  var semKits = !kitsAtivos || kitsAtivos.size === 0;
  var dadosOrc = typeof extrairDadosPedido === 'function' ? extrairDadosPedido() : { itens: [], total: 0 };

  if (!semKits && !dadosOrc.itens.length) {
    alert('Nenhum item encontrado no orcamento atual.');
    return;
  }

  var kitsArr = [];
  if (semKits) {
    kitsArr = [
      { nome: '_gen1', nomeLabel: 'Fornecimento de material de gesso',
        descricao: 'Fornecimento de materiais para sistema de gesso acartonado (drywall).',
        A: 0, P: 0, cant: 0, grupos: null, cfg: null },
    ];
  } else {
    kitsAtivos.forEach(function(estado, nome) {
      kitsArr.push({
        nome:   nome,
        A:      estado.A    || 0,
        P:      estado.P    || 0,
        cant:   estado.cant || 3.15,
        grupos: estado.grupos || null,
        cfg:    estado.cfg   || null,
      });
    });
  }
  var varianteTabica  = resumido_detectarTabica(dadosOrc.itens);
  var totalCartaoBase = dadosOrc.itens.reduce(function(s, it) { return s + it.qtd * it.vlUnit; }, 0);
  var kitsInfo;
  if (semKits) {
    kitsInfo = kitsArr.map(function(k) {
      return {
        nome: k.nome, nomeLabel: k.nomeLabel, descricao: k.descricao,
        A: 0, P: 0, cant: 0, grupos: null, cfg: null,
        custoRelativo: 0, totalCartao: 0, moBase: 30,
      };
    });
  } else {
  var custoPorKit     = resumido_custoPorKit(kitsArr, dadosOrc.itens);
  var kitsArrAgrupado = typeof resumido_agruparKitsArr === 'function'
    ? resumido_agruparKitsArr(kitsArr, custoPorKit)
    : kitsArr;
  var somaC           = Object.values(custoPorKit).reduce(function(s, v) { return s + v; }, 0) || 1;
  kitsInfo = kitsArrAgrupado.map(function(k) {
    return {
      nome:          k.nome,
      nomeLabel:     typeof resumido_resolverNome === 'function'
                       ? resumido_resolverNome(k.nome, k.cfg)
                       : (RESUMIDO_NOMES[k.nome] || k.nome),
      A:             k.A,
      P:             k.P,
      cant:          k.cant,
      grupos:        k.grupos || null,
      cfg:           k.cfg   || null,
      custoRelativo: k.custoRelativo,
      totalCartao:   (k.custoRelativo / somaC) * totalCartaoBase,
      moBase:        typeof resumido_resolverMoBase === 'function'
                       ? resumido_resolverMoBase(k.nome, k.cfg)
                       : ((typeof RESUMIDO_MO_BASE !== 'undefined' ? RESUMIDO_MO_BASE[k.nome] : null) || 30),
    };
  });
  } // fim else (semKits)
  var clienteEl  = document.getElementById('iCliente');
  var vendedorEl = document.getElementById('iVendedor');
  var _vend = window.__hiperVendedor || {};
  // Prioriza o campo iVendedor digitado na aba do orçamento;
  // cai para __hiperVendedor (storage) caso o campo não exista ou esteja vazio.
  var vendedorTextoFinal = (vendedorEl && vendedorEl.value.trim())
    ? vendedorEl.value.trim()
    : ((_vend.checked && _vend.text) ? _vend.text.trim() : '');
  var payload = {
    kitsInfo: kitsInfo, totalCartaoBase: totalCartaoBase,
    varianteTabica: varianteTabica, avisoMisto: varianteTabica === 'misto',
    LOGO: window.__hiperLogo || window.__hiperLogoBase64 || '',
    numeroOrcamento: opcoes.numeroOrcamento,
    dataHoje: new Date().toLocaleDateString('pt-BR'),
    clienteNome: (clienteEl && clienteEl.value.trim()) || '',
    vendedorTexto: vendedorTextoFinal,
  };
  var htmlResumido = resumido_gerarHtml(payload, { parcelas: 3, frete: 0 });
  var blobR = new Blob([htmlResumido], { type: 'text/html;charset=utf-8' });
  var urlR  = URL.createObjectURL(blobR);
  window.open(urlR, '_blank');
  setTimeout(function() { URL.revokeObjectURL(urlR); }, 120000);
  _baixarDetalhadoEmBackground(dadosOrc, { parcelas: 3, incluirEntrega: false, taxaEntrega: 30, numeroOrcamento: payload.numeroOrcamento });
}

// ── Monkey-patch em gerarHtmlOrcamento ────────────────────────────────────────
(function patchGerarHtml() {
  var MAX = 80, tentativas = 0;
  function tentar() {
    if (typeof gerarHtmlOrcamento !== 'function') {
      if (++tentativas < MAX) { setTimeout(tentar, 150); }
      else { console.warn('[HiperResumido] gerarHtmlOrcamento nao encontrada.'); }
      return;
    }
    var _original = gerarHtmlOrcamento;
    window.gerarHtmlOrcamento = function(dados, opcoes) {
      var html = _original(dados, opcoes);
      var kitsAtivos = window.kitsAtivos;
      var semKits = !kitsAtivos || kitsAtivos.size === 0;
      var dadosOrc = typeof extrairDadosPedido === 'function' ? extrairDadosPedido() : { itens: [] };
      var totalBase = dadosOrc.itens.reduce(function(s, it) { return s + it.qtd * it.vlUnit; }, 0);
      var varTab    = resumido_detectarTabica(dadosOrc.itens);
      var kitsInfo;

      if (semKits) {
        kitsInfo = [
          { nome: '_gen1', nomeLabel: 'Fornecimento de material de gesso',
            descricao: 'Fornecimento de materiais para sistema de gesso acartonado (drywall).',
            A: 0, P: 0, cant: 0, grupos: null, cfg: null, custoRelativo: 0, totalCartao: 0, moBase: 30 },
        ];
      } else {
        var kitsArr = [];
        kitsAtivos.forEach(function(estado, nome) {
          kitsArr.push({
            nome:   nome,
            A:      estado.A    || 0,
            P:      estado.P    || 0,
            cant:   estado.cant || 3.15,
            grupos: estado.grupos || null,
            cfg:    estado.cfg   || null,
          });
        });
        var custoPorKit     = resumido_custoPorKit(kitsArr, dadosOrc.itens);
        var kitsArrAgrupado = typeof resumido_agruparKitsArr === 'function'
          ? resumido_agruparKitsArr(kitsArr, custoPorKit)
          : kitsArr;
        var somaC = Object.values(custoPorKit).reduce(function(s, v) { return s + v; }, 0) || 1;
        kitsInfo = kitsArrAgrupado.map(function(k) {
          return {
            nome:          k.nome,
            nomeLabel:     typeof resumido_resolverNome === 'function'
                             ? resumido_resolverNome(k.nome, k.cfg)
                             : (RESUMIDO_NOMES[k.nome] || k.nome),
            A:             k.A,
            P:             k.P,
            cant:          k.cant,
            grupos:        k.grupos || null,
            cfg:           k.cfg   || null,
            custoRelativo: k.custoRelativo,
            totalCartao:   (k.custoRelativo / somaC) * totalBase,
            moBase:        typeof resumido_resolverMoBase === 'function'
                             ? resumido_resolverMoBase(k.nome, k.cfg)
                             : ((typeof RESUMIDO_MO_BASE !== 'undefined' ? RESUMIDO_MO_BASE[k.nome] : null) || 30),
          };
        });
      }
      var clienteEl  = document.getElementById('iCliente');
      var vendedorEl = document.getElementById('iVendedor');
      var _vend = window.__hiperVendedor || {};
      var vendedorTextoFinal = (vendedorEl && vendedorEl.value.trim())
        ? vendedorEl.value.trim()
        : ((_vend.checked && _vend.text) ? _vend.text.trim() : '');
      var payloadR = {
        kitsInfo: kitsInfo, totalCartaoBase: totalBase,
        varianteTabica: varTab, avisoMisto: varTab === 'misto',
        LOGO: window.__hiperLogoBase64 || window.__hiperLogo || '',
        numeroOrcamento: opcoes.numeroOrcamento,
        dataHoje: new Date().toLocaleDateString('pt-BR'),
        clienteNome: (clienteEl && clienteEl.value.trim()) || '',
        vendedorTexto: vendedorTextoFinal,
      };

      // Gera o HTML completo do resumido em memória e serializa com JSON.stringify.
      // JSON.stringify produz uma string JS segura — sem risco de </script> no output.
      var htmlResumido  = resumido_gerarHtml(payloadR, { parcelas: 3, frete: 0 });
      var htmlResumidoJ = JSON.stringify(htmlResumido).replace(/<\/script>/gi, '<\\/script>');

      var SI = '<' + 'script';
      var EI = '</' + 'script>';

      var scriptInline = '\n' + SI + ' id="hiper-resumido-patch">\n' +
        '(function() {\n' +
        '  var _HTML = ' + htmlResumidoJ + ';\n' +
        '  window.__gerarResumidoDaAba = function() {\n' +
        '    // Relê cliente e vendedor da aba do orçamento no momento do clique\n' +
        '    var cEl = document.getElementById("iCliente");\n' +
        '    var vEl = document.getElementById("iVendedor");\n' +
        '    var cliente  = cEl ? cEl.value.trim()  : "";\n' +
        '    var vendedor = vEl ? vEl.value.trim()  : "";\n' +
        '    var html = _HTML\n' +
        '      .replace(/(var _CLIENTE\\s*=\\s*)"[^"]*"/, "$1" + JSON.stringify(cliente))\n' +
        '      .replace(/(var _VENDEDOR\\s*=\\s*)"[^"]*"/, "$1" + JSON.stringify(vendedor));\n' +
        '    var blob = new Blob([html], { type: "text/html;charset=utf-8" });\n' +
        '    var url  = URL.createObjectURL(blob);\n' +
        '    window.open(url, "_blank");\n' +
        '    setTimeout(function() { URL.revokeObjectURL(url); }, 120000);\n' +
        '  };\n' +
        '})();\n' +
        EI + '\n';

      html = html.replace('</body>', scriptInline + '\n</body>');
      return html;
    };
    console.info('[HiperResumido] Patch em gerarHtmlOrcamento aplicado.');
  }
  tentar();
})();

window.abrirOrcamentoResumido = abrirOrcamentoResumido;