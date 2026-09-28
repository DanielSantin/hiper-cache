// ═══════════════════════════════════════════════════════════════════════
// kit.js — HiperCache | Kits rápidos + Fórmulas
// ═══════════════════════════════════════════════════════════════════════

// ── 1. GRUPOS DE VARIAÇÃO ──────────────────────────────────────────────
const GRUPOS_VARIACAO = {
  parafuso: [
    { codigo: "79899037", tamanho: 1,    limite: 450      },
    { codigo: "79980030", tamanho: 1000, limite: Infinity },
  ],
  massa: [
    { codigo: "100983990", tamanho: 6,  limite: 6        },
    { codigo: "100984275", tamanho: 14, limite: 14       },
    { codigo: "120638070", tamanho: 25, limite: Infinity  },
  ],
  fita: [
    { codigo: "142763406", tamanho: 45, limite: 45      },
    { codigo: "79833178", tamanho: 90, limite: Infinity },
  ],
  // cimentícia: massa cimentícia (litros → unidades de embalagem)
  baldeCim: [
    { codigo: "98073558", tamanho: 3.6, limite: 3.6     }, // balde 3,6 L
    { codigo: "120773931", tamanho: 10,  limite: Infinity }, // balde 10 L
  ],
  // bucha 6mm: unitário até 899, pacote 1000 a partir de 900
  bucha: [
    { codigo: "79898849", tamanho: 1,    limite: 899      }, // unitário
    { codigo: "195137276", tamanho: 1000, limite: Infinity  }, // pacote 1000 un
  ],
  // cimentícia: parafuso unitário → caixa a partir de 500 un
  parafusoCim: [
    { codigo: "186791200", tamanho: 1,   limite: 499      }, // unitário
    { codigo: "195138246", tamanho: 500, limite: Infinity  }, // caixa 500 un
  ],
};

const CODIGO_PARA_GRUPO = {};
for (const [nomeGrupo, niveis] of Object.entries(GRUPOS_VARIACAO)) {
  for (const nivel of niveis) {
    CODIGO_PARA_GRUPO[nivel.codigo] = nomeGrupo;
  }
}

// Toggles do painel: tamanho do montante/guia e cor da tabica.
const COD_MONTANTE = { '48': '80704698', '70': '79831932', '90': '80814793' };
const COD_GUIA     = { '48': '88849464', '70': '79831929', '90': '80815323' };
const COD_TABICA   = { branca: '79830939', natural: '79832337' };

// Códigos que podem ocupar a MESMA linha de um kit (tier de embalagem,
// tamanho de montante/guia, cor da tabica). Usado pra achar a linha de um
// kit recuperado do banco, cujo produto pode não ser mais o código base.
const FAMILIAS_TROCAVEIS = [
  ...Object.values(GRUPOS_VARIACAO).map(niveis => niveis.map(n => n.codigo)),
  Object.values(COD_MONTANTE),
  Object.values(COD_GUIA),
  Object.values(COD_TABICA),
];

function codigosEquivalentes(codigo) {
  const c = String(codigo);
  return new Set(FAMILIAS_TROCAVEIS.find(f => f.includes(c)) ?? [c]);
}

// ── ARREDONDAMENTOS ESPECIAIS ──────────────────────────────────────────
// Códigos que precisam de arredondamento além do Math.ceil padrão.
// Cada entrada é uma função (qtdBruta) => qtdArredondada.
// O valor bruto original é sempre preservado e exibido no tooltip.
const ARREDONDAMENTO_CODIGOS = {
  "79899037": (v) => Math.ceil(v / 50) * 50, // Parafuso TA-25 unitário
  "85213799": (v) => Math.ceil(v / 50) * 50, // Parafuso 6mm
  "79898849": (v) => Math.ceil(v / 50) * 50, // Bucha 6mm unitário
  "186791200": (v) => Math.ceil(v / 50) * 50, // Parafuso cimentícia unitário
  "79984586": (v) => Math.ceil(v / 0.5) * 0.5,   // Sisal
  "79899298": (v) => Math.ceil(v),           // Arame 10
  "79899328": (v) => Math.ceil(v),           // Arame 18
};

// Códigos que devem ser adicionados mas não devem ser modificados automaticamente
const BLACKLIST_SETAR = new Set(["79831929", "79831932", "80704698", "80814793", "80815323", "88849464"]);


// ── 2. DEFINIÇÃO DOS KITS (não-parede) ────────────────────────────────
const KITS_GESSO = {
  aramado:       ["93974519","100983990","79898066","79899328","142763406","79984586","80065949","79830939","79899037","85213799","79898849"],
  estruturado:   ["93938763","100983990","79897413","79896245","79948195","79899298","142763406","79899037","79830939","85213799","79898849"],
  reforcoTrilho: ["79897413","79896245","79948195","79899298","79899037"],
  cortineiro:    ["93938763","100983990","79899037","142763406","79831935"],
  portas:        ["93938763","100983990","79831932","79831929","79899037","85213799","79898849","142763406"],
};

// ── 3. SISTEMA DE PAREDES PARAMETRIZADO ───────────────────────────────
//
// Cada parede é definida por 3 parâmetros independentes:
//   faceA / faceB : 'ST' | 'RU' | 'CIM'
//   faces         : 1 | 2
//   estrutura     : 'simples' | 'dupla'
//
// Para parede de 1 face, faceB é ignorada.
// A estrutura dupla dobra montante e guia (qualquer tamanho — ver PAREDE_FORMULAS_ESTRUTURA).
// Itens ST e RU usam os mesmos produtos; CIM usa produtos exclusivos.

// ── ORDEM DE EXIBIÇÃO DOS PRODUTOS DE PAREDE ─────────────────────────────
// Usada para ordenar os itens ao montar o kit pela primeira vez.
// Adicione aqui os códigos de novos materiais (RU, CIM, etc.) na posição desejada.
// Produtos fora desta lista são anexados ao final, na ordem em que aparecem.
const PAREDE_ORDEM_PRODUTOS = [
  "93938763", // chapa ST
  "93939592", // chapa RU
  "79884530", // placa cimentícia
  "120638070", // massa drywall 25kg
  "79831932", // montante
  "79831929", // guia
  "79899037", // parafuso TA-25
  "85213799", // parafuso 6mm
  "79898849", // bucha 6mm
  "79833178", // fita telada 90m
  "142763406", // fita telada 45m
  "98073558", // cola cimentícia
  "79932400", // fita cimentícia
  "186791200", // parafuso cimentícia
];

// Códigos da ESTRUTURA — sempre presentes, dobram na dupla
// Parafuso 6mm e bucha 6mm são da estrutura — aparecem em todos os tipos
const PAREDE_COD_ESTRUTURA = ["79831932", "79831929", "85213799", "79898849"];

// Códigos de chapa ST — escalam pelo número de faces ST
// Inclui todos os códigos resolvidos dos grupos (baldes 14/25kg da massa, caixa do
// parafuso, rolo 90m da fita) para que recalcularTudo encontre a fórmula
// independente do código que estiver na linha do DOM
const PAREDE_COD_CHAPA_ST = ["93938763", "100983990", "100984275", "120638070", "79899037", "79980030", "142763406", "79833178"];

// Códigos de chapa RU — escalam pelo número de faces RU
// Chapa RU: 1,20×1,80 m (2,16 m²)
const PAREDE_COD_CHAPA_RU = ["93939592", "100983990", "100984275", "120638070", "79899037", "79980030", "142763406", "79833178"];

// Códigos exclusivos de face CIM — escalam pelo número de faces CIM
// Inclui a caixa de 500 do parafuso cimentícia pelo mesmo motivo
const PAREDE_COD_CHAPA_CIM = ["79884530", "98073558", "120773931", "79932400", "186791200", "195138246"];

