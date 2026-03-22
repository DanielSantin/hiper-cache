// resumido-runtime-src.js
// Conteudo de resumido-runtime.js embutido como string (evita fetch)
window.RESUMIDO_RUNTIME_SRC = `// ═══════════════════════════════════════════════════════════════════════════════
// resumido-runtime.js — Funções que rodam DENTRO do HTML gerado
//
// ATENÇÃO: Este arquivo NÃO é carregado diretamente pelo browser como <script>.
// Ele é lido em tempo de build (por resumido-gerador.js) e embutido como string
// dentro do HTML do orçamento. Por isso:
//
//  • Não use template literals (backticks) — eles complicam a serialização.
//  • Não use </script> em nenhum comentário ou string.
//  • Funções aqui dependem de _KI, _PIX, _SOMA_PESO, _NR injetados pelo gerador.
// ═══════════════════════════════════════════════════════════════════════════════

/* globals _KI, _PIX, _SOMA_PESO, _NR */

// ── Helpers básicos ───────────────────────────────────────────────────────────

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

// ── Atualização de labels ─────────────────────────────────────────────────────

function atualizarLblParc() {
  var p = parseInt((el('selParcelas') && el('selParcelas').value) || '3');
  if (el('lblParc')) {
    el('lblParc').textContent = 'Valor Total \\u2013 Parcelado em at\\u00e9 ' + p + 'x no Cart\\u00e3o de Cr\\u00e9dito';
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
    var unid  = kit.nome === 'cortineiro' ? 'ml' : 'm\\u00b2';
    var c2 = el('lm2c-' + i);
    var v2 = el('lm2v-' + i);
    if (c2) c2.textContent = 'R$ ' + fN(m2c) + '/' + unid;
    if (v2) v2.textContent = 'R$ ' + fN(m2c * _PIX) + '/' + unid;
  });
}

function atualizarTotaisGlobais() {
  var s = 0;
  _KI.forEach(function(_, i) { s += numEl('totc-' + i); });
  var tc = s + getFrete();
  var tv = tc * _PIX;
  var fr = getFrete();
  if (el('valC')) { el('valC').value = tc.toFixed(2); }
  if (el('valV')) { el('valV').value = tv.toFixed(2); }
  if (el('valC-p')) el('valC-p').textContent = fN(tc);
  if (el('valV-p')) el('valV-p').textContent = fN(tv);
  if (el('rowE'))   el('rowE').style.display = (el('chkE') && el('chkE').checked) ? 'flex' : 'none';
  if (el('valEntrega')) el('valEntrega').textContent = 'R$ ' + fN(fr);
  atualizarLblParc();
}

// ── Handlers de edição na tabela ─────────────────────────────────────────────

// Usuário mudou ÁREA → recalcula R$/m² mantendo o total do kit fixo
function onArea(i) {
  var area  = numEl('area-' + i);
  var tcKit = numEl('totc-' + i);
  if (area > 0 && el('m2c-' + i)) {
    el('m2c-' + i).value = (tcKit / area).toFixed(2);
  }
  atualizarDescricoes();
  atualizarTotaisGlobais();
}

// Usuário mudou R$/m² → recalcula total do kit (área fica fixa)
function onM2(i) {
  var area  = numEl('area-' + i);
  var m2c   = numEl('m2c-' + i);
  var tcKit = area * m2c;
  if (el('totc-' + i)) el('totc-' + i).value = tcKit.toFixed(2);
  atualizarDescricoes();
  atualizarTotaisGlobais();
}

// Usuário mudou TOTAL do kit → recalcula R$/m² (área fica fixa)
function onTotKit(i) {
  var area  = numEl('area-' + i);
  var tcKit = numEl('totc-' + i);
  if (area > 0 && el('m2c-' + i)) {
    el('m2c-' + i).value = (tcKit / area).toFixed(2);
  }
  atualizarDescricoes();
  atualizarTotaisGlobais();
}

// ── Handlers dos totais globais ───────────────────────────────────────────────

// Usuário mudou o TOTAL CARTÃO global → distribui pelos kits com pesos
function onValC() {
  var novoTc = numEl('valC');
  var fr     = getFrete();
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

// Usuário mudou o TOTAL À VISTA → converte para cartão e redistribui
function onValV() {
  var novoTv = numEl('valV');
  var novoTc = novoTv / _PIX;
  if (el('valC'))   el('valC').value   = novoTc.toFixed(2);
  if (el('valC-p')) el('valC-p').textContent = fN(novoTc);
  if (el('valV-p')) el('valV-p').textContent = fN(novoTv);
  var fr = getFrete();
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

// Entrega ou seletor de parcelas mudou → recalcula totais globais mantendo os kits
function recalcTotais() {
  var totalItens = _KI.reduce(function(acc, _, i) { return acc + numEl('totc-' + i); }, 0);
  var novoTc     = totalItens + getFrete();
  if (el('valC')) el('valC').value = novoTc.toFixed(2);
  if (el('valV')) el('valV').value = (novoTc * _PIX).toFixed(2);
  if (el('rowE')) el('rowE').style.display = (el('chkE') && el('chkE').checked) ? 'flex' : 'none';
  if (el('valEntrega')) el('valEntrega').textContent = 'R$ ' + fN(getFrete());
  sincronizarLabelsPrint();
  atualizarLblParc();
}

// ── Congelar select no clone (para PDF/imagem) ────────────────────────────────
// FIX: usa atributo data-val para evitar aspas aninhadas no querySelector
function congelarSelectEmClone(clone) {
  var selectOriginal = document.querySelector('.page select');
  var selectNoClone  = clone.querySelector('select');
  if (!selectOriginal || !selectNoClone) return;
  var val = selectOriginal.value;
  // Itera as options em vez de usar querySelector com atributo interpolado
  var options = selectNoClone.querySelectorAll('option');
  for (var i = 0; i < options.length; i++) {
    if (options[i].value === val) {
      options[i].setAttribute('selected', 'selected');
      selectNoClone.value = val;
      break;
    }
  }
}

// ── Copiar imagem para clipboard ──────────────────────────────────────────────
async function copiarImagem() {
  var btn = el('btnCopy');
  btn.disabled = true;
  btn.textContent = '\\u23F3 Gerando imagem...';
  var MARGEM = 24;
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
        var a = document.createElement('a');
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
    var SCALE = 2;
    var canvas = await html2canvas(wrapper, {
      scale: SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: wrapper.offsetWidth, height: wrapper.offsetHeight, windowWidth: wrapper.offsetWidth,
    });
    document.body.removeChild(wrapper);
    ocultar.forEach(function(e) { e.style.display = e.dataset.prevDisplay || ''; });
    var jsPDF  = window.jspdf.jsPDF;
    var iW     = (canvas.width  / SCALE) / M2P;
    var iH     = (canvas.height / SCALE) / M2P;
    var r      = (A4W - MG * 2) / iW;
    var fW     = iW * r, fH = iH * r;
    var pH     = fH <= (A4H - MG * 2) ? A4H : fH + MG * 2;
    var pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [A4W, pH] });
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