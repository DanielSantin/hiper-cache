// ═══════════════════════════════════════════════════════════════════════
// kit.js — HiperCache | Kits rápidos + Fórmulas
// ═══════════════════════════════════════════════════════════════════════

// ── 1. GRUPOS DE VARIAÇÃO ──────────────────────────────────────────────
const GRUPOS_VARIACAO = {
    parafuso: [
        { codigo: "3021", tamanho: 1,    limite: 700      },
        { codigo: "3032", tamanho: 1000, limite: Infinity },
    ],
    massa: [
        { codigo: "3089", tamanho: 6,  limite: 6        },
        { codigo: "3090", tamanho: 14, limite: 14        },
        { codigo: "3113", tamanho: 25, limite: Infinity  },
    ],
    fita: [
        { codigo: "3132", tamanho: 45, limite: 45      },
        { codigo: "3014", tamanho: 90, limite: Infinity },
    ],
};

const CODIGO_PARA_GRUPO = {};
for (const [nomeGrupo, niveis] of Object.entries(GRUPOS_VARIACAO)) {
  for (const nivel of niveis) {
    CODIGO_PARA_GRUPO[nivel.codigo] = nomeGrupo;
  }
}

// ── 2. DEFINIÇÃO DOS KITS ──────────────────────────────────────────────
const KITS_GESSO = {
  aramado:     ["3076","3089","3019","3023","3132","3035","3037","3010","3006","3021","3058","3020"],
  estruturado: ["3073","3089","3018","3017","3029","3022","3132","3021","3006","3010","3058","3020"],
  paredes:     ["3073","3089","3008","3007","3021","3058","3020","3132"],
  cortineiro:  ["3073","3089","3021","3132","3009"],
  portas:      ["3073","3089","3008","3007","3021","3058","3020","3132"],
};

// ── 3. FÓRMULAS ────────────────────────────────────────────────────────
const FORMULAS_GESSO = {
  aramado: {
    "3076": (A, P) => A / 1.2,
    "3089": (A, P) => A * 0.45,
    "3019": (A, P) => A / 1.2,
    "3023": (A, P) => A / 20,
    "3132": (A, P) => A * 2.6,
    "3035": (A, P) => A * 0.03,
    "3037": (A, P) => A / 30,
    "3010": (A, P) => P / 3,
    "3006": (A, P) => P / 3,
    "3021": (A, P) => P * 5,
    "3058": (A, P) => 11 * P / 3,
    "3020": (A, P) => 11 * P / 3,
  },
  estruturado: {
    "3073": (A, P) => A / 2.88,
    "3089": (A, P) => A * 0.45,
    "3018": (A, P) => A * 1.68 / 3,
    "3017": (A, P) => A * 1.4,
    "3029": (A, P) => A * 0.3,
    "3022": (A, P) => A * 0.06,
    "3132": (A, P) => A * 1.5,
    "3021": (A, P) => (A / 2.88) * 35 + (P / 3) * 11,
    "3006": (A, P) => P / 3,
    "3010": (A, P) => P / 3,
    "3058": (A, P) => (P / 3) * 11,
    "3020": (A, P) => (P / 3) * 11,
  },
  paredes: {
    "3073": (A, P) => (A / 2.88) * 2,
    "3089": (A, P) => A * 0.9,
    "3008": (A, P) => A * 2.11 / 3,
    "3007": (A, P) => A * 0.7 / 3,
    "3021": (A, P) => (A / 2.88 * 2) * 35,
    "3058": (A, P) => (A * 0.7 / 3) * 11,
    "3020": (A, P) => (A * 0.7 / 3) * 11,
    "3132": (A, P) => A * 3,
  },
  cortineiro: {
    "3073": (ML, _, cant) => ML * 0.4 / 2.88,
    "3089": (ML, _, cant) => ML * 0.45,
    "3021": (ML, _, cant) => ML * 29,
    "3132": (ML, _, cant) => ML * 1.5,
    "3009": (ML, _, cant) => ML * cant / 3,
  },
  // Portas: mesmas fórmulas de paredes. A é calculado como soma(qtd × larg × alt).
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

// ── 4. CONFIG DE INPUTS POR KIT ────────────────────────────────────────
const KIT_INPUTS = {
  aramado:     [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }],
  estruturado: [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }],
  paredes:     [{ key: "A", label: "M² de parede" }],
  cortineiro:  [{ key: "A", label: "ML" }, { key: "cant", label: "Cant/m", title: "Cantoneiras por metro linear (padrão: 3,15)" }],
  // portas não usa KIT_INPUTS — tem painel próprio com grupos
};