// ── CÓDIGOS CANÔNICOS (apenas para inserção de linhas no DOM) ─────────────
// Contém somente um código por grupo de variação (o código base).
// Os alternativos (baldes maiores de massa, caixa de parafuso, rolo de fita,
// balde maior cimentícia, caixa de parafuso cimentícia) são resolvidos em
// tempo de execução por resolverNivel() dentro de trocarProdutoNaLinha().
// Usar os alternativos aqui causaria linhas duplicadas no pedido.
const PAREDE_COD_INSERIR_ST  = ["93938763", "100983990", "79899037", "142763406"];
const PAREDE_COD_INSERIR_RU  = ["93939592", "100983990", "79899037", "142763406"];
const PAREDE_COD_INSERIR_CIM = ["79884530", "98073558", "79932400", "186791200"];

// Fórmulas base POR FACE ST (A = m² total da parede)
// Chapa ST: 1,20×2,40 m = 2,88 m²
const PAREDE_FORMULAS_FACE_ST = {
  "93938763": (A) => A / 2.88,            // chapa ST (un)
  "100983990": (A) => A * 0.45,            // massa drywall (kg) — código base
  "100984275": (A) => A * 0.45,            // massa drywall (kg) — balde 14kg
  "120638070": (A) => A * 0.45,            // massa drywall (kg) — saco 25kg
  "79899037": (A) => (A / 2.88) * 35,     // parafuso TA-25 (bruto — arredondamento via ARREDONDAMENTO_CODIGOS)
  "79980030": (A) => (A / 2.88) * 35,     // parafuso TA-25 caixa 1000 (bruto)
  "142763406": (A) => A * 1.5,             // fita telada (m) — rolo 45m
  "79833178": (A) => A * 1.5,             // fita telada (m) — rolo 90m
};

// Fórmulas base POR FACE RU (A = m² total da parede)
const PAREDE_FORMULAS_FACE_RU = {
  "93939592": (A) => A / 2.88,            // chapa RU (un)
  "100983990": (A) => A * 0.45,            // massa drywall (kg) — código base
  "100984275": (A) => A * 0.45,            // massa drywall (kg) — balde 14kg
  "120638070": (A) => A * 0.45,            // massa drywall (kg) — saco 25kg
  "79899037": (A) => (A / 2.88) * 35,     // parafuso TA-25 (bruto — arredondamento via ARREDONDAMENTO_CODIGOS)
  "79980030": (A) => (A / 2.88) * 35,     // parafuso TA-25 caixa 1000 (bruto)
  "142763406": (A) => A * 1.5,             // fita telada (m) — rolo 45m
  "79833178": (A) => A * 1.5,             // fita telada (m) — rolo 90m
};

// Fórmulas base POR FACE CIM (A = m² total da parede)
const PAREDE_FORMULAS_FACE_CIM = {
  "79884530": (A) => A / 2.88,            // placa cimentícia (un)
  "98073558": (A) => A * 0.324,           // massa cimentícia (litros) → grupo baldeCim — balde 3,6L
  "120773931": (A) => A * 0.324,           // massa cimentícia (litros) → grupo baldeCim — balde 10L
  "79932400": (A) => A * 1.5 / 46,        // fita cimentícia
  "186791200": (A) => (A / 2.88) * 35,     // parafuso cimentícia — unitário
  "195138246": (A) => (A / 2.88) * 35,     // parafuso cimentícia — caixa 500
};

// Fórmulas da ESTRUTURA — fatorEstrutura = 2 se dupla, 1 se simples
// Parafuso 6mm e bucha 6mm são da fixação da estrutura na laje/piso (independente de faces e chapas)
const PAREDE_FORMULAS_ESTRUTURA = {
  "79831932": (A, fe) => A * 2.11 / 3 * fe, // montante 70 (m)
  "80704698": (A, fe) => A * 2.11 / 3 * fe, // montante 48 (m)
  "80814793": (A, fe) => A * 2.11 / 3 * fe, // montante 90 (m)
  "79831929": (A, fe) => A * 0.7  / 3 * fe, // guia 70 (m)
  "88849464": (A, fe) => A * 0.7  / 3 * fe, // guia 48 (m)
  "80815323": (A, fe) => A * 0.7  / 3 * fe, // guia 90 (m)
  "85213799": (A, fe) => A * 0.7  / 3 * 11, // parafuso 6mm (un) — não dobra na dupla
  "79898849": (A, fe) => A * 0.7  / 3 * 11, // bucha 6mm (un)    — não dobra na dupla
  "195137276": (A, fe) => A * 0.7  / 3 * 11, // bucha 6mm pacote 1000 — mesmo cálculo
};

// Gera o objeto de fórmulas compatível com FORMULAS_GESSO para uma instância de parede
function paredeGerarFormulas(cfg) {
  const { faceA, faceB, faces, estrutura } = cfg;
  const fatorEstrutura = estrutura === 'dupla' ? 2 : 1;
  const facesAtivas = faces === 2 ? [faceA, faceB] : [faceA];

  const qtdSt  = facesAtivas.filter(f => f === 'ST').length;
  const qtdRu  = facesAtivas.filter(f => f === 'RU').length;
  const qtdCim = facesAtivas.filter(f => f === 'CIM').length;

  const formulas = {};

  // Estrutura — gera fórmula para todos os tamanhos (48/70/90) para que
  // recalcularTudo encontre a fórmula independente do montante/guia selecionado.
  for (const cod of Object.keys(PAREDE_FORMULAS_ESTRUTURA)) {
    formulas[cod] = (A) => PAREDE_FORMULAS_ESTRUTURA[cod](A, fatorEstrutura);
  }

  // Faces ST
  if (qtdSt > 0) {
    for (const cod of PAREDE_COD_CHAPA_ST) {
      const fn = PAREDE_FORMULAS_FACE_ST[cod];
      if (fn) formulas[cod] = (A) => fn(A) * qtdSt;
    }
  }

  // Faces RU — acumula sobre produtos compartilhados (ex: massa, parafusos, fita)
  if (qtdRu > 0) {
    for (const cod of PAREDE_COD_CHAPA_RU) {
      const fn = PAREDE_FORMULAS_FACE_RU[cod];
      if (!fn) continue;
      if (formulas[cod]) {
        // Produto já existe via face ST — soma as contribuições
        const fnExistente = formulas[cod];
        formulas[cod] = (A) => fnExistente(A) + fn(A) * qtdRu;
      } else {
        formulas[cod] = (A) => fn(A) * qtdRu;
      }
    }
  }

  // Faces CIM
  if (qtdCim > 0) {
    for (const cod of PAREDE_COD_CHAPA_CIM) {
      const fn = PAREDE_FORMULAS_FACE_CIM[cod];
      if (fn) formulas[cod] = (A) => fn(A) * qtdCim;
    }
  }

  return formulas;
}

// Retorna a lista de códigos necessários para uma configuração de parede
function paredeCodigosAtivos(cfg) {
  const { faceA, faceB, faces } = cfg;
  const facesAtivas = faces === 2 ? [faceA, faceB] : [faceA];
  const temSt  = facesAtivas.some(f => f === 'ST');
  const temRu  = facesAtivas.some(f => f === 'RU');
  const temCim = facesAtivas.some(f => f === 'CIM');

  // Reúne apenas os códigos canônicos (um por grupo de variação) para inserção no DOM.
  // Os alternativos são resolvidos em tempo de execução por resolverNivel().
  const set = new Set([
    ...PAREDE_COD_ESTRUTURA,
    ...(temSt  ? PAREDE_COD_INSERIR_ST  : []),
    ...(temRu  ? PAREDE_COD_INSERIR_RU  : []),
    ...(temCim ? PAREDE_COD_INSERIR_CIM : []),
  ]);

  // Ordena conforme PAREDE_ORDEM_PRODUTOS; códigos fora da lista ficam no final
  const posicao = (cod) => {
    const i = PAREDE_ORDEM_PRODUTOS.indexOf(cod);
    return i >= 0 ? i : Infinity;
  };
  return [...set].sort((a, b) => posicao(a) - posicao(b));
}

