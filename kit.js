// ═══════════════════════════════════════════════════════════════════════
// kit.js — HiperCache | Kits rápidos + Fórmulas
// ═══════════════════════════════════════════════════════════════════════

// ── 1. GRUPOS DE VARIAÇÃO ──────────────────────────────────────────────
const GRUPOS_VARIACAO = {
  parafuso: [
    { codigo: "3021", tamanho: 1,    limite: 450      },
    { codigo: "3032", tamanho: 1000, limite: Infinity },
  ],
  massa: [
    { codigo: "3089", tamanho: 6,  limite: 6        },
    { codigo: "3090", tamanho: 14, limite: 14       },
    { codigo: "3113", tamanho: 25, limite: Infinity  },
  ],
  fita: [
    { codigo: "3132", tamanho: 45, limite: 45      },
    { codigo: "3014", tamanho: 90, limite: Infinity },
  ],
  // cimentícia: massa cimentícia (litros → unidades de embalagem)
  baldeCim: [
    { codigo: "3084", tamanho: 3.6, limite: 3.6     }, // balde 3,6 L
    { codigo: "3122", tamanho: 10,  limite: Infinity }, // balde 10 L
  ],
  // bucha 6mm: unitário até 899, pacote 1000 a partir de 900
  bucha: [
    { codigo: "3020", tamanho: 1,    limite: 899      }, // unitário
    { codigo: "3173", tamanho: 1000, limite: Infinity  }, // pacote 1000 un
  ],
  // cimentícia: parafuso unitário → caixa a partir de 500 un
  parafusoCim: [
    { codigo: "3163", tamanho: 1,   limite: 499      }, // unitário
    { codigo: "3177", tamanho: 500, limite: Infinity  }, // caixa 500 un
  ],
};

const CODIGO_PARA_GRUPO = {};
for (const [nomeGrupo, niveis] of Object.entries(GRUPOS_VARIACAO)) {
  for (const nivel of niveis) {
    CODIGO_PARA_GRUPO[nivel.codigo] = nomeGrupo;
  }
}

// ── ARREDONDAMENTOS ESPECIAIS ──────────────────────────────────────────
// Códigos que precisam de arredondamento além do Math.ceil padrão.
// Cada entrada é uma função (qtdBruta) => qtdArredondada.
// O valor bruto original é sempre preservado e exibido no tooltip.
const ARREDONDAMENTO_CODIGOS = {
  "3021": (v) => Math.ceil(v / 50) * 50, // Parafuso TA-25 unitário
  "3058": (v) => Math.ceil(v / 50) * 50, // Parafuso 6mm
  "3020": (v) => Math.ceil(v / 50) * 50, // Bucha 6mm unitário
  "3163": (v) => Math.ceil(v / 50) * 50, // Parafuso cimentícia unitário
  "3035": (v) => Math.ceil(v / 0.5) * 0.5,   // Sisal
  "3022": (v) => Math.ceil(v),           // Arame 10
  "3023": (v) => Math.ceil(v),           // Arame 18
};

// Códigos que devem ser adicionados mas não devem ser modificados automaticamente
const BLACKLIST_SETAR = new Set(["3007", "3008", "3042", "3043", "3044", "3060"]);


// ── 2. DEFINIÇÃO DOS KITS (não-parede) ────────────────────────────────
const KITS_GESSO = {
  aramado:     ["3076","3089","3019","3023","3132","3035","3037","3006","3021","3058","3020"],
  estruturado: ["3073","3089","3018","3017","3029","3022","3132","3021","3006","3058","3020"],
  cortineiro:  ["3073","3089","3021","3132","3009"],
  portas:      ["3073","3089","3008","3007","3021","3058","3020","3132"],
};

// ── 3. SISTEMA DE PAREDES PARAMETRIZADO ───────────────────────────────
//
// Cada parede é definida por 3 parâmetros independentes:
//   faceA / faceB : 'ST' | 'RU' | 'CIM'
//   faces         : 1 | 2
//   estrutura     : 'simples' | 'dupla'
//
// Para parede de 1 face, faceB é ignorada.
// A estrutura dupla dobra montante (3008) e guia (3007).
// Itens ST e RU usam os mesmos produtos; CIM usa produtos exclusivos.