const KIT_LABELS = {
  aramado:     'Aramado',
  estruturado: 'Estruturado',
  paredes:     'Parede',
  cortineiro:  'Sanca',
  portas:      'Fech. de Porta',
};

// MO base referência: R$100/m² de fechamento de porta
const PORTAS_MO_POR_M2 = 100;

// ── ESTADO ─────────────────────────────────────────────────────────────
// kitsAtivos: Map<nomeKit, estado>
// estado normal: { A, P, cant, linhas }
// estado portas: { A (derivado), grupos: [{id, qtd, larg, alt}], linhas }
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
  console.warn('[HiperCache] ⏱ Timeout aguardando input de quantidade habilitar.');
  return false;
}

// ── SETAR QUANTIDADE ───────────────────────────────────────────────────
async function setarQuantidade($inputQtd, valor, valorBruto = null) {
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
    // Apenas atualiza a quantidade se o produto já estiver na linha
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
  if ($qtd.length) await setarQuantidade($qtd, qtdFinal, qtdFinal);
}

// ── CALCULAR ÁREA TOTAL DE PORTAS ──────────────────────────────────────
// Retorna { areaTotal, qtdTotal, grupos } para uso no resumido
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

  kitsAtivos.forEach((estado, nomeKit) => {
    let A, P, cant;

    if (nomeKit === 'portas') {
      const r = calcularPortas(estado);
      A    = r.areaTotal;
      P    = 0;
      cant = 3.15;
      estado.A = A; // sincroniza para o resumido
    } else {
      A    = num(estado.A);
      P    = num(estado.P    ?? 0);
      cant = num(estado.cant ?? 3.15);
    }

    const formulas = FORMULAS_GESSO[nomeKit] ?? {};

    estado.linhas.forEach(({ codigo, $linha }) => {
      if (!$.contains(document, $linha[0])) return;

      const fn       = formulas[codigo];
      const qtdBruta = fn ? fn(A, P, cant) : 0;

      if (!totais.has(codigo)) {
        totais.set(codigo, { qtdBruta: 0, linhasSeen: new Set(), linhas: [] });
      }
      const entry = totais.get(codigo);
      entry.qtdBruta += qtdBruta;

      const domEl = $linha[0];
      if (!entry.linhasSeen.has(domEl)) {
        entry.linhasSeen.add(domEl);
        entry.linhas.push($linha);
      }
    });
  });

  totais.forEach(({ qtdBruta, linhas }, codigoBase) => {
    const linhasVivas = linhas.filter(l => $.contains(document, l[0]));
    if (!linhasVivas.length) return;

    const nivel = resolverNivel(codigoBase, qtdBruta);

    if (nivel) {
      const qtdFinal = Math.round((qtdBruta / nivel.tamanho) * 100) / 100;
      trocarProdutoNaLinha(linhasVivas[0], nivel.codigo, qtdFinal, qtdFinal);
    } else {
      const qtdFinal = Math.round(qtdBruta * 100) / 100;
      const $qtd = linhasVivas[0].find(
        ".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']"
      ).first();
      if ($qtd.length) setarQuantidade($qtd, qtdFinal, qtdBruta);
    }

    for (let i = 1; i < linhasVivas.length; i++) {
      const $qtdExtra = linhasVivas[i].find(
        ".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']"
      ).first();
      if ($qtdExtra.length) setarQuantidade($qtdExtra, 0, 0);
    }
  });
}

