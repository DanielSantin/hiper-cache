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

// ── Fórmulas dos kits (documento de kits vindo do banco) ──────────────────────
// compilarFormulaKit("A / 2,88 * 35 + ceil(P / 3)", ["A", "P"]) → função(vars) → número.
// Aceita números (vírgula ou ponto decimal), as variáveis listadas, + − * /,
// parênteses e ceil/floor/round/min/max (argumentos separados por ';', como no
// Excel em português). Sem eval/new Function: a página do Hiper pode bloquear,
// e a fórmula vem do banco. Erro de sintaxe ou variável desconhecida → lança
// Error. A conta é feita na mesma ordem que o JS faria com a expressão escrita
// à mão, então o resultado é idêntico ao das funções antigas do kit.js — e ao
// de core/kits.py no backend (mesmo algoritmo).
const _FUNCOES_FORMULA = {
  ceil: [1, Math.ceil], floor: [1, Math.floor], round: [1, Math.round],
  min: [2, Math.min], max: [2, Math.max],
};

function compilarFormulaKit(texto, variaveis) {
  const src = String(texto ?? '');
  const toks = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(.))/gy;
  let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) toks.push({ t: 'n', v: Number(m[1].replace(',', '.')) });
    else if (m[2] !== undefined) toks.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined && m[3].trim()) {
      if (!'+-*/();'.includes(m[3])) throw new Error(`caractere inválido: "${m[3]}"`);
      toks.push({ t: m[3] });
    }
  }
  let i = 0;
  const ver = () => toks[i]?.t;
  const pegar = (t) => { if (ver() !== t) throw new Error(`esperava "${t}"`); return toks[i++]; };

  function expr() {
    let a = termo();
    while (ver() === '+' || ver() === '-') {
      const op = toks[i++].t, b = termo(), x = a;
      a = op === '+' ? (v) => x(v) + b(v) : (v) => x(v) - b(v);
    }
    return a;
  }
  function termo() {
    let a = fator();
    while (ver() === '*' || ver() === '/') {
      const op = toks[i++].t, b = fator(), x = a;
      a = op === '*' ? (v) => x(v) * b(v) : (v) => x(v) / b(v);
    }
    return a;
  }
  function fator() {
    const k = toks[i];
    if (!k) throw new Error('fórmula incompleta');
    if (k.t === '-') { i++; const f = fator(); return (v) => -f(v); }
    if (k.t === '+') { i++; return fator(); }
    if (k.t === 'n') { i++; const n = k.v; return () => n; }
    if (k.t === '(') { i++; const e = expr(); pegar(')'); return e; }
    if (k.t === 'id') {
      i++;
      if (ver() === '(') {
        const fn = _FUNCOES_FORMULA[k.v];
        if (!fn) throw new Error(`função desconhecida: ${k.v}`);
        i++;
        const args = [expr()];
        while (ver() === ';') { i++; args.push(expr()); }
        pegar(')');
        if (args.length !== fn[0]) throw new Error(`${k.v} pede ${fn[0]} argumento(s)`);
        return args.length === 1 ? (v) => fn[1](args[0](v)) : (v) => fn[1](args[0](v), args[1](v));
      }
      if (!variaveis.includes(k.v)) throw new Error(`variável desconhecida: ${k.v}`);
      const nome = k.v;
      return (v) => v[nome];
    }
    throw new Error(`"${k.t}" fora do lugar`);
  }

  if (!toks.length) throw new Error('fórmula vazia');
  const f = expr();
  if (i < toks.length) throw new Error(`sobrou "${toks[i].v ?? toks[i].t}" no fim`);
  return f;
}

function temOperadorBR(str) {
  return /\d\s*[x×X*/+\-−÷]\s*\d/.test(String(str ?? ''));
}
