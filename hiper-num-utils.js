// ═══════════════════════════════════════════════════════════════════════════════
// hiper-num-utils.js — Parser único de número/moeda no formato BR (vírgula decimal)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Antes disso, kit.js (num), hiper-orcamento.js (parseMoedaOrc) e hiper-widgets.js
// (parseMoeda) mantinham cada um sua própria cópia dessa lógica de parsing.
//
// SEMPRE pode retornar NaN (string vazia/nula ou sem número válido) — de
// propósito, sem cair pra 0 sozinho. Quem chama decide o que fazer com isso:
//   • parseMoeda (hiper-widgets.js) propaga o NaN — o algoritmo de desconto
//     usa isNaN(...) pra filtrar linha com preço/quantidade ilegível, então
//     silenciar isso pra 0 corromperia o cálculo sem avisar ninguém.
//   • num() / parseMoedaOrc (kit.js / hiper-orcamento.js) convertem NaN pra 0
//     na própria função — nunca lidam com validação, só querem um número.
function parseNumeroBR(str) {
  const s = String(str).replace(/[^\d,\.]/g, '');
  const commas = (s.match(/,/g) || []).length;
  const dots   = (s.match(/\./g) || []).length;
  if (commas === 1 && dots === 0) return parseFloat(s.replace(',', '.'));
  if (dots === 1 && commas === 0) return parseFloat(s);
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

// Conta digitada num campo (ex.: "2*2,5*5" → 25). Aceita + − * / e "x"/"×"
// como vezes, com precedência normal (vezes/dividir antes de mais/menos).
// Cada número aceita vírgula ou ponto (via parseNumeroBR). Operador sobrando
// no fim ("2*") é ignorado, pra conta parcial já dar valor enquanto digita.
// Sem operador → igual a parseNumeroBR. Retorna NaN se não der pra entender.
function avaliarExpressaoBR(str) {
  const s = String(str ?? '')
    .replace(/[x×X]/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/[^\d,.+\-*/]/g, '');
  if (!/[+*/]|.-/.test(s)) return parseNumeroBR(s);

  const toks = s.match(/[\d.,]+|[+\-*/]/g) || [];
  while (toks.length && /^[+\-*/]$/.test(toks[toks.length - 1])) toks.pop();
  if (!toks.length) return NaN;

  let soma = 0, termo = null, sinal = 1, op = null;
  for (const t of toks) {
    if (/^[\d.,]+$/.test(t)) {
      const n = parseNumeroBR(t);
      if (isNaN(n)) return NaN;
      if (termo === null) termo = n;
      else if (op === '*') termo *= n;
      else if (op === '/') termo = n === 0 ? NaN : termo / n;
      else return NaN;
      op = null;
    } else if (t === '*' || t === '/') {
      if (termo === null || op) return NaN;
      op = t;
    } else {
      if (op) return NaN;
      if (termo !== null) { soma += sinal * termo; termo = null; sinal = 1; }
      if (t === '-') sinal = -sinal;
    }
  }
  if (termo === null || isNaN(termo)) return NaN;
  return soma + sinal * termo;
}

function temOperadorBR(str) {
  return /\d\s*[x×X*/+\-−÷]\s*\d/.test(String(str ?? ''));
}
