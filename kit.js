// ═══════════════════════════════════════════════════════════════════════
// kit.js — HiperCache | Kits rápidos
// ═══════════════════════════════════════════════════════════════════════

// ── 1. DEFINIÇÃO DOS KITS ──────────────────────────────────────────────
const KITS_GESSO = {
  aramado:     ["3076","3113","3019","3023","3014","3132","3035","3037","3010","3006","3032","3021","3058","3020"],
  estruturado: ["3073","3113","3018","3017","3029","3022","3014","3132","3032","3021","3006","3010","3058","3020"],
  paredes:     ["3073","3113","3008","3007","3032","3021","3058","3020","3014","3132"]
};

// ── UTIL ───────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── BUSCA NO MASTER ────────────────────────────────────────────────────
function buscarNaMaster(codigo) {
  const master = window.__hiperMaster;
  if (!master?.length) {
    console.warn("[HiperCache] __hiperMaster vazio ou inexistente!");
    return null;
  }

  const cod = normalizar(String(codigo));

  // O código está no início do campo Nome: "3076 - Descrição"
  return (
    master.find(p => normalizar(String(p.Nome ?? '')).startsWith(cod + ' ')) ||
    master.find(p => normalizar(String(p.text ?? '')).startsWith(cod + ' ')) ||
    null
  );
}

// ── INSERÇÃO VIA CACHE ─────────────────────────────────────────────────
function inserirViaCache($input, produto) {
  console.log(`[HiperCache] ⚡ Inserindo via master → ${produto.Nome}`);

  const data = {
    id:   String(produto.id ?? produto.idProduto),
    text: produto.Nome ?? produto.text,
    ...produto
  };

  // Pega a instância Select2 v3 do elemento
  const s2 = $input.data("select2");
  if (!s2) {
    console.error("[HiperCache] ❌ Instância select2 não encontrada no input");
    return;
  }

  // Simula exatamente o que onSelect() faz internamente
  const anterior = s2.data();
  $input.val(data.id);
  s2.updateSelection(data);
  $input.trigger({ type: "select2-selected", val: data.id, choice: data });
  s2.triggerChange({ added: data, removed: anterior });
}

// ── FUNÇÃO PRINCIPAL ───────────────────────────────────────────────────
async function aplicarKitGesso(nomeKit) {
  const codigos = KITS_GESSO[nomeKit];
  if (!codigos) { console.error(`[HiperCache] Kit inexistente: ${nomeKit}`); return; }

  // Aguarda master (até 10s)
  let t = 0;
  while (!window.__hiperMaster?.length && t++ < 100) await delay(100);
  if (!window.__hiperMaster?.length) { console.error('[HiperCache] ❌ Master não disponível.'); return; }

  console.log(`[HiperCache] ▶ Aplicando kit "${nomeKit}" (${codigos.length} produtos)`);

  for (const codigo of codigos) {
    $(".btn-adicionar-mais-produtos").click();
    await delay(300);

    const $linha = $(".linha-produto:not(.default)").last();
    const $input = $linha.find("input.produto"); // ← Select2 v3

    if (!$input.length) {
      console.error(`[HiperCache] ❌ input.produto não encontrado para "${codigo}"`);
      break;
    }

    const produto = buscarNaMaster(codigo);
    if (!produto) {
      console.error(`[HiperCache] ❌ "${codigo}" não encontrado no master.`);
      $linha.find(".btn-excluir-linha").click();
      break;
    }

    inserirViaCache($input, produto);
    await delay(200);
  }

  console.log(`[HiperCache] ✅ Kit "${nomeKit}" finalizado`);
}

// ── INTERFACE ──────────────────────────────────────────────────────────
function injetarPainelKits() {
  if (document.getElementById("hiper-painel-kits")) return;

  const botoesHTML = Object.keys(KITS_GESSO)
    .map(nome => {
      const label = nome.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      return `
        <button
          class="btn btn-xs btn-default"
          style="margin:2px;font-weight:bold;border:1px solid #ccc"
          onclick="aplicarKitGesso('${nome}')">
          ${label}
        </button>`;
    })
    .join("");

  const container = document.createElement("div");
  container.id = "hiper-painel-kits";
  container.style.cssText = `margin:10px 0;padding:10px;border:1px solid #ddd;background:#fdfdfd;border-radius:4px`;
  container.innerHTML = `
    <div style="font-size:10px;color:#666;margin-bottom:5px;font-weight:bold;text-transform:uppercase">
      🧱 Estruturas de Gesso
    </div>
    <div style="display:flex;flex-wrap:wrap">${botoesHTML}</div>
  `;

  const anchor =
    document.getElementById("hiper-btn-orcamento")?.parentElement ||
    document.querySelector(".barra-botoes-pedido");

  if (anchor) anchor.appendChild(container);
}

// ── OBSERVER ───────────────────────────────────────────────────────────
function iniciarObserver() {
  const target = document.body || document.documentElement;
  if (!target) { console.warn("[HiperCache] DOM não disponível."); return; }

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