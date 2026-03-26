// resumido-runtime-src.js
// Conteudo de resumido-runtime.js embutido como string (evita fetch)
window.RESUMIDO_RUNTIME_SRC = `// ═══════════════════════════════════════════════════════════════════════════════
// resumido-runtime.js — Funções que rodam DENTRO do HTML gerado
//
// ATENÇÃO: Este arquivo NÃO é carregado diretamente pelo browser como <script>.
// Ele é lido em tempo de build (por resumido-gerador.js) e embutido como string
// dentro do HTML do orçamento.
//
//  • Funções aqui dependem de _KI, _PIX, _SOMA_PESO, _NR injetados pelo gerador.
//  • Variáveis MO: _MO_IMPOSTO, _MO_LUCRO, _MO_ATIVA, _MO_AGRUPAR
// ═══════════════════════════════════════════════════════════════════════════════

/* globals _KI, _PIX, _SOMA_PESO, _NR, _MO_IMPOSTO, _MO_LUCRO, _MO_ATIVA, _MO_AGRUPAR */

function el(id) { return document.getElementById(id); }

function fN(n) {
  return Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numEl(id) {
  var v = parseFloat(el(id) && el(id).value);
  return isNaN(v) ? 0 : v;
}

function getFrete() {
  return el('chkE') && el('chkE').checked ? numEl('iE') : 0;
}

// ── Cálculo MO: venda = custo / (1 - imposto/100 - lucro/100) ────────────────
function calcVendaMo(custoBase, impostoNF, lucroMeta) {
  var div = 1 - impostoNF / 100 - lucroMeta / 100;
  if (div <= 0) return 0;
  return custoBase / div;
}

function getMoBase(i) {
  return numEl('mobase-' + i) || 0;
}

function atualizarLabelMo(i) {
  var base  = getMoBase(i);
  var imp   = numEl('cfgImposto');
  var lucro = numEl('cfgLucro');
  if (!imp)   imp   = _MO_IMPOSTO;
  if (!lucro) lucro = _MO_LUCRO;
  var venda = calcVendaMo(base, imp, lucro);
  var lbl = el('mo-venda-' + i);
  if (lbl) lbl.textContent = 'Venda: R$ ' + fN(venda);
}

function getUnid(i) {
  var e2 = el('und-' + i);
  return e2 ? (e2.textContent || e2.innerText || 'm\u00b2').trim() : 'm\u00b2';
}

function atualizarLblParc() {
  var p = parseInt((el('selParcelas') && el('selParcelas').value) || '3');
  if (el('lblParc')) {
    el('lblParc').textContent = 'Valor Total \u2013 Parcelado em at\u00e9 ' + p + 'x no Cart\u00e3o de Cr\u00e9dito';
  }
}

function sincronizarLabelsPrint() {
  var tc = numEl('valC');
  var tv = numEl('valV');
  if (el('valC-p')) el('valC-p').textContent = fN(tc);
  if (el('valV-p')) el('valV-p').textContent = fN(tv);
}

function atualizarDescricoes() {
  _KI.forEach(function(kit, i) {
    var area  = numEl('area-' + i);
    var tcKit = numEl('totc-' + i);
    var m2c   = area > 0 ? tcKit / area : 0;
    var unid  = getUnid(i);
    var c2 = el('lm2c-' + i);
    var v2 = el('lm2v-' + i);
    if (c2) c2.textContent = 'R$ ' + fN(m2c) + '/' + unid;
    if (v2) v2.textContent = 'R$ ' + fN(m2c * _PIX) + '/' + unid;
  });
}

function atualizarTotaisGlobais() {
  atualizarTotaisGlobaisComMo();
  atualizarDescricoes();
}

function onArea(i) {
  var area  = numEl('area-' + i);
  var tcKit = numEl('totc-' + i);
  if (area > 0 && el('m2c-' + i)) el('m2c-' + i).value = (tcKit / area).toFixed(2);
  if (_MO_ATIVA && !_MO_AGRUPAR) atualizarLinhaMoDesagrupada(i);
  atualizarDescricoes();
  atualizarTotaisGlobais();
}

function onM2(i) {
  var area  = numEl('area-' + i);
  var m2c   = numEl('m2c-' + i);
  if (el('totc-' + i)) el('totc-' + i).value = (area * m2c).toFixed(2);
  atualizarDescricoes();
  atualizarTotaisGlobais();
}

function onTotKit(i) {
  var area  = numEl('area-' + i);
  var tcKit = numEl('totc-' + i);
  if (area > 0 && el('m2c-' + i)) el('m2c-' + i).value = (tcKit / area).toFixed(2);
  atualizarDescricoes();
  atualizarTotaisGlobais();
}

// ── Handlers MO ──────────────────────────────────────────────────────────────

function onMoBase(i) {
  atualizarLabelMo(i);
  if (_MO_ATIVA && !_MO_AGRUPAR) atualizarLinhaMoDesagrupada(i);
}

function onMoM2(i) {
  var area  = numEl('area-' + i);
  var m2    = numEl('mo-m2c-' + i);
  if (el('mo-totc-' + i)) el('mo-totc-' + i).value = (area * m2).toFixed(2);
  var imp   = numEl('cfgImposto') || _MO_IMPOSTO;
  var lucro = numEl('cfgLucro')   || _MO_LUCRO;
  var fator = 1 - imp / 100 - lucro / 100;
  if (el('mobase-' + i)) el('mobase-' + i).value = Math.max(0, m2 * fator).toFixed(2);
  atualizarLabelMo(i);
  // Atualiza labels R$/m² na linha MO desagrupada
  var unid = getUnid(i);
  if (el('mo-lm2c-' + i)) el('mo-lm2c-' + i).textContent = 'R$ ' + fN(m2) + '/' + unid;
  if (el('mo-lm2v-' + i)) el('mo-lm2v-' + i).textContent = 'R$ ' + fN(m2 * _PIX) + '/' + unid;
  atualizarTotaisGlobaisComMo();
}

function onMoTotc(i) {
  var area  = numEl('area-' + i);
  var tot   = numEl('mo-totc-' + i);
  var m2    = area > 0 ? tot / area : 0;
  if (el('mo-m2c-' + i)) el('mo-m2c-' + i).value = m2.toFixed(2);
  var imp   = numEl('cfgImposto') || _MO_IMPOSTO;
  var lucro = numEl('cfgLucro')   || _MO_LUCRO;
  var fator = 1 - imp / 100 - lucro / 100;
  if (el('mobase-' + i)) el('mobase-' + i).value = Math.max(0, m2 * fator).toFixed(2);
  atualizarLabelMo(i);
  // Atualiza labels R$/m² na linha MO desagrupada
  var unid = getUnid(i);
  if (el('mo-lm2c-' + i)) el('mo-lm2c-' + i).textContent = 'R$ ' + fN(m2) + '/' + unid;
  if (el('mo-lm2v-' + i)) el('mo-lm2v-' + i).textContent = 'R$ ' + fN(m2 * _PIX) + '/' + unid;
  atualizarTotaisGlobaisComMo();
}

function atualizarLinhaMoDesagrupada(i) {
  var area  = numEl('area-' + i);
  var base  = getMoBase(i);
  var imp   = numEl('cfgImposto') || _MO_IMPOSTO;
  var lucro = numEl('cfgLucro')   || _MO_LUCRO;
  var venda = calcVendaMo(base, imp, lucro);
  if (el('mo-m2c-'  + i)) el('mo-m2c-'  + i).value = venda.toFixed(2);
  if (el('mo-totc-' + i)) el('mo-totc-' + i).value = (area * venda).toFixed(2);
}

function onCfgMO() {
  _MO_IMPOSTO = numEl('cfgImposto') || 13.53;
  _MO_LUCRO   = numEl('cfgLucro')   || 20;
  _KI.forEach(function(_, i) {
    atualizarLabelMo(i);
    if (_MO_ATIVA && !_MO_AGRUPAR) atualizarLinhaMoDesagrupada(i);
  });
}

function onToggleMO() {
  _MO_ATIVA = !!(el('chkMO') && el('chkMO').checked);
  aplicarMO();
}

function onToggleAgrupar() {
  _MO_AGRUPAR = !!(el('chkAgrupar') && el('chkAgrupar').checked);
  aplicarMO();
}

// ── Renumeração sequencial de todas as linhas visíveis ────────────────────────
function renumerarLinhas() {
  var tbody = el('tblBody');
  if (!tbody) return;
  var num = 1;
  var linhas = tbody.querySelectorAll('tr');
  for (var li = 0; li < linhas.length; li++) {
    var tr = linhas[li];
    if (!tr.className) continue; // pula linhas vazias de preenchimento
    var tdNum = tr.querySelector('.td-num');
    if (tdNum) tdNum.textContent = num++;
  }
}

function aplicarMO() {
  var tbody = el('tblBody');
  if (!tbody) return;
  // Remove linhas MO extras
  var extras = tbody.querySelectorAll('.row-mo');
  extras.forEach(function(r) { r.parentNode.removeChild(r); });

  // Captura snapshot das linhas de kit ANTES do loop para que inserções
  // de .row-mo não deslocarem os índices nas iterações seguintes.
  var linhasSnapshot = tbody.querySelectorAll('tr:not(.row-mo)');

  _KI.forEach(function(kit, i) {
    var imp   = numEl('cfgImposto') || _MO_IMPOSTO;
    var lucro = numEl('cfgLucro')   || _MO_LUCRO;
    var base  = getMoBase(i);
    var venda = calcVendaMo(base, imp, lucro);
    var area  = numEl('area-' + i);
    var tot   = area * venda;
    var unid  = getUnid(i);
    var nomeEl2 = el('nomeLabel-' + i);
    var descEl  = el('desc-' + i);

    if (_MO_ATIVA) {
      if (_MO_AGRUPAR) {
        // Agrupado: muda texto e soma MO ao total do kit
        if (nomeEl2) nomeEl2.textContent = 'Fornecimento e instalação \u2013 ' + kit.nomeLabel;
        if (descEl) {
          if (descEl.dataset.textoOrig === undefined) descEl.dataset.textoOrig = descEl.innerHTML;
          descEl.innerHTML = descEl.dataset.textoOrig.replace(/^Fornecimento de /i, 'Fornecimento e instalação de ');
        }
        // Soma MO ao total do kit e atualiza R$/m²
        var trcEl = el('totc-' + i);
        // Salva total original de material (sem MO) para poder desfazer
        if (trcEl && trcEl.dataset.totalMat === undefined) trcEl.dataset.totalMat = (numEl('totc-' + i)).toFixed(2);
        var totalComMo = parseFloat(trcEl.dataset.totalMat) + tot;
        if (trcEl) trcEl.value = totalComMo.toFixed(2);
        if (area > 0 && el('m2c-' + i)) el('m2c-' + i).value = (totalComMo / area).toFixed(2);
      } else {
        // Desagrupado: linha principal volta ao total apenas de material
        if (nomeEl2) nomeEl2.textContent = kit.nomeLabel;
        if (descEl && descEl.dataset.textoOrig !== undefined) descEl.innerHTML = descEl.dataset.textoOrig;
        // Restaura total de material (sem MO)
        var trcEl2 = el('totc-' + i);
        if (trcEl2 && trcEl2.dataset.totalMat !== undefined) {
          trcEl2.value = trcEl2.dataset.totalMat;
          if (area > 0 && el('m2c-' + i)) el('m2c-' + i).value = (parseFloat(trcEl2.dataset.totalMat) / area).toFixed(2);
        }
        // Insere linha MO extra usando o snapshot capturado antes do loop
        if (linhasSnapshot[i]) {
          var tipoNome = kit.nomeLabel;
          var moDescTexto = 'Serviço de instalação (Mão de obra especializada) de ' + tipoNome +
            ' \u2013 com nota fiscal de prestação de serviços = Conferindo Garantia.';
          var tr2 = document.createElement('tr');
          tr2.className = 'row-mo';
          tr2.innerHTML =
            '<td class="td-num" style="text-align:center;border:1px solid #000;padding:5px 4px;font-size:8pt;vertical-align:middle">' + (i + 1) + '</td>' +
            '<td style="text-align:center;border:1px solid #000;padding:3px 4px;vertical-align:middle">' +
              '<span style="font-size:9pt;font-weight:bold">' + fN(area) + '</span>' +
            '</td>' +
            '<td style="text-align:center;border:1px solid #000;padding:3px 4px;font-size:9pt;font-weight:bold;vertical-align:middle">' + unid + '</td>' +
            '<td style="text-align:left;border:1px solid #000;padding:5px 6px;vertical-align:top">' +
              '<div contenteditable="true" style="font-weight:bold;margin-bottom:3px;outline:none;cursor:text;border-radius:2px;padding:1px 2px" ' +
                'onfocus="this.style.background=\\'#fffde7\\';this.style.outline=\\'1px solid #f0c040\\'" ' +
                'onblur="this.style.background=\\'\\';this.style.outline=\\'none\\'">Instala\u00e7\u00e3o \u2013 ' + tipoNome + '</div>' +
              '<div contenteditable="true" style="font-size:8.5pt;color:#222;line-height:1.5;outline:none;cursor:text;border-radius:2px;padding:1px 2px" ' +
                'onfocus="this.style.background=\\'#fffde7\\';this.style.outline=\\'1px solid #f0c040\\'" ' +
                'onblur="this.style.background=\\'\\';this.style.outline=\\'none\\'">' + moDescTexto + '</div>' +
              '<div style="margin-top:5px;font-size:8pt;color:#555;display:flex;gap:12px;flex-wrap:wrap">' +
                '<span>Cart\u00e3o: <strong id="mo-lm2c-' + i + '">R$ ' + fN(venda) + '/' + unid + '</strong></span>' +
                '<span>\u00c0 vista: <strong id="mo-lm2v-' + i + '">R$ ' + fN(venda * _PIX) + '/' + unid + '</strong></span>' +
              '</div>' +
            '</td>' +
            '<td style="text-align:right;border:1px solid #000;padding:3px 4px;vertical-align:middle">' +
              '<input id="mo-m2c-' + i + '" type="number" min="0" step="0.01" value="' + venda.toFixed(2) + '"' +
              ' style="width:70px;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;font-weight:bold;color:#000"' +
              ' oninput="onMoM2(' + i + ')">' +
            '</td>' +
            '<td style="text-align:right;border:1px solid #000;padding:3px 4px;vertical-align:middle">' +
              '<input id="mo-totc-' + i + '" type="number" min="0" step="0.01" value="' + tot.toFixed(2) + '"' +
              ' style="width:74px;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;font-weight:bold;color:#000"' +
              ' oninput="onMoTotc(' + i + ')">' +
            '</td>' +
            '<td class="col-mo-base no-print" style="border:1px solid #000;padding:3px 6px;text-align:center">' +
              '<span style="font-size:8pt;color:#aaa">\u2014</span>' +
            '</td>';
          linhasSnapshot[i].parentNode.insertBefore(tr2, linhasSnapshot[i].nextSibling);
        }
      }
    } else {
      // MO desativada: restaura tudo ao original
      if (nomeEl2) nomeEl2.textContent = kit.nomeLabel;
      if (descEl && descEl.dataset.textoOrig !== undefined) descEl.innerHTML = descEl.dataset.textoOrig;
      // Restaura total de material (sem MO)
      var trcEl3 = el('totc-' + i);
      if (trcEl3 && trcEl3.dataset.totalMat !== undefined) {
        trcEl3.value = trcEl3.dataset.totalMat;
        delete trcEl3.dataset.totalMat;
        if (area > 0 && el('m2c-' + i)) el('m2c-' + i).value = (parseFloat(trcEl3.value) / area).toFixed(2);
      }
    }
  });
  // Recalcula totais globais após qualquer mudança de MO
  renumerarLinhas();
  atualizarTotaisGlobaisComMo();
}

// ── Totais globais (inclui linhas MO desagrupadas) ────────────────────────────

function atualizarTotaisGlobaisComMo() {
  var s = 0;
  _KI.forEach(function(_, i) { s += numEl('totc-' + i); });
  // Soma linhas MO desagrupadas
  _KI.forEach(function(_, i) {
    var moTot = el('mo-totc-' + i);
    if (moTot) s += parseFloat(moTot.value) || 0;
  });
  // Soma linhas personalizadas
  var customs = document.querySelectorAll('.row-custom');
  customs.forEach(function(r) {
    var totEl = r.querySelector('.custom-totc');
    if (totEl) s += parseFloat(totEl.value) || 0;
  });
  var tc = s + getFrete();
  var tv = tc * _PIX;
  if (el('valC')) el('valC').value = tc.toFixed(2);
  if (el('valV')) el('valV').value = tv.toFixed(2);
  if (el('valC-p')) el('valC-p').textContent = fN(tc);
  if (el('valV-p')) el('valV-p').textContent = fN(tv);
  if (el('rowE')) el('rowE').style.display = (el('chkE') && el('chkE').checked) ? 'flex' : 'none';
  if (el('valEntrega')) el('valEntrega').textContent = 'R$ ' + fN(getFrete());
  atualizarLblParc();
}

// ── Totais globais ────────────────────────────────────────────────────────────

function onValC() {
  var novoTc   = numEl('valC');
  var fr       = getFrete();
  var paraKits = Math.max(0, novoTc - fr);
  _KI.forEach(function(kit, i) {
    var peso  = kit.custoRelativo / _SOMA_PESO;
    var tcKit = paraKits * peso;
    var area  = numEl('area-' + i);
    var m2c   = area > 0 ? tcKit / area : 0;
    if (el('totc-' + i)) el('totc-' + i).value = tcKit.toFixed(2);
    if (el('m2c-'  + i)) el('m2c-'  + i).value = m2c.toFixed(2);
  });
  var tv = novoTc * _PIX;
  if (el('valV'))   el('valV').value   = tv.toFixed(2);
  if (el('valC-p')) el('valC-p').textContent = fN(novoTc);
  if (el('valV-p')) el('valV-p').textContent = fN(tv);
  atualizarDescricoes();
  atualizarLblParc();
}

function onValV() {
  var novoTv = numEl('valV');
  var novoTc = novoTv / _PIX;
  if (el('valC'))   el('valC').value   = novoTc.toFixed(2);
  if (el('valC-p')) el('valC-p').textContent = fN(novoTc);
  if (el('valV-p')) el('valV-p').textContent = fN(novoTv);
  var fr       = getFrete();
  var paraKits = Math.max(0, novoTc - fr);
  _KI.forEach(function(kit, i) {
    var peso  = kit.custoRelativo / _SOMA_PESO;
    var tcKit = paraKits * peso;
    var area  = numEl('area-' + i);
    var m2c   = area > 0 ? tcKit / area : 0;
    if (el('totc-' + i)) el('totc-' + i).value = tcKit.toFixed(2);
    if (el('m2c-'  + i)) el('m2c-'  + i).value = m2c.toFixed(2);
  });
  atualizarDescricoes();
  atualizarLblParc();
}

function recalcTotais() {
  atualizarTotaisGlobaisComMo();
  sincronizarLabelsPrint();
  atualizarLblParc();
}

// ── Linhas personalizadas ─────────────────────────────────────────────────────
var _customCount = 0;

function adicionarLinhaCustom() {
  var tbody = el('tblBody');
  if (!tbody) return;
  var idx = _customCount++;
  var tr = document.createElement('tr');
  tr.className = 'row-custom';
  tr.dataset.customIdx = idx;
  tr.innerHTML =
    '<td class="td-num" style="text-align:center;border:1px solid #000;padding:5px 4px;font-size:8pt;vertical-align:middle"></td>' +
    '<td style="text-align:center;border:1px solid #000;padding:3px 4px">' +
      '<input type="number" min="0" step="0.01" value="0" class="custom-area"' +
      ' style="width:56px;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;font-weight:bold;color:#000"' +
      ' oninput="onCustomArea(this)" title="Editar área">' +
    '</td>' +
    '<td style="text-align:center;border:1px solid #000;padding:3px 4px">' +
      '<span contenteditable="true" style="font-size:9pt;font-weight:bold;outline:none;cursor:text;display:inline-block;min-width:20px;border-radius:2px;padding:1px 2px"' +
      ' onfocus="this.style.background=\\'#fffde7\\';this.style.outline=\\'1px solid #f0c040\\'"' +
      ' onblur="this.style.background=\\'\\';this.style.outline=\\'none\\'">m\u00b2</span>' +
    '</td>' +
    '<td style="text-align:left;border:1px solid #000;padding:5px 6px;vertical-align:top">' +
      '<div contenteditable="true" style="font-weight:bold;margin-bottom:3px;outline:none;cursor:text;border-radius:2px;padding:1px 2px"' +
      ' onfocus="this.style.background=\\'#fffde7\\';this.style.outline=\\'1px solid #f0c040\\'"' +
      ' onblur="this.style.background=\\'\\';this.style.outline=\\'none\\'">T\u00edtulo do item</div>' +
      '<div contenteditable="true" style="font-size:8.5pt;color:#222;line-height:1.5;outline:none;cursor:text;border-radius:2px;padding:1px 2px"' +
      ' onfocus="this.style.background=\\'#fffde7\\';this.style.outline=\\'1px solid #f0c040\\'"' +
      ' onblur="this.style.background=\\'\\';this.style.outline=\\'none\\'">Descri\u00e7\u00e3o do item</div>' +
    '</td>' +
    '<td style="text-align:right;border:1px solid #000;padding:3px 4px">' +
      '<input type="number" min="0" step="0.01" value="0" class="custom-m2c"' +
      ' style="width:70px;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;font-weight:bold;color:#000"' +
      ' oninput="onCustomM2(this)" title="Editar R$/m\u00b2">' +
    '</td>' +
    '<td style="text-align:right;border:1px solid #000;padding:3px 4px">' +
      '<input type="number" min="0" step="0.01" value="0" class="custom-totc"' +
      ' style="width:74px;border:none;background:transparent;text-align:right;font-size:9pt;font-family:Arial;font-weight:bold;color:#000"' +
      ' oninput="atualizarTotaisGlobaisComMo()" title="Editar total">' +
    '</td>' +
    '<td class="col-mo-base no-print" style="border:1px solid #000;padding:3px 6px;text-align:center">' +
      '<button onclick="removerLinhaCustom(this)" style="border:none;background:#e55;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px">\u2715</button>' +
    '</td>';
  // Insere depois da última linha com conteúdo (row-kit, row-mo, row-custom),
  // antes das linhas vazias de preenchimento (tr sem classe)
  var todasLinhas = tbody.querySelectorAll('tr');
  var ultimaComConteudo = null;
  for (var li = 0; li < todasLinhas.length; li++) {
    if (todasLinhas[li].className) { ultimaComConteudo = todasLinhas[li]; }
  }
  if (ultimaComConteudo && ultimaComConteudo.nextSibling) {
    tbody.insertBefore(tr, ultimaComConteudo.nextSibling);
  } else if (ultimaComConteudo) {
    tbody.appendChild(tr);
  } else {
    tbody.appendChild(tr);
  }
  renumerarLinhas();
  atualizarTotaisGlobaisComMo();
}

function removerLinhaCustom(btn) {
  var tr = btn.closest('tr');
  if (tr) { tr.parentNode.removeChild(tr); renumerarLinhas(); atualizarTotaisGlobaisComMo(); }
}

function onCustomArea(inp) {
  var tr   = inp.closest('tr');
  var area = parseFloat(inp.value) || 0;
  var m2El = tr.querySelector('.custom-m2c');
  var totEl = tr.querySelector('.custom-totc');
  var m2   = parseFloat(m2El && m2El.value) || 0;
  if (totEl) totEl.value = (area * m2).toFixed(2);
  atualizarTotaisGlobaisComMo();
}

function onCustomM2(inp) {
  var tr   = inp.closest('tr');
  var m2   = parseFloat(inp.value) || 0;
  var areaEl = tr.querySelector('.custom-area');
  var totEl  = tr.querySelector('.custom-totc');
  var area = parseFloat(areaEl && areaEl.value) || 0;
  if (totEl) totEl.value = (area * m2).toFixed(2);
  atualizarTotaisGlobaisComMo();
}

// ── Clone helpers ─────────────────────────────────────────────────────────────
function congelarSelectEmClone(clone) {
  var selectOriginal = document.querySelector('.page select');
  var selectNoClone  = clone.querySelector('select');
  if (!selectOriginal || !selectNoClone) return;
  var val     = selectOriginal.value;
  var options = selectNoClone.querySelectorAll('option');
  for (var i = 0; i < options.length; i++) {
    if (options[i].value === val) {
      options[i].setAttribute('selected', 'selected');
      selectNoClone.value = val;
      break;
    }
  }
}

// ── Copiar imagem ─────────────────────────────────────────────────────────────
async function copiarImagem() {
  var btn = el('btnCopy');
  btn.disabled = true;
  btn.textContent = '\\u23F3 Gerando imagem...';
  var MARGEM  = 24;
  var ocultar = document.querySelectorAll('.no-print');
  ocultar.forEach(function(e) { e.dataset.prevDisplay = e.style.display; e.style.display = 'none'; });
  var page    = document.querySelector('.page');
  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'background:transparent;display:inline-block;width:' + page.offsetWidth + 'px';
  var clone = page.cloneNode(true);
  clone.style.padding = '0';
  clone.querySelectorAll('.no-print').forEach(function(e) { e.remove(); });
  congelarSelectEmClone(clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  try {
    var inner = await html2canvas(wrapper, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: wrapper.offsetWidth, height: wrapper.offsetHeight,
    });
    document.body.removeChild(wrapper);
    ocultar.forEach(function(e) { e.style.display = e.dataset.prevDisplay || ''; });
    var m   = MARGEM * 2;
    var out = document.createElement('canvas');
    out.width  = inner.width  + m * 2;
    out.height = inner.height + m * 2;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(inner, m, m);
    out.toBlob(async function(blob) {
      try {
        window.focus();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        btn.textContent = '\\u2705 Copiado! Cole no WhatsApp';
        btn.style.background = '#1a73e8';
        setTimeout(function() {
          btn.disabled = false;
          btn.textContent = '\\uD83D\\uDCCB Copiar para WhatsApp';
          btn.style.background = '#25d366';
        }, 3000);
      } catch (clipErr) {
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href = url; a.download = 'resumido.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
        btn.disabled = false;
        btn.textContent = '\\u26A0\\uFE0F Imagem baixada';
        btn.style.background = '#e8510a';
        setTimeout(function() {
          btn.textContent = '\\uD83D\\uDCCB Copiar para WhatsApp';
          btn.style.background = '#25d366';
        }, 4000);
      }
    }, 'image/png');
  } catch (err) {
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
    ocultar.forEach(function(e) { e.style.display = e.dataset.prevDisplay || ''; });
    btn.disabled = false;
    btn.textContent = '\\u274C Erro';
  }
}

// ── Baixar PDF ────────────────────────────────────────────────────────────────
async function baixarPdf() {
  var btn = el('btnPdf');
  btn.disabled = true;
  btn.textContent = '\\u23F3 Gerando PDF...';
  var A4W = 210, A4H = 297, MG = 8, M2P = 3.7795275591;
  var PXW = Math.round(A4W * M2P);
  var ocultar = document.querySelectorAll('.no-print');
  ocultar.forEach(function(e) { e.dataset.prevDisplay = e.style.display; e.style.display = 'none'; });
  var page    = document.querySelector('.page');
  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:0;left:-9999px;background:#fff;width:' + PXW + 'px;padding:' + Math.round(MG * M2P) + 'px;box-sizing:border-box';
  var clone = page.cloneNode(true);
  clone.style.cssText = 'width:100%;max-width:none;padding:0;margin:0';
  clone.querySelectorAll('.no-print').forEach(function(e) { e.remove(); });
  congelarSelectEmClone(clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  await new Promise(function(r) { setTimeout(r, 150); });
  try {
    var SCALE  = 2;
    var canvas = await html2canvas(wrapper, {
      scale: SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: wrapper.offsetWidth, height: wrapper.offsetHeight, windowWidth: wrapper.offsetWidth,
    });
    document.body.removeChild(wrapper);
    ocultar.forEach(function(e) { e.style.display = e.dataset.prevDisplay || ''; });
    var jsPDF = window.jspdf.jsPDF;
    var iW    = (canvas.width  / SCALE) / M2P;
    var iH    = (canvas.height / SCALE) / M2P;
    var r     = (A4W - MG * 2) / iW;
    var fW    = iW * r, fH = iH * r;
    var pH    = fH <= (A4H - MG * 2) ? A4H : fH + MG * 2;
    var pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [A4W, pH] });
    pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', MG, MG, fW, fH, undefined, 'FAST');
    pdf.save('resumido-' + _NR + '-' + new Date().toISOString().slice(0, 10) + '.pdf');
    _pdfOK = true;
    if (el('pdfBadge')) el('pdfBadge').classList.add('visible');
    btn.disabled = false;
    btn.textContent = '\\u2705 PDF baixado';
    btn.style.background = '#1a7a1a';
    setTimeout(function() {
      btn.textContent = '\\u2B07\\uFE0F Baixar PDF novamente';
      btn.style.background = '#e8510a';
    }, 4000);
  } catch (err) {
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
    ocultar.forEach(function(e) { e.style.display = e.dataset.prevDisplay || ''; });
    btn.disabled = false;
    btn.textContent = '\\u274C Erro';
  }
}`;