// Gera o label legível da configuração de parede
function paredeLabelCfg(cfg) {
  const { faceA, faceB, faces, estrutura } = cfg;
  const faceStr = faces === 2 ? `${faceA}/${faceB}` : `1F ${faceA}`;
  const estStr  = estrutura === 'dupla' ? ' Dupla' : '';
  return `${faceStr}${estStr}`;
}

// Calcula MO por m² para uma configuração de parede
//
// Tabela de referência (estrutura simples):
//   1 face  : ST = R$20  |  RU = R$20  |  CIM = R$35
//   2 faces : ST/ST = R$25  |  RU/RU = R$25  |  ST/CIM = R$35  |  CIM/CIM = R$40
//
// Modificadores:
//   Estrutura dupla: +R$25 sobre o valor base de 2 faces
//
function paredeMoBase(cfg) {
  const { faceA, faceB, faces, estrutura } = cfg;

  // 1 face: CIM = R$35, demais (ST, RU) = R$20
  if (faces === 1) return faceA === 'CIM' ? 35 : 20;

  const facesAtivas = [faceA, faceB];
  const qtdCim = facesAtivas.filter(f => f === 'CIM').length;

  // Valor base para estrutura simples 2 faces
  let base;
  if      (qtdCim === 2) base = 40; // CIM/CIM
  else if (qtdCim === 1) base = 35; // ST/CIM ou RU/CIM
  else                   base = 25; // ST/ST ou RU/RU

  // Estrutura dupla adiciona R$25
  if (estrutura === 'dupla') base += 25;

  return base;
}

// ── 4. FÓRMULAS (não-parede) ──────────────────────────────────────────
const FORMULAS_GESSO = {
  aramado: {
    "93974519": (A, P, cant, altPend) => A / 1.2,
    "100983990": (A, P, cant, altPend) => A * 0.45,
    "79898066": (A, P, cant, altPend) => A * 4 / 1.2,
    "79899328": (A, P, cant, altPend) => A * altPend / 10,  // arame 18: área × alt pendural (m)
    "142763406": (A, P, cant, altPend) => A * 2.6,
    "79984586": (A, P, cant, altPend) => A * 0.03,
    "80065949": (A, P, cant, altPend) => A / 30,
    "79832337": (A, P, cant, altPend) => P / 3,
    "79830939": (A, P, cant, altPend) => P / 3,
    "79899037": (A, P, cant, altPend) => P * 5,
    "85213799": (A, P, cant, altPend) => 11 * P / 3,
    "79898849": (A, P, cant, altPend) => 11 * P / 3,
  },
  estruturado: {
    "93938763": (A, P, cant, altPend) => A / 2.88,
    "100983990": (A, P, cant, altPend) => A * 0.45,
    "79897413": (A, P, cant, altPend) => A * 1.68 / 3,
    "79896245": (A, P, cant, altPend) => A * 1.4,
    "79948195": (A, P, cant, altPend) => A * 0.3,
    "79899298": (A, P, cant, altPend) => A * altPend / 10,  // arame 10: área × alt pendural (m)
    "142763406": (A, P, cant, altPend) => A * 1.5,
    "79899037": (A, P, cant, altPend) => (A / 2.88) * 35 + (P / 3) * 11,
    "79830939": (A, P, cant, altPend) => P / 3,
    "79832337": (A, P, cant, altPend) => P / 3,
    "85213799": (A, P, cant, altPend) => (P / 3) * 11,
    "79898849": (A, P, cant, altPend) => (P / 3) * 11,
  },
  cortineiro: {
    "93938763": (ML, _, cant) => ML * 0.4 / 2.88,
    "100983990": (ML, _, cant) => ML * 0.45,
    "79899037": (ML, _, cant) => ML * 29,
    "142763406": (ML, _, cant) => ML * 1.5,
    "79831935": (ML, _, cant) => ML * cant / 3,
  },
  reforcoTrilho: {
    "79897413": (ML) => ML * 2 / 3,
    "79896245": (ML) => ML * 8 / 3,
    "79948195": (ML) => ML / 3,
    "79899298": (ML) => ML * 0.172,
    "79899037": (ML) => ML * 22 / 3,
  },
  // Portas: equivalente a parede ST/ST simples 2 faces
  portas: {
    "93938763": (A) => (A / 2.88) * 2,
    "100983990": (A) => A * 0.9,
    "79831932": (A) => A * 2.11 / 3,
    "79831929": (A) => A * 0.7 / 3,
    "79899037": (A) => (A / 2.88 * 2) * 35,
    "85213799": (A) => (A * 0.7 / 3) * 11,
    "79898849": (A) => (A * 0.7 / 3) * 11,
    "142763406": (A) => A * 3,
  },
};

// ── 5. CONFIG DE INPUTS E LABELS (não-parede) ─────────────────────────
const KIT_INPUTS = {
  aramado:       [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }, { key: "altPend", label: "Alt Pend (m)", title: "Altura do pendural em metros (padrão: 0,60 m)" }],
  estruturado:   [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }, { key: "altPend", label: "Alt Pend (m)", title: "Altura do pendural em metros (padrão: 0,60 m)" }],
  cortineiro:    [{ key: "A", label: "ML" }, { key: "cant", label: "Cant/3ml", title: "Cantoneiras por metro linear (padrão: 3,15)" }],
  reforcoTrilho: [{ key: "A", label: "ML" }],
  // portas e paredes não usam KIT_INPUTS — têm painéis próprios
};

const KIT_LABELS = {
  aramado:     'Aramado',
  estruturado: 'Estruturado',
  cortineiro:  'Sanca',
  reforcoTrilho: 'Reforço Embutir',
  portas:      'Fech. de Porta',
};

// MO base referência: R$100/m² de fechamento de porta
const PORTAS_MO_POR_M2 = 100;

// ── ESTADO ─────────────────────────────────────────────────────────────
// kitsAtivos: Map<id, estado>
//   paredes:  id = "parede_<timestamp>", estado.tipo = 'parede'
//   portas:   id = "portas",             estado.tipo = 'portas'
//   demais:   id = nome do kit,          estado.tipo = 'kit'
const kitsAtivos = new Map();

// O estado dos kits pertence a UM pedido. Ao sair do cadastro do pedido,
// descarta tudo — senão os kits de um orçamento recuperado sobrevivem à
// navegação do SPA e reaparecem (e são salvos!) no pedido seguinte.
// Chamado pelo aoDesmontar do painel (hiper-ui.js), que só dispara quando o
// menu lateral do cadastro some da tela — re-render do microfrontend sem
// sair da tela não desmonta, então as medidas em edição ficam.
function _descartarKits() {
  _hintsQuantidade.clear();
  if (!kitsAtivos.size) return;
  kitsAtivos.clear();
  console.info('[HiperKit] 🧹 Saiu do cadastro do pedido — kits descartados.');
}

// ── UTIL ───────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function num(s) {
  const v = parseNumeroBR(s);
  return isNaN(v) ? 0 : v;
}

function resolverNivel(codigoBase, qtdBruta) {
  const nomeGrupo = CODIGO_PARA_GRUPO[codigoBase];
  if (!nomeGrupo) return null;
  const niveis = GRUPOS_VARIACAO[nomeGrupo];
  for (const nivel of niveis) {
    if (qtdBruta <= nivel.limite) return nivel;
  }
  return niveis[niveis.length - 1];
}

// ── LINHAS DO PEDIDO (store Pinia do microfrontend) ───────────────────
// Cada linha de kit é referenciada pelo `id` (GUID) do item na store
// 'cadastro-pedido-de-venda-produtos' — ver hiper-pedido-store.js. Nada aqui
// toca o DOM do pedido: a store é a fonte que o Hiper serializa ao salvar.
// Todas as tabelas deste arquivo usam idProduto = idProdutoHiperOnline.
function _storeProdutos() {
  return window.__hiperPedido?.produtos() ?? null;
}

function _itemDaLinha(linhaId) {
  return _storeProdutos()?.itens.find(i => i.id === linhaId) ?? null;
}

function _linhaExiste(linhaId) {
  const item = _itemDaLinha(linhaId);
  return !!item && !item.cancelado;
}