// ── ORDEM DE EXIBIÇÃO DOS PRODUTOS DE PAREDE ─────────────────────────────
// Usada para ordenar os itens ao montar o kit pela primeira vez.
// Adicione aqui os códigos de novos materiais (RU, CIM, etc.) na posição desejada.
// Produtos fora desta lista são anexados ao final, na ordem em que aparecem.
const PAREDE_ORDEM_PRODUTOS = [
  "3073", // chapa ST
  "3075", // chapa RU
  "3016", // placa cimentícia
  "3113", // massa drywall 25kg
  "3008", // montante
  "3007", // guia
  "3021", // parafuso TA-25
  "3058", // parafuso 6mm
  "3020", // bucha 6mm
  "3014", // fita telada 90m
  "3132", // fita telada 45m
  "3084", // cola cimentícia
  "3027", // fita cimentícia
  "3163", // parafuso cimentícia
];

// Códigos da ESTRUTURA — sempre presentes, dobram na dupla
// 3058 (parafuso 6mm) e 3020 (bucha 6mm) são da estrutura — aparecem em todos os tipos
const PAREDE_COD_ESTRUTURA = ["3008", "3007", "3058", "3020"];

// Códigos de chapa ST — escalam pelo número de faces ST
// Inclui todos os códigos resolvidos dos grupos (3090/3113 da massa, 3032 do parafuso, 3014 da fita)
// para que recalcularTudo encontre a fórmula independente do código que estiver na linha do DOM
const PAREDE_COD_CHAPA_ST = ["3073", "3089", "3090", "3113", "3021", "3032", "3132", "3014"];

// Códigos de chapa RU — escalam pelo número de faces RU
// Chapa RU: 1,20×1,80 m (2,16 m²) — código 3075
const PAREDE_COD_CHAPA_RU = ["3075", "3089", "3090", "3113", "3021", "3032", "3132", "3014"];

// Códigos exclusivos de face CIM — escalam pelo número de faces CIM
// Inclui 3177 (caixa 500 parafuso cimentícia) pelo mesmo motivo
const PAREDE_COD_CHAPA_CIM = ["3016", "3084", "3122", "3027", "3163", "3177"];

// ── CÓDIGOS CANÔNICOS (apenas para inserção de linhas no DOM) ─────────────
// Contém somente um código por grupo de variação (o código base).
// Os alternativos (3090/3113, 3032, 3014, 3122, 3177) são resolvidos em
// tempo de execução por resolverNivel() dentro de trocarProdutoNaLinha().
// Usar os alternativos aqui causaria linhas duplicadas no pedido.
const PAREDE_COD_INSERIR_ST  = ["3073", "3089", "3021", "3132"];
const PAREDE_COD_INSERIR_RU  = ["3075", "3089", "3021", "3132"];
const PAREDE_COD_INSERIR_CIM = ["3016", "3084", "3027", "3163"];

// Fórmulas base POR FACE ST (A = m² total da parede)
// Chapa ST: 1,20×2,40 m = 2,88 m²
const PAREDE_FORMULAS_FACE_ST = {
  "3073": (A) => A / 2.88,            // chapa ST (un)
  "3089": (A) => A * 0.45,            // massa drywall (kg) — código base
  "3090": (A) => A * 0.45,            // massa drywall (kg) — balde 14kg
  "3113": (A) => A * 0.45,            // massa drywall (kg) — saco 25kg
  "3021": (A) => (A / 2.88) * 35,     // parafuso TA-25 (bruto — arredondamento via ARREDONDAMENTO_CODIGOS)
  "3032": (A) => (A / 2.88) * 35,     // parafuso TA-25 caixa 1000 (bruto)
  "3132": (A) => A * 1.5,             // fita telada (m) — rolo 45m
  "3014": (A) => A * 1.5,             // fita telada (m) — rolo 90m
};

