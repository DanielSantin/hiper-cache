// ═══════════════════════════════════════════════════════════════════════
// kit.js — HiperCache | Kits rápidos + Fórmulas
// ═══════════════════════════════════════════════════════════════════════

// ── 1. DEFINIÇÃO DOS KITS ──────────────────────────────────────────────
const KITS_GESSO = {
  aramado:     ["3076","3113","3019","3023","3014","3132","3035","3037","3010","3006","3032","3021","3058","3020"],
  estruturado: ["3073","3113","3018","3017","3029","3022","3014","3132","3032","3021","3006","3010","3058","3020"],
  paredes:     ["3073","3113","3008","3007","3032","3021","3058","3020","3014","3132"]
};

// ── 2. FÓRMULAS (A=área, P=perímetro) retornam quantidade ─────────────
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
    "3032": (A, P) => P * 5 / 1000,
    "3021": (A, P) => P * 5,
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
    "3032": (A, P) => (A / 2.88) * 35 / 1000 + (P / 3) * 11 / 1000,
    "3021": (A, P) => (A / 2.88) * 35   + (P / 3) * 11,
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
    "3032": (A, P) => (A / 2.88 * 2) * 35 / 1000,
    "3021": (A, P) => (A / 2.88 * 2) * 35,
    "3058": (A, P) => (A * 0.7 / 3) * 11,
    "3020": (A, P) => (A * 0.7 / 3) * 11,
    "3014": (A, P) => A * 3 / 90,
    "3132": (A, P) => A * 3 / 45,
  }
};

// Labels dos inputs por kit
const KIT_INPUTS = {
  aramado:     [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }],
  estruturado: [{ key: "A", label: "Área (m²)" }, { key: "P", label: "Perímetro (ml)" }],
  paredes:     [{ key: "A", label: "M² de parede" }],
};

// ── ESTADO ─────────────────────────────────────────────────────────────
// kitsAtivos: Map<nomeKit, { A, P, linhas: [{ codigo, $linha }] }>
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

// ── SETAR QUANTIDADE ───────────────────────────────────────────────────
function setarQuantidade($inputQtd, valor) {
  const nativeInput = $inputQtd[0];
  if (!nativeInput) return;

  // 1. Setter nativo (necessário para frameworks que usam Object.defineProperty)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter ? setter.call(nativeInput, valor) : (nativeInput.value = valor);

  // 2. Eventos nativos com bubbles
  nativeInput.dispatchEvent(new Event('input',  { bubbles: true }));
  nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
  nativeInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

  // 3. jQuery trigger (para listeners jQuery diretos)
  $inputQtd.trigger('input').trigger('change').trigger('keyup');

  // 4. Angular: notifica o $scope se existir
  try {
    const scope = angular.element(nativeInput).scope();
    if (scope) {
      scope.$apply(function() {
        // tenta setar via ng-model diretamente
        const ngModel = $inputQtd.controller
          ? $inputQtd.controller('ngModel')
          : angular.element(nativeInput).data('$ngModelController');
        
        if (ngModel) {
          ngModel.$setViewValue(String(valor));
          ngModel.$render();
        }
      });
    }
  } catch(e) {
    // Angular não disponível ou erro de scope, ignora
  }

  // 5. Blur/focus para forçar validação de campos que só atualizam ao sair
  nativeInput.dispatchEvent(new Event('blur',  { bubbles: true }));
  nativeInput.dispatchEvent(new Event('focus', { bubbles: true }));
}

// ── RECALCULAR TUDO ────────────────────────────────────────────────────
// Agrupa por código, soma quantidades de todos os kits ativos, aplica nas linhas
function recalcularTudo() {
  // Monta mapa codigo → quantidade total
  const totais = new Map(); // codigo → { qtd, linhas: [$linha, ...] }

  kitsAtivos.forEach((estado, nomeKit) => {
    const A = num(estado.A);
    const P = num(estado.P ?? 0);
    const formulas = FORMULAS_GESSO[nomeKit] ?? {};

    estado.linhas.forEach(({ codigo, $linha }) => {
      if (!$.contains(document, $linha[0])) return; // linha deletada → ignora

      const fn = formulas[codigo];
      const qtd = fn ? fn(A, P) : 0;

      if (!totais.has(codigo)) {
        totais.set(codigo, { qtd: 0, linhas: [] });
      }
      const entry = totais.get(codigo);
      entry.qtd += qtd;
      entry.linhas.push($linha);
    });
  });

  // Aplica nos inputs
  totais.forEach(({ qtd, linhas }) => {
    // Se o mesmo código aparece em múltiplos kits, aplica a soma na primeira
    // linha viva e zera as repetidas (ou divide — aqui somamos na primeira)
    const linhasVivas = linhas.filter(l => $.contains(document, l[0]));
    if (!linhasVivas.length) return;

    // Primeira linha recebe a soma total
    const $qtd = linhasVivas[0].find(".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']").first();
    if ($qtd.length) setarQuantidade($qtd, Math.ceil(qtd));

    // Linhas extras do mesmo código (de kits diferentes) recebem 0 ou podem ser ignoradas
    // — como itens repetidos são inseridos juntos, setar a mesma qtd nas outras
    for (let i = 1; i < linhasVivas.length; i++) {
      const $qtdExtra = linhasVivas[i].find(".quantidade-produto input, input.quantidade-unitaria, input[ng-model*='quantidade']").first();
      if ($qtdExtra.length) setarQuantidade($qtdExtra, 0);
    }
  });
}

