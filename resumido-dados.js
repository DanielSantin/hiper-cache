// ═══════════════════════════════════════════════════════════════════════════════
// resumido-dados.js — Textos, nomes e funções de dados
// ═══════════════════════════════════════════════════════════════════════════════

const RESUMIDO_TEXTOS = {
  estruturado: {
    branca:  `Fornecimento de material completo para Forro de gesso acartonado sistema estruturado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, tabica galvanizada cor branca (pintura automotiva de fábrica), Perfis galvanizado tipo F-530 (gramatura 0,50mm), arame galvanizado nº 10, Suporte nivelador, Conector, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Forro de gesso acartonado sistema estruturado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, tabica galvanizada natural, Perfis galvanizado tipo F-530 (gramatura 0,50mm), arame galvanizado nº 10, Suporte nivelador, Conector, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Forro de gesso acartonado sistema estruturado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, tabica galvanizada (branca e natural conforme projeto), Perfis galvanizado tipo F-530 (gramatura 0,50mm), arame galvanizado nº 10, Suporte nivelador, Conector, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
  aramado: {
    branca:  `Fornecimento de material completo para Forro de gesso acartonado sistema aramado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm, Tabica galvanizada cor branca (pintura automotiva de fábrica), Junção H, arame galvanizado nº 18, Sisal, Gesso em pó, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Forro de gesso acartonado sistema aramado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm, Tabica galvanizada natural, Junção H, arame galvanizado nº 18, Sisal, Gesso em pó, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Forro de gesso acartonado sistema aramado tabicado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm, Tabica galvanizada (branca e natural conforme projeto), Junção H, arame galvanizado nº 18, Sisal, Gesso em pó, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
  paredes: {
    branca:  `Fornecimento de material completo para Parede Drywall de Gesso Acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Parede Drywall de Gesso Acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Parede Drywall de Gesso Acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
  cortineiro: {
    branca:  `Fornecimento de material completo para Sancas de gesso acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm Marca Trevo, Cantoneira de aço galvanizado, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Sancas de gesso acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm Marca Trevo, Cantoneira de aço galvanizado, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Sancas de gesso acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm Marca Trevo, Cantoneira de aço galvanizado, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
  portas: {
    branca:  `Fornecimento de material completo para Fechamento de portas em Drywall, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    natural: `Fornecimento de material completo para Fechamento de portas em Drywall, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
    misto:   `Fornecimento de material completo para Fechamento de portas em Drywall, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  },
};

const RESUMIDO_NOMES = {
  estruturado: 'Forro Estruturado',
  aramado:     'Forro Aramado',
  paredes:     'Parede Drywall',
  cortineiro:  'Sanca / Cortineiro',
  portas:      'Fechamento de Porta',
};

const COD_TABICA_BRANCA  = '3006';
const COD_TABICA_NATURAL = '3010';

// Custo base de mão de obra por tipo de kit (R$/m²)
// Para portas: R$100/m² de área de fechamento (larg × alt de cada porta)
const RESUMIDO_MO_BASE = {
  estruturado: 30,
  aramado:     30,
  paredes:     25,
  cortineiro:  25,
  portas:      100,
};

// Detecta qual variante de tabica está no orçamento: branca | natural | misto
function resumido_detectarTabica(itens) {
  const temB = itens.some(it => it.idProduto === COD_TABICA_BRANCA);
  const temN = itens.some(it => it.idProduto === COD_TABICA_NATURAL);
  if (temB && temN) return 'misto';
  if (temN) return 'natural';
  return 'branca';
}

// Distribui o custo total proporcionalmente entre os kits, usando as fórmulas de quantidade.
function resumido_custoPorKit(kitsArr, itens) {
  const FORMULAS = window.FORMULAS_GESSO || (typeof FORMULAS_GESSO !== 'undefined' ? FORMULAS_GESSO : {});
  const resultado = {};
  kitsArr.forEach(k => { resultado[k.nome] = 0; });

  itens.forEach(item => {
    const cod     = item.idProduto;
    const vlTotal = item.qtd * item.vlUnit;
    if (!cod || vlTotal <= 0) return;

    const kitsComProduto = kitsArr.filter(k =>
      typeof (FORMULAS[k.nome] || {})[cod] === 'function'
    );

    if (kitsComProduto.length === 0) {
      const parte = vlTotal / kitsArr.length;
      kitsArr.forEach(k => { resultado[k.nome] += parte; });
      return;
    }
    if (kitsComProduto.length === 1) {
      resultado[kitsComProduto[0].nome] += vlTotal;
      return;
    }

    const qtdBrutaPorKit = kitsComProduto.map(k => {
      const fn = FORMULAS[k.nome][cod];
      return Math.max(fn(k.A || 0, k.P || 0, k.cant || 3.15), 0);
    });
    const somaQtd = qtdBrutaPorKit.reduce((s, v) => s + v, 0);

    if (somaQtd <= 0) {
      const parte = vlTotal / kitsComProduto.length;
      kitsComProduto.forEach(k => { resultado[k.nome] += parte; });
      return;
    }
    kitsComProduto.forEach((k, i) => {
      resultado[k.nome] += (qtdBrutaPorKit[i] / somaQtd) * vlTotal;
    });
  });

  kitsArr.forEach(k => { if (resultado[k.nome] <= 0) resultado[k.nome] = 0.001; });
  return resultado;
}

// Gera a descrição detalhada de grupos de porta para o resumido
// Ex: "3 portas (2× 70×210 cm, 1× 90×210 cm)"
function resumido_descricaoPortas(grupos) {
  if (!grupos || grupos.length === 0) return 'Fechamento de portas';

  const qtdTotal = grupos.reduce((s, g) => s + (parseInt(g.qtd) || 0), 0);

  // Agrupa por dimensão para exibir de forma compacta
  const mapa = {};
  grupos.forEach(g => {
    const qtd  = parseInt(g.qtd)  || 0;
    const larg = parseFloat(g.larg) || 0.70;
    const alt  = parseFloat(g.alt)  || 2.10;
    const largCm = Math.round(larg * 100);
    const altCm  = Math.round(alt  * 100);
    const chave  = `${largCm}×${altCm}`;
    mapa[chave]  = (mapa[chave] || 0) + qtd;
  });

  const detalhe = Object.entries(mapa)
    .map(([dim, qtd]) => `${qtd}× ${dim} cm`)
    .join(', ');

  const plural = qtdTotal === 1 ? 'porta' : 'portas';
  return `${qtdTotal} ${plural} (${detalhe})`;
}