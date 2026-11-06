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
  // Preserva as configs (toggles, letra) e a CHAVE ao limpar o cache: a partir
  // do estágio 2 a extensão não traz mais a chave, então perder aqui seria
  // ter que digitar de novo.
  const preserve = await chrome.storage.local.get(
    ['hiper_ativo', 'otim_select', 'otim_preco', 'hiper_orc_letra', 'hiper_api_key', 'vendedor']);
  await chrome.storage.local.clear();
  await chrome.storage.local.set(preserve);
  feedback('✓ Cache limpo!');
});

// ── Chave de acesso da API ────────────────────────────────────────────────────
// Guardada em chrome.storage.local (hiper_api_key); o interceptor manda em toda
// chamada e entrega ao site. Ver background.js e hiper-database/core/chave.py.
const chaveInp    = document.getElementById('chaveApi');
const chaveStatus = document.getElementById('chaveStatus');

chrome.storage.local.get('hiper_api_key', (r) => {
  chaveInp.value = r.hiper_api_key || '';
  chaveStatus.textContent = r.hiper_api_key ? 'guardada' : 'nenhuma';
});

document.getElementById('chaveVer').addEventListener('click', () => {
  chaveInp.type = chaveInp.type === 'password' ? 'text' : 'password';
});

document.getElementById('chaveSalvar').addEventListener('click', async () => {
  const v = chaveInp.value.trim();
  if (v) await chrome.storage.local.set({ hiper_api_key: v });
  else await chrome.storage.local.remove('hiper_api_key');
  chaveStatus.textContent = v ? 'guardada' : 'nenhuma';
  feedback(v ? '✅ Chave salva — recarregue a página' : 'Chave apagada');
});

document.getElementById('chaveTestar').addEventListener('click', async () => {
  chaveStatus.textContent = 'testando…';
  try {
    const r = await fetch('https://api.sistema.santin.tec.br/chave/verificar', {
      headers: { 'X-Chave': chaveInp.value.trim(), 'X-Hiper-Ext': chrome.runtime.getManifest().version },
      cache: 'no-store',
    });
    const j = await r.json();
    chaveStatus.textContent = j.valida ? '✅ válida' : '❌ inválida';
  } catch (e) {
    chaveStatus.textContent = 'sem conexão';
  }
});