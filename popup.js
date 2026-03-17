function feedback(msg) {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 2500);
}

async function updateCount() {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(k => !k.startsWith('custo:') && k !== 'hiper_ativo');
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

// ── Botões ────────────────────────────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', async () => {
  await chrome.storage.local.clear();
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