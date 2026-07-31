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
