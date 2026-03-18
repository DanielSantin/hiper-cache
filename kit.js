// ═══════════════════════════════════════════════════════════════════════
// kit.js — HiperCache | Kits rápidos + Fórmulas
// ═══════════════════════════════════════════════════════════════════════

// ── 1. GRUPOS DE VARIAÇÃO ──────────────────────────────────────────────
// Quando a quantidade bruta ultrapassa `limite`, troca para o próximo.
// `tamanho` é o fator de divisão (1 = unitário, 1000 = caixa c/ 1000).
const GRUPOS_VARIACAO = {
  parafuso: [
    { codigo: "3021", tamanho: 1,    limite: 700      },
    { codigo: "3032", tamanho: 1000, limite: Infinity },
  ],
  // Exemplo futuro:
  // massa: [
  //   { codigo: "XXXX", tamanho: 10, limite: 30       },
  //   { codigo: "YYYY", tamanho: 25, limite: Infinity },
  // ],
};

// Índice reverso: código → nome do grupo (ex: "3021" → "parafuso")
const CODIGO_PARA_GRUPO = {};
for (const [nomeGrupo, niveis] of Object.entries(GRUPOS_VARIACAO)) {
  for (const nivel of niveis) {
    CODIGO_PARA_GRUPO[nivel.codigo] = nomeGrupo;
  }
}

// ── 2. DEFINIÇÃO DOS KITS ──────────────────────────────────────────────
// Cada kit lista apenas o código BASE do grupo (o menor, ex: "3021").
// A troca automática é feita pelo GRUPOS_VARIACAO em tempo de cálculo.
const KITS_GESSO = {
  aramado:     ["3076","3113","3019","3023","3014","3132","3035","3037","3010","3006","3021","3058","3020"],
  estruturado: ["3073","3113","3018","3017","3029","3022","3014","3132","3021","3006","3010","3058","3020"],
  paredes:     ["3073","3113","3008","3007","3021","3058","3020","3014","3132"],
  cortineiro:  ["3073","3113","3021","3014","3132","3009"],
};

// ── 3. FÓRMULAS — sempre calculam a quantidade BRUTA (unidades) ────────
// Para grupos de variação, defina apenas o código base (ex: "3021").
// O recalcularTudo resolve qual produto usar e divide pelo tamanho.
const FORMULAS_GESSO = {
  aramado: {
    "3076": (A, P) => A / 1.2,
    "3113": (A, P) => A * 0.45 / 25,
    "3019": (A, P) => A / 1.2,
    "3023": (A, P) => A / 20,
    "3014": (A, P) => A * 2.6 / 90,
    "3132": (A, P) => A * 2.6 / 45,
    "3035": (A, P) => A * 0.03,
    "3037": (A, P) => A / 30,
    "3010": (A, P) => P / 3,
    "3006": (A, P) => P / 3,
    "3021": (A, P) => P * 5,       // bruto; troca automática para 3032 se > 700
    "3058": (A, P) => 11 * P / 3,
    "3020": (A, P) => 11 * P / 3,
  },
  estruturado: {
    "3073": (A, P) => A / 2.88,
    "3113": (A, P) => A * 0.45 / 25,
    "3018": (A, P) => A * 1.68 / 3,
    "3017": (A, P) => A * 1.4,
    "3029": (A, P) => A * 0.3,
    "3022": (A, P) => A * 0.06,
    "3014": (A, P) => A * 1.5 / 90,
    "3132": (A, P) => A * 1.5 / 45,
    "3021": (A, P) => (A / 2.88) * 35 + (P / 3) * 11,   // bruto
    "3006": (A, P) => P / 3,
    "3010": (A, P) => P / 3,
    "3058": (A, P) => (P / 3) * 11,
    "3020": (A, P) => (P / 3) * 11,
  },
  paredes: {
    "3073": (A, P) => (A / 2.88) * 2,
    "3113": (A, P) => A * 0.9 / 25,
    "3008": (A, P) => A * 2.11 / 3,
    "3007": (A, P) => A * 0.7 / 3,
    "3021": (A, P) => (A / 2.88 * 2) * 35,              // bruto
    "3058": (A, P) => (A * 0.7 / 3) * 11,
    "3020": (A, P) => (A * 0.7 / 3) * 11,
    "3014": (A, P) => A * 3 / 90,
    "3132": (A, P) => A * 3 / 45,
  },
  cortineiro: {
    "3073": (ML, _, cant) => ML * 0.4 / 2.88,
    "3113": (ML, _, cant) => ML * 0.45 / 25,
    "3021": (ML, _, cant) => ML * 29,                    // bruto
    "3014": (ML, _, cant) => ML * 1.5 / 90,
    "3132": (ML, _, cant) => ML * 1.5 / 45,
    "3009": (ML, _, cant) => ML * cant / 3,
  },
};