// Fórmulas base POR FACE RU (A = m² total da parede)
const PAREDE_FORMULAS_FACE_RU = {
  "3075": (A) => A / 2.88,            // chapa RU (un)
  "3089": (A) => A * 0.45,            // massa drywall (kg) — código base
  "3090": (A) => A * 0.45,            // massa drywall (kg) — balde 14kg
  "3113": (A) => A * 0.45,            // massa drywall (kg) — saco 25kg
  "3021": (A) => (A / 2.88) * 35,     // parafuso TA-25 (bruto — arredondamento via ARREDONDAMENTO_CODIGOS)
  "3032": (A) => (A / 2.88) * 35,     // parafuso TA-25 caixa 1000 (bruto)
  "3132": (A) => A * 1.5,             // fita telada (m) — rolo 45m
  "3014": (A) => A * 1.5,             // fita telada (m) — rolo 90m
};

// Fórmulas base POR FACE CIM (A = m² total da parede)
const PAREDE_FORMULAS_FACE_CIM = {
  "3016": (A) => A / 2.88,            // placa cimentícia (un)
  "3084": (A) => A * 0.324,           // massa cimentícia (litros) → grupo baldeCim — balde 3,6L
  "3122": (A) => A * 0.324,           // massa cimentícia (litros) → grupo baldeCim — balde 10L
  "3027": (A) => A * 1.5 / 46,        // fita cimentícia
  "3163": (A) => (A / 2.88) * 35,     // parafuso cimentícia — unitário
  "3177": (A) => (A / 2.88) * 35,     // parafuso cimentícia — caixa 500
};

// Fórmulas da ESTRUTURA — fatorEstrutura = 2 se dupla, 1 se simples
// 3058 e 3020 são da fixação da estrutura na laje/piso (independente de faces e chapas)
const PAREDE_FORMULAS_ESTRUTURA = {
  "3008": (A, fe) => A * 2.11 / 3 * fe, // montante 70 (m)
  "3042": (A, fe) => A * 2.11 / 3 * fe, // montante 48 (m)
  "3043": (A, fe) => A * 2.11 / 3 * fe, // montante 90 (m)
  "3007": (A, fe) => A * 0.7  / 3 * fe, // guia 70 (m)
  "3060": (A, fe) => A * 0.7  / 3 * fe, // guia 48 (m)
  "3044": (A, fe) => A * 0.7  / 3 * fe, // guia 90 (m)
  "3058": (A, fe) => A * 0.7  / 3 * 11, // parafuso 6mm (un) — não dobra na dupla
  "3020": (A, fe) => A * 0.7  / 3 * 11, // bucha 6mm (un)    — não dobra na dupla
  "3173": (A, fe) => A * 0.7  / 3 * 11, // bucha 6mm pacote 1000 — mesmo cálculo
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

  // Estrutura
  for (const cod of PAREDE_COD_ESTRUTURA) {
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
    "3076": (A, P, cant, altPend) => A / 1.2,
    "3089": (A, P, cant, altPend) => A * 0.45,
    "3019": (A, P, cant, altPend) => A * 4 / 1.2,
    "3023": (A, P, cant, altPend) => A * altPend / 10,  // arame 18: área × alt pendural (m)
    "3132": (A, P, cant, altPend) => A * 2.6,
    "3035": (A, P, cant, altPend) => A * 0.03,
    "3037": (A, P, cant, altPend) => A / 30,
    "3010": (A, P, cant, altPend) => P / 3,
    "3006": (A, P, cant, altPend) => P / 3,
    "3021": (A, P, cant, altPend) => P * 5,
    "3058": (A, P, cant, altPend) => 11 * P / 3,
    "3020": (A, P, cant, altPend) => 11 * P / 3,
  },
  estruturado: {
    "3073": (A, P, cant, altPend) => A / 2.88,
    "3089": (A, P, cant, altPend) => A * 0.45,
    "3018": (A, P, cant, altPend) => A * 1.68 / 3,
    "3017": (A, P, cant, altPend) => A * 1.4,
    "3029": (A, P, cant, altPend) => A * 0.3,
    "3022": (A, P, cant, altPend) => A * altPend / 10,  // arame 10: área × alt pendural (m)
    "3132": (A, P, cant, altPend) => A * 1.5,
    "3021": (A, P, cant, altPend) => (A / 2.88) * 35 + (P / 3) * 11,
    "3006": (A, P, cant, altPend) => P / 3,
    "3010": (A, P, cant, altPend) => P / 3,
    "3058": (A, P, cant, altPend) => (P / 3) * 11,
    "3020": (A, P, cant, altPend) => (P / 3) * 11,
  },
  cortineiro: {
    "3073": (ML, _, cant) => ML * 0.4 / 2.88,
    "3089": (ML, _, cant) => ML * 0.45,
    "3021": (ML, _, cant) => ML * 29,
    "3132": (ML, _, cant) => ML * 1.5,
    "3009": (ML, _, cant) => ML * cant / 3,
  },
  // Portas: equivalente a parede ST/ST simples 2 faces
  portas: {
    "3073": (A) => (A / 2.88) * 2,
    "3089": (A) => A * 0.9,
    "3008": (A) => A * 2.11 / 3,
    "3007": (A) => A * 0.7 / 3,
    "3021": (A) => (A / 2.88 * 2) * 35,
    "3058": (A) => (A * 0.7 / 3) * 11,
    "3020": (A) => (A * 0.7 / 3) * 11,
    "3132": (A) => A * 3,
  },
};