// ── REMOVER KIT ────────────────────────────────────────────────────────
function removerKit(nomeKit) {
  const estadoRemovido = kitsAtivos.get(nomeKit);
  kitsAtivos.delete(nomeKit);
  atualizarBotaoKit(nomeKit, false);

  if (estadoRemovido) {
    // Códigos que ainda existem em algum kit ativo
    const codigosAindaAtivos = new Set();
    kitsAtivos.forEach((estado) => {
      estado.linhas.forEach(({ codigo }) => codigosAindaAtivos.add(codigo));
    });

    // Remove do DOM as linhas que eram exclusivas do kit removido
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
  // Toggle: se já está ativo, remove
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

  for (let i = 0; i < codigos.length; i++) $(".btn-adicionar-mais-produtos").click();

  const inicio = Date.now();
  while (Date.now() - inicio < 3000) {
    if ($(".linha-produto:not(.default)").length >= codigos.length) break;
    await delay(50);
  }

  const todasLinhas = $(".linha-produto:not(.default)").toArray();
  const linhasAlvo  = todasLinhas.slice(-codigos.length);

  await Promise.all(linhasAlvo.map((linha, i) => {
    const $input = $(linha).find("input.produto");
    if ($input.length) inserirViaCache($input, produtos[i]);
  }));

  // Salva estado
  kitsAtivos.set(nomeKit, {
    A: 0, P: 0,
    linhas: linhasAlvo.map((linha, i) => ({ codigo: codigos[i], $linha: $(linha) }))
  });

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

  // Mostra/oculta linha de inputs do kit
  $(`#hiper-row-${nome}`).toggle(ativo);
}

// ── INTERFACE ──────────────────────────────────────────────────────────
function injetarPainelKits() {
  if (document.getElementById("hiper-painel-kits")) return;

  // Botões
  const botoesHTML = Object.keys(KITS_GESSO).map(nome => {
    const label = nome.charAt(0).toUpperCase() + nome.slice(1);
    return `<button
      id="hiper-btn-kit-${nome}"
      class="btn btn-xs btn-default"
      style="margin:2px;font-weight:bold;border:1px solid #ccc"
      onclick="aplicarKitGesso('${nome}')">
      ${label}
    </button>`;
  }).join('');

  // Linhas de inputs por kit (ocultas até o kit ser ativado)
  const linhasInputHTML = Object.keys(KITS_GESSO).map(nome => {
    const campos = KIT_INPUTS[nome] ?? [{ key: 'A', label: 'Área (m²)' }];
    const inputsHTML = campos.map(({ key, label }) => `
      <label style="font-size:11px;color:#555;margin-right:2px;margin-left:8px">${label}</label>
      <input
        id="hiper-input-${nome}-${key}"
        type="number" min="0" step="0.1"
        placeholder="0"
        data-kit="${nome}" data-key="${key}"
        style="width:75px;padding:2px 5px;font-size:12px;border:1px solid #aaa;border-radius:3px;height:24px"
      />
    `).join('');

    return `
      <div id="hiper-row-${nome}" style="display:none;align-items:center;flex-wrap:wrap;margin-top:4px;padding:4px 6px;background:#f0f4ff;border-radius:3px;border-left:3px solid #2c7be5">
        <span style="font-size:11px;font-weight:bold;color:#2c7be5;min-width:70px">${nome.charAt(0).toUpperCase() + nome.slice(1)}</span>
        ${inputsHTML}
      </div>
    `;
  }).join('');

  const container = document.createElement("div");
  container.id = "hiper-painel-kits";
  container.style.cssText = `margin:10px 0;padding:10px;border:1px solid #ddd;background:#fdfdfd;border-radius:4px`;
  container.innerHTML = `
    <div style="font-size:10px;color:#666;margin-bottom:6px;font-weight:bold;text-transform:uppercase">
      🧱 Estruturas de Gesso
    </div>
    <div style="display:flex;flex-wrap:wrap;align-items:center">${botoesHTML}</div>
    <div id="hiper-linhas-kits">${linhasInputHTML}</div>
  `;

  const anchor =
    document.getElementById("hiper-btn-orcamento")?.parentElement ||
    document.querySelector(".barra-botoes-pedido");

  if (anchor) anchor.appendChild(container);

  // Evento único delegado para todos os inputs de kits
  const linhasKits = document.getElementById("hiper-linhas-kits");
  if (!linhasKits) {
    console.warn("[HiperCache] ⚠️ #hiper-linhas-kits não encontrado, evento não registrado.");
    return;
  }
  linhasKits.addEventListener("input", function(e) {
    const el = e.target;
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