// Labels dos inputs por kit
const KIT_INPUTS = {
  aramado:     [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }],
  estruturado: [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }],
  paredes:     [{ key: "A", label: "M² de parede" }],
  cortineiro:  [{ key: "A", label: "ML" }, { key: "cant", label: "Cant/m", title: "Cantoneiras por metro linear (padrão: 3,15)" }],
};

// ── ESTADO ─────────────────────────────────────────────────────────────
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

// Resolve qual nível do grupo usar baseado na quantidade bruta.
// Retorna { codigo, tamanho } do nível adequado.
function resolverNivel(codigoBase, qtdBruta) {
  const nomeGrupo = CODIGO_PARA_GRUPO[codigoBase];
  if (!nomeGrupo) return null; // não é um grupo de variação

  const niveis = GRUPOS_VARIACAO[nomeGrupo];
  for (const nivel of niveis) {
    if (qtdBruta <= nivel.limite) return nivel;
  }
  return niveis[niveis.length - 1]; // fallback pro último
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

// ── TROCAR PRODUTO NA LINHA (para grupos de variação) ─────────────────
async function trocarProdutoNaLinha($linha, codigoNovo, qtdFinal, qtdBruta) {
  const produto = buscarNaMaster(codigoNovo);
  if (!produto) {
    console.warn(`[HiperCache] ⚠ Produto ${codigoNovo} não encontrado para troca.`);
    return;
  }

  const $inputProduto = $linha.find("input.produto");
  if (!$inputProduto.length) return;

  // Verifica se o produto já está correto para evitar troca desnecessária
  const s2 = $inputProduto.data("select2");
  const atual = s2?.data();
  const idAtual = String(atual?.id ?? atual?.idProduto ?? '');
  const idNovo  = String(produto.id ?? produto.idProduto);

  if (idAtual !== idNovo) {
    inserirViaCache($inputProduto, produto);
  }

  // Aguarda o input de quantidade estar disponível após a troca
  const $qtd = $linha.find(
    ".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']"
  ).first();

  if ($qtd.length) await setarQuantidade($qtd, qtdFinal, qtdFinal);
}

// ── RECALCULAR TUDO ────────────────────────────────────────────────────
function recalcularTudo() {
  // Passo 1: acumula quantidade BRUTA por código base, sem duplicar linhas
  const totais = new Map();
  // totais: codigoBase → { qtdBruta, linhasSeen: Set, linhas: [$linha] }

  kitsAtivos.forEach((estado, nomeKit) => {
    const A    = num(estado.A);
    const P    = num(estado.P    ?? 0);
    const cant = num(estado.cant ?? 3.15);
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

  // Passo 2: aplica — resolvendo grupos de variação
  totais.forEach(({ qtdBruta, linhas }, codigoBase) => {
    const linhasVivas = linhas.filter(l => $.contains(document, l[0]));
    if (!linhasVivas.length) return;

    const nivel = resolverNivel(codigoBase, qtdBruta);

    if (nivel) {
      // É um grupo de variação: possivelmente troca o produto e ajusta quantidade
      const qtdFinal = Math.round((qtdBruta / nivel.tamanho) * 100) / 100;
      trocarProdutoNaLinha(linhasVivas[0], nivel.codigo, qtdFinal, qtdFinal);
    } else {
      // Produto normal: aplica direto
      const qtdFinal = Math.round(qtdBruta * 100) / 100;
      const $qtd = linhasVivas[0].find(
        ".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']"
      ).first();
      if ($qtd.length) setarQuantidade($qtd, qtdFinal, qtdBruta);
    }

    // Linhas extras recebem 0
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
  atualizarBotaoKit(nomeKit, false);

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
  if (kitsAtivos.has(nomeKit)) {
    removerKit(nomeKit);
    return;
  }

  const codigos = KITS_GESSO[nomeKit];
  if (!codigos) return;

  let t = 0;
  while (!window.__hiperMaster?.length && t++ < 100) await delay(100);
  if (!window.__hiperMaster?.length) { console.error('[HiperCache] ❌ Master não disponível.'); return; }

  const produtos = codigos.map(c => buscarNaMaster(c));
  if (produtos.some(p => !p)) { console.error('[HiperCache] ❌ Produtos faltando.'); return; }

  // Monta mapa de código → $linha já existente nos kits ativos
  const linhasExistentes = new Map();
  kitsAtivos.forEach((estado) => {
    estado.linhas.forEach(({ codigo, $linha }) => {
      if ($.contains(document, $linha[0])) linhasExistentes.set(codigo, $linha);
    });
  });

  // Descobre quais códigos precisam de linha nova
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

  await Promise.all(linhasNovas.map((linha, i) => {
    const $input = $(linha).find("input.produto");
    if ($input.length) inserirViaCache($input, produtos[codigos.indexOf(codigosNovos[i])]);
  }));

  let novasIdx = 0;
  const linhasDoKit = codigos.map((codigo) => {
    if (linhasExistentes.has(codigo)) {
      return { codigo, $linha: linhasExistentes.get(codigo) };
    } else {
      return { codigo, $linha: $(linhasNovas[novasIdx++]) };
    }
  });

  kitsAtivos.set(nomeKit, { A: 0, P: 0, linhas: linhasDoKit });

  atualizarBotaoKit(nomeKit, true);
  console.log(`[HiperCache] ✅ Kit "${nomeKit}" ativo`);
}

// ── ATUALIZAR VISUAL DO BOTÃO ──────────────────────────────────────────
function atualizarBotaoKit(nome, ativo) {
  const $btn = $(`#hiper-btn-kit-${nome}`);
  if (ativo) {
    $btn.css({ background: '#2c7be5', color: '#fff', borderColor: '#2c7be5' });
  } else {
    $btn.css({ background: '', color: '', borderColor: '#ccc' });
  }

  $(`#hiper-row-${nome} input`).each(function() {
    if (ativo) {
      $(this).prop('disabled', false)
             .css({ background: '#fff', color: '#333', borderColor: '#aaa' });
    } else {
      const defaultVal = $(this).data('key') === 'cant' ? '3.15' : '';
      $(this).prop('disabled', true)
             .val(defaultVal)
             .css({ background: '#f5f5f5', color: '#aaa', borderColor: '#ddd' });
    }
  });

  $(`#hiper-row-${nome}`).show();
}

// ── INTERFACE ──────────────────────────────────────────────────────────
function injetarPainelKits() {
  if (document.getElementById("hiper-painel-kits")) return;

  const linhasHTML = Object.keys(KITS_GESSO).map(nome => {
    const label  = nome.charAt(0).toUpperCase() + nome.slice(1);
    const campos = KIT_INPUTS[nome] ?? [{ key: 'A', label: 'Área (m²)' }];

    const inputsHTML = campos.map(({ key, label: lbl, title }) => `
      <label
        style="font-size:11px;color:#999;margin-left:10px;margin-right:3px${title ? ';cursor:help;text-decoration:underline dotted' : ''}"
        ${title ? `title="${title}"` : ''}>
        ${lbl}
      </label>
      <input
        id="hiper-input-${nome}-${key}"
        type="number" min="0" step="0.01"
        placeholder="${key === 'cant' ? '3.15' : '0'}"
        ${key === 'cant' ? 'value="3.15"' : ''}
        data-kit="${nome}" data-key="${key}"
        disabled
        style="width:75px;padding:2px 5px;font-size:12px;border:1px solid #ddd;border-radius:3px;height:24px;background:#f5f5f5;color:#aaa"
      />
    `).join('');

    return `
      <div style="display:flex;align-items:center;padding:5px 4px;border-bottom:1px solid #f0f0f0">
        <button
          id="hiper-btn-kit-${nome}"
          class="btn btn-xs btn-default"
          style="min-width:90px;font-weight:bold;border:1px solid #ccc;text-align:left"
          onclick="aplicarKitGesso('${nome}')">
          ${label}
        </button>
        <div id="hiper-row-${nome}" style="display:flex;align-items:center;flex-wrap:wrap">
          ${inputsHTML}
        </div>
      </div>
    `;
  }).join('');

  const container = document.createElement("div");
  container.id = "hiper-painel-kits";
  container.style.cssText = `margin:10px 0;padding:8px 10px;border:1px solid #ddd;background:#fdfdfd;border-radius:4px`;
  container.innerHTML = `
    <div style="font-size:10px;color:#666;margin-bottom:6px;font-weight:bold;text-transform:uppercase">
      🧱 Estruturas de Gesso
    </div>
    <div id="hiper-linhas-kits">${linhasHTML}</div>
  `;

// No kit.js, altere a função de injeção para:
    var anchor = document.getElementById('hiper-btn-orcamento')?.parentElement || 
                 document.querySelector('.aba-esquerda .parte-4 > div');

    if (!anchor) return; // Sai silenciosamente se ainda não houver onde injetar

  // Adiciona ao DOM ANTES de buscar elementos internos
  anchor.appendChild(container);

  const linhasKits = document.getElementById("hiper-linhas-kits");
  if (!linhasKits) {
    console.warn("[HiperCache] ⚠️ #hiper-linhas-kits não encontrado, evento não registrado.");
    return;
  }

  linhasKits.addEventListener("input", function(e) {
    const el      = e.target;
    const nomeKit = el.dataset.kit;
    const key     = el.dataset.key;
    if (!nomeKit || !key) return;

    const estado = kitsAtivos.get(nomeKit);
    if (!estado) return;

    estado[key] = num(el.value);
    recalcularTudo();
  });
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

window.aplicarKitGesso = aplicarKitGesso;
window.recalcularTudo  = recalcularTudo;