// ── HINT "≈ x" (valor bruto calculado, antes do arredondamento) ────────
// Aparece embaixo do campo Quantidade da linha. Montante/guia só recebem
// esse hint (BLACKLIST_SETAR), então é a única forma do vendedor ver quanto
// o kit calculou pra eles. Fonte maior + valor em negrito preto de propósito:
// leitura fácil pra quem tem vista cansada.
const _hintsQuantidade = new Map();   // linhaId → valor bruto
window.__hiperKitHints = _hintsQuantidade;

// O campo de quantidade da linha i tem a classe "Itens[i].Quantidade" (usada
// pela validação do Hiper), com i = índice em store.itens. Como remover uma
// linha muda os índices, os hints são sempre re-sincronizados do zero.
function _campoQuantidade(indice) {
  return document
    .querySelector(`#pedido-venda-produtos [class~="Itens[${indice}].Quantidade"]`)
    ?.closest('.cadastro-pedido-de-venda-produtos__field') ?? null;
}

function _renderizarHints() {
  const store = _storeProdutos();
  const desejados = new Map();   // campo → texto
  if (store) {
    store.itens.forEach((item, i) => {
      if (!_hintsQuantidade.has(item.id) || item.cancelado) return;
      const campo = _campoQuantidade(i);
      if (!campo) return;
      const v = _hintsQuantidade.get(item.id);
      desejados.set(campo, v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    });
  }

  // Só mexe no DOM quando algo mudou — este render roda dentro de um
  // MutationObserver e não pode se re-disparar indefinidamente.
  document.querySelectorAll('#pedido-venda-produtos .hiper-kit-hint').forEach(el => {
    if (!desejados.has(el.parentElement)) el.remove();
  });
  desejados.forEach((texto, campo) => {
    let el = campo.querySelector(':scope > .hiper-kit-hint');
    if (!el) {
      el = document.createElement('div');
      el.className = 'hiper-kit-hint';
      el.style.cssText = 'margin-top:3px;font-size:13px;color:#555;line-height:1.3;pointer-events:none';
      el.innerHTML = 'Calculado: <b style="color:#000;font-size:14px">≈ <span></span></b>';
      campo.appendChild(el);
    }
    const span = el.querySelector('span');
    if (span.textContent !== texto) span.textContent = texto;
  });
}

let _hintsAgendado = null;
function _agendarHints() {
  if (_hintsAgendado) return;
  _hintsAgendado = setTimeout(() => { _hintsAgendado = null; _renderizarHints(); }, 100);
}

// Re-sincroniza quando o Hiper re-renderiza a lista de produtos (linha
// removida, nova linha, troca de produto recriando o campo...). As próprias
// mutações do render re-agendam uma vez, mas a 2ª passada não muda nada e
// o ciclo para.
new MutationObserver(() => {
  if (_hintsQuantidade.size || document.querySelector('.hiper-kit-hint')) _agendarHints();
}).observe(document.documentElement, { childList: true, subtree: true });

// ── SETAR QUANTIDADE ───────────────────────────────────────────────────
function setarQuantidade(linhaId, valor, valorBruto = null, apenasHint = false) {
  const item = _itemDaLinha(linhaId);
  if (!item) return;
  _hintsQuantidade.set(linhaId, valorBruto ?? valor);
  _agendarHints();
  if (apenasHint) return;

  // Unidade inteira → arredonda pra cima (não vende meia chapa); com casas
  // decimais → respeita a precisão da unidade de medida do produto.
  const casas = item.quantidadeCasasDecimais || 0;
  const fator = 10 ** casas;
  const qtd = casas === 0 ? Math.ceil(valor - 1e-9) : Math.round(valor * fator) / fator;
  if (item.quantidade !== qtd) _storeProdutos().setQuantidade(linhaId, qtd);
}

// ── TROCAR PRODUTO NA LINHA ────────────────────────────────────────────
// Troca o produto mantendo a quantidade atual (preencherLinha, ver
// hiper-pedido-store.js). `_seqTroca` descarta trocas antigas que resolvem
// depois de uma mais nova na mesma linha (recalcularTudo pode disparar
// várias seguidas enquanto o usuário digita).
const _seqTroca = new Map();   // linhaId → nº da troca mais recente

async function _trocarProduto(linhaId, codigoNovo) {
  const seq = (_seqTroca.get(linhaId) ?? 0) + 1;
  _seqTroca.set(linhaId, seq);

  const item = _itemDaLinha(linhaId);
  if (!item) return false;
  if (String(item.idProdutoHiperOnline) === String(codigoNovo)) return true;

  const dados = await window.__hiperPedido?.obterProduto(codigoNovo);
  const atual = _itemDaLinha(linhaId);
  if (_seqTroca.get(linhaId) !== seq || !atual) return false;
  if (!dados) {
    console.warn(`[HiperCache] ⚠ Produto ${codigoNovo} não encontrado no Hiper — linha não atualizada.`);
    return false;
  }

  return window.__hiperPedido.preencherLinha(linhaId, dados, atual.quantidade);
}

async function trocarProdutoNaLinha(linhaId, codigoNovo, qtdFinal, qtdBruta) {
  const ok = await _trocarProduto(linhaId, codigoNovo);
  if (ok) setarQuantidade(linhaId, qtdFinal, qtdBruta);
}

// ── ABRIR LINHAS DE UM KIT ─────────────────────────────────────────────
// Reaproveita linhas que outro kit já abriu (linhasExistentes: codigo →
// linhaId) e cria o resto. Tudo ou nada: se algum produto não existir no
// Hiper, não cria nenhuma linha.
async function _abrirLinhas(codigos, linhasExistentes) {
  const store = _storeProdutos();
  if (!store) { console.error('[HiperCache] ❌ Store do pedido não encontrada.'); return null; }

  const novos    = codigos.filter(c => !linhasExistentes.has(c));
  const produtos = await Promise.all(novos.map(c => window.__hiperPedido.obterProduto(c)));
  const faltando = novos.filter((_, i) => !produtos[i]);
  if (faltando.length) {
    console.error('[HiperCache] ❌ Produtos não encontrados no Hiper:', faltando);
    return null;
  }

  // Quantidade inicial 1 — o recalcularTudo() preenche quando houver medida.
  const novasLinhas = new Map();
  novos.forEach((codigo, i) => {
    novasLinhas.set(codigo, window.__hiperPedido.novaLinha(produtos[i], 1));
  });
  window.__hiperPedido.removerLinhasVazias();

  return codigos.map(codigo => ({
    codigo,
    linhaId: linhasExistentes.get(codigo) ?? novasLinhas.get(codigo),
  }));
}

// Linhas já abertas por kits ativos (codigo → linhaId).
function _linhasAbertas({ excluirBlacklist = false } = {}) {
  const mapa = new Map();
  kitsAtivos.forEach((estado) => {
    estado.linhas.forEach(({ codigo, linhaId }) => {
      if (!_linhaExiste(linhaId)) return;
      if (excluirBlacklist && BLACKLIST_SETAR.has(codigo)) return;
      mapa.set(codigo, linhaId);
    });
  });
  return mapa;
}

// ── CALCULAR ÁREA TOTAL DE PORTAS ──────────────────────────────────────
function calcularPortas(estado) {
  const grupos = estado.grupos || [];
  let areaTotal = 0;
  let qtdTotal  = 0;
  grupos.forEach(g => {
    const qtd  = num(g.qtd)  || 0;
    const larg = num(g.larg) || 0.70;
    const alt  = num(g.alt)  || 2.10;
    areaTotal += qtd * larg * alt;
    qtdTotal  += qtd;
  });
  return { areaTotal, qtdTotal, grupos };
}

// ── RECALCULAR TUDO ────────────────────────────────────────────────────
function recalcularTudo() {
  const totais = new Map();

  kitsAtivos.forEach((estado, id) => {
    let A, P, cant, formulas;

    if (estado.tipo === 'portas') {
      const r = calcularPortas(estado);
      A = r.areaTotal; P = 0; cant = 3.15;
      estado.A = A;
      formulas = FORMULAS_GESSO['portas'] ?? {};

    } else if (estado.tipo === 'parede') {
      A = num(estado.A); P = 0; cant = 3.15;
      formulas = paredeGerarFormulas(estado.cfg);

    } else {
      // kit normal (aramado, estruturado, cortineiro, etc.)
      A    = num(estado.A);
      P    = num(estado.P    ?? 0);
      cant = num(estado.cant ?? 3.15);
      // estado.nomeKit guarda o tipo base (ex: "cortineiro") mesmo quando o id é único
      formulas = FORMULAS_GESSO[estado.nomeKit ?? id] ?? {};
    }

    const altPend    = num(estado.altPend ?? 0.6);
    const fatorMargem = 1 + (num(estado.margem ?? 0) / 100);

    estado.linhas.forEach(({ codigo, linhaId }) => {
      if (!_linhaExiste(linhaId)) return;

      const fn       = formulas[codigo];
      const qtdBruta = fn ? fn(A, P, cant, altPend) * fatorMargem : 0;

      // Chave = linha da store: dois kits que compartilham a mesma linha
      // (mesmo código base resolvido para o mesmo produto) acumulam na
      // mesma entrada em vez de criar duplicatas por string de código.
      if (!totais.has(linhaId)) {
        totais.set(linhaId, { codigo, qtdBruta: 0 });
      }
      totais.get(linhaId).qtdBruta += qtdBruta;
    });
  });

  totais.forEach(({ codigo, qtdBruta }, linhaId) => {
    if (!_linhaExiste(linhaId)) return;

    const nivel = resolverNivel(codigo, qtdBruta);

    // Aplica arredondamento especial se existir para este código (ou código resolvido).
    // O qtdBruta original é sempre preservado e vai pro tooltip.
    const codigoFinal  = nivel ? nivel.codigo : codigo;
    const arredondarFn = ARREDONDAMENTO_CODIGOS[codigoFinal];

    if (nivel) {
      const qtdRaw   = (qtdBruta / nivel.tamanho);
      const qtdFinal = arredondarFn
        ? arredondarFn(qtdRaw)
        : Math.round(qtdRaw * 100) / 100;
      trocarProdutoNaLinha(linhaId, nivel.codigo, qtdFinal, qtdRaw);
    } else {
      const qtdFinal = arredondarFn
        ? arredondarFn(qtdBruta)
        : Math.round(qtdBruta * 100) / 100;
      const apenasHint = BLACKLIST_SETAR.has(codigoFinal);
      setarQuantidade(linhaId, qtdFinal, qtdBruta, apenasHint);
    }
  });
}

// ── REMOVER KIT ────────────────────────────────────────────────────────
function removerKit(id) {
  const estadoRemovido = kitsAtivos.get(id);
  kitsAtivos.delete(id);

  const store = _storeProdutos();
  if (estadoRemovido && store) {
    estadoRemovido.linhas.forEach(({ linhaId }) => {
      // Verifica pelo id da linha — não pelo código — porque dois kits podem
      // ter linhas separadas para o mesmo produto (ex: montante 70 em duas paredes).
      const usadaEmOutroKit = [...kitsAtivos.values()].some(est =>
        est.linhas.some(l => l.linhaId === linhaId)
      );
      if (!usadaEmOutroKit && _linhaExiste(linhaId)) {
        store.removerItem(linhaId);
        _hintsQuantidade.delete(linhaId);
      }
    });
    _agendarHints();
  }

  recalcularTudo();
  console.log(`[HiperCache] 🗑 Kit "${id}" removido`);
}

// ── APLICAR KIT (não-parede) ───────────────────────────────────────────
async function aplicarKitGesso(nomeKit) {
  // Portas continuam usando id fixo (lógica de grupos própria)
  if (nomeKit === 'portas' && kitsAtivos.has('portas')) return;

  const codigos = KITS_GESSO[nomeKit];
  if (!codigos) return;

  // Gera id único para todos os kits (exceto portas que mantém id fixo)
  const id = nomeKit === 'portas' ? 'portas' : nomeKit + '_' + Date.now();

  const linhasDoKit = await _abrirLinhas(codigos, _linhasAbertas());
  if (!linhasDoKit) return;

  const estadoInicial = nomeKit === 'portas'
    ? { tipo: 'portas', nomeKit, A: 0, grupos: [{ id: Date.now(), qtd: 1, larg: 0.70, alt: 2.10 }], linhas: linhasDoKit }
    : { tipo: 'kit', nomeKit, A: 0, P: 0,
        ...(nomeKit === 'cortineiro'  ? { cant: 3.15 } : {}),
        ...((nomeKit === 'aramado' || nomeKit === 'estruturado') ? { altPend: 0.6, tabica: 'branca' } : {}),
        linhas: linhasDoKit };

  kitsAtivos.set(id, estadoInicial);
  console.log(`[HiperCache] ✅ Kit "${id}" ativo`);
}

// ── APLICAR PAREDE PARAMETRIZADA ──────────────────────────────────────
async function aplicarParedeCfg(cfg) {
  const id = 'parede_' + Date.now();

  // Aproveita linhas já abertas por outros kits.
  // Montante e guia (BLACKLIST_SETAR) nunca são compartilhados — cada parede
  // precisa de uma linha própria para poder ter um tamanho independente.
  const linhasDoKit = await _abrirLinhas(
    paredeCodigosAtivos(cfg),
    _linhasAbertas({ excluirBlacklist: true }),
  );
  if (!linhasDoKit) return null;

  kitsAtivos.set(id, { tipo: 'parede', cfg: { ...cfg }, A: 0, montante: '70', linhas: linhasDoKit });
  console.log(`[HiperCache] ✅ Parede "${id}" ativa — ${paredeLabelCfg(cfg)}`);
  return id;
}

// ═══════════════════════════════════════════════════════════════════════
// ── PAINEL DE ADIÇÃO DE ESTRUTURAS ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function _injetarCssPainel() {
  if (document.getElementById('hiper-painel-styles')) return;
  const s = document.createElement('style');
  s.id = 'hiper-painel-styles';
  s.textContent = `
    #hiper-painel-kits{margin:10px 0;padding:8px 10px;border:1px solid #ddd;background:#fdfdfd;border-radius:4px}
    #hiper-painel-kits .hp-titulo{font-size:10px;color:#666;margin-bottom:8px;font-weight:bold;text-transform:uppercase}
    #hiper-painel-kits .hp-lista{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
    #hiper-painel-kits .hp-item{display:flex;flex-direction:column;width:200px;max-width:200px;box-sizing:border-box;border:1px solid #b8d4f5;border-radius:5px;background:#f0f6ff;overflow:hidden}
    #hiper-painel-kits .hp-item.parede{border-color:#c8b4f5;background:#f5f0ff}
    #hiper-painel-kits .hp-item.porta{border-color:#f5c880;background:#fff8ee}
    #hiper-painel-kits .hp-head{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:#dce8ff;border-bottom:1px solid #b8d4f5}
    #hiper-painel-kits .hp-item.parede .hp-head{background:#e4d4ff;border-bottom-color:#c8b4f5}
    #hiper-painel-kits .hp-item.porta .hp-head{background:#ffe8c0;border-bottom-color:#f5c880}
    #hiper-painel-kits .hp-body{padding:7px 8px;display:flex;flex-direction:column;gap:4px}
    #hiper-painel-kits .hp-field-row{display:flex;align-items:center;gap:6px;min-height:24px}
    #hiper-painel-kits .hp-row-lbl{width:66px;font-size:11px;color:#777;flex-shrink:0;white-space:nowrap}
    #hiper-painel-kits .hp-row-val{display:flex;align-items:center;gap:4px;flex:1;min-width:0}
    #hiper-painel-kits .hp-row-unit{font-size:11px;color:#aaa;flex-shrink:0}
    #hiper-painel-kits .hp-badge{font-size:12px;font-weight:bold;color:#1a5c1a;white-space:nowrap}
    #hiper-painel-kits .hp-badge.porta{color:#7a3a00}
    #hiper-painel-kits .hp-badge.parede{color:#3a007a}
    #hiper-painel-kits .hp-lbl{font-size:11px;color:#777;white-space:nowrap;flex-shrink:0}
    #hiper-painel-kits .hp-lbl.m2{font-size:11px;color:#999}
    #hiper-painel-kits .hp-inp{flex:1;min-width:0;padding:2px 5px;font-size:13px;text-align:left;border:1px solid #b0c8e8;border-radius:3px;height:24px;background:#fff;box-sizing:border-box}
    #hiper-painel-kits .hp-btn-rm{font-size:11px;padding:1px 7px;border:none;border-radius:3px;background:#e55;color:#fff;cursor:pointer;line-height:18px;flex-shrink:0}
    #hiper-painel-kits .hp-btn-add-grupo{font-size:11px;padding:2px 9px;border:1px dashed #b87a00;border-radius:3px;background:transparent;color:#b87a00;cursor:pointer;white-space:nowrap;margin-top:2px}
    #hiper-painel-kits .hp-add-wrap{width:100%;margin-top:2px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    #hiper-painel-kits .hp-add-lbl{font-size:10px;color:#aaa}
    #hiper-painel-kits .hp-btn-tipo{font-size:11px;font-weight:bold;padding:3px 10px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;cursor:pointer;color:#444}
    #hiper-painel-kits .hp-btn-tipo:hover{background:#e8f0fe;border-color:#2c7be5;color:#2c7be5}
    #hiper-painel-kits .hp-parede-form{width:100%;box-sizing:border-box;display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;padding:5px 8px;border:1px dashed #c8b4f5;border-radius:4px;background:#faf7ff}
    #hiper-painel-kits .hp-parede-form select{padding:1px 3px;font-size:11px;border:1px solid #c0a8e8;border-radius:3px;height:22px;background:#fff;color:#333}
    #hiper-painel-kits .hp-btn-add-parede{font-size:11px;font-weight:bold;padding:2px 10px;border:1px solid #8a5cd0;border-radius:3px;background:#f0e8ff;color:#5a1fa0;cursor:pointer;white-space:nowrap}
    #hiper-painel-kits .hp-btn-add-parede:hover{background:#e0d0ff}
    #hiper-painel-kits .hp-btn-tabica{font-size:10px;padding:1px 6px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;cursor:pointer;color:#666;white-space:nowrap;flex-shrink:0}
    #hiper-painel-kits .hp-btn-tabica.ativo{background:#1a7a4a;border-color:#1a7a4a;color:#fff;font-weight:bold}
    #hiper-painel-kits .hp-btn-montante{font-size:10px;padding:1px 6px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;cursor:pointer;color:#666;white-space:nowrap;flex-shrink:0}
    #hiper-painel-kits .hp-btn-montante.ativo{background:#2c5fa0;border-color:#2c5fa0;color:#fff;font-weight:bold}
    #hiper-painel-kits .hp-porta-grupo{padding-bottom:5px;border-bottom:1px dashed #f5c880;margin-bottom:4px}
    #hiper-painel-kits .hp-porta-grupo:last-of-type{border-bottom:none;padding-bottom:0;margin-bottom:0}
    #hiper-painel-kits .hp-item.memoria{border-color:#b0bac8;background:#f0f2f5}
    #hiper-painel-kits .hp-item.memoria .hp-head{background:#dce0e8;border-bottom-color:#b0bac8}
    #hiper-painel-kits .hp-item.memoria .hp-badge{color:#3a4556}
    #hiper-painel-kits .hp-item.memoria .hp-inp{background:#e2e5ea!important;color:#333!important;cursor:not-allowed;border-color:#c8d0da}
    #hiper-painel-kits .hp-item.memoria .hp-btn-tabica,
    #hiper-painel-kits .hp-item.memoria .hp-btn-montante{opacity:.3;pointer-events:none}
    #hiper-painel-kits .hp-memoria-tag{font-size:10px;background:#c4ccd8;color:#3a4556;border-radius:3px;padding:1px 5px;font-weight:normal;margin-left:5px;vertical-align:middle}
  `;
  document.head.appendChild(s);
}

