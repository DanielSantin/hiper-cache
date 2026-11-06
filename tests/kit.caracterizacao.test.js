// ═══════════════════════════════════════════════════════════════════════
// Teste de caracterização do kit.js — trava a saída ATUAL das fórmulas.
//
//   node --test tests/                       → compara com kit.snapshot.json
//   ATUALIZAR=1 node --test tests/           → regrava o snapshot (só quando
//                                              a mudança de fórmula é de propósito)
//
// Carrega o kit.js real num contexto vm com um navegador/store falsos e
// chama recalcularTudo() + calcularRateioKits(). Para cada linha registra o
// que o kit mandaria gravar: produto final (tier de embalagem), quantidade
// arredondada, valor bruto e se é só hint (montante/guia). Não testa a tela
// nem a store do Hiper — só a conta.
//
// Serve de referência para levar as fórmulas para o banco: a versão nova tem
// que produzir exatamente este snapshot a partir dos dados semeados.
// ═══════════════════════════════════════════════════════════════════════
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const RAIZ     = path.join(__dirname, '..');
const SNAPSHOT = path.join(__dirname, 'kit.snapshot.json');
const cenarios = require('./kit.cenarios.js');

function carregarKit() {
  const noop = () => {};
  const elFalso = () => ({
    style: {}, classList: { add: noop, remove: noop }, dataset: {},
    appendChild: noop, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, setAttribute: noop,
  });
  const ctx = {
    console: { log: noop, info: noop, warn: noop, error: console.error },
    setTimeout: () => 0, clearTimeout: noop, Promise, Date, Math, JSON,
    URLSearchParams,
    MutationObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { search: '', href: 'https://tagdrywall.hiper.com.br/', pathname: '/' },
    history: { replaceState: noop },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: elFalso, head: elFalso(), body: elFalso(), documentElement: elFalso(),
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['hiper-num-utils.js', 'kit.js']) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

// Monta os kits como _abrirLinhas faria: um código base por linha, e kits que
// pedem o mesmo código dividem a linha. Devolve o resultado por linha.
function rodarCenario(kit, kits) {
  kit.kitsAtivos.clear();
  const linhaDoCodigo = new Map();
  const linhaId = (codigo) => {
    if (!linhaDoCodigo.has(codigo)) linhaDoCodigo.set(codigo, 'L' + (linhaDoCodigo.size + 1));
    return linhaDoCodigo.get(codigo);
  };

  kits.forEach((k, i) => {
    let codigos, estado;
    if (k.tipo === 'parede') {
      const tam = k.montante ?? '70';
      codigos = kit.paredeCodigosAtivos(k.cfg).map(c =>
        c === '79831932' ? kit.COD_MONTANTE[tam] : c === '79831929' ? kit.COD_GUIA[tam] : c);
      estado = { tipo: 'parede', cfg: { ...k.cfg }, A: k.A, areaVaos: k.areaVaos ?? 0,
                 margem: k.margem ?? 0, montante: tam };
    } else if (k.tipo === 'portas') {
      codigos = kit.KITS_GESSO.portas;
      estado = { tipo: 'portas', nomeKit: 'portas', A: 0, grupos: k.grupos, margem: k.margem ?? 0 };
    } else {
      codigos = kit.KITS_GESSO[k.nomeKit];
      estado = { tipo: 'kit', nomeKit: k.nomeKit, ...k.medidas };
    }
    estado.linhas = codigos.map(codigo => ({ codigo, linhaId: linhaId(codigo) }));
    kit.kitsAtivos.set(k.id ?? `${k.nomeKit ?? k.tipo}_${i}`, estado);
  });

  const linhas = {};
  const r4 = v => Math.round(v * 1e6) / 1e6;
  kit._linhaExiste            = () => true;
  kit._atualizarCamposEstrutura = () => {};
  kit.trocarProdutoNaLinha = (id, codigo, qtd, bruto) => {
    linhas[id] = { produto: codigo, qtd: r4(qtd), bruto: r4(bruto), tier: true };
  };
  kit.setarQuantidade = (id, qtd, bruto, apenasHint) => {
    linhas[id] = { produto: null, qtd: r4(qtd), bruto: r4(bruto), ...(apenasHint ? { soHint: true } : {}) };
  };
  kit.recalcularTudo();

  const rateio = kit.calcularRateioKits();
  const saida = {};
  for (const [codigo, id] of linhaDoCodigo) {
    const l = linhas[id];
    const rat = rateio[id] ?? {};
    saida[codigo] = {
      ...l, produto: l?.produto ?? codigo,
      ...(Object.keys(rat).length > 1
        ? { rateio: Object.fromEntries(Object.entries(rat).map(([k, v]) => [k, r4(v)])) } : {}),
    };
  }
  return saida;
}

// Documento de kits gerado das tabelas embutidas (o mesmo que semeou o banco).
function docPadrao() {
  const { execFileSync } = require('node:child_process');
  return JSON.parse(execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'exportar-kits.js')], { encoding: 'utf8' }));
}

