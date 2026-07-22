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

// ── Leitura das linhas de produto (mesmos seletores/lógica do CadastroPedidoVenda.js) ──
function getLinhasAtivas() {
  return Array.from(document.querySelectorAll('.tabela-produtos .corpo-tabela .linha-produto'))
    .filter(el => !el.classList.contains('default') && !el.classList.contains('linha-cancelada'));
}

function lerCampoMoeda(linha, seletor) {
  const el = linha.querySelector(`${seletor} input`);
  return el ? parseMoeda(el.value) : NaN;
}

// Réplica de recalcularTabela(): quantidadeDeCasasDecimais=0 usa .val() puro (mask 0#),
// os demais usam o valor com máscara de moeda (vírgula decimal) — daí o fallback.
function lerQuantidade(linha) {
  const el = linha.querySelector('.quantidade-produto input');
  if (!el) return NaN;
  const direto = Number(el.value);
  return (el.value !== '' && !isNaN(direto)) ? direto : parseMoeda(el.value);
}

function setDescontoLinha(linha, valor) {
  const el = linha.querySelector('.desconto-produto input');
  if (!el) return false;
  el.value = Math.max(0, valor).toFixed(6).replace('.', ',');
  // O handler que recalcula a linha (recalcularLinha) está preso no 'keyup',
  // não em input/change — sem esse evento específico nada é recalculado.
  ['keyup', 'change', 'input'].forEach(e => dispararEvento(el, e));
  return true;
}

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

  // ── Aplica valor final calculando o desconto exato de cada linha ──────────
  //
  // O campo agregado (.input-desconto-no-total-valor) não dá pra usar pra bater
  // um valor exato: o Hiper reparte esse valor proporcionalmente entre as linhas
  // (arredondando o desconto unitário de cada uma pra 6 casas) e DEPOIS soma os
  // subtotais de cada linha JÁ arredondados pra 2 casas (recalcularLinha). O total
  // final é a soma de N arredondamentos independentes, não um arredondamento único
  // — por isso variava e às vezes não convergia.
  //
  // Em vez de adivinhar um valor pro campo agregado e torcer, calculamos aqui o
  // desconto exato de CADA linha (método dos maiores restos, garante que a soma
  // dos subtotais arredondados bate no centavo) e gravamos direto em cada
  // ".desconto-produto input" — sem passar pelo rateio do Hiper.
  async function aplicar(valorDesejado) {
    const vd = valorDesejado !== undefined ? valorDesejado : parseMoeda(inp.value);
    const di = getDescontoInput();

    if (isNaN(vd) || vd <= 0) { msg.style.color='#c00'; msg.textContent='Valor inválido.'; return; }

    const linhas = getLinhasAtivas();
    if (!linhas.length) { msg.style.color='#c00'; msg.textContent='Nenhum item encontrado na tabela.'; return; }

    msg.style.color = '#888';
    msg.textContent = 'Calculando...';

    // Zera tudo (campo agregado + linhas) pra partir de uma base limpa, sem
    // desconto residual de uma aplicação anterior distorcendo o cálculo.
    if (di) await zerarDesconto(di);
    linhas.forEach(l => setDescontoLinha(l, 0));
    await new Promise(r => setTimeout(r, 150));

    const dados = linhas.map(l => ({
      linha: l,
      valorUnitario: lerCampoMoeda(l, '.valor-unitario-produto'),
      quantidade: lerQuantidade(l),
    })).filter(d => !isNaN(d.valorUnitario) && !isNaN(d.quantidade) && d.quantidade > 0);

    if (!dados.length) { msg.style.color='#c00'; msg.textContent='Não consegui ler valor/quantidade dos itens.'; return; }

    dados.forEach(d => { d.bruto = d.valorUnitario * d.quantidade; });
    const totalBruto = dados.reduce((s, d) => s + d.bruto, 0);

    const freteEl    = document.querySelector('input.valor-frete');
    const totalFrete = freteEl ? (parseMoeda(freteEl.value) || 0) : 0;

    const targetItens = vd - totalFrete;
    if (targetItens < 0)        { msg.style.color='#c00'; msg.textContent='Valor menor que o frete.'; return; }
    if (targetItens > totalBruto + 0.005) { msg.style.color='#c00'; msg.textContent='Valor maior que o total bruto.'; return; }

    const targetCentavos = Math.round(targetItens * 100);

    // Distribuição proporcional ao peso de cada linha no bruto (mesmo critério
    // do Hiper), com o resíduo de centavos alocado pelas maiores partes
    // fracionárias — garante soma EXATA sem depender de tentativa e erro.
    const rawCents = dados.map(d => (d.bruto / totalBruto) * targetCentavos);
    const floors    = rawCents.map(Math.floor);
    let deficit     = targetCentavos - floors.reduce((a, b) => a + b, 0);

    const ordem = rawCents
      .map((v, i) => ({ i, frac: v - floors[i] }))
      .sort((a, b) => b.frac - a.frac);

    const centsFinais = floors.slice();
    for (let k = 0; k < deficit; k++) centsFinais[ordem[k].i] += 1;

    dados.forEach((d, i) => {
      const subtotalFinal = centsFinais[i] / 100;
      const desconto = d.valorUnitario - (subtotalFinal / d.quantidade);
      setDescontoLinha(d.linha, desconto);
    });

    await new Promise(r => setTimeout(r, 150));

    let totalFinal = getValorTotal();
    let exato = !isNaN(totalFinal) && Math.abs(totalFinal - vd) < 0.005;

    // Rede de segurança: só entra em jogo se sobrar 1 centavo por causa de
    // alguma diferença de modo de arredondamento do Hiper (não é mais o
    // mecanismo principal, é só um ajuste fino de última milha).
    if (!exato && !isNaN(totalFinal)) {
      const maior = dados.reduce((m, d) => d.bruto > m.bruto ? d : m, dados[0]);
      const ajuste = totalFinal - vd;
      const descontoAtual = maior.valorUnitario - (centsFinais[dados.indexOf(maior)] / 100 / maior.quantidade);
      setDescontoLinha(maior.linha, descontoAtual + (ajuste / maior.quantidade));
      await new Promise(r => setTimeout(r, 150));
      totalFinal = getValorTotal();
      exato = !isNaN(totalFinal) && Math.abs(totalFinal - vd) < 0.005;
    }

    const descFinal = totalBruto + totalFrete - totalFinal;

    msg.style.color = exato ? '#1a7a1a' : '#b8860b';
    msg.textContent = exato
      ? `Desconto R$ ${descFinal.toFixed(2).replace('.',',')} (${((descFinal/(totalBruto+totalFrete))*100).toFixed(2)}%)`
      : `⚠️ Final: R$ ${totalFinal.toFixed(2).replace('.',',')} (diff R$ ${(totalFinal-vd).toFixed(2).replace('.',',')})`;
  }

  btn.addEventListener('click', () => aplicar());
  inp.addEventListener('keydown', e => { if (e.key==='Enter') aplicar(); });

  // Exposto pra outros módulos (ex: hiper-db.js na restauração de pedido)
  // chamarem o cálculo direto, sem simular clique/digitação no widget.
  window.HiperWidgets = window.HiperWidgets || {};
  window.HiperWidgets.aplicarValorFinal = aplicar;

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
    // Zera também as linhas: senão um desconto residual de uma linha (de uma
    // aplicação anterior) contaminaria a leitura de vt como base do 4,77%.
    getLinhasAtivas().forEach(l => setDescontoLinha(l, 0));
    await new Promise(r => setTimeout(r, 150));

    const vt = getValorTotal();
    if (isNaN(vt) || vt <= 0) return;

    // Reutiliza o cálculo exato por linha de aplicar()
    await aplicar(vt * (1 - 0.0477));
  });

  console.info('[HiperCache] Widget "Valor Final" injetado.');
}

if (document.readyState !== 'loading') injetarWidget();
else document.addEventListener('DOMContentLoaded', injetarWidget);

new MutationObserver(() => {
  if (!document.getElementById('hiper-widget-valor-final') && getDescontoInput()) injetarWidget();
}).observe(document.body || document.documentElement, { childList: true, subtree: true });