// ── 5. CONFIG DE INPUTS E LABELS (não-parede) ─────────────────────────
const KIT_INPUTS = {
  aramado:     [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }, { key: "altPend", label: "Alt Pend (m)", title: "Altura do pendural em metros (padrão: 0,60 m)" }],
  estruturado: [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }, { key: "altPend", label: "Alt Pend (m)", title: "Altura do pendural em metros (padrão: 0,60 m)" }],
  cortineiro:  [{ key: "A", label: "ML" }, { key: "cant", label: "Cant/3ml", title: "Cantoneiras por metro linear (padrão: 3,15)" }],
  // portas e paredes não usam KIT_INPUTS — têm painéis próprios
};

const KIT_LABELS = {
  aramado:     'Aramado',
  estruturado: 'Estruturado',
  cortineiro:  'Sanca',
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

// ── UTIL ───────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function num(s) {
  const v = parseFloat(String(s).replace(',', '.'));
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

// ── BUSCA NO MASTER ────────────────────────────────────────────────────
function buscarNaMaster(codigo) {
  const master = window.__hiperMaster;
  if (!master?.length) return null;
  const cod = normalizar(String(codigo));
  return (
    master.find(p => normalizar(String(p.Nome ?? '')).startsWith(cod + ' ')) ||
    master.find(p => normalizar(String(p.text ?? '')).startsWith(cod + ' ')) ||
    null
  );
}

// ── INSERÇÃO VIA CACHE ─────────────────────────────────────────────────
function inserirViaCache($input, produto) {
  if (!produto) {
    console.warn('[HiperCache] ⚠ inserirViaCache chamado com produto undefined — ignorado.');
    return;
  }
  const data = { id: String(produto.id ?? produto.idProduto), text: produto.Nome ?? produto.text, ...produto };
  const s2 = $input.data("select2");
  if (!s2) return;
  const anterior = s2.data();
  $input.val(data.id);
  s2.updateSelection(data);
  $input.trigger({ type: "select2-selected", val: data.id, choice: data });
  s2.triggerChange({ added: data, removed: anterior });
}

// ── AGUARDAR INPUT HABILITADO ──────────────────────────────────────────
async function aguardarInputHabilitado($input, timeout = 3000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    const el = $input[0];
    if (el && !el.disabled && !el.readOnly && $.contains(document, el)) return true;
    await delay(50);
  }
  console.log('[HiperCache] ⏱ Timeout aguardando input de quantidade habilitar.');
  return false;
}