// Renderiza o formulário inline para adicionar nova parede
function _renderFormParede(lista) {
  const form = document.createElement('div');
  form.className = 'hp-parede-form';
  form.innerHTML = `
    <span style="font-size:11px;color:#5a1fa0;font-weight:bold">+ Parede</span>
    <div class="hp-sep"></div>
    <select class="hp-sel-faces" title="Número de faces">
      <option value="2">2 faces</option>
      <option value="1">1 face</option>
    </select>
    <select class="hp-sel-faceA" title="Face A (ou única)">
      <option value="ST">ST</option>
      <option value="RU">RU</option>
      <option value="CIM">CIM</option>
    </select>
    <span class="hp-face2">
      <span style="font-size:11px;color:#aaa">/</span>
      <select class="hp-sel-faceB" title="Face B">
        <option value="ST">ST</option>
        <option value="RU">RU</option>
        <option value="CIM">CIM</option>
      </select>
    </span>
    <select class="hp-sel-estrutura" title="Estrutura">
      <option value="simples">Simples</option>
      <option value="dupla">Dupla</option>
    </select>
    <button class="hp-btn-add-parede">Adicionar</button>
  `;

  // Oculta Face B quando 1 face selecionada
  const selFaces  = form.querySelector('.hp-sel-faces');
  const face2span = form.querySelector('.hp-face2');
  selFaces.addEventListener('change', function() {
    face2span.style.display = this.value === '1' ? 'none' : '';
  });

  form.querySelector('.hp-btn-add-parede').addEventListener('click', async function() {
    const cfg = {
      faceA:     form.querySelector('.hp-sel-faceA').value,
      faceB:     form.querySelector('.hp-sel-faceB').value,
      faces:     parseInt(form.querySelector('.hp-sel-faces').value),
      estrutura: form.querySelector('.hp-sel-estrutura').value,
    };
    await aplicarParedeCfg(cfg);
    renderizarPainel();
    recalcularTudo();
  });

  lista.appendChild(form);
}

