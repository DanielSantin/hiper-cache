// ═══════════════════════════════════════════════════════════════════════
// Teste do algoritmo de desconto/aumento do "Valor total" (hiper-widgets.js).
//
//   node --test
//
// Carrega o hiper-widgets.js real num sandbox com uma store falsa que faz a
// conta do Hiper: subtotal da linha = round2(q × (v − d)) e total do pedido =
// round2(Σ subtotais) + frete. Pedidos aleatórios (semente fixa, sempre os
// mesmos): o total final tem que bater no centavo, descontos ≥ 0 e, no
// aumento, preços com 2 casas.
// ═══════════════════════════════════════════════════════════════════════
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const r2 = (x) => Math.round(x * 100) / 100;

function storeFalsa(itens, frete) {
  const linha = (id) => itens.find(i => i.id === id);
  const produtos = {
    itens,
    setDescontoUnitario(id, d) { linha(id).descontoUnitario = d; },
    setValorUnitario(id, v) { linha(id).valorUnitario = v; },
  };
  const descontos = {
    valorDoFrete: frete,
    limparDescontos() { itens.forEach(i => { i.descontoUnitario = 0; }); },
    get totalDoPedido() {
      const soma = itens.filter(i => !i.cancelado)
        .reduce((s, i) => s + r2(i.quantidade * (i.valorUnitario - (i.descontoUnitario || 0))), 0);
      return r2(soma) + frete;
    },
  };
  return { produtos: () => produtos, descontos: () => descontos };
}

function carregar() {
  const noop = () => {};
  const ctx = {
    console: { log: noop, info: noop, warn: noop, error: console.error },
    setTimeout: () => 0, MutationObserver: class { observe() {} },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop,
                body: { appendChild: noop }, documentElement: {},
                createElement: () => ({ style: {}, appendChild: noop }), head: { appendChild: noop } },
    Number, Math,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'hiper-widgets.js'), 'utf8'), ctx, { filename: 'hiper-widgets.js' });
  return ctx;
}

// Gerador com semente (mesmos pedidos a cada execução)
function aleatorio(semente) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function pedidoAleatorio(rnd) {
  const n = 1 + Math.floor(rnd() * 15);
  const itens = [];
  for (let i = 0; i < n; i++) {
    const inteiro = rnd() < 0.7;
    itens.push({
      id: 'L' + i, idProdutoHiperOnline: 1000 + i, cancelado: false, descontoUnitario: 0,
      quantidade: inteiro ? 1 + Math.floor(rnd() * 400) : r2(0.5 + rnd() * 80),
      valorUnitario: r2(0.3 + rnd() * 250),
    });
  }
  const frete = rnd() < 0.3 ? r2(rnd() * 150) : 0;
  return { itens, frete };
}

test('desconto: 3000 pedidos aleatórios batem o total no centavo', () => {
  const w = carregar();
  const rnd = aleatorio(12345);
  for (let k = 0; k < 3000; k++) {
    const { itens, frete } = pedidoAleatorio(rnd);
    w.__hiperPedido = storeFalsa(itens, frete);
    const cheio = w.__hiperPedido.descontos().totalDoPedido;
    const alvo = r2(frete + (cheio - frete) * (0.5 + rnd() * 0.5));
    if (!(alvo - frete > 0)) continue;
    const r = w.HiperWidgets.aplicarValorTotal(alvo);
    assert.ok(r.ok, `pedido ${k}: ${r.msg}`);
    assert.ok(Math.abs(w.__hiperPedido.descontos().totalDoPedido - alvo) < 0.005, `pedido ${k}: total diferente do alvo`);
    itens.forEach(i => assert.ok(i.descontoUnitario >= 0, `pedido ${k}: desconto negativo`));
  }
});

test('aumento: só com permitirAumento, e 2000 pedidos batem no centavo com preços de 2 casas', () => {
  const w = carregar();
  const rnd = aleatorio(777);
  for (let k = 0; k < 2000; k++) {
    const { itens, frete } = pedidoAleatorio(rnd);
    w.__hiperPedido = storeFalsa(itens, frete);
    const cheio = w.__hiperPedido.descontos().totalDoPedido;
    const alvo = r2(cheio * (1.001 + rnd() * 0.3));
    const sem = w.HiperWidgets.aplicarValorTotal(alvo);
    assert.ok(sem.precisaConfirmar && !sem.ok, `pedido ${k}: subiu preço sem confirmação`);
    const r = w.HiperWidgets.aplicarValorTotal(alvo, { permitirAumento: true });
    assert.ok(r.ok, `pedido ${k}: ${r.msg}`);
    assert.ok(Math.abs(w.__hiperPedido.descontos().totalDoPedido - alvo) < 0.005, `pedido ${k}: total diferente`);
    itens.forEach(i => assert.strictEqual(r2(i.valorUnitario), i.valorUnitario, `pedido ${k}: preço com mais de 2 casas`));
  }
});

test('casos de borda: alvo ≤ frete, alvo inválido, linha cancelada fica de fora', () => {
  const w = carregar();
  w.__hiperPedido = storeFalsa([{ id: 'a', idProdutoHiperOnline: 1, quantidade: 2, valorUnitario: 10 }], 30);
  assert.ok(!w.HiperWidgets.aplicarValorTotal(25).ok);
  assert.ok(!w.HiperWidgets.aplicarValorTotal(0).ok);
  const itens = [
    { id: 'a', idProdutoHiperOnline: 1, quantidade: 3, valorUnitario: 10 },
    { id: 'b', idProdutoHiperOnline: 2, quantidade: 1, valorUnitario: 99, cancelado: true },
  ];
  w.__hiperPedido = storeFalsa(itens, 0);
  assert.ok(w.HiperWidgets.aplicarValorTotal(25).ok);
  assert.ok(Math.abs(w.__hiperPedido.descontos().totalDoPedido - 25) < 0.005);   // a cancelada não entra na conta
});