// ── SETAR QUANTIDADE ───────────────────────────────────────────────────
async function setarQuantidade($inputQtd, valor, valorBruto = null, apenasHint=false) {
  const pronto = await aguardarInputHabilitado($inputQtd);
  if (!pronto) return;

  const nativeInput = $inputQtd[0];
  const valorAtual  = nativeInput.value;
  const campoAceitaDecimal = valorAtual.includes(',') || valorAtual.includes('.');

  const valorStr = campoAceitaDecimal
    ? valor.toFixed(2).replace('.', ',')
    : String(Math.ceil(valor));

  let $hint = $inputQtd.data('$hint');
  const bruto = (valorBruto ?? valor).toFixed(2).replace('.', ',');

  if (!$hint || !$.contains(document, $hint[0])) {
    $hint = $('<span style="display:block;font-size:10px;color:#999;text-align:right;margin-top:1px;pointer-events:none"></span>');
    $inputQtd.after($hint);
    $inputQtd.data('$hint', $hint);
  }
  $hint.text(`≈ ${bruto}`);

  if (apenasHint) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter ? setter.call(nativeInput, valorStr) : (nativeInput.value = valorStr);

  nativeInput.dispatchEvent(new Event('input',  { bubbles: true }));
  nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
  nativeInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  $inputQtd.trigger('input').trigger('change').trigger('keyup');
  nativeInput.dispatchEvent(new Event('blur',  { bubbles: true }));
  nativeInput.dispatchEvent(new Event('focus', { bubbles: true }));
}

// ── TROCAR PRODUTO NA LINHA ────────────────────────────────────────────
async function trocarProdutoNaLinha($linha, codigoNovo, qtdFinal, qtdBruta) {
  const produto = buscarNaMaster(codigoNovo);
  if (!produto) {
    console.warn(`[HiperCache] ⚠ Produto ${codigoNovo} não encontrado — linha não atualizada.`);
    const $qtd = $linha.find(
      ".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']"
    ).first();
    if ($qtd.length) await setarQuantidade($qtd, qtdFinal, qtdBruta);
    return;
  }

  const $inputProduto = $linha.find("input.produto");
  if (!$inputProduto.length) return;

  const s2 = $inputProduto.data("select2");
  const atual = s2?.data();
  const idAtual = String(atual?.id ?? atual?.idProduto ?? '');
  const idNovo  = String(produto.id ?? produto.idProduto);

  if (idAtual !== idNovo) inserirViaCache($inputProduto, produto);

  const $qtd = $linha.find(
    ".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']"
  ).first();
  if ($qtd.length) await setarQuantidade($qtd, qtdFinal, qtdBruta);
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

    estado.linhas.forEach(({ codigo, $linha }) => {
      if (!$.contains(document, $linha[0])) return;

      const fn       = formulas[codigo];
      const qtdBruta = fn ? fn(A, P, cant, altPend) * fatorMargem : 0;

      // Chave = elemento DOM: dois kits que compartilham a mesma $linha
      // (mesmo código base resolvido para o mesmo produto) acumulam na
      // mesma entrada em vez de criar duplicatas por string de código.
      const domEl = $linha[0];
      if (!totais.has(domEl)) {
        totais.set(domEl, { codigo, qtdBruta: 0, $linha });
      }
      totais.get(domEl).qtdBruta += qtdBruta;
    });
  });

  totais.forEach(({ codigo, qtdBruta, $linha }, domEl) => {
    if (!$.contains(document, domEl)) return;

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
      trocarProdutoNaLinha($linha, nivel.codigo, qtdFinal, qtdRaw);
    } else {
      const qtdFinal = arredondarFn
        ? arredondarFn(qtdBruta)
        : Math.round(qtdBruta * 100) / 100;
      const $qtd = $linha.find(
        ".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']"
      ).first();
      const apenasHint = BLACKLIST_SETAR.has(codigoFinal)
      if ($qtd.length) setarQuantidade($qtd, qtdFinal, qtdBruta, apenasHint);
    }
  });
}