function renderizarPainel(painelRef) {
  const painel = painelRef || document.getElementById('hiper-painel-kits');
  if (!painel) return;
  const lista = painel.querySelector('#hp-lista');
  if (!lista) return;

  lista.innerHTML = '';

  // ── Itens ativos ───────────────────────────────────────────────────
  kitsAtivos.forEach((estado, id) => {

    if (estado.tipo === 'portas') {
      const portaCard = document.createElement('div');
      portaCard.className = 'hp-item porta' + (estado._restaurado ? ' memoria' : '');

      const gruposHTML = (estado.grupos || []).map(grupo => {
        const areaGrupo = (num(grupo.qtd) * (num(grupo.larg) || 0.70) * (num(grupo.alt) || 2.10)).toFixed(2);
        return `<div class="hp-porta-grupo">
          <div class="hp-field-row">
            <span class="hp-row-lbl">Qtd</span>
            <div class="hp-row-val">
              <input class="hp-inp" type="number" min="1" step="1" value="${grupo.qtd}" data-id="portas" data-gid="${grupo.id}" data-key="qtd">
            </div>
          </div>
          <div class="hp-field-row">
            <span class="hp-row-lbl">Larg (m)</span>
            <div class="hp-row-val">
              <input class="hp-inp" type="number" min="0.01" step="0.01" value="${grupo.larg}" data-id="portas" data-gid="${grupo.id}" data-key="larg">
              <span class="hp-row-unit">m</span>
            </div>
          </div>
          <div class="hp-field-row">
            <span class="hp-row-lbl">Alt (m)</span>
            <div class="hp-row-val">
              <input class="hp-inp" type="number" min="0.01" step="0.01" value="${grupo.alt}" data-id="portas" data-gid="${grupo.id}" data-key="alt">
              <span class="hp-row-unit">m</span>
            </div>
          </div>
          <div class="hp-field-row">
            <span class="hp-row-lbl">Área</span>
            <div class="hp-row-val">
              <span class="hp-lbl m2" data-m2-gid="${grupo.id}" style="flex:1;text-align:right">${areaGrupo}</span>
              <span class="hp-row-unit">m²</span>
              <button class="hp-btn-rm" data-rm-id="portas" data-rm-gid="${grupo.id}">✕</button>
            </div>
          </div>
        </div>`;
      }).join('');

      portaCard.innerHTML = `
        <div class="hp-head">
          <span class="hp-badge porta">🚪 Fechamento de Porta${estado._restaurado ? ' <span class="hp-memoria-tag">memória</span>' : ''}</span>
          ${estado._restaurado ? '<button class="hp-btn-rm" data-rm-id="portas">✕</button>' : ''}
        </div>
        <div class="hp-body">
          ${gruposHTML}
          ${estado._restaurado ? '' : '<button class="hp-btn-add-grupo" id="hp-btn-add-porta">+ outro tamanho</button>'}
        </div>
      `;
      if (estado._restaurado) {
        portaCard.querySelectorAll('.hp-inp, [data-rm-gid]').forEach(el => { el.disabled = true; });
      }
      lista.appendChild(portaCard);

    } else if (estado.tipo === 'parede') {
      const item = document.createElement('div');
      item.className = 'hp-item parede' + (estado._restaurado ? ' memoria' : '');
      const margemParede  = estado.margem   != null ? estado.margem   : '';
      const montanteAtual = estado.montante || '70';
      item.innerHTML = `
        <div class="hp-head">
          <span class="hp-badge parede">🧱 ${paredeLabelCfg(estado.cfg)}${estado._restaurado ? ' <span class="hp-memoria-tag">memória</span>' : ''}</span>
          <button class="hp-btn-rm" data-rm-id="${id}">✕</button>
        </div>
        <div class="hp-body">
          <div class="hp-field-row">
            <span class="hp-row-lbl">M²</span>
            <div class="hp-row-val">
              <input class="hp-inp" type="number" min="0" step="0.01" value="${estado.A || ''}" data-id="${id}" data-key="A">
              <span class="hp-row-unit">m²</span>
            </div>
          </div>
          <div class="hp-field-row">
            <span class="hp-row-lbl">Montante</span>
            <div class="hp-row-val">
              <button class="hp-btn-montante${montanteAtual === '48' ? ' ativo' : ''}" data-id="${id}" data-montante="48">48</button>
              <button class="hp-btn-montante${montanteAtual === '70' ? ' ativo' : ''}" data-id="${id}" data-montante="70">70</button>
              <button class="hp-btn-montante${montanteAtual === '90' ? ' ativo' : ''}" data-id="${id}" data-montante="90">90</button>
            </div>
          </div>
          <div class="hp-field-row">
            <span class="hp-row-lbl" title="Margem extra em %" style="cursor:help;text-decoration:underline dotted">Margem</span>
            <div class="hp-row-val">
              <input class="hp-inp" type="number" min="0" step="1" value="${margemParede}" data-id="${id}" data-key="margem" placeholder="0">
              <span class="hp-row-unit">%</span>
            </div>
          </div>
        </div>
      `;
      if (estado._restaurado) {
        item.querySelectorAll('.hp-inp, .hp-btn-montante').forEach(el => { el.disabled = true; });
      }
      lista.appendChild(item);

    } else {
      // Kit normal (aramado, estruturado, cortineiro, e suas instâncias múltiplas)
      const tipoKit = estado.nomeKit ?? id;
      const campos = KIT_INPUTS[tipoKit] || [{ key: 'A', label: 'Área (m²)' }];
      const ehMemoria = !!estado._restaurado;
      const item = document.createElement('div');
      item.className = 'hp-item' + (ehMemoria ? ' memoria' : '');

      const temTabica   = tipoKit === 'aramado' || tipoKit === 'estruturado';
      const tabicaAtual = estado.tabica || 'branca';
      const margemKit   = estado.margem != null ? estado.margem : '';

      // Extrai label e unidade de "Área (m²)" → ["Área", "m²"]
      const splitLU = lbl => { const m = lbl.match(/^(.+?)\s*\(([^)]+)\)$/); return m ? [m[1].trim(), m[2]] : [lbl, '']; };

      const campoRows = campos.map(f => {
        const val = estado[f.key] !== undefined ? estado[f.key] : (f.key === 'altPend' ? 0.6 : f.key === 'cant' ? 3.15 : '');
        const [lbl, unit] = splitLU(f.label);
        const tabicaInline = (temTabica && f.key === 'P') ? `
          <button class="hp-btn-tabica${tabicaAtual === 'branca'  ? ' ativo' : ''}" data-id="${id}" data-tabica="branca">B</button>
          <button class="hp-btn-tabica${tabicaAtual === 'natural' ? ' ativo' : ''}" data-id="${id}" data-tabica="natural">N</button>
        ` : '';
        return `<div class="hp-field-row">
          <span class="hp-row-lbl"${f.title ? ` title="${f.title}" style="cursor:help;text-decoration:underline dotted"` : ''}>${lbl}</span>
          <div class="hp-row-val">
            <input class="hp-inp" type="number" min="0" step="0.01" value="${val}" data-id="${id}" data-key="${f.key}"${f.title ? ` title="${f.title}"` : ''}>
            ${unit ? `<span class="hp-row-unit">${unit}</span>` : ''}
            ${tabicaInline}
          </div>
        </div>`;
      }).join('');

      item.innerHTML = `
        <div class="hp-head">
          <span class="hp-badge">${KIT_LABELS[tipoKit] || tipoKit}${ehMemoria ? ' <span class="hp-memoria-tag">memória</span>' : ''}</span>
          <button class="hp-btn-rm" data-rm-id="${id}">✕</button>
        </div>
        <div class="hp-body">
          ${campoRows}
          <div class="hp-field-row">
            <span class="hp-row-lbl" title="Margem extra em % (ex: 5 = +5%)" style="cursor:help;text-decoration:underline dotted">Margem</span>
            <div class="hp-row-val">
              <input class="hp-inp" type="number" min="0" step="1" value="${margemKit}" data-id="${id}" data-key="margem" placeholder="0">
              <span class="hp-row-unit">%</span>
            </div>
          </div>
        </div>
      `;
      if (ehMemoria) {
        item.querySelectorAll('.hp-inp, .hp-btn-tabica').forEach(el => { el.disabled = true; });
      }
      lista.appendChild(item);
    }
  });

  // ── Botões para adicionar kits normais ────────────────────────────
  const addWrap = document.createElement('div');
  addWrap.className = 'hp-add-wrap';

  const disponiveis = Object.keys(KITS_GESSO).filter(t =>
    t !== 'portas' || !kitsAtivos.has('portas')
  );

  if (disponiveis.length > 0) {
    addWrap.innerHTML = '<span class="hp-add-lbl">+ adicionar:</span>';
    disponiveis.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'hp-btn-tipo';
      btn.dataset.addKit = t;
      btn.textContent = KIT_LABELS[t] || t;
      addWrap.appendChild(btn);
    });
  }
  lista.appendChild(addWrap);

  // Formulário de nova parede (sempre visível)
  _renderFormParede(lista);

  // ── Bind de eventos ────────────────────────────────────────────────
  _bindPainelEventos(lista);
}

// ── DEBOUNCE ───────────────────────────────────────────────────────────
// Evita recálculos múltiplos enquanto o usuário ainda está digitando.
// O recalcularTudo() só dispara após o usuário parar de digitar por 350 ms.
let _debounceTimer = null;
function _debounceRecalcular() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => recalcularTudo(), 350);
}

function _bindPainelEventos(lista) {
  // Inputs numéricos
  lista.querySelectorAll('input.hp-inp').forEach(el => {
    el.addEventListener('input', function () {
      const id  = this.dataset.id;
      const key = this.dataset.key;
      const gid = this.dataset.gid;

      if (id === 'portas' && gid) {
        const estado = kitsAtivos.get('portas');
        if (!estado) return;
        const grupo = estado.grupos.find(g => String(g.id) === String(gid));
        if (!grupo) return;
        grupo[key] = num(this.value) || (key === 'larg' ? 0.70 : key === 'alt' ? 2.10 : 1);
        _debounceRecalcular();
        const span = lista.querySelector(`[data-m2-gid="${gid}"]`);
        if (span) {
          const a = num(grupo.qtd) * (num(grupo.larg) || 0.70) * (num(grupo.alt) || 2.10);
          span.textContent = `= ${a.toFixed(2)} m²`;
        }
      } else if (id) {
        const estado = kitsAtivos.get(id);
        if (!estado) return;
        estado[key] = num(this.value);
        _debounceRecalcular();
      }
    });
  });

  // Botões ✕
  lista.querySelectorAll('[data-rm-id]').forEach(btn => {
    btn.addEventListener('click', function () {
      const id  = this.dataset.rmId;
      const gid = this.dataset.rmGid;

      if (id === 'portas' && gid) {
        const estado = kitsAtivos.get('portas');
        if (!estado) return;
        estado.grupos = estado.grupos.filter(g => String(g.id) !== String(gid));
        if (estado.grupos.length === 0) removerKit('portas');
        else recalcularTudo();
        renderizarPainel();
      } else {
        removerKit(id);
        renderizarPainel();
      }
    });
  });

  // Botão "+ outro tamanho de porta"
  const btnAddPorta = lista.querySelector('#hp-btn-add-porta');
  if (btnAddPorta) {
    btnAddPorta.addEventListener('click', function () {
      const estado = kitsAtivos.get('portas');
      if (!estado) return;
      estado.grupos.push({ id: Date.now(), qtd: 1, larg: 0.70, alt: 2.10 });
      renderizarPainel();
    });
  }

  // Toggle de montante/guia (48 / 70 / 90)
  const TODOS_MONTANTES = new Set(Object.values(COD_MONTANTE));
  const TODOS_GUIAS     = new Set(Object.values(COD_GUIA));

  lista.querySelectorAll('.hp-btn-montante').forEach(btn => {
    btn.addEventListener('click', async function() {
      const id      = this.dataset.id;
      const novoTam = this.dataset.montante;
      const estado  = kitsAtivos.get(id);
      if (!estado || estado.montante === novoTam) return;

      const linhaM = estado.linhas.find(l => TODOS_MONTANTES.has(l.codigo));
      const linhaG = estado.linhas.find(l => TODOS_GUIAS.has(l.codigo));

      // Montante/guia só recebem hint (BLACKLIST_SETAR) — a quantidade é a que
      // o usuário digitou, e _trocarProduto a mantém na troca de tamanho.
      await Promise.all([{ linha: linhaM, mapa: COD_MONTANTE }, { linha: linhaG, mapa: COD_GUIA }].map(async ({ linha, mapa }) => {
        if (!linha) return;
        const novoCod = mapa[novoTam];
        if (await _trocarProduto(linha.linhaId, novoCod)) linha.codigo = novoCod;
      }));

      estado.montante = novoTam;
      renderizarPainel();
    });
  });

  // Toggle de tabica (branca / natural)
  lista.querySelectorAll('.hp-btn-tabica').forEach(btn => {
    btn.addEventListener('click', async function() {
      const id         = this.dataset.id;
      const novaTabica = this.dataset.tabica;
      const estado     = kitsAtivos.get(id);
      if (!estado || estado.tabica === novaTabica) return;

      const linhaTabica = estado.linhas.find(l => l.codigo === COD_TABICA.branca || l.codigo === COD_TABICA.natural);
      if (linhaTabica) {
        const novoCod  = COD_TABICA[novaTabica];
        const formulas = FORMULAS_GESSO[estado.nomeKit] || {};
        const fn       = formulas[novoCod];
        const fator    = 1 + (num(estado.margem) / 100);
        const qtdBruta = fn ? fn(num(estado.A), num(estado.P), 3.15, num(estado.altPend || 0.6)) * fator : 0;
        const qtdFinal = Math.round(qtdBruta * 100) / 100;
        await trocarProdutoNaLinha(linhaTabica.linhaId, novoCod, qtdFinal, qtdBruta);
        linhaTabica.codigo = novoCod;
      }

      estado.tabica = novaTabica;
      recalcularTudo();
      renderizarPainel();
    });
  });

  // Botões de adicionar kit normal
  lista.querySelectorAll('[data-add-kit]').forEach(btn => {
    btn.addEventListener('click', async function () {
      const kit = this.dataset.addKit;

      if (kit === 'portas' && kitsAtivos.has('portas')) {
        kitsAtivos.get('portas').grupos.push({ id: Date.now(), qtd: 1, larg: 0.70, alt: 2.10 });
        renderizarPainel();
        return;
      }

      await aplicarKitGesso(kit);
      renderizarPainel();
      recalcularTudo();
    });
  });
}

