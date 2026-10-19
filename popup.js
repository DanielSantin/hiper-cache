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
  const ignorar = new Set(['hiper_ativo', 'otim_select', 'otim_preco', 'hiper_orc_letra']);
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

// ── Toggles de otimização (select e preço) ────────────────────────────────────
// Desligar volta ao comportamento nativo do Hiper na busca / na seleção de item.
function ligarToggleOtim(inputId, sliderId, thumbId, chave) {
  const input  = document.getElementById(inputId);
  const slider = document.getElementById(sliderId);
  const thumb  = document.getElementById(thumbId);

  function aplicar(ativo) {
    input.checked          = ativo;
    slider.style.background = ativo ? '#22c55e' : '#ef4444';
    thumb.style.transform   = ativo ? 'translateX(18px)' : 'translateX(0)';
  }

  chrome.storage.local.get(chave, (r) => aplicar(r[chave] !== false)); // padrão: ligado

  input.addEventListener('change', () => {
    const ativo = input.checked;
    chrome.storage.local.set({ [chave]: ativo });
    aplicar(ativo);
    feedback(ativo ? '✅ Otimização ligada — recarregue a página'
                   : '⏸ Otimização desligada — recarregue a página');
  });
}

ligarToggleOtim('toggleSelect', 'selectSlider', 'selectThumb', 'otim_select');
ligarToggleOtim('togglePreco',  'precoSlider',  'precoThumb',  'otim_preco');

// ── Letra do orçamento (por perfil — o contador é do servidor, não guardamos aqui) ──
const LETRA_PADRAO = 'T';
const orcLetraInput = document.getElementById('orcLetra');

chrome.storage.local.get('hiper_orc_letra', (r) => {
  orcLetraInput.value = (r.hiper_orc_letra || LETRA_PADRAO).toUpperCase();
});

orcLetraInput.addEventListener('change', () => {
  let letra = orcLetraInput.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (!letra) letra = LETRA_PADRAO;
  orcLetraInput.value = letra;
  chrome.storage.local.set({ hiper_orc_letra: letra });
  feedback('✅ Letra salva: ' + letra);
});

// ── Botões ────────────────────────────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', async () => {
  // Preserva as configs (toggles + letra) ao limpar o cache
  const preserve = await chrome.storage.local.get(
    ['hiper_ativo', 'otim_select', 'otim_preco', 'hiper_orc_letra']);
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