// ── REMOVER KIT ────────────────────────────────────────────────────────
function removerKit(id) {
  const estadoRemovido = kitsAtivos.get(id);
  kitsAtivos.delete(id);

  if (estadoRemovido) {
    const codigosAindaAtivos = new Set();
    kitsAtivos.forEach((estado) => {
      estado.linhas.forEach(({ codigo }) => codigosAindaAtivos.add(codigo));
    });

    estadoRemovido.linhas.forEach(({ codigo, $linha }) => {
      // Verifica pela referência DOM — não pelo código — porque dois kits podem
      // ter linhas separadas para o mesmo produto (ex: montante 70 em duas paredes).
      const usadaEmOutroKit = [...kitsAtivos.values()].some(est =>
        est.linhas.some(l => l.$linha[0] === $linha[0])
      );
      if (!usadaEmOutroKit && $.contains(document, $linha[0])) {
        $linha.remove();
      }
    });
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

  $(".linha-produto:not(.default)").each(function() {
    const $linha = $(this);
    const textoChosen = $linha.find(".select2-chosen").text().trim();
    if (textoChosen === "Nome, código de barras, código do produto ou referência interna") {
      $linha.find(".btn-remover-linha, .btn-excluir-linha, [ng-click*='remover'], [ng-click*='excluir']")
            .first().click();
    }
  });

  let t = 0;
  while (!window.__hiperMaster?.length && t++ < 100) await delay(100);
  if (!window.__hiperMaster?.length) { console.error('[HiperCache] ❌ Master não disponível.'); return; }

  const produtos = codigos.map(c => buscarNaMaster(c));
  if (produtos.some(p => !p)) { console.error('[HiperCache] ❌ Produtos faltando.'); return; }

  const linhasExistentes = new Map();
  kitsAtivos.forEach((estado) => {
    estado.linhas.forEach(({ codigo, $linha }) => {
      if ($.contains(document, $linha[0])) linhasExistentes.set(codigo, $linha);
    });
  });

  const codigosNovos = codigos.filter(c => !linhasExistentes.has(c));

  // Captura total ANTES de adicionar, para saber exatamente quantas linhas novas aguardar
  const totalAntes = $(".linha-produto:not(.default)").length;

  for (let i = 0; i < codigosNovos.length; i++) $(".btn-adicionar-mais-produtos").click();

  if (codigosNovos.length > 0) {
    const inicio = Date.now();
    while (Date.now() - inicio < 3000) {
      if ($(".linha-produto:not(.default)").length >= totalAntes + codigosNovos.length) break;
      await delay(50);
    }
  }

  const todasLinhas = $(".linha-produto:not(.default)").toArray();
  const linhasNovas = todasLinhas.slice(totalAntes);

  for (let i = 0; i < linhasNovas.length; i++) {
    const codigoNovo = codigosNovos[i];
    if (!codigoNovo) continue;
    const idxNoCodigos = codigos.indexOf(codigoNovo);
    const produto = idxNoCodigos >= 0 ? produtos[idxNoCodigos] : undefined;
    if (!produto) {
      console.warn(`[HiperCache] ⚠ Produto para código "${codigoNovo}" não encontrado — linha ignorada.`);
      continue;
    }
    const $input = $(linhasNovas[i]).find("input.produto");
    if ($input.length) {
      inserirViaCache($input, produto);
      await delay(150);
    }
  }

  let novasIdx = 0;
  const linhasDoKit = codigos.map((codigo) => {
    if (linhasExistentes.has(codigo)) {
      return { codigo, $linha: linhasExistentes.get(codigo) };
    } else {
      return { codigo, $linha: $(linhasNovas[novasIdx++]) };
    }
  });

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

  let t = 0;
  while (!window.__hiperMaster?.length && t++ < 100) await delay(100);
  if (!window.__hiperMaster?.length) { console.error('[HiperCache] ❌ Master não disponível.'); return null; }

  const codigos = paredeCodigosAtivos(cfg);
  const produtos = codigos.map(c => buscarNaMaster(c));
  if (produtos.some(p => !p)) { console.error('[HiperCache] ❌ Produtos de parede faltando.'); return null; }

  // Aproveita linhas já abertas por outros kits.
  // Montante e guia (BLACKLIST_SETAR) nunca são compartilhados — cada parede
  // precisa de uma linha própria para poder ter um tamanho independente.
  const linhasExistentes = new Map();
  kitsAtivos.forEach((estado) => {
    estado.linhas.forEach(({ codigo, $linha }) => {
      if ($.contains(document, $linha[0]) && !BLACKLIST_SETAR.has(codigo)) {
        linhasExistentes.set(codigo, $linha);
      }
    });
  });

  const codigosNovos = codigos.filter(c => !linhasExistentes.has(c));

  // Captura total ANTES de adicionar, para saber exatamente quantas linhas novas aguardar
  const totalAntes = $(".linha-produto:not(.default)").length;

  for (let i = 0; i < codigosNovos.length; i++) $(".btn-adicionar-mais-produtos").click();

  if (codigosNovos.length > 0) {
    const inicio = Date.now();
    while (Date.now() - inicio < 3000) {
      if ($(".linha-produto:not(.default)").length >= totalAntes + codigosNovos.length) break;
      await delay(50);
    }
  }

  const todasLinhas = $(".linha-produto:not(.default)").toArray();
  const linhasNovas = todasLinhas.slice(totalAntes);

  for (let i = 0; i < linhasNovas.length; i++) {
    const codigoNovo = codigosNovos[i];
    if (!codigoNovo) continue;
    const produto = buscarNaMaster(codigoNovo);
    if (!produto) continue;
    const $input = $(linhasNovas[i]).find("input.produto");
    if ($input.length) {
      inserirViaCache($input, produto);
      await delay(150);
    }
  }

  let novasIdx = 0;
  const linhasDoKit = codigos.map((codigo) => {
    if (linhasExistentes.has(codigo)) {
      return { codigo, $linha: linhasExistentes.get(codigo) };
    } else {
      return { codigo, $linha: $(linhasNovas[novasIdx++]) };
    }
  });

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
  const COD_MONTANTE = { '48': '3042', '70': '3008', '90': '3043' };
  const COD_GUIA     = { '48': '3060', '70': '3007', '90': '3044' };
  const TODOS_MONTANTES = new Set(Object.values(COD_MONTANTE));
  const TODOS_GUIAS     = new Set(Object.values(COD_GUIA));

  lista.querySelectorAll('.hp-btn-montante').forEach(btn => {
    btn.addEventListener('click', function() {
      const id      = this.dataset.id;
      const novoTam = this.dataset.montante;
      const estado  = kitsAtivos.get(id);
      if (!estado || estado.montante === novoTam) return;

      const linhaM = estado.linhas.find(l => TODOS_MONTANTES.has(l.codigo));
      const linhaG = estado.linhas.find(l => TODOS_GUIAS.has(l.codigo));

      [{ linha: linhaM, mapa: COD_MONTANTE }, { linha: linhaG, mapa: COD_GUIA }].forEach(({ linha, mapa }) => {
        if (!linha) return;
        const novoCod = mapa[novoTam];
        const produto = buscarNaMaster(novoCod);
        if (!produto) return;
        const $inp = linha.$linha.find('input.produto');
        if ($inp.length) inserirViaCache($inp, produto);
        linha.codigo = novoCod;
      });

      estado.montante = novoTam;
      renderizarPainel();
    });
  });

  // Toggle de tabica (branca / natural)
  const COD_TABICA = { branca: '3006', natural: '3010' };
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
        await trocarProdutoNaLinha(linhaTabica.$linha, novoCod, qtdFinal, qtdBruta);
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
// ordem 20 — painel de kits fica logo abaixo do botão de orçamento
(function _registrarKits() {
  function _criarPainel() {
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
      window.__hiperUI.registrar({ id: 'hiper-painel-kits', ordem: 20, render: _criarPainel });
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