// ── REGISTRO NO CENTRALIZADOR DE UI (hiper-ui.js) ─────────────────────
// Tela nova (microfrontend): o menu lateral não tem espaço pro painel, então
// ele ocupa o #footer global do Hiper (que vem com .hidden de fábrica). Só
// monta enquanto o cadastro do pedido estiver na tela; ao sair, o footer volta
// ao estado original.
(function _registrarKits() {
  const SEL_CADASTRO_PEDIDO = '#hiper-microfrontend-pedidodevenda .cadastro-pedido-de-venda__menu-lateral';

  function _alvoPainel() {
    if (!document.querySelector(SEL_CADASTRO_PEDIDO)) return null;
    const footer = document.getElementById('footer');
    return footer ? { parent: footer, ref: footer.firstChild } : null;
  }

  function _restaurarFooter() {
    _descartarKits();
    const footer = document.getElementById('footer');
    if (!footer) return;
    footer.classList.add('hidden');
    footer.querySelector(':scope > .clearfix')?.style.removeProperty('display');
  }

  function _criarPainel() {
    const footer = document.getElementById('footer');
    if (footer) {
      footer.classList.remove('hidden');
      footer.querySelector(':scope > .clearfix')?.style.setProperty('display', 'none');
    }
    _injetarCssPainel();
    const container = document.createElement('div');
    container.id = 'hiper-painel-kits';
    container.innerHTML = `
      <div class="hp-titulo">🧱 Estruturas de Gesso</div>
      <div id="hp-lista" class="hp-lista"></div>
    `;
    // Passa o container diretamente — ele ainda não está no DOM,
    // então getElementById('hiper-painel-kits') retornaria null.
    renderizarPainel(container);
    console.info('[HiperCache] ✅ Painel de estruturas criado.');
    return container;
  }

  function _registrar() {
    if (window.__hiperUI) {
      window.__hiperUI.registrar({
        id: 'hiper-painel-kits', ordem: 20, render: _criarPainel,
        alvo: _alvoPainel, aoDesmontar: _restaurarFooter,
      });
    } else {
      setTimeout(_registrar, 50);
    }
  }
  _registrar();
})();

window.aplicarKitGesso     = aplicarKitGesso;
window.aplicarParedeCfg    = aplicarParedeCfg;
window.recalcularTudo      = recalcularTudo;
window.renderizarPainel    = renderizarPainel;
window.kitsAtivos          = kitsAtivos;
window.FORMULAS_GESSO      = FORMULAS_GESSO;
window.calcularPortas      = calcularPortas;
window.PORTAS_MO_POR_M2    = PORTAS_MO_POR_M2;
window.paredeGerarFormulas  = paredeGerarFormulas;
window.paredeCodigosAtivos  = paredeCodigosAtivos;
window.paredeLabelCfg      = paredeLabelCfg;
window.paredeMoBase        = paredeMoBase;
window.KITS_GESSO          = KITS_GESSO;
window.CODIGO_PARA_GRUPO   = CODIGO_PARA_GRUPO;
window.COD_MONTANTE        = COD_MONTANTE;
window.COD_GUIA            = COD_GUIA;
window.codigosEquivalentes = codigosEquivalentes;