// ── REMOVER KIT ────────────────────────────────────────────────────────
function removerKit(nomeKit) {
  const estadoRemovido = kitsAtivos.get(nomeKit);
  kitsAtivos.delete(nomeKit);

  if (estadoRemovido) {
    const codigosAindaAtivos = new Set();
    kitsAtivos.forEach((estado) => {
      estado.linhas.forEach(({ codigo }) => codigosAindaAtivos.add(codigo));
    });

    estadoRemovido.linhas.forEach(({ codigo, $linha }) => {
      if (!codigosAindaAtivos.has(codigo) && $.contains(document, $linha[0])) {
        $linha.remove();
      }
    });
  }

  recalcularTudo();
  console.log(`[HiperCache] 🗑 Kit "${nomeKit}" removido`);
}

// ── APLICAR KIT ────────────────────────────────────────────────────────
async function aplicarKitGesso(nomeKit) {
  if (kitsAtivos.has(nomeKit)) return; // painel cuida de adicionar grupos

  const codigos = KITS_GESSO[nomeKit];
  if (!codigos) return;

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

  for (let i = 0; i < codigosNovos.length; i++) $(".btn-adicionar-mais-produtos").click();

  if (codigosNovos.length > 0) {
    const inicio = Date.now();
    while (Date.now() - inicio < 3000) {
      if ($(".linha-produto:not(.default)").length >= codigosNovos.length) break;
      await delay(50);
    }
  }

  const todasLinhas = $(".linha-produto:not(.default)").toArray();
  const linhasNovas = todasLinhas.slice(-codigosNovos.length);

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
    ? { A: 0, grupos: [{ id: Date.now(), qtd: 1, larg: 0.70, alt: 2.10 }], linhas: linhasDoKit }
    : { A: 0, P: 0, cant: 3.15, linhas: linhasDoKit };

  kitsAtivos.set(nomeKit, estadoInicial);
  console.log(`[HiperCache] ✅ Kit "${nomeKit}" ativo`);
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
    #hiper-painel-kits .hp-lista{display:flex;flex-direction:column;gap:4px}
    #hiper-painel-kits .hp-item{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:5px 6px;border:1px solid #b8d4f5;border-radius:4px;background:#f0f6ff}
    #hiper-painel-kits .hp-badge{font-size:11px;font-weight:bold;color:#1a5c1a;background:#d4edda;border-radius:3px;padding:1px 7px;white-space:nowrap;flex-shrink:0}
    #hiper-painel-kits .hp-badge.porta{color:#7a3a00;background:#fff0d4}
    #hiper-painel-kits .hp-lbl{font-size:11px;color:#777;white-space:nowrap}
    #hiper-painel-kits .hp-lbl.m2{font-size:10px;color:#aaa;white-space:nowrap}
    #hiper-painel-kits .hp-inp{width:68px;padding:2px 5px;font-size:12px;border:1px solid #b0c8e8;border-radius:3px;height:22px;background:#fff}
    #hiper-painel-kits .hp-inp.qtd{width:46px}
    #hiper-painel-kits .hp-sep{width:1px;height:14px;background:#cce;flex-shrink:0}
    #hiper-painel-kits .hp-btn-rm{margin-left:auto;font-size:11px;padding:1px 7px;border:none;border-radius:3px;background:#e55;color:#fff;cursor:pointer;line-height:18px;flex-shrink:0}
    #hiper-painel-kits .hp-btn-add-grupo{font-size:11px;padding:2px 9px;border:1px dashed #b87a00;border-radius:3px;background:transparent;color:#b87a00;cursor:pointer;white-space:nowrap}
    #hiper-painel-kits .hp-add-wrap{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    #hiper-painel-kits .hp-add-lbl{font-size:10px;color:#aaa}
    #hiper-painel-kits .hp-btn-tipo{font-size:11px;font-weight:bold;padding:3px 10px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;cursor:pointer;color:#444}
    #hiper-painel-kits .hp-btn-tipo:hover{background:#e8f0fe;border-color:#2c7be5;color:#2c7be5}
  `;
  document.head.appendChild(s);
}

function renderizarPainel() {
  const painel = document.getElementById('hiper-painel-kits');
  if (!painel) return;
  const lista = painel.querySelector('#hp-lista');
  if (!lista) return;

  lista.innerHTML = '';

  // ── Itens ativos ───────────────────────────────────────────────────
  kitsAtivos.forEach((estado, nomeKit) => {

    if (nomeKit === 'portas') {
      // Um item por grupo de porta
      (estado.grupos || []).forEach(grupo => {
        const areaGrupo = (num(grupo.qtd) * (num(grupo.larg) || 0.70) * (num(grupo.alt) || 2.10)).toFixed(2);
        const item = document.createElement('div');
        item.className = 'hp-item';
        item.innerHTML = `
          <span class="hp-badge porta">🚪 Porta</span>
          <span class="hp-lbl">Qtd</span>
          <input class="hp-inp qtd" type="number" min="1" step="1" value="${grupo.qtd}"
            data-kit="portas" data-gid="${grupo.id}" data-key="qtd">
          <div class="hp-sep"></div>
          <span class="hp-lbl">Larg</span>
          <input class="hp-inp" type="number" min="0.01" step="0.01" value="${grupo.larg}"
            data-kit="portas" data-gid="${grupo.id}" data-key="larg">
          <span class="hp-lbl">Alt</span>
          <input class="hp-inp" type="number" min="0.01" step="0.01" value="${grupo.alt}"
            data-kit="portas" data-gid="${grupo.id}" data-key="alt">
          <span class="hp-lbl m2" data-m2-gid="${grupo.id}">= ${areaGrupo} m²</span>
          <button class="hp-btn-rm" data-rm-kit="portas" data-rm-gid="${grupo.id}">✕</button>
        `;
        lista.appendChild(item);
      });

      // Botão "+ outro tamanho"
      const wrap = document.createElement('div');
      wrap.style.cssText = 'padding:2px 4px';
      wrap.innerHTML = `<button class="hp-btn-add-grupo" id="hp-btn-add-porta">+ outro tamanho de porta</button>`;
      lista.appendChild(wrap);

    } else {
      // Kits normais
      const campos = KIT_INPUTS[nomeKit] || [{ key: 'A', label: 'Área (m²)' }];
      const item = document.createElement('div');
      item.className = 'hp-item';

      const inputsHTML = campos.map(({ key, label, title }, idx) => {
        const val = estado[key] !== undefined ? estado[key] : (key === 'cant' ? 3.15 : '');
        const sep = idx > 0 ? '<div class="hp-sep"></div>' : '';
        return `${sep}
          <span class="hp-lbl"${title ? ` title="${title}" style="cursor:help;text-decoration:underline dotted"` : ''}>${label}</span>
          <input class="hp-inp" type="number" min="0" step="0.01" value="${val}"
            data-kit="${nomeKit}" data-key="${key}"${title ? ` title="${title}"` : ''}>
        `;
      }).join('');

      item.innerHTML = `
        <span class="hp-badge">${KIT_LABELS[nomeKit] || nomeKit}</span>
        ${inputsHTML}
        <button class="hp-btn-rm" data-rm-kit="${nomeKit}">✕</button>
      `;
      lista.appendChild(item);
    }
  });

  // ── Botões para adicionar novos kits ──────────────────────────────
  const addWrap = document.createElement('div');
  addWrap.className = 'hp-add-wrap';

  const disponiveis = Object.keys(KITS_GESSO).filter(t =>
    t === 'portas' ? true : !kitsAtivos.has(t)
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

  // ── Bind de eventos ────────────────────────────────────────────────
  _bindPainelEventos(lista);
}

function _bindPainelEventos(lista) {
  // Inputs: atualiza estado e recalcula
  lista.querySelectorAll('input.hp-inp').forEach(el => {
    el.addEventListener('input', function () {
      const kit = this.dataset.kit;
      const key = this.dataset.key;
      const gid = this.dataset.gid;

      if (kit === 'portas' && gid) {
        const estado = kitsAtivos.get('portas');
        if (!estado) return;
        const grupo = estado.grupos.find(g => String(g.id) === String(gid));
        if (!grupo) return;
        grupo[key] = num(this.value) || (key === 'larg' ? 0.70 : key === 'alt' ? 2.10 : 1);
        recalcularTudo();
        // Atualiza o label de m² ao lado sem re-renderizar
        const span = lista.querySelector(`[data-m2-gid="${gid}"]`);
        if (span) {
          const a = (num(grupo.qtd)) * (num(grupo.larg) || 0.70) * (num(grupo.alt) || 2.10);
          span.textContent = `= ${a.toFixed(2)} m²`;
        }
      } else if (kit) {
        const estado = kitsAtivos.get(kit);
        if (!estado) return;
        estado[key] = num(this.value);
        recalcularTudo();
      }
    });
  });

  // Botões ✕
  lista.querySelectorAll('[data-rm-kit]').forEach(btn => {
    btn.addEventListener('click', function () {
      const kit = this.dataset.rmKit;
      const gid = this.dataset.rmGid;

      if (kit === 'portas' && gid) {
        const estado = kitsAtivos.get('portas');
        if (!estado) return;
        estado.grupos = estado.grupos.filter(g => String(g.id) !== String(gid));
        if (estado.grupos.length === 0) {
          removerKit('portas');
        } else {
          recalcularTudo();
        }
        renderizarPainel();
      } else {
        removerKit(kit);
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

  // Botões de adicionar tipo
  lista.querySelectorAll('[data-add-kit]').forEach(btn => {
    btn.addEventListener('click', async function () {
      const kit = this.dataset.addKit;

      if (kit === 'portas' && kitsAtivos.has('portas')) {
        // Já existe: só adiciona mais um grupo
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

// ── INJETAR PAINEL ─────────────────────────────────────────────────────
function injetarPainelKits() {
  if (document.getElementById("hiper-painel-kits")) return;

  const anchor = document.getElementById('hiper-btn-orcamento')?.parentElement ||
                 document.querySelector('.aba-esquerda .parte-4 > div');
  if (!anchor) return;

  _injetarCssPainel();

  const container = document.createElement("div");
  container.id = "hiper-painel-kits";
  container.innerHTML = `
    <div class="hp-titulo">🧱 Estruturas de Gesso</div>
    <div id="hp-lista" class="hp-lista"></div>
  `;
  anchor.appendChild(container);

  renderizarPainel();
  console.info('[HiperCache] ✅ Painel de estruturas injetado.');
}

// ── OBSERVER ───────────────────────────────────────────────────────────
function iniciarObserver() {
  const target = document.body || document.documentElement;
  if (!target) return;

  new MutationObserver(() => {
    if (location.hash.includes("pedido-venda") && !document.getElementById("hiper-painel-kits")) {
      injetarPainelKits();
    }
  }).observe(target, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarObserver);
} else {
  iniciarObserver();
}

window.aplicarKitGesso  = aplicarKitGesso;
window.recalcularTudo   = recalcularTudo;
window.renderizarPainel = renderizarPainel;
window.kitsAtivos       = kitsAtivos;
window.FORMULAS_GESSO   = FORMULAS_GESSO;
window.calcularPortas   = calcularPortas;
window.PORTAS_MO_POR_M2 = PORTAS_MO_POR_M2;