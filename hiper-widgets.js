// ═══════════════════════════════════════════════════════════════════════════════
// hiper-widgets.js — Widget "Valor Final" + Checkbox PIX
// ═══════════════════════════════════════════════════════════════════════════════

function parseMoeda(str) {
  if (!str) return NaN;
  const s = str.replace(/[^\d,\.]/g, '');
  const commas = (s.match(/,/g)||[]).length, dots = (s.match(/\./g)||[]).length;
  if (commas===1 && dots===0) return parseFloat(s.replace(',','.'));
  if (dots===1  && commas===0) return parseFloat(s);
  return parseFloat(s.replace(/\./g,'').replace(',','.'));
}

const getValorTotal    = () => { const el = document.querySelector('.valor-total'); return el ? parseMoeda(el.textContent.trim()) : NaN; };
const getDescontoInput = () => document.querySelector('.input-desconto-no-total-valor');
const dispararEvento   = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));

function injetarWidget() {
  if (document.getElementById('hiper-widget-valor-final')) return;
  const descEl = getDescontoInput();
  if (!descEl) return;
  const anchor = descEl.closest('.desconto-input-group') || descEl.parentElement;
  if (!anchor) return;

  const w = document.createElement('div');
  w.id = 'hiper-widget-valor-final';
  w.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;padding:6px 8px;background:#f0f7ff;border:1px solid #b3d4f5;border-radius:4px;font-size:12px;';
  w.innerHTML = `
    <span style="white-space:nowrap;color:#555;font-weight:600;">💰 Valor final:</span>
    <input id="hiper-vf-input" type="text" placeholder="Ex: 2000,00"
      style="width:110px;padding:3px 6px;border:1px solid #aac;border-radius:3px;font-size:12px;text-align:right;"/>
    <button id="hiper-vf-btn"
      style="padding:3px 10px;background:#1a73e8;color:#fff;border:none;border-radius:3px;font-size:12px;cursor:pointer;">
      Aplicar
    </button>
    <span id="hiper-vf-msg" style="color:#888;font-size:11px;"></span>
  `;
  anchor.parentElement.insertBefore(w, anchor.nextSibling);

  const inp = document.getElementById('hiper-vf-input');
  const btn = document.getElementById('hiper-vf-btn');
  const msg = document.getElementById('hiper-vf-msg');

  async function zerarDesconto(di) {
    const atual = parseMoeda(di.value);
    if (isNaN(atual) || atual === 0) return;

    di.value = '0,00';
    ['input', 'change', 'blur'].forEach(e => dispararEvento(di, e));

    await new Promise(resolve => {
      const MAX_TENTATIVAS = 20;
      let tentativas = 0;
      const checar = setInterval(() => {
        const valorAtual = parseMoeda(getDescontoInput()?.value);
        tentativas++;
        if (valorAtual === 0 || isNaN(valorAtual) || tentativas >= MAX_TENTATIVAS) {
          clearInterval(checar);
          resolve();
        }
      }, 50);
    });
  }

  // ── Aplica valor final com loop de correção de arredondamento ─────────────
  async function aplicar(valorDesejado) {
    const vd = valorDesejado !== undefined ? valorDesejado : parseMoeda(inp.value);
    const di = getDescontoInput();

    if (isNaN(vd) || vd <= 0) { msg.style.color='#c00'; msg.textContent='Valor inválido.'; return; }
    if (!di)                  { msg.style.color='#c00'; msg.textContent='Campo de desconto não encontrado.'; return; }

    msg.style.color = '#888';
    msg.textContent = 'Calculando...';

    await zerarDesconto(di);

    const vt = getValorTotal();
    if (isNaN(vt) || vt <= 0) { msg.style.color='#c00'; msg.textContent='Não foi possível ler o total.'; return; }
    if (vd > vt)               { msg.style.color='#c00'; msg.textContent='Valor maior que o total bruto.'; return; }

    // Loop de correção: ajusta desconto até total resultante bater com vd
    let descAtual = vt - vd;
    const MAX_TENTATIVAS = 6;

    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      di.value = descAtual.toFixed(6).replace('.', ',');
      ['input', 'change', 'blur'].forEach(e => dispararEvento(di, e));

      await new Promise(r => setTimeout(r, 200));

      const totalResultante = getValorTotal();
      const diff = totalResultante - vd;

      if (Math.abs(diff) < 0.005) break; // ✅ convergiu

      descAtual += diff;
    }

    const totalFinal = getValorTotal();
    const descFinal  = vt - totalFinal;
    const exato      = Math.abs(totalFinal - vd) < 0.005;

    msg.style.color = exato ? '#1a7a1a' : '#b8860b';
    msg.textContent = exato
      ? `Desconto R$ ${descFinal.toFixed(2).replace('.',',')} (${((descFinal/vt)*100).toFixed(2)}%)`
      : `⚠️ Final: R$ ${totalFinal.toFixed(2).replace('.',',')} (diff R$ ${(totalFinal-vd).toFixed(2).replace('.',',')})`;
  }

  btn.addEventListener('click', () => aplicar());
  inp.addEventListener('keydown', e => { if (e.key==='Enter') aplicar(); });

  // Botão desconto PIX 4,77%
  const pixBtn = document.createElement('button');
  pixBtn.id = 'hiper-btn-pix';
  pixBtn.textContent = '💸 Desconto PIX 4,77%';
  pixBtn.style.cssText = 'margin-top:6px;padding:3px 10px;background:#0d6b0d;color:#fff;border:none;border-radius:3px;font-size:12px;cursor:pointer;font-weight:600;';
  w.appendChild(pixBtn);

  pixBtn.addEventListener('click', async function() {
    const di = getDescontoInput();
    if (!di) return;

    await zerarDesconto(di);

    const vt = getValorTotal();
    if (isNaN(vt) || vt <= 0) return;

    // Reutiliza o loop de correção via aplicar()
    await aplicar(vt * (1 - 0.0477));
  });

  console.info('[HiperCache] Widget "Valor Final" injetado.');
}

if (document.readyState !== 'loading') injetarWidget();
else document.addEventListener('DOMContentLoaded', injetarWidget);

new MutationObserver(() => {
  if (!document.getElementById('hiper-widget-valor-final') && getDescontoInput()) injetarWidget();
}).observe(document.body || document.documentElement, { childList: true, subtree: true });