function rodarTodos(kit) {
  const atual = {};
  for (const [nome, kits] of Object.entries(cenarios())) atual[nome] = rodarCenario(kit, kits);
  return atual;
}

test('kit.js com o documento do banco: mesmo snapshot das tabelas embutidas', () => {
  const kit = carregarKit();
  kit.__hiperKits.aplicarDoc(docPadrao(), { rev: 1, hash: 'x' });
  assert.strictEqual(kit.__hiperKits.config.origem, 'banco');
  const esperado = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const atual = rodarTodos(kit);
  for (const nome of Object.keys(esperado)) {
    assert.deepStrictEqual(atual[nome], esperado[nome], `cenário "${nome}" (documento)`);
  }
});

test('documento: cada fórmula antiga (e equivalentes) dá o mesmo número, bit a bit', () => {
  const velho = carregarKit();
  const novo  = carregarKit();
  novo.__hiperKits.aplicarDoc(docPadrao());
  const amostras = [];
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 200; i++) amostras.push([rnd() * 500, rnd() * 200, rnd() * 6, rnd() * 2]);

  for (const [kitNome, mapa] of Object.entries(velho.FORMULAS_GESSO)) {
    for (const [cod, fn] of Object.entries(mapa)) {
      const fnNovo = novo.FORMULAS_GESSO[kitNome][cod];
      assert.ok(fnNovo, `${kitNome}/${cod} sumiu`);
      for (const a of amostras) assert.strictEqual(fnNovo(...a), fn(...a), `${kitNome}/${cod} em ${a}`);
    }
  }
  for (const estrutura of ['simples', 'dupla']) for (const faces of [1, 2])
    for (const faceA of ['ST', 'RU', 'CIM']) for (const faceB of ['ST', 'RU', 'CIM']) {
      const cfg = { faces, faceA, faceB, estrutura };
      const fv = velho.paredeGerarFormulas(cfg), fnv = novo.paredeGerarFormulas(cfg);
      for (const [cod, fn] of Object.entries(fv)) {
        assert.ok(fnv[cod], `parede ${JSON.stringify(cfg)} ${cod} sumiu`);
        for (const a of amostras) assert.strictEqual(fnv[cod](a[0]), fn(a[0]), `parede ${cod}`);
      }
      assert.deepStrictEqual([...novo.paredeCodigosAtivos(cfg)], [...velho.paredeCodigosAtivos(cfg)]);
      assert.strictEqual(novo.paredeMoBase(cfg), velho.paredeMoBase(cfg));
    }
});

test('documento inválido não troca nada (fica a versão anterior)', () => {
  const kit = carregarKit();
  const doc = docPadrao();
  doc.kits.aramado.itens[0].formula = 'A / (1,2';
  assert.throws(() => kit.__hiperKits.aplicarDoc(doc), /aramado.*93974519/);
  assert.strictEqual(kit.__hiperKits.config.origem, 'embutida');
  assert.strictEqual(kit.FORMULAS_GESSO.aramado['93974519'](12, 0, 0, 0), 10);
});

test('compilarFormulaKit: vírgula decimal, funções com ";", erros', () => {
  const kit = carregarKit();
  const c = (f, v = {}) => kit.compilarFormulaKit(f, Object.keys(v))(v);
  assert.strictEqual(c('A * 0,45', { A: 10 }), 10 * 0.45);
  assert.strictEqual(c('ceil(1 + ml / 0.6) * h / 3', { ml: 2, h: 3 }), Math.ceil(1 + 2 / 0.6) * 3 / 3);
  assert.strictEqual(c('max(A; 2) - -1', { A: 1 }), 3);
  assert.strictEqual(c('(A / 2.88) * 35 + (P / 3) * 11', { A: 7, P: 9 }), (7 / 2.88) * 35 + (9 / 3) * 11);
  for (const ruim of ['', 'A +', 'B * 2', 'alert(1)', 'A; 2', '2 ** 3', 'A.b', 'min(1)']) {
    assert.throws(() => c(ruim, { A: 1 }), (e) => typeof e.message === "string" && e.message.length > 0, ruim);
  }
});

test('kit.js: fórmulas, tiers, arredondamento e rateio iguais ao snapshot', () => {
  const kit = carregarKit();
  const atual = rodarTodos(kit);

  if (process.env.ATUALIZAR || !fs.existsSync(SNAPSHOT)) {
    fs.writeFileSync(SNAPSHOT, JSON.stringify(atual, null, 1) + '\n');
    console.log(`snapshot gravado: ${Object.keys(atual).length} cenários`);
    return;
  }
  const esperado = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  assert.deepStrictEqual(Object.keys(atual).sort(), Object.keys(esperado).sort(), 'lista de cenários mudou');
  for (const nome of Object.keys(esperado)) {
    assert.deepStrictEqual(atual[nome], esperado[nome], `cenário "${nome}"`);
  }
});
