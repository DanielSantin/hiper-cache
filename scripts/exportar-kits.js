// ═══════════════════════════════════════════════════════════════════════
// scripts/exportar-kits.js — gera o documento de kits (v1) a partir das
// tabelas embutidas no kit.js e dos textos do resumido (hiper-sites).
//
//   node scripts/exportar-kits.js > ../hiper-database/assets/kits_padrao.json
//
// Usado uma vez para semear o banco (tabela kit_config). Depois disso a fonte
// é o banco: editar em sistema.santin.tec.br/kits. As tabelas do kit.js ficam
// só como reserva (API fora do ar), e o kits-padrao.js da extensão é gerado
// deste mesmo JSON.
// ═══════════════════════════════════════════════════════════════════════
const fs   = require('node:fs');
const path = require('node:path');
const vm   = require('node:vm');

const RAIZ  = path.join(__dirname, '..');
const SITES = path.join(RAIZ, '..', 'hiper-sites');

function rodar(arquivos, exportar) {
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop }, dataset: {}, appendChild: noop,
                      querySelector: () => null, querySelectorAll: () => [], addEventListener: noop });
  const ctx = {
    console: { log: noop, info: noop, warn: noop, error: noop }, setTimeout: () => 0,
    MutationObserver: class { observe() {} }, URLSearchParams,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { search: '', href: '', pathname: '/' }, history: { replaceState: noop },
    document: { getElementById: () => null, querySelector: () => null, createElement: el, head: el(), body: el() },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const fonte = arquivos.map(f => fs.readFileSync(f, 'utf8')).join('\n;\n') + `\n;this.__x = {${exportar}};`;
  vm.runInContext(fonte, ctx);
  return ctx.__x;
}

const K = rodar([path.join(RAIZ, 'hiper-num-utils.js'), path.join(RAIZ, 'kit.js')],
  'GRUPOS_VARIACAO, COD_MONTANTE, COD_GUIA, COD_TABICA, ARREDONDAMENTO_CODIGOS, BLACKLIST_SETAR, ' +
  'KITS_GESSO, FORMULAS_GESSO, KIT_INPUTS, KIT_LABELS, PAREDE_ORDEM_PRODUTOS, PAREDE_COD_ESTRUTURA, ' +
  'PAREDE_COD_INSERIR_ST, PAREDE_COD_INSERIR_RU, PAREDE_COD_INSERIR_CIM, PAREDE_FORMULAS_FACE_ST, ' +
  'PAREDE_FORMULAS_FACE_RU, PAREDE_FORMULAS_FACE_CIM, PAREDE_FORMULAS_ESTRUTURA, paredeMoBase');
const R = rodar([path.join(SITES, 'v2', 'kits-dados.js')], 'RESUMIDO_TEXTOS, RESUMIDO_NOMES, RESUMIDO_MO_BASE');

// "(ML, _, cant) => ML * 0.4 / 2.88"  →  "A * 0.4 / 2.88"  (parâmetros por posição)
function formula(fn, nomes) {
  const src = fn.toString();
  const m = src.match(/^\(([^)]*)\)\s*=>\s*([\s\S]+)$/);
  if (!m) throw new Error('fórmula inesperada: ' + src);
  const params = m[1].split(',').map(s => s.trim()).filter(Boolean);
  let corpo = m[2].trim().replace(/\s+/g, ' ');
  params.forEach((p, i) => {
    if (p !== nomes[i]) corpo = corpo.replace(new RegExp(`\\b${p}\\b`, 'g'), nomes[i]);
  });
  return corpo;
}

const VARS_KIT = ['A', 'P', 'cant', 'altPend'];
const ROTULOS_PADRAO = { A: 0, P: 0, cant: 3.15, altPend: 0.6 };
const UNIDADE = { cortineiro: 'ml', reforcoTrilho: 'ml', portas: 'un.' };

const kits = {};
for (const [nome, codigos] of Object.entries(K.KITS_GESSO)) {
  const formulas = K.FORMULAS_GESSO[nome];
  const entradas = (K.KIT_INPUTS[nome] || []).map(f => ({
    chave: f.key, rotulo: f.label, ...(f.title ? { dica: f.title } : {}), padrao: ROTULOS_PADRAO[f.key] ?? 0,
  }));
  kits[nome] = {
    rotulo:   K.KIT_LABELS[nome] || nome,
    nome:     R.RESUMIDO_NOMES[nome] || nome,
    unidade:  UNIDADE[nome] || 'm²',
    mo_base:  R.RESUMIDO_MO_BASE[nome] ?? 25,
    texto:    R.RESUMIDO_TEXTOS[nome] ?? '',
    entradas,
    itens: codigos.map(c => {
      if (!formulas[c]) throw new Error(`${nome}: ${c} sem fórmula`);
      return { produto: c, formula: formula(formulas[c], VARS_KIT) };
    }),
  };
}

const face = (inserir, formulas) => ({
  itens: inserir.map(c => ({ produto: c, formula: formula(formulas[c], ['A']) })),
});

const mo = (cfg) => K.paredeMoBase(cfg);
const doc = {
  versao: 1,
  embalagens: Object.fromEntries(Object.entries(K.GRUPOS_VARIACAO).map(([g, niveis]) => [g,
    niveis.map(n => ({ produto: n.codigo, tamanho: n.tamanho, limite: Number.isFinite(n.limite) ? n.limite : null }))])),
  arredondar: Object.fromEntries(Object.entries(K.ARREDONDAMENTO_CODIGOS).map(([c, fn]) => {
    const m = fn.toString().match(/Math\.ceil\(v \/ ([\d.]+)\) \* ([\d.]+)/);
    if (m && m[1] === m[2]) return [c, Number(m[1])];
    if (/^\(v\) => Math\.ceil\(v\)$/.test(fn.toString())) return [c, 1];
    throw new Error('arredondamento inesperado: ' + fn);
  })),
  estrutura: { montante: { ...K.COD_MONTANTE }, guia: { ...K.COD_GUIA }, padrao: '70' },
  tabica: { ...K.COD_TABICA },
  so_sugestao: [...K.BLACKLIST_SETAR],
  kits,
  parede: {
    faces: {
      ST:  face(K.PAREDE_COD_INSERIR_ST,  K.PAREDE_FORMULAS_FACE_ST),
      RU:  face(K.PAREDE_COD_INSERIR_RU,  K.PAREDE_FORMULAS_FACE_RU),
      CIM: face(K.PAREDE_COD_INSERIR_CIM, K.PAREDE_FORMULAS_FACE_CIM),
    },
    estrutura: {
      itens: K.PAREDE_COD_ESTRUTURA.map(c => ({ produto: c, formula: formula(K.PAREDE_FORMULAS_ESTRUTURA[c], ['A', 'fe']) })),
    },
    ordem: [...K.PAREDE_ORDEM_PRODUTOS],
    mo: {
      uma_face: { ST: mo({ faces: 1, faceA: 'ST' }), RU: mo({ faces: 1, faceA: 'RU' }), CIM: mo({ faces: 1, faceA: 'CIM' }) },
      duas_faces: [0, 1, 2].map(n => mo({ faces: 2, faceA: n >= 1 ? 'CIM' : 'ST', faceB: n >= 2 ? 'CIM' : 'ST', estrutura: 'simples' })),
      dupla: mo({ faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'dupla' }) - mo({ faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'simples' }),
    },
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
