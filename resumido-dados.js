// ═══════════════════════════════════════════════════════════════════════════════
// resumido-dados.js — Textos, nomes e funções de dados
// ═══════════════════════════════════════════════════════════════════════════════

const RESUMIDO_TEXTOS = {
  // Forros: mantêm 3 variantes porque a tabica muda o texto (branca / natural / misto)
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
  // Kits sem variação de tabica — texto único (paredes geradas dinamicamente, não usam este objeto)
  cortineiro: `Fornecimento de material completo para Sancas de gesso acartonado, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 600 × 2000mm Marca Trevo, Cantoneira de aço galvanizado, Parafuso TA-25, Parafuso 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
  portas: `Fornecimento de material completo para Fechamento de portas em Drywall, sendo: Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo, Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50), Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel, Fita telada fibra de vidro e massa drywall.`,
};

const RESUMIDO_NOMES = {
  estruturado: 'Forro Estruturado',
  aramado:     'Forro Aramado',
  paredeStSt:  'Parede Drywall ST',
  paredeStCim: 'Parede Drywall CIM/ST',
  cortineiro:  'Sanca / Cortineiro',
  portas:      'Fechamento de Porta',
};

// Resolve o nome legível de um kit, incluindo paredes parametrizadas (id = "parede_...")
function resumido_resolverNome(id, cfg) {
  if (RESUMIDO_NOMES[id]) return RESUMIDO_NOMES[id];
  // Parede parametrizada: usa paredeLabelCfg se disponível
  if (id && id.startsWith('parede_') && cfg) {
    if (typeof paredeLabelCfg === 'function') return 'Parede ' + paredeLabelCfg(cfg);
    // Fallback manual se kit.js não carregou ainda
    if (cfg.faces === 1) return 'Parede Drywall 1 Face ' + cfg.faceA + (cfg.estrutura === 'dupla' ? ' Dupla' : '');
    var faces2 = [cfg.faceA, cfg.faceB].sort(function(a, b) {
      var ordem = { CIM: 0, RU: 1, ST: 2 };
      return (ordem[a] || 9) - (ordem[b] || 9);
    });
    var faceStr = faces2[0] === faces2[1] ? faces2[0] : faces2[0] + '/' + faces2[1];
    var estStr  = cfg.estrutura === 'dupla' ? ' Dupla' : '';
    return 'Parede Drywall ' + faceStr + estStr;
  }
  return id;
}

// Resolve o texto descritivo de um kit para o resumido
// Para paredes parametrizadas, monta a descrição com base na configuração
function resumido_resolverTexto(id, varianteTabica, cfg) {
  // Kit estático (forro, sanca, porta)
  // Forros: texto varia pela tabica. Demais kits estáticos: texto único (string direta)
  if (RESUMIDO_TEXTOS[id]) {
    var t = RESUMIDO_TEXTOS[id];
    return typeof t === 'string' ? t : (t[varianteTabica] || '');
  }

  // Parede parametrizada
  if (id && id.startsWith('parede_') && cfg) {
    var faces = cfg.faces === 2 ? [cfg.faceA, cfg.faceB] : [cfg.faceA];
    var temCim = faces.some(function(f) { return f === 'CIM'; });
    var temSt  = faces.some(function(f) { return f === 'ST'; });
    var temRu  = faces.some(function(f) { return f === 'RU'; });
    var est    = cfg.estrutura === 'dupla' ? 'estrutura dupla ' : '';

    // Partes fixas reutilizadas nos textos
    var _estrutura = 'Perfis de aço galvanizado tipo montantes e guias de 70mm (Normatizados com gramatura de 0,50)';
    var _fixacaoSt = 'Parafusos TA-25, Parafusos 4,5 × 45mm com bucha plástica c/anel';
    var _fixacaoCim = 'Parafuso cimentícia S/ASA 4,2×32mm, Parafusos 4,5 × 45mm com bucha plástica c/anel';

    // Monta a listagem das chapas conforme as faces presentes
    function _descreverChapas(faces) {
      var partes = [];
      if (faces.some(function(f) { return f === 'ST';  }))
        partes.push('Chapa de gesso acartonado ST (Standart) 12,5 × 1200 × 2400mm Marca Trevo');
      if (faces.some(function(f) { return f === 'RU';  }))
        partes.push('Chapa de gesso acartonado RU (Resistente à Umidade) 12,5 × 1200 × 1800mm Marca Trevo');
      if (faces.some(function(f) { return f === 'CIM'; }))
        partes.push('Chapa Cimentícia 8mm 1200 × 2400mm');
      return partes.join(', ');
    }

    // Materiais exclusivos da face cimentícia (não variam com o lado gesso)
    var _materiaisCim = 'Massa Cimentícia Multiperfil, Fita telada p/cimentícia 102mm × 46m, ' + _fixacaoCim;

    if (cfg.faces === 1) {
      if (temCim) {
        return 'Fornecimento de material completo para Parede Drywall ' + est + '1 face cimentícia' +
          ', sendo: ' + _descreverChapas(faces) +
          ', ' + _estrutura + ', ' + _materiaisCim + '.';
      }
      return 'Fornecimento de material completo para Parede Drywall ' + est + '1 face ' + (temRu ? 'RU' : 'ST') +
        ', sendo: ' + _descreverChapas(faces) +
        ', ' + _estrutura + ', ' + _fixacaoSt + ', Fita telada fibra de vidro e massa drywall.';
    }

    // 2 faces
    var qtdCim = faces.filter(function(f) { return f === 'CIM'; }).length;
    if (qtdCim === 2) {
      return 'Fornecimento de material completo para Parede Drywall ' + est + 'com revestimento cimentício em ambas as faces' +
        ', sendo: ' + _descreverChapas(faces) +
        ' (2 faces), ' + _estrutura + ', ' + _materiaisCim + '.';
    }
    if (qtdCim === 1) {
      // Uma face gesso (ST ou RU) + uma face cimentícia
      var faceSt = faces.some(function(f) { return f === 'ST'; }) ? 'standart' : 'RU';
      return 'Fornecimento de material completo para Parede Drywall ' + est + 'com uma face cimentícia e outra face ' + faceSt +
        ', sendo: ' + _descreverChapas(faces) +
        ', ' + _estrutura +
        ', Parafusos TA-25, ' + _materiaisCim + ', Fita telada fibra de vidro e massa drywall.';
    }
    // ST/ST, RU/RU ou ST/RU
    return ('Fornecimento de material completo para Parede Drywall de Gesso Acartonado ' + est).trimEnd() +
      ', sendo: ' + _descreverChapas(faces) +
      ', ' + _estrutura + ', ' + _fixacaoSt + ', Fita telada fibra de vidro e massa drywall.';
  }

  return '';
}

const COD_TABICA_BRANCA  = '3006';
const COD_TABICA_NATURAL = '3010';

// Custo base de mão de obra por tipo de kit (R$/m²)
// Para portas: R$100/m² de área de fechamento (larg × alt de cada porta)
// Paredes parametrizadas: calculado dinamicamente via paredeMoBase(cfg) em kit.js
const RESUMIDO_MO_BASE = {
  estruturado: 20,
  aramado:     20,
  cortineiro:  20,
  portas:      100,
};

// Resolve o custo base de MO para qualquer kit, incluindo paredes parametrizadas
function resumido_resolverMoBase(id, cfg) {
  if (RESUMIDO_MO_BASE[id] !== undefined) return RESUMIDO_MO_BASE[id];
  if (id && id.startsWith('parede_') && cfg) {
    if (typeof paredeMoBase === 'function') return paredeMoBase(cfg);
    // Fallback manual (espelha a lógica de paredeMoBase em kit.js)
    if (cfg.faces === 1) return cfg.faceA === 'CIM' ? 35 : 20;
    var qtdCim = [cfg.faceA, cfg.faceB].filter(function(f) { return f === 'CIM'; }).length;
    var base = qtdCim === 2 ? 40 : qtdCim === 1 ? 35 : 25;
    if (cfg.estrutura === 'dupla') base += 25;
    return base;
  }
  return 25; // fallback genérico
}

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

  // Monta mapa de fórmulas por kit (inclui paredes parametrizadas)
  const formulasPorKit = {};
  kitsArr.forEach(k => {
    if (k.cfg && k.nome.startsWith('parede_')) {
      // Parede parametrizada: gera fórmulas a partir da cfg
      formulasPorKit[k.nome] = (typeof paredeGerarFormulas === 'function')
        ? paredeGerarFormulas(k.cfg)
        : {};
    } else {
      formulasPorKit[k.nome] = FORMULAS[k.nome] || {};
    }
  });

  itens.forEach(item => {
    const cod     = item.idProduto;
    const vlTotal = item.qtd * item.vlUnit;
    if (!cod || vlTotal <= 0) return;

    const kitsComProduto = kitsArr.filter(k =>
      typeof (formulasPorKit[k.nome] || {})[cod] === 'function'
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
      const fn = formulasPorKit[k.nome][cod];
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