// ═══════════════════════════════════════════════════════════════════════════════
// hiper-orcamento-resumido.js — Orçamento resumido (versão texto para o cliente)
//
// Depende de (mesma página do ERP):
//   • kit.js            → window.kitsAtivos, FORMULAS_GESSO
//   • hiper-orcamento.js → extrairDadosPedido(), gerarNumeroOrcamento()
//
// Como funciona:
//   1. Na aba do ERP: botão "📝 Resumido" injetado ao lado de "📄 Orçamento".
//      Clique → lê kitsAtivos + itens do orçamento → gera HTML resumido em nova aba.
//
//   2. No HTML do orçamento DETALHADO: monkey-patch em gerarHtmlOrcamento()
//      injeta botão "📝 Resumido" ao lado de "⬇️ Baixar PDF".
//      Clique → gera HTML resumido usando dados serializados no próprio HTML.
//
// Sem modal — geração direta.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Textos descritivos por kit × variante de tabica ────────────────────────────
const RESUMIDO_TEXTOS = {
  estruturado: {
    branca:  `Fornecimento de material completo para Forro de gesso acartonado sistema estruturado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, tabica galvanizada cor branca (pintura automotiva de fábrica), Perfis galvanizado tipo F-530 (gramatura 0,50mm), arame galvanizado nº 10, Suporte nivelador, Conector, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Forro de gesso acartonado sistema estruturado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, tabica galvanizada natural, Perfis galvanizado tipo F-530 (gramatura 0,50mm), arame galvanizado nº 10, Suporte nivelador, Conector, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Forro de gesso acartonado sistema estruturado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, tabica galvanizada (branca e natural conforme projeto), Perfis galvanizado tipo F-530 (gramatura 0,50mm), arame galvanizado nº 10, Suporte nivelador, Conector, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
  aramado: {
    branca:  `Fornecimento de material completo para Forro de gesso acartonado sistema aramado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm, Tabica galvanizada cor branca (pintura automotiva de fábrica), Junção H, arame galvanizado nº 18, Sisal, Gesso em pó, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Forro de gesso acartonado sistema aramado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm, Tabica galvanizada natural, Junção H, arame galvanizado nº 18, Sisal, Gesso em pó, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Forro de gesso acartonado sistema aramado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm, Tabica galvanizada (branca e natural conforme projeto), Junção H, arame galvanizado nº 18, Sisal, Gesso em pó, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
  paredes: {
    branca:  `Fornecimento de material completo para Parede Drywall de Gesso Acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Parede Drywall de Gesso Acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Parede Drywall de Gesso Acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
  cortineiro: {
    branca:  `Fornecimento de material completo para Sancas de gesso acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm Marca Trevo, Cantoneira de aço galvanizado, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Sancas de gesso acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm Marca Trevo, Cantoneira de aço galvanizado, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Sancas de gesso acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm Marca Trevo, Cantoneira de aço galvanizado, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
};

const RESUMIDO_NOMES = {
  estruturado: 'Forro Estruturado',
  aramado:     'Forro Aramado',
  paredes:     'Parede Drywall',
  cortineiro:  'Sanca / Cortineiro',
};

const COD_TABICA_BRANCA  = '3006';
const COD_TABICA_NATURAL = '3010';

// ── Helpers ────────────────────────────────────────────────────────────────────
function resumido_detectarTabica(itens) {
  const temB = itens.some(it => it.idProduto === COD_TABICA_BRANCA);
  const temN = itens.some(it => it.idProduto === COD_TABICA_NATURAL);
  if (temB && temN) return 'misto';
  if (temN) return 'natural';
  return 'branca';
}

// Distribui o custo de cada item do orçamento entre os kits ativos.
//
// Para cada produto:
//   - Exclusivo de 1 kit  → 100% do custo para esse kit
//   - Compartilhado       → divide proporcionalmente pelas quantidades BRUTAS
//                           que cada fórmula calcularia (sem arredondamento).
//                           Ex: forro pede 1.3 un, parede pede 2.2 un →
//                           forro recebe 1.3/(1.3+2.2) do custo total do item.
//   - Não mapeado         → divide igualmente como fallback
//
// Retorna: { nomeKit → valor monetário (R$) atribuído }
function resumido_custoPorKit(kitsArr, itens) {
  const FORMULAS = window.FORMULAS_GESSO || (typeof FORMULAS_GESSO !== 'undefined' ? FORMULAS_GESSO : {});
  // Preço unitário de cada produto presente no orçamento
  const precos = {};
  itens.forEach(it => { if (it.idProduto) precos[it.idProduto] = it.vlUnit || 0; });

  // Inicializa acumuladores
  const resultado = {};
  kitsArr.forEach(k => { resultado[k.nome] = 0; });

  itens.forEach(item => {
    const cod     = item.idProduto;
    const vlTotal = item.qtd * item.vlUnit;
    if (!cod || vlTotal <= 0) return;

    // Kits ativos que têm fórmula para este produto
    const kitsComProduto = kitsArr.filter(k =>
      typeof (FORMULAS[k.nome] || {})[cod] === 'function'
    );

    if (kitsComProduto.length === 0) {
      // Produto não mapeado — divide igualmente
      const parte = vlTotal / kitsArr.length;
      kitsArr.forEach(k => { resultado[k.nome] += parte; });
      return;
    }

    if (kitsComProduto.length === 1) {
      // Exclusivo — 100% para o kit que o usa
      resultado[kitsComProduto[0].nome] += vlTotal;
      return;
    }

    // Compartilhado — calcula quantidade bruta (sem arredondamento) de cada kit
    // e usa como peso para dividir o custo proporcionalmente
    const qtdBrutaPorKit = kitsComProduto.map(k => {
      const fn = FORMULAS[k.nome][cod];
      return Math.max(fn(k.A || 0, k.P || 0, k.cant || 3.15), 0);
    });

    const somaQtd = qtdBrutaPorKit.reduce((s, v) => s + v, 0);

    if (somaQtd <= 0) {
      // Fórmulas retornaram zero — divide igualmente
      const parte = vlTotal / kitsComProduto.length;
      kitsComProduto.forEach(k => { resultado[k.nome] += parte; });
      return;
    }

    // Distribui proporcionalmente: kit_i recebe (qtd_i / soma) * vlTotal
    kitsComProduto.forEach((k, i) => {
      resultado[k.nome] += (qtdBrutaPorKit[i] / somaQtd) * vlTotal;
    });
  });

  // Garante que nenhum kit fique com zero (evita divisão por zero downstream)
  kitsArr.forEach(k => {
    if (resultado[k.nome] <= 0) resultado[k.nome] = 0.001;
  });

  return resultado;
}

// ── Gera o HTML do orçamento resumido ─────────────────────────────────────────
// payload: { kitsInfo, totalCartaoBase, varianteTabica, avisoMisto,
//            LOGO, numeroOrcamento, dataHoje, clienteNome, vendedorTexto }
// opcoes:  { parcelas, desconto, frete }
function resumido_gerarHtml(payload, opcoes) {
  const {
    kitsInfo, totalCartaoBase, varianteTabica, avisoMisto,
    LOGO, numeroOrcamento, dataHoje, clienteNome, vendedorTexto,
  } = payload;

  const { parcelas = 3, desconto = 0, frete = 0 } = opcoes || {};

  const PIX  = 0.9523;
  const fmtN = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const somaC    = kitsInfo.reduce((s, k) => s + k.custoRelativo, 0) || 1;
  const totalC   = Math.max(0, totalCartaoBase - desconto) + frete;
  const totalV   = totalC * PIX;

  const linhasTabela = kitsInfo.map((kit, i) => {
    const prop  = kit.custoRelativo / somaC;
    const tcKit = totalC * prop;
    const tvKit = tcKit * PIX;
    const area  = kit.A;
    const unid  = kit.nome === 'cortineiro' ? 'ml' : 'm²';
    const vlM2C = area > 0 ? tcKit / area : 0;
    const vlM2V = area > 0 ? tvKit / area : 0;
    const texto = (RESUMIDO_TEXTOS[kit.nome] || {})[varianteTabica] || '';

    return `<tr>
      <td style="text-align:center;border:1px solid #000;padding:5px 6px;vertical-align:middle">${i + 1}</td>
      <td style="text-align:center;border:1px solid #000;padding:5px 6px;vertical-align:middle">${fmtN(area)} ${unid}</td>
      <td style="text-align:center;border:1px solid #000;padding:5px 6px;vertical-align:middle">${unid}</td>
      <td style="text-align:left;border:1px solid #000;padding:5px 6px;vertical-align:top">
        <div style="font-weight:bold;margin-bottom:3px">${kit.nomeLabel}</div>
        <div style="font-size:8.5pt;color:#222;line-height:1.5">${texto}</div>
        <div style="margin-top:5px;font-size:8pt;color:#555;display:flex;gap:12px;flex-wrap:wrap">
          <span>🃏 Cartão: <strong class="m2c-${i}">R$ ${fmtN(vlM2C)}/m²</strong></span>
          <span>💲 À vista: <strong class="m2v-${i}">R$ ${fmtN(vlM2V)}/m²</strong></span>
        </div>
      </td>
      <td style="text-align:right;border:1px solid #000;padding:5px 6px;vertical-align:middle" id="tdM2-${i}">R$ ${fmtN(vlM2C)}</td>
      <td style="text-align:right;border:1px solid #000;padding:5px 6px;vertical-align:middle" id="tdTot-${i}">R$ ${fmtN(tcKit)}</td>
    </tr>`;
  }).join('');

  const vazias = Math.max(0, 4 - kitsInfo.length);
  const linhasVazias = Array(vazias).fill(
    '<tr><td style="height:22px;border:1px solid #000"></td>' +
    '<td style="border:1px solid #000"></td><td style="border:1px solid #000"></td>' +
    '<td style="border:1px solid #000"></td><td style="border:1px solid #000"></td>' +
    '<td style="border:1px solid #000"></td></tr>'
  ).join('');

  const avisoHtml = avisoMisto ? `
    <div id="avisoMisto" style="background:#fff3cd;border:1px solid #e0c040;border-radius:4px;
         padding:7px 12px;margin-bottom:8px;font-size:10pt" class="no-print">
      ⚠️ <strong>Atenção:</strong> detectados dois tipos de tabica no orçamento
      (branca 3006 <em>e</em> galvanizada natural 3010). O texto usa a variante mista.
      Confirme antes de enviar ao cliente.
    </div>` : '';

  // Serializa payload + textos para que a aba possa se auto-regenerar
  const payloadJSON  = JSON.stringify(payload).replace(/<\/script>/gi, '<\\/script>');
  const textosJSON   = JSON.stringify(RESUMIDO_TEXTOS).replace(/<\/script>/gi, '<\\/script>');
  const nomesJSON    = JSON.stringify(RESUMIDO_NOMES);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orçamento Resumido ${numeroOrcamento} — ${dataHoje}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#fff}
.page{width:100%;max-width:260mm;margin:0 auto;padding:8mm 10mm}
.header{display:flex;align-items:stretch;border:2px solid #000}
.header-logo{padding:6px 12px;border-right:2px solid #000;display:flex;align-items:center;flex-direction:column;gap:2px}
.tag-txt{font-size:32pt;font-weight:900;color:#1a5c1a;line-height:1}
.orc-num{font-size:9pt;font-weight:bold;color:#1a5c1a;text-align:center}
.hdr-emp{flex:1;padding:6px 14px;display:flex;flex-direction:column;justify-content:center}
.hdr-emp .nome{font-size:13pt;font-weight:bold}
.hdr-emp .sub{font-size:9pt;color:#555;margin-top:2px}
.hdr-trevo{padding:4px 8px;border-left:2px solid #000;display:flex;align-items:center;justify-content:center}
.tbl{width:100%;border-collapse:collapse}
.tbl thead tr{background:#d0d0d0}
.tbl th{padding:4px 5px;font-size:9pt;text-align:center;border:1px solid #000}
.totais-wrap{border:1px solid #000;border-top:none}
.trow{display:grid;grid-template-columns:1fr 110px 110px;border-bottom:1px solid #000}
.trow:last-child{border-bottom:none}
.trow .tlabel{padding:4px 8px;font-size:9pt;display:flex;align-items:center}
.trow .ttag{font-weight:bold;font-size:9.5pt;background:#e8e8e8;border-left:1px solid #000;
            display:flex;align-items:center;justify-content:center;padding:2px 4px;text-align:center}
.trow .tval{border-left:1px solid #000;display:flex;align-items:center;justify-content:flex-end;
            padding:2px 8px;font-weight:bold;font-size:10pt}
.val-inp{width:100%;border:none;background:transparent;text-align:right;font-weight:bold;
         font-size:10pt;font-family:Arial;padding:0;color:#000;cursor:text}
.val-inp:focus{outline:1px solid #1a73e8;background:#e8f0fe;border-radius:2px;padding:0 2px}
.val-prefix{font-size:9pt;color:#888;margin-right:2px;flex-shrink:0}
.val-print{display:none;font-weight:bold;font-size:10pt;color:#000}
.validade-row{padding:4px 8px;font-size:8.5pt;color:#c00;font-weight:bold;border-top:1px solid #000}
.rodape{border:1px solid #000;border-top:none;padding:5px 8px;font-size:8pt;line-height:1.6}
.rodape .entrega{color:#c00;font-weight:bold;font-size:9pt;margin-top:3px}
.panel{border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;background:#f4f8ff;border:1px solid #b3d4f5}
.panel h4{font-size:12px;font-weight:bold;color:#1a3a6a;margin-bottom:8px}
.prow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.prow label{display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap}
.prow input[type=number]{padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px}
.prow input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#1a73e8}
.toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px;align-items:center;flex-wrap:wrap}
.btn-print{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#1a73e8}
.btn-copy{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#25d366}
.btn-pdf{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold;background:#e8510a}
.pdf-badge{display:none;align-items:center;gap:6px;padding:4px 12px;background:#d4edda;
           border:1px solid #6dbf8a;border-radius:20px;font-size:12px;font-weight:bold;color:#1a5c1a}
.pdf-badge.visible{display:flex}
.resumido-tag{display:inline-block;background:#1a5c8a;color:#fff;font-size:8pt;font-weight:bold;
              padding:2px 6px;border-radius:3px;vertical-align:middle;margin-left:6px;letter-spacing:.3px}
@media print{
  .no-print{display:none!important}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:210mm;padding:4mm 6mm}
  .val-inp,.val-prefix{display:none!important}
  .val-print{display:inline!important}
}
</style>
</head>
<body>
<div class="page">

<div class="toolbar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <button class="btn-copy" id="btnCopy" onclick="copiarImagem()">📋 Copiar para WhatsApp</button>
  <button class="btn-pdf"  id="btnPdf"  onclick="baixarPdf()">⬇️ Baixar PDF</button>
  <div class="pdf-badge" id="pdfBadge">✅ PDF baixado</div>
</div>

<div class="panel no-print">
  <h4>⚙️ Opções — <strong style="color:#1a5c1a">${numeroOrcamento}</strong>
    <span class="resumido-tag">RESUMIDO</span></h4>
  <div class="prow">
    <label>Parcelas cartão:
      <select id="selParcelas" onchange="recalcTotais()"
        style="padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n =>
          `<option value="${n}" ${n === parcelas ? 'selected' : ''}>${n}x</option>`
        ).join('')}
      </select>
    </label>
    <span style="color:#ccc">|</span>
    <label><input type="checkbox" id="chkE" onchange="recalcTotais()"${frete > 0 ? ' checked' : ''}> Entrega R$
      <input type="number" id="iE" value="${frete > 0 ? frete : 30}" min="0" step="0.01"
        style="width:72px" oninput="recalcTotais()">
    </label>
    <span style="color:#ccc">|</span>
    <label>Desconto R$
      <input type="number" id="iDesc" value="${desconto}" min="0" step="0.01"
        style="width:80px" oninput="recalcTotais()">
    </label>
  </div>
</div>

${avisoHtml}

<div class="header">
  <div class="header-logo">
    <div class="tag-txt">TAG</div>
    <div class="orc-num">${numeroOrcamento}</div>
  </div>
  <div class="hdr-emp">
    <div class="nome">Comércio e Serv. Gesso Acartonado Ltda</div>
    <div class="sub">Orçamento gerado em ${dataHoje} <span class="resumido-tag">RESUMIDO</span></div>
    ${clienteNome   ? `<div class="sub"><strong>Cliente:</strong> ${clienteNome}</div>`   : ''}
    ${vendedorTexto ? `<div class="sub">${vendedorTexto}</div>` : ''}
  </div>
  <div class="hdr-trevo"><img src="${LOGO}" width="64" height="64" style="object-fit:contain" alt="Trevo"></div>
</div>

<table class="tbl">
  <thead>
    <tr>
      <th style="width:28px">ITEM</th>
      <th style="width:70px">ÁREA</th>
      <th style="width:32px">UND</th>
      <th>DESCRIÇÃO</th>
      <th style="width:80px">R$/M²</th>
      <th style="width:90px">VL TOTAL</th>
    </tr>
  </thead>
  <tbody>${linhasTabela}${linhasVazias}</tbody>
</table>

<div class="totais-wrap">
  <div class="trow" id="rowEntrega" style="display:${frete > 0 ? 'grid' : 'none'}">
    <div class="tlabel">TAXA DE ENTREGA</div>
    <div class="ttag"></div>
    <div class="tval" id="valEntrega">R$ ${fmtN(frete)}</div>
  </div>
  <div class="trow">
    <div class="tlabel" id="lblParc">Valor Total – Parcelado em até ${parcelas}x no Cartão de Crédito</div>
    <div class="ttag" id="tagParc">CARTÃO ${parcelas}x</div>
    <div class="tval">
      <span class="val-prefix">R$</span>
      <input class="val-inp" type="number" id="valC" step="0.01" style="width:75px"
             value="${totalC.toFixed(2)}" oninput="onValC()">
      <span class="val-print" id="valC-p">${fmtN(totalC)}</span>
    </div>
  </div>
  <div class="trow">
    <div class="tlabel">Valor Total – À vista (PIX)</div>
    <div class="ttag">À VISTA PIX</div>
    <div class="tval">
      <span class="val-prefix">R$</span>
      <input class="val-inp" type="number" id="valV" step="0.01" style="width:75px"
             value="${totalV.toFixed(2)}" oninput="onValV()">
      <span class="val-print" id="valV-p">${fmtN(totalV)}</span>
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

</div><!-- .page -->

<script>
const _PAYLOAD  = ${payloadJSON};
const _TEXTOS   = ${textosJSON};
const _NOMES    = ${nomesJSON};
const _KI       = _PAYLOAD.kitsInfo;
const _BASE     = _PAYLOAD.totalCartaoBase;
const _PIX      = 0.9523;
const _NR       = _PAYLOAD.numeroOrcamento;
let   _pdfOK    = false;

window.addEventListener('beforeunload', e => {
  if (_pdfOK) return;
  const m = 'O PDF do orçamento resumido ' + _NR + ' ainda não foi baixado.';
  e.preventDefault(); e.returnValue = m; return m;
});

function el(id)  { return document.getElementById(id); }
function num(id) { const v = parseFloat(el(id)?.value); return isNaN(v) ? 0 : v; }
function fN(n)   { return Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function recalcTotais() {
  const desc = num('iDesc');
  const fr   = el('chkE')?.checked ? num('iE') : 0;
  const parc = parseInt(el('selParcelas')?.value || '3');
  const somaC = _KI.reduce((s, k) => s + k.custoRelativo, 0) || 1;
  const tc   = Math.max(0, _BASE - desc) + fr;
  const tv   = tc * _PIX;

  _KI.forEach((kit, i) => {
    const prop  = kit.custoRelativo / somaC;
    const tcK   = tc * prop, tvK = tcK * _PIX;
    const area  = kit.A;
    const m2c   = area > 0 ? tcK / area : 0;
    const m2v   = area > 0 ? tvK / area : 0;
    const m2cEl = document.querySelector('.m2c-' + i);
    const m2vEl = document.querySelector('.m2v-' + i);
    if (m2cEl) m2cEl.textContent = 'R$ ' + fN(m2c) + '/m²';
    if (m2vEl) m2vEl.textContent = 'R$ ' + fN(m2v) + '/m²';
    const tdM2  = el('tdM2-'  + i);
    const tdTot = el('tdTot-' + i);
    if (tdM2)  tdM2.textContent  = 'R$ ' + fN(m2c);
    if (tdTot) tdTot.textContent = 'R$ ' + fN(tcK);
  });

  el('valC').value        = tc.toFixed(2);
  el('valV').value        = tv.toFixed(2);
  el('valC-p').textContent = fN(tc);
  el('valV-p').textContent = fN(tv);
  el('lblParc').textContent = 'Valor Total – Parcelado em até ' + parc + 'x no Cartão de Crédito';
  el('tagParc').textContent = 'CARTÃO ' + parc + 'x';
  const rE = el('rowEntrega');
  if (rE) {
    rE.style.display = el('chkE')?.checked ? 'grid' : 'none';
    el('valEntrega').textContent = 'R$ ' + fN(fr);
  }
}

function onValC() {
  const tc = parseFloat(el('valC').value) || 0, tv = tc * _PIX;
  el('valV').value = tv.toFixed(2);
  el('valC-p').textContent = fN(tc); el('valV-p').textContent = fN(tv);
}
function onValV() {
  const tv = parseFloat(el('valV').value) || 0, tc = tv / _PIX;
  el('valC').value = tc.toFixed(2);
  el('valC-p').textContent = fN(tc); el('valV-p').textContent = fN(tv);
}

async function copiarImagem() {
  const btn = el('btnCopy');
  btn.disabled = true; btn.textContent = '⏳ Gerando imagem...';
  const oc = document.querySelectorAll('.no-print');
  oc.forEach(e => { e.dataset.pd = e.style.display; e.style.display = 'none'; });
  try {
    const c = await html2canvas(document.querySelector('.page'),
      { scale:2, useCORS:true, backgroundColor:'#fff', logging:false });
    oc.forEach(e => { e.style.display = e.dataset.pd || ''; });
    c.toBlob(async blob => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.disabled = false; btn.textContent = '📋 Copiar para WhatsApp'; }, 3000);
      } catch {
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: 'resumido.png' }).click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        btn.disabled = false; btn.textContent = '⚠️ Imagem baixada';
      }
    }, 'image/png');
  } catch {
    oc.forEach(e => { e.style.display = e.dataset.pd || ''; });
    btn.disabled = false; btn.textContent = '❌ Erro';
  }
}

async function baixarPdf() {
  const btn = el('btnPdf');
  btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
  const M = 3.7795275591, A4 = 210, MG = 8;
  const oc = document.querySelectorAll('.no-print');
  oc.forEach(e => { e.dataset.pd = e.style.display; e.style.display = 'none'; });
  try {
    const c = await html2canvas(document.querySelector('.page'),
      { scale:2, useCORS:true, backgroundColor:'#fff', logging:false,
        width: document.querySelector('.page').offsetWidth });
    oc.forEach(e => { e.style.display = e.dataset.pd || ''; });
    const { jsPDF } = window.jspdf;
    const iW = (c.width/2)/M, iH = (c.height/2)/M;
    const r = (A4 - MG*2) / iW;
    const fW = iW*r, fH = iH*r;
    const pH = fH <= 281 ? 297 : fH + MG*2;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:[A4, pH] });
    pdf.addImage(c.toDataURL('image/png', 1.0), 'PNG', MG, MG, fW, fH, undefined, 'FAST');
    pdf.save('resumido-' + _NR + '-' + new Date().toISOString().slice(0,10) + '.pdf');
    _pdfOK = true;
    el('pdfBadge').classList.add('visible');
    btn.disabled = false; btn.textContent = '✅ PDF baixado'; btn.style.background = '#1a7a1a';
    setTimeout(() => { btn.textContent = '⬇️ Baixar PDF novamente'; btn.style.background = '#e8510a'; }, 4000);
  } catch {
    oc.forEach(e => { e.style.display = e.dataset.pd || ''; });
    btn.disabled = false; btn.textContent = '❌ Erro — tente novamente';
  }
}
<\/script>
</body>
</html>`;
}

// ── Gera PDF do orçamento detalhado em background e dispara download ──────────
async function _baixarDetalhadoEmBackground(dados, opcoes) {
  try {
    await _garantirLibs();

    const html = gerarHtmlOrcamento(dados, opcoes);

    // Renderiza o HTML num container oculto na própria página do ERP
    // (evita iframe que é bloqueado pelo CSP da extensão)
    const container = document.createElement('div');
    container.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0',
      'width:900px', 'background:#fff',
      'font-family:Arial,sans-serif', 'font-size:10pt',
      'color:#000', 'z-index:-1', 'pointer-events:none',
    ].join(';');

    // Extrai só o <body> para não conflitar com scripts da página
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    container.innerHTML = bodyMatch ? bodyMatch[1] : html;
    container.querySelectorAll('script, .no-print, .margem-box').forEach(e => e.remove());

    document.body.appendChild(container);
    await new Promise(r => setTimeout(r, 50));

    const page = container.querySelector('.page');
    if (!page) throw new Error('.page não encontrado no HTML gerado');

    const M  = 3.7795275591, A4 = 210, MG = 8;
    const canvas = await window.html2canvas(page, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: page.offsetWidth, height: page.offsetHeight,
      windowWidth: page.offsetWidth,
    });

    document.body.removeChild(container);

    const { jsPDF } = window.jspdf;
    const iW = (canvas.width  / 2) / M;
    const iH = (canvas.height / 2) / M;
    const r  = (A4 - MG * 2) / iW;
    const fW = iW * r, fH = iH * r;
    const pH = fH <= 281 ? 297 : fH + MG * 2;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [A4, pH] });
    pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', MG, MG, fW, fH, undefined, 'FAST');

    const nomeArq = 'orcamento-' + opcoes.numeroOrcamento + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
    pdf.save(nomeArq);
    console.info('[HiperResumido] ✅ PDF detalhado salvo:', nomeArq);
  } catch(e) {
    console.warn('[HiperResumido] ⚠ Falha ao gerar PDF detalhado:', e?.message || e);
  }
}

// Carrega html2canvas e jsPDF na página do ERP se ainda não disponíveis
function _garantirLibs() {
  const promises = [];
  if (!window.html2canvas) {
    promises.push(new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }));
  }
  if (!window.jspdf) {
    promises.push(new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }));
  }
  return Promise.all(promises);
}

// ── Coleta dados, abre o resumido e baixa o detalhado em background ────────────
function abrirOrcamentoResumido() {
  const kitsAtivos = window.kitsAtivos;
  if (!kitsAtivos || kitsAtivos.size === 0) {
    alert('⚠️ Nenhum kit ativo.\n\nAcesse "Estruturas de Gesso", ative um kit e preencha a área antes de gerar o orçamento resumido.');
    return;
  }

  const dadosOrc = typeof extrairDadosPedido === 'function' ? extrairDadosPedido() : { itens: [], total: 0 };
  if (!dadosOrc.itens.length) {
    alert('⚠️ Nenhum item encontrado no orçamento atual.');
    return;
  }

  const kitsArr = [];
  kitsAtivos.forEach((estado, nome) => {
    kitsArr.push({ nome, A: estado.A || 0, P: estado.P || 0, cant: estado.cant || 3.15 });
  });

  const varianteTabica  = resumido_detectarTabica(dadosOrc.itens);
  const custoPorKit     = resumido_custoPorKit(kitsArr, dadosOrc.itens);
  const totalCartaoBase = dadosOrc.itens.reduce((s, it) => s + it.qtd * it.vlUnit, 0);
  const somaC           = Object.values(custoPorKit).reduce((s, v) => s + v, 0) || 1;

  const kitsInfo = kitsArr.map(k => ({
    nome:          k.nome,
    nomeLabel:     RESUMIDO_NOMES[k.nome] || k.nome,
    A:             k.A,
    P:             k.P,
    cant:          k.cant,
    custoRelativo: custoPorKit[k.nome],
    totalCartao:   (custoPorKit[k.nome] / somaC) * totalCartaoBase,
  }));

  const clienteNome = document.getElementById('iCliente')?.value?.trim() || '';
  const vendedorTexto = (() => {
    const chk = document.getElementById('chkVendedor');
    const inp = document.getElementById('iVendedor');
    return (chk?.checked && inp?.value?.trim()) ? inp.value.trim() : '';
  })();

  const LOGO = window.__hiperLogo || window.__hiperLogoBase64 || '';

  // Número gerado UMA vez — compartilhado entre resumido e detalhado
  const numeroOrcamento = typeof gerarNumeroOrcamento === 'function'
    ? gerarNumeroOrcamento()
    : ('R' + Date.now());

  const dataHoje = new Date().toLocaleDateString('pt-BR');

  // 1. Abre o resumido na aba nova (para o cliente)
  const payload = {
    kitsInfo, totalCartaoBase, varianteTabica,
    avisoMisto: varianteTabica === 'misto',
    LOGO, numeroOrcamento, dataHoje, clienteNome, vendedorTexto,
  };
  const htmlResumido = resumido_gerarHtml(payload, { parcelas: 3, desconto: 0, frete: 0 });
  const blobR = new Blob([htmlResumido], { type: 'text/html;charset=utf-8' });
  const urlR  = URL.createObjectURL(blobR);
  window.open(urlR, '_blank');
  setTimeout(() => URL.revokeObjectURL(urlR), 120000);

  // 2. Baixa PDF do detalhado em background com o mesmo número
  _baixarDetalhadoEmBackground(dadosOrc, {
    parcelas: 3,
    incluirEntrega: false,
    taxaEntrega: 30,
    numeroOrcamento,
  });
}


// ── Monkey-patch em gerarHtmlOrcamento para injetar botão "📝 Resumido" ────────
// Aguarda a função ser definida pelo hiper-orcamento.js, depois sobrescreve.
(function patchGerarHtml() {
  const MAX = 80;
  let tentativas = 0;

  function tentar() {
    if (typeof gerarHtmlOrcamento !== 'function') {
      if (++tentativas < MAX) { setTimeout(tentar, 150); }
      else { console.warn('[HiperResumido] ⚠ gerarHtmlOrcamento não encontrada. Botão "Resumido" não será injetado no HTML detalhado.'); }
      return;
    }

    const _original = gerarHtmlOrcamento;

    window.gerarHtmlOrcamento = function(dados, opcoes) {
      let html = _original(dados, opcoes);

      // ── Serializa dados dos kits para embutir no HTML detalhado ──────────────
      const kitsAtivos = window.kitsAtivos;
      if (!kitsAtivos || kitsAtivos.size === 0) return html; // sem kits → não injeta

      const kitsArr = [];
      kitsAtivos.forEach((estado, nome) => {
        kitsArr.push({ nome, A: estado.A || 0, P: estado.P || 0, cant: estado.cant || 3.15 });
      });

      const dadosOrc    = typeof extrairDadosPedido === 'function' ? extrairDadosPedido() : { itens: [] };
      const varTab      = resumido_detectarTabica(dadosOrc.itens);
      const custoPorKit = resumido_custoPorKit(kitsArr, dadosOrc.itens);
      const totalBase   = dadosOrc.itens.reduce((s, it) => s + it.qtd * it.vlUnit, 0);
      const somaC       = Object.values(custoPorKit).reduce((s, v) => s + v, 0) || 1;

      const kitsInfo = kitsArr.map(k => ({
        nome:          k.nome,
        nomeLabel:     RESUMIDO_NOMES[k.nome] || k.nome,
        A:             k.A,
        P:             k.P,
        cant:          k.cant,
        custoRelativo: custoPorKit[k.nome],
        totalCartao:   (custoPorKit[k.nome] / somaC) * totalBase,
      }));

      const LOGO = window.__hiperLogoBase64 || window.__hiperLogo || '';

      const payloadResumido = {
        kitsInfo,
        totalCartaoBase: totalBase,
        varianteTabica:  varTab,
        avisoMisto:      varTab === 'misto',
        LOGO,
        numeroOrcamento: opcoes.numeroOrcamento,
        dataHoje:        new Date().toLocaleDateString('pt-BR'),
        clienteNome:     document.getElementById('iCliente')?.value?.trim() || '',
        vendedorTexto: (() => {
          const chk = document.getElementById('chkVendedor');
          const inp = document.getElementById('iVendedor');
          return (chk?.checked && inp?.value?.trim()) ? inp.value.trim() : '';
        })(),
      };

      // Versão compacta de resumido_gerarHtml para embutir inline no HTML detalhado
      // (evita dependência de arquivo externo na aba detalhada)
      const rTextos = JSON.stringify(RESUMIDO_TEXTOS).replace(/<\/script>/gi, '<\\/script>');
      const rNomes  = JSON.stringify(RESUMIDO_NOMES);
      const rPayload = JSON.stringify(payloadResumido).replace(/<\/script>/gi, '<\\/script>');

      const scriptInline = `
<script id="hiper-resumido-data">
(function() {
  const _RP = ${rPayload};
  const _RT = ${rTextos};
  const _RN = ${rNomes};

  function _gerarResumido(payload, opcoes) {
    const { kitsInfo, totalCartaoBase, varianteTabica, avisoMisto,
            LOGO, numeroOrcamento, dataHoje, clienteNome, vendedorTexto } = payload;
    const { parcelas=3, desconto=0, frete=0 } = opcoes||{};
    const PIX=0.9523;
    const fN=n=>n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const somaC=kitsInfo.reduce((s,k)=>s+k.custoRelativo,0)||1;
    const totalC=Math.max(0,totalCartaoBase-desconto)+frete;
    const totalV=totalC*PIX;
    const linhas=kitsInfo.map((kit,i)=>{
      const p=kit.custoRelativo/somaC,tcK=totalC*p,tvK=tcK*PIX,a=kit.A;
      const unid=kit.nome==='cortineiro'?'ml':'m²';
      const m2c=a>0?tcK/a:0,m2v=a>0?tvK/a:0;
      const txt=(_RT[kit.nome]||{})[varianteTabica]||'';
      return '<tr><td style="text-align:center;border:1px solid #000;padding:5px 6px;vertical-align:middle">'+(i+1)+'<\\/td>'+
        '<td style="text-align:center;border:1px solid #000;padding:5px 6px;vertical-align:middle">'+fN(a)+' '+unid+'<\\/td>'+
        '<td style="text-align:center;border:1px solid #000;padding:5px 6px;vertical-align:middle">'+unid+'<\\/td>'+
        '<td style="text-align:left;border:1px solid #000;padding:5px 6px;vertical-align:top">'+
          '<div style="font-weight:bold;margin-bottom:3px">'+kit.nomeLabel+'<\\/div>'+
          '<div style="font-size:8.5pt;color:#222;line-height:1.5">'+txt+'<\\/div>'+
          '<div style="margin-top:5px;font-size:8pt;color:#555;display:flex;gap:12px;flex-wrap:wrap">'+
            '<span>🃏 Cartão: <strong id="m2c'+i+'">R$ '+fN(m2c)+'/m²<\\/strong><\\/span>'+
            '<span>💲 À vista: <strong id="m2v'+i+'">R$ '+fN(m2v)+'/m²<\\/strong><\\/span>'+
          '<\\/div><\\/td>'+
        '<td style="text-align:right;border:1px solid #000;padding:5px 6px;vertical-align:middle" id="r_m2_'+i+'">R$ '+fN(m2c)+'<\\/td>'+
        '<td style="text-align:right;border:1px solid #000;padding:5px 6px;vertical-align:middle" id="r_tot_'+i+'">R$ '+fN(tcK)+'<\\/td><\\/tr>';
    }).join('');
    const vz=Math.max(0,4-kitsInfo.length);
    const lv=Array(vz).fill('<tr><td style="height:22px;border:1px solid #000"><\\/td><td style="border:1px solid #000"><\\/td><td style="border:1px solid #000"><\\/td><td style="border:1px solid #000"><\\/td><td style="border:1px solid #000"><\\/td><td style="border:1px solid #000"><\\/td><\\/tr>').join('');
    const av=avisoMisto?'<div class="no-print" style="background:#fff3cd;border:1px solid #e0c040;border-radius:4px;padding:7px 12px;margin-bottom:8px;font-size:10pt">⚠️ <strong>Atenção:<\\/strong> tabica mista detectada (3006 e 3010). Verifique antes de enviar.<\\/div>':'';
    const KIJ=JSON.stringify(kitsInfo).replace(/<\\/script>/gi,'<\\\\/script>');
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Orçamento Resumido '+numeroOrcamento+'<\\/title>'+
    '<script src="https:\\/\\/cdnjs.cloudflare.com\\/ajax\\/libs\\/html2canvas\\/1.4.1\\/html2canvas.min.js"><\\/scr'+'ipt>'+
    '<script src="https:\\/\\/cdnjs.cloudflare.com\\/ajax\\/libs\\/jspdf\\/2.5.1\\/jspdf.umd.min.js"><\\/scr'+'ipt>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#fff}.page{width:100%;max-width:260mm;margin:0 auto;padding:8mm 10mm}.header{display:flex;align-items:stretch;border:2px solid #000}.header-logo{padding:6px 12px;border-right:2px solid #000;display:flex;align-items:center;flex-direction:column;gap:2px}.tag-txt{font-size:32pt;font-weight:900;color:#1a5c1a;line-height:1}.orc-num{font-size:9pt;font-weight:bold;color:#1a5c1a;text-align:center}.hdr-emp{flex:1;padding:6px 14px;display:flex;flex-direction:column;justify-content:center}.hdr-emp .nome{font-size:13pt;font-weight:bold}.hdr-emp .sub{font-size:9pt;color:#555;margin-top:2px}.hdr-trevo{padding:4px 8px;border-left:2px solid #000;display:flex;align-items:center;justify-content:center}.tbl{width:100%;border-collapse:collapse}.tbl thead tr{background:#d0d0d0}.tbl th{padding:4px 5px;font-size:9pt;text-align:center;border:1px solid #000}.totais-wrap{border:1px solid #000;border-top:none}.trow{display:grid;grid-template-columns:1fr 110px 110px;border-bottom:1px solid #000}.trow:last-child{border-bottom:none}.trow .tlabel{padding:4px 8px;font-size:9pt;display:flex;align-items:center}.trow .ttag{font-weight:bold;font-size:9.5pt;background:#e8e8e8;border-left:1px solid #000;display:flex;align-items:center;justify-content:center;padding:2px 4px;text-align:center}.trow .tval{border-left:1px solid #000;display:flex;align-items:center;justify-content:flex-end;padding:2px 8px;font-weight:bold;font-size:10pt}.val-inp{width:100%;border:none;background:transparent;text-align:right;font-weight:bold;font-size:10pt;font-family:Arial;padding:0;color:#000}.val-inp:focus{outline:1px solid #1a73e8;background:#e8f0fe;border-radius:2px}.val-prefix{font-size:9pt;color:#888;margin-right:2px}.val-print{display:none;font-weight:bold;font-size:10pt}.validade-row{padding:4px 8px;font-size:8.5pt;color:#c00;font-weight:bold;border-top:1px solid #000}.rodape{border:1px solid #000;border-top:none;padding:5px 8px;font-size:8pt;line-height:1.6}.rodape .entrega{color:#c00;font-weight:bold;font-size:9pt;margin-top:3px}.panel{border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;background:#f4f8ff;border:1px solid #b3d4f5}.panel h4{font-size:12px;font-weight:bold;color:#1a3a6a;margin-bottom:8px}.prow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.prow label{display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap}.prow input[type=number]{padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px}.prow input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#1a73e8}.toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px;align-items:center;flex-wrap:wrap}.btn-print,.btn-copy,.btn-pdf{padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold}.btn-print{background:#1a73e8}.btn-copy{background:#25d366}.btn-pdf{background:#e8510a}.pdf-badge{display:none;align-items:center;gap:6px;padding:4px 12px;background:#d4edda;border:1px solid #6dbf8a;border-radius:20px;font-size:12px;font-weight:bold;color:#1a5c1a}.pdf-badge.visible{display:flex}.rtag{display:inline-block;background:#1a5c8a;color:#fff;font-size:8pt;font-weight:bold;padding:2px 6px;border-radius:3px;vertical-align:middle;margin-left:6px}@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:210mm;padding:4mm 6mm}.val-inp,.val-prefix{display:none!important}.val-print{display:inline!important}}<\\/style><\\/head><body>'+
    '<div class="page">'+
    '<div class="toolbar no-print">'+
    '<button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF<\\/button>'+
    '<button class="btn-copy" id="btnCopy" onclick="copiarImagem()">📋 Copiar para WhatsApp<\\/button>'+
    '<button class="btn-pdf" id="btnPdf" onclick="baixarPdf()">⬇️ Baixar PDF<\\/button>'+
    '<div class="pdf-badge" id="pdfBadge">✅ PDF baixado<\\/div><\\/div>'+
    '<div class="panel no-print"><h4>⚙️ Opções — <strong style="color:#1a5c1a">'+numeroOrcamento+'<\\/strong> <span class="rtag">RESUMIDO<\\/span><\\/h4>'+
    '<div class="prow">'+
    '<label>Parcelas: <select id="sP" onchange="rc()" style="padding:3px 6px;border:1px solid #aaa;border-radius:4px;font-size:12px">'+[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>'<option value="'+n+'" '+(n===parcelas?'selected':'')+'>'+ n+'x<\\/option>').join('')+'<\\/select><\\/label>'+
    '<label><input type="checkbox" id="chkE" onchange="rc()"'+(frete>0?' checked':'')+'> Entrega R$ <input type="number" id="iE" value="'+(frete>0?frete:30)+'" min="0" step="0.01" style="width:72px" oninput="rc()"><\\/label>'+
    '<label>Desconto R$ <input type="number" id="iDesc" value="'+desconto+'" min="0" step="0.01" style="width:80px" oninput="rc()"><\\/label><\\/div><\\/div>'+
    av+
    '<div class="header">'+
    '<div class="header-logo"><div class="tag-txt">TAG<\\/div><div class="orc-num">'+numeroOrcamento+'<\\/div><\\/div>'+
    '<div class="hdr-emp"><div class="nome">Comércio e Serv. Gesso Acartonado Ltda<\\/div>'+
    '<div class="sub">Orçamento gerado em '+dataHoje+' <span class="rtag">RESUMIDO<\\/span><\\/div>'+
    (clienteNome?'<div class="sub"><strong>Cliente:<\\/strong> '+clienteNome+'<\\/div>':'')+
    (vendedorTexto?'<div class="sub">'+vendedorTexto+'<\\/div>':'')+
    '<\\/div><div class="hdr-trevo"><img src="'+LOGO+'" width="64" height="64" style="object-fit:contain" alt=""><\\/div><\\/div>'+
    '<table class="tbl"><thead><tr><th style="width:28px">ITEM<\\/th><th style="width:70px">ÁREA<\\/th><th style="width:32px">UND<\\/th><th>DESCRIÇÃO<\\/th><th style="width:80px">R$/M²<\\/th><th style="width:90px">VL TOTAL<\\/th><\\/tr><\\/thead><tbody>'+linhas+lv+'<\\/tbody><\\/table>'+
    '<div class="totais-wrap">'+
    '<div class="trow" id="rowE" style="display:'+(frete>0?'grid':'none')+'"><div class="tlabel">TAXA DE ENTREGA<\\/div><div class="ttag"><\\/div><div class="tval" id="valE">R$ '+fN(frete)+'<\\/div><\\/div>'+
    '<div class="trow"><div class="tlabel" id="lblP">Valor Total – Parcelado em até '+parcelas+'x no Cartão de Crédito<\\/div><div class="ttag" id="tagP">CARTÃO '+parcelas+'x<\\/div><div class="tval"><span class="val-prefix">R$<\\/span><input class="val-inp" type="number" id="valC" step="0.01" style="width:75px" value="'+totalC.toFixed(2)+'" oninput="onC()"><span class="val-print" id="vCp">'+fN(totalC)+'<\\/span><\\/div><\\/div>'+
    '<div class="trow"><div class="tlabel">Valor Total – À vista (PIX)<\\/div><div class="ttag">À VISTA PIX<\\/div><div class="tval"><span class="val-prefix">R$<\\/span><input class="val-inp" type="number" id="valV" step="0.01" style="width:75px" value="'+totalV.toFixed(2)+'" oninput="onV()"><span class="val-print" id="vVp">'+fN(totalV)+'<\\/span><\\/div><\\/div>'+
    '<div class="validade-row">* ORÇAMENTO VÁLIDO POR 10 (DEZ) DIAS<\\/div><\\/div>'+
    '<div class="rodape"><div>Contato Vendas: Luciana Santin – Fone / Watts: +55 (69) 99237-1547<\\/div><div>Av. Rio de Janeiro, 5075 A - Nova Porto Velho – Em frente ao Sindsef<\\/div><div>Chave Pix CNPJ - 56.240.315/0001-60 – Guimarães &amp; Santin<\\/div><div class="entrega">➡ ENTREGA SOMENTE NO TÉRREO<\\/div><\\/div>'+
    '<\\/div>'+
    '<scr'+'ipt>'+
    'const _KI='+KIJ+',_B='+totalCartaoBase+',_PIX=0.9523,_NR='+JSON.stringify(numeroOrcamento)+';'+
    'let _pdf=false;'+
    'window.addEventListener("beforeunload",e=>{if(_pdf)return;const m="PDF não baixado.";e.preventDefault();e.returnValue=m;return m;});'+
    'function el(id){return document.getElementById(id);}'+
    'function num(id){const v=parseFloat(el(id)?.value);return isNaN(v)?0:v;}'+
    'function fN(n){return Math.abs(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}'+
    'function rc(){'+
      'const d=num("iDesc"),fr=el("chkE")?.checked?num("iE"):0,p=parseInt(el("sP")?.value||"3");'+
      'const sc=_KI.reduce((s,k)=>s+k.custoRelativo,0)||1;'+
      'const tc=Math.max(0,_B-d)+fr,tv=tc*_PIX;'+
      '_KI.forEach((kit,i)=>{'+
        'const pr=kit.custoRelativo/sc,tcK=tc*pr,tvK=tcK*_PIX,a=kit.A;'+
        'const m2c=a>0?tcK/a:0,m2v=a>0?tvK/a:0;'+
        'const c2=document.getElementById("m2c"+i),v2=document.getElementById("m2v"+i);'+
        'if(c2)c2.textContent="R$ "+fN(m2c)+"/m²";if(v2)v2.textContent="R$ "+fN(m2v)+"/m²";'+
        'const tm=document.getElementById("r_m2_"+i),tt=document.getElementById("r_tot_"+i);'+
        'if(tm)tm.textContent="R$ "+fN(m2c);if(tt)tt.textContent="R$ "+fN(tcK);'+
      '});'+
      'el("valC").value=tc.toFixed(2);el("valV").value=tv.toFixed(2);'+
      'el("vCp").textContent=fN(tc);el("vVp").textContent=fN(tv);'+
      'el("lblP").textContent="Valor Total – Parcelado em até "+p+"x no Cartão de Crédito";'+
      'el("tagP").textContent="CARTÃO "+p+"x";'+
      'const rE=el("rowE");if(rE){rE.style.display=el("chkE")?.checked?"grid":"none";el("valE").textContent="R$ "+fN(fr);}'+
    '}'+
    'function onC(){const tc=parseFloat(el("valC").value)||0,tv=tc*_PIX;el("valV").value=tv.toFixed(2);el("vCp").textContent=fN(tc);el("vVp").textContent=fN(tv);}'+
    'function onV(){const tv=parseFloat(el("valV").value)||0,tc=tv/_PIX;el("valC").value=tc.toFixed(2);el("vCp").textContent=fN(tc);el("vVp").textContent=fN(tv);}'+
    'async function copiarImagem(){const btn=el("btnCopy");btn.disabled=true;btn.textContent="⏳ Gerando...";const oc=document.querySelectorAll(".no-print");oc.forEach(e=>{e.dataset.pd=e.style.display;e.style.display="none";});try{const c=await html2canvas(document.querySelector(".page"),{scale:2,useCORS:true,backgroundColor:"#fff",logging:false});oc.forEach(e=>{e.style.display=e.dataset.pd||"";});c.toBlob(async b=>{try{await navigator.clipboard.write([new ClipboardItem({"image/png":b})]);btn.textContent="✅ Copiado!";setTimeout(()=>{btn.disabled=false;btn.textContent="📋 Copiar para WhatsApp";},3000);}catch{const u=URL.createObjectURL(b);Object.assign(document.createElement("a"),{href:u,download:"resumido.png"}).click();setTimeout(()=>URL.revokeObjectURL(u),5000);btn.disabled=false;btn.textContent="⚠️ Imagem baixada";}},"image/png");}catch{oc.forEach(e=>{e.style.display=e.dataset.pd||"";});btn.disabled=false;btn.textContent="❌ Erro";}}'+
    'async function baixarPdf(){const btn=el("btnPdf");btn.disabled=true;btn.textContent="⏳ Gerando PDF...";const M=3.7795275591,A4=210,MG=8;const oc=document.querySelectorAll(".no-print");oc.forEach(e=>{e.dataset.pd=e.style.display;e.style.display="none";});try{const c=await html2canvas(document.querySelector(".page"),{scale:2,useCORS:true,backgroundColor:"#fff",logging:false,width:document.querySelector(".page").offsetWidth});oc.forEach(e=>{e.style.display=e.dataset.pd||"";});const{jsPDF}=window.jspdf;const iW=(c.width/2)/M,iH=(c.height/2)/M,r=(A4-MG*2)/iW,fW=iW*r,fH=iH*r,pH=fH<=281?297:fH+MG*2;const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:[A4,pH]});pdf.addImage(c.toDataURL("image/png",1.0),"PNG",MG,MG,fW,fH,undefined,"FAST");pdf.save("resumido-"+_NR+"-"+new Date().toISOString().slice(0,10)+".pdf");_pdf=true;el("pdfBadge").classList.add("visible");btn.disabled=false;btn.textContent="✅ PDF baixado";btn.style.background="#1a7a1a";setTimeout(()=>{btn.textContent="⬇️ Baixar PDF novamente";btn.style.background="#e8510a";},4000);}catch{oc.forEach(e=>{e.style.display=e.dataset.pd||"";});btn.disabled=false;btn.textContent="❌ Erro";}}'+
    '<\\/scr'+'ipt>'+
    '<\\/body><\\/html>';
  }

  window.__gerarResumidoDaAba = function() {
    const html = _gerarResumido(_RP, { parcelas:3, desconto:0, frete:0 });
    const blob = new Blob([html], { type:'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  };
})();
<\/script>`;

      // Injeta script antes de </body>
      html = html.replace('</body>', scriptInline + '\n</body>');

      // Injeta botão "📝 Resumido" ao lado do "⬇️ Baixar PDF"
      // O botão de PDF tem id="btnPdf"
      html = html.replace(
        /(<button[^>]*id="btnPdf"[^>]*>[\s\S]*?<\/button>)/,
        `$1
  <button id="btnResumido"
    onclick="if(window.__gerarResumidoDaAba){window.__gerarResumidoDaAba();baixarPdf();}"
    style="padding:8px 20px;border:none;border-radius:6px;font-size:13px;cursor:pointer;
           color:#fff;font-weight:bold;background:#1a5c8a">
    📝 Resumido
  </button>`
      );

      return html;
    };

    console.info('[HiperResumido] ✅ Patch em gerarHtmlOrcamento aplicado — botão "📝 Resumido" será injetado no HTML detalhado.');
  }

  tentar();
})();

window.abrirOrcamentoResumido = abrirOrcamentoResumido;