// ═══════════════════════════════════════════════════════════════════════════════
// hiper-widgets.js — Widget "Valor Final" + Checkbox PIX
// ═══════════════════════════════════════════════════════════════════════════════

function parseMoeda(str) {
  if (!str) return NaN;
  const s = str.replace(/[^\d,\.]/g, '');
  const commas = (s.match(/,/g)||[]).length, dots = (s.match(/\./g)||[]).length;
  if (commas===1 && dots===0) return parseFloat(s.replace(',','.'));
  if (dots===1 && commas===0) return parseFloat(s);
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
    if (isNaN(atual) || atual === 0) return; // já está zerado, não precisa esperar

    di.value = '0,00';
    ['input','change','blur'].forEach(e => dispararEvento(di, e));
    await new Promise(r => setTimeout(r, 300));
  }

  async function aplicar() {
    const vd = parseMoeda(inp.value);
    const di = getDescontoInput();

    if (isNaN(vd) || vd <= 0) { msg.style.color='#c00'; msg.textContent='Valor inválido.'; return; }
    if (!di)                  { msg.style.color='#c00'; msg.textContent='Campo de desconto não encontrado.'; return; }

    await zerarDesconto(di);

    const vt = getValorTotal();
    if (isNaN(vt) || vt <= 0) { msg.style.color='#c00'; msg.textContent='Não foi possível ler o total.'; return; }
    if (vd > vt)               { msg.style.color='#c00'; msg.textContent='Valor maior que o total bruto.'; return; }

    const desc = vt - vd;
    const ds   = desc.toFixed(2).replace('.', ',');
    di.value   = ds;
    ['input','change','blur'].forEach(e => dispararEvento(di, e));

    msg.style.color = '#1a7a1a';
    msg.textContent = `Desconto R$ ${ds} (${((desc/vt)*100).toFixed(2)}%)`;
  }

  btn.addEventListener('click', aplicar);
  inp.addEventListener('keydown', e => { if (e.key==='Enter') aplicar(); });

  // Checkbox desconto PIX 4,77%
  const pixRow = document.createElement('label');
  pixRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;cursor:pointer;color:#0d6b0d;font-weight:600;';
  pixRow.innerHTML = '<input type="checkbox" id="hiper-chk-pix" style="width:15px;height:15px;cursor:pointer;"> 💸 Desconto PIX 4,77%';
  w.appendChild(pixRow);

  document.getElementById('hiper-chk-pix').addEventListener('change', async function() {
    const di = getDescontoInput();
    if (!di) return;

    if (!this.checked) {
      di.value = '0,00';
      ['input','change','blur'].forEach(e => dispararEvento(di, e));
      const msgEl = document.getElementById('hiper-vf-msg');
      if (msgEl) msgEl.textContent = '';
      return;
    }

    await zerarDesconto(di);

    const vt = getValorTotal();
    if (isNaN(vt) || vt <= 0) return;

    const desc = vt * 0.0477;
    di.value   = desc.toFixed(2).replace('.', ',');
    ['input','change','blur'].forEach(e => dispararEvento(di, e));

    const msgEl = document.getElementById('hiper-vf-msg');
    if (msgEl) {
      msgEl.style.color = '#1a7a1a';
      msgEl.textContent = `PIX: -R$ ${desc.toFixed(2).replace('.',',')} (4,77%)`;
    }
  });

  console.info('[HiperCache] Widget "Valor Final" injetado.');
}

if (document.readyState !== 'loading') injetarWidget();
else document.addEventListener('DOMContentLoaded', injetarWidget);

new MutationObserver(() => {
  if (!document.getElementById('hiper-widget-valor-final') && getDescontoInput()) injetarWidget();
}).observe(document.body || document.documentElement, { childList: true, subtree: true });
