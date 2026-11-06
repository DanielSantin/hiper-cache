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

// ── Cenários ───────────────────────────────────────────────────────────
// Medidas pequenas e grandes para passar pelos tiers de embalagem
// (parafuso avulso/caixa, massa 6/14/25 kg, fita 45/90 m, bucha, balde...).
function cenarios() {
  const c = {};
  const forro = { A: 0, P: 0, altPend: 0.6 };
  for (const [A, P] of [[12, 14], [85.5, 40], [400, 120]]) {
    c[`aramado A${A} P${P}`]     = [{ nomeKit: 'aramado',     medidas: { ...forro, A, P } }];
    c[`estruturado A${A} P${P}`] = [{ nomeKit: 'estruturado', medidas: { ...forro, A, P } }];
  }
  c['estruturado altPend 1,2 margem 10'] = [{ nomeKit: 'estruturado', medidas: { A: 50, P: 30, altPend: '1,2', margem: 10 } }];
  c['estruturado texto BR "1.234,5"']    = [{ nomeKit: 'estruturado', medidas: { A: '1.234,5', P: '140', altPend: 0.6 } }];
  for (const ML of [6, 35, 210]) {
    c[`cortineiro ML${ML}`]    = [{ nomeKit: 'cortineiro',    medidas: { A: ML, cant: 3.15 } }];
    c[`reforcoTrilho ML${ML}`] = [{ nomeKit: 'reforcoTrilho', medidas: { A: ML } }];
  }
  c['cortineiro cant 4'] = [{ nomeKit: 'cortineiro', medidas: { A: 20, cant: 4 } }];

  c['portas 1x padrão'] = [{ tipo: 'portas', grupos: [{ qtd: 1, larg: 0.7, alt: 2.1 }] }];
  c['portas 3 grupos']  = [{ tipo: 'portas', grupos: [
    { qtd: 4, larg: 0.8, alt: 2.1 }, { qtd: 2, larg: '0,6', alt: '2,1' }, { qtd: 1, larg: 0, alt: 0 }] }];

  const faces = ['ST', 'RU', 'CIM'];
  for (const estrutura of ['simples', 'dupla']) {
    for (const a of faces) {
      c[`parede 1F ${a} ${estrutura}`] = [{ tipo: 'parede', A: 30, cfg: { faces: 1, faceA: a, faceB: a, estrutura } }];
      for (const b of faces) {
        c[`parede ${a}/${b} ${estrutura}`] = [{ tipo: 'parede', A: 42, cfg: { faces: 2, faceA: a, faceB: b, estrutura } }];
      }
    }
  }
  c['parede ST/ST grande (tiers)'] = [{ tipo: 'parede', A: 520, cfg: { faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'simples' } }];
  c['parede CIM/CIM grande (tiers)'] = [{ tipo: 'parede', A: 260, cfg: { faces: 2, faceA: 'CIM', faceB: 'CIM', estrutura: 'simples' } }];
  c['parede ST/RU com vãos e margem'] = [{ tipo: 'parede', A: 60, areaVaos: 7.5, margem: 5, cfg: { faces: 2, faceA: 'ST', faceB: 'RU', estrutura: 'simples' } }];
  for (const m of ['48', '90']) {
    c[`parede ST/ST montante ${m}`] = [{ tipo: 'parede', A: 42, montante: m, cfg: { faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'dupla' } }];
  }

  // Vários kits no mesmo pedido: linhas compartilhadas somam e o rateio divide.
  c['combo forro + parede + portas'] = [
    { id: 'estruturado_1', nomeKit: 'estruturado', medidas: { A: 60, P: 32, altPend: 0.6 } },
    { id: 'parede_1', tipo: 'parede', A: 45, cfg: { faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'simples' } },
    { id: 'portas', tipo: 'portas', grupos: [{ qtd: 2, larg: 0.7, alt: 2.1 }] },
  ];
  c['combo duas sancas'] = [
    { id: 'cortineiro_1', nomeKit: 'cortineiro', medidas: { A: 10, cant: 3.15 } },
    { id: 'cortineiro_2', nomeKit: 'cortineiro', medidas: { A: 30, cant: 3.15 } },
  ];
  c['kit sem medida (rateio igual)'] = [
    { id: 'aramado_1', nomeKit: 'aramado', medidas: { A: 0, P: 0, altPend: 0.6 } },
    { id: 'aramado_2', nomeKit: 'aramado', medidas: { A: 0, P: 0, altPend: 0.6 } },
  ];
  return c;
}

test('kit.js: fórmulas, tiers, arredondamento e rateio iguais ao snapshot', () => {
  const kit = carregarKit();
  const atual = {};
  for (const [nome, kits] of Object.entries(cenarios())) atual[nome] = rodarCenario(kit, kits);

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
