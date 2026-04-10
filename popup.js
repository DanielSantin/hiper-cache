function feedback(msg) {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 2500);
}

// Guard: popup.js só funciona dentro do contexto de extensão Chrome
if (typeof chrome === 'undefined' || !chrome.storage?.local) {
  console.warn('[HiperPopup] chrome.storage não disponível — popup carregado fora do contexto de extensão.');
  // Encerra silenciosamente para evitar erros em cascata
  throw new Error('chrome.storage indisponível');
}

async function updateCount() {
  const all = await chrome.storage.local.get(null);
  const ignorar = new Set(['hiper_ativo', 'hiper_orc_letra', 'hiper_orc_counter']);
  const cacheKeys = Object.keys(all).filter(k => !k.startsWith('custo:') && !ignorar.has(k));
  const custoKeys = Object.keys(all).filter(k => k.startsWith('custo:'));
  document.getElementById('count').textContent = cacheKeys.length;
  document.getElementById('custoCount').textContent = custoKeys.length;
}

// ── Toggle ────────────────────────────────────────────────────────────────────
const toggleAtivo  = document.getElementById('toggleAtivo');
const toggleSlider = document.getElementById('toggleSlider');
const toggleThumb  = document.getElementById('toggleThumb');
const dot          = document.getElementById('dot');

function aplicarEstadoToggle(ativo) {
  toggleAtivo.checked           = ativo;
  toggleSlider.style.background = ativo ? '#22c55e' : '#ef4444';
  toggleThumb.style.transform   = ativo ? 'translateX(18px)' : 'translateX(0)';
  dot.style.background          = ativo ? '#22c55e' : '#ef4444';
  dot.style.boxShadow           = ativo ? '0 0 6px #22c55e' : '0 0 6px #ef4444';
}

chrome.storage.local.get('hiper_ativo', (r) => {
  aplicarEstadoToggle(r.hiper_ativo !== false); // padrão: ativo
});

toggleAtivo.addEventListener('change', () => {
  const ativo = toggleAtivo.checked;
  chrome.storage.local.set({ hiper_ativo: ativo });
  aplicarEstadoToggle(ativo);
  feedback(ativo ? '✅ Ativada — recarregue a página' : '⏸ Pausada — recarregue a página');
});

// ── Config de orçamento (letra + contador) ────────────────────────────────────
const letraSelect   = document.getElementById('orcLetra');
const counterInput  = document.getElementById('orcCounter');
const orcSaveBtn    = document.getElementById('orcSaveBtn');
const orcPreview    = document.getElementById('orcPreview');

function atualizarPreview() {
  const letra   = letraSelect.value;
  const counter = parseInt(counterInput.value, 10) || 999;
  const proximo = counter >= 99999 ? 1000 : counter + 1;
  orcPreview.textContent = 'Próximo: ' + letra + proximo;
}

// Carrega valores salvos
chrome.storage.local.get(['hiper_orc_letra', 'hiper_orc_counter'], (r) => {
  letraSelect.value  = r.hiper_orc_letra   || 'A';
  counterInput.value = r.hiper_orc_counter != null ? r.hiper_orc_counter : 999;
  atualizarPreview();
});

letraSelect.addEventListener('change', atualizarPreview);
counterInput.addEventListener('input', atualizarPreview);

orcSaveBtn.addEventListener('click', async () => {
  const letra   = letraSelect.value.toUpperCase();
  const counter = Math.max(999, Math.min(99999, parseInt(counterInput.value, 10) || 999));
  counterInput.value = counter;
  chrome.storage.local.set({ hiper_orc_letra: letra, hiper_orc_counter: counter });
  atualizarPreview();

  // Notifica a aba ativa para atualizar __hiperOrcConfig em memória imediatamente
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (l, c) => {
          window.__hiperOrcConfig = { letra: l, counter: c };
          window.postMessage({ type: 'HIPER_ORC_CONFIG_CHANGED', letra: l, counter: c }, '*');
        },
        args: [letra, counter],
      });
    }
  } catch(e) { /* permissão não disponível, ok */ }

  feedback('✅ Config salva!');
});

// ── Botões ────────────────────────────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', async () => {
  // Preserva as configs de orçamento ao limpar o cache
  const preserve = await chrome.storage.local.get(['hiper_orc_letra', 'hiper_orc_counter', 'hiper_ativo']);
  await chrome.storage.local.clear();
  await chrome.storage.local.set(preserve);
  feedback('✓ Cache limpo!');
  updateCount();
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { if (window.__hiperExportarCustos) window.__hiperExportarCustos(); }
    });
  }
});

updateCount();