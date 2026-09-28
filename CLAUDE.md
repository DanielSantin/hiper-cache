# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Chrome Extension (Manifest V3, vanilla JS, no bundler/framework) that augments the Hiper ERP's own
web app (`tagdrywall.hiper.com.br`) for a construction-materials store: quote/orçamento generation,
inventory sync, profit-margin widgets, kit formulas, CPF autofill. Talks to the FastAPI backend in
`../dbApi` (`api.sistema.santin.tec.br`). Distributed as an **unlisted** Chrome Web Store item (real
users, not just dev machines) — see `RELEASE.md` before touching anything deploy-related.

## Running / developing

No build step, no bundler, no test suite (`npm`/`node_modules` don't exist here — this is plain
`<script>`-tag JS). To iterate:

1. `chrome://extensions` → enable Developer mode → "Load unpacked" → select this folder.
2. After any change, click the reload icon on the extension card, then reload the Hiper tab.
3. To ship: bump `"version"` in `manifest.json`, run `./scripts/build-zip.ps1`, upload to the Chrome
   Web Store dev dashboard. Full process (including why the old self-hosted `.crx`/`.pem` flow was
   abandoned) is in `RELEASE.md`. **A manifest/module-path change means a new version + Web Store
   review (days to ~2 weeks) before it reaches real machines** — factor that into how you batch changes.

## Architecture

### Two JS worlds, one bridge

`interceptor.js` is the **only** file declared as a `content_script` in `manifest.json` — it's the
only code with `chrome.*` access (isolated world). Every other `.js` file here is listed under
`web_accessible_resources` and gets injected into the **page's own JS world** by `interceptor.js`
(`MODULES` array → sequential `<script src="chrome-extension://...">` tags), which is why they can
call the Hiper page's own jQuery (`$`) directly but **cannot** call `chrome.*` at all — that's a hard
browser boundary, not a bug. Anything needing both (e.g. reading `chrome.storage`) has to go through
`window.postMessage` to `interceptor.js` and back (see the `HIPER_CACHE_*` message handlers there).
`hiper-num-utils.js` is loaded first in `MODULES` specifically so every later module can use
`parseNumeroBR` without a load-order dependency.

Because module scripts share one global `window`, **two files must never declare a same-named global
with different contracts** — this bit us once already (`num()` in `kit.js` vs `parseMoedaOrc()` in
`hiper-orcamento.js` were duplicate copies of the same BR-number parser; now both delegate to
`parseNumeroBR` in `hiper-num-utils.js`). `parseNumeroBR` itself always returns `NaN` on unparseable
input rather than coercing to `0` — `hiper-widgets.js` relies on that `NaN` to tell "typed
something unreadable" (ignore the edit) apart from a real value; `kit.js`/
`hiper-orcamento.js` want a plain `0` and add `isNaN(v) ? 0 : v` themselves at the call site. Don't
"simplify" that split — the two contracts aren't interchangeable.

### `background.js` (service worker) only exists for two `chrome.*`-only jobs

1. `chrome.scripting.executeScript({ world: 'MAIN' })` to blank out `window.print` on the
   `/Imprimir?tag_view=1` page — bypasses page CSP, which only a background/service-worker context
   can do.
2. `chrome.webRequest.onCompleted` on the **old** API's `atualizar-situacao` PUT requests, relayed
   `background.js → interceptor.js → postMessage`. **Obsolete since 2026-09**: the new pedido
   screen doesn't use that API, and `hiper-sync.js` no longer listens for the message. It's left in
   place only because removing a permission means a new Web Store review.

### `hiper-sync.js`: pedidos only *notify* the backend

When Hiper's new API (`prd-ms-pedidodevenda-api`) is **sent** `pedidos-de-venda/salvar`,
`atualizar-situacao-pedido-de-venda` or `faturamento/faturar-pedidos`, it immediately posts
`POST /hiper-pedido-mudou { ids, recentes }` (`fetch` with `keepalive`, `text/plain` to skip the CORS
preflight). It doesn't wait for Hiper's response, so the notice isn't lost if the tab closes; the
backend waits ~10 s before reading. The ids come from the request (`id` on salvar, `pedidosIds` on
the others). A new order (`id: null`) and a batch selection by filter become `recentes: true`, and
the new order's GUID is sent again once `salvar` responds (`data` = GUID). The backend
reads the order and reconciles stock itself (`hiper-database/routers/pedidos_sync.py`). Don't
rebuild items or state client-side again: doing that is what broke with every Hiper UI change. NF-e
stock entry (`confirmar-importacao`) and the catalog cache (`_simularResposta`) live in the same
file.

Nothing product/order-number related lives in `background.js` anymore — it used to (idempotency-key
counter over `chrome.storage`), but that was replaced with a direct `fetch` from `hiper-orcamento.js`
straight to the backend once we confirmed CORS already allows `tagdrywall.hiper.com.br` and the
counter's atomicity is guaranteed server-side, not by this extension.

### `hiper-orcamento.js` and `resumido-gerador.js` are each two files in one

Both build a full standalone HTML string (quote / "resumido" report), wrap it in a `Blob`, and
`window.open()` it in a new tab. Everything inside that generated HTML — including its own
`<script>` block (functions like `num(id)`, `el(id)`, margin/PIX calculators) — runs in a **completely
separate document with its own global scope**. It never sees `kit.js`, `hiper-num-utils.js`, or
anything else injected into the main Hiper page, and vice versa. The popup talks back to the main
page only via `window.opener.__hiperDBSave(...)` (exposed by `hiper-db.js`) — don't assume a function
defined in the main-page part of either file is reachable from its own embedded `<script>`, or vice
versa.

**Trap this already caused once:** `hiper-orcamento.js` has its own inline `parseMoedaOrc` inside the
embedded `<script>` (near `fmt`/`fmtNum`), textually identical to the one near the top of the file
used by the main-page part. These look like a copy-paste duplicate — they are **not**: the popup
can't call `parseNumeroBR` (from `hiper-num-utils.js`) or anything else outside its own inline
`<script>`, so it needs a fully self-contained copy. Before "deduplicating" any function that appears
twice in this file, check whether the second occurrence is past the `<script>` tag inside the
template-literal HTML string — line-number proximity or identical source text does not mean same
scope.

### `hiper-ui.js` — single mount point for injected widgets

Other modules never insert their widgets into the pedido-venda DOM directly; they call
`window.__hiperUI.registrar({ id, ordem, render, alvo?, aoDesmontar? })` once. `alvo()` returns
`{ parent, ref }` (where to insert) or `null` (anchor not on screen → widget removed, then
`aoDesmontar(el)` restores any foreign DOM it touched). A throttled MutationObserver re-evaluates
every widget on each DOM change, so it copes with late-loading microfrontends and re-renders.
Widgets without `alvo` fall back to the legacy `.parte-4 > div` anchor, which only exists on the
**old** hash-routed screen (`#/pedido-venda/novo`).

The pedido screen was replaced (2026-09) by a microfrontend at `/vendas/pedido-de-venda/cadastro`
(path-based, **no hash**, no `.linha-produto` rows). Current placements: orçamento button right after
the native "Salvar orçamento" in `.cadastro-pedido-de-venda-menu-lateral__buttons`; kits panel takes
over the global `#footer` (normally `.hidden`) while the cadastro is on screen. Anything still keyed
on `location.hash` or `.linha-produto` is pending migration.

### `hiper-pedido-store.js` — read/write the new pedido screen through its Pinia stores

The microfrontend is Vue 3 + Pinia (minified bundle kept in `referencias/hiper_javascript/`; `Ra(...)`
there is `defineStore`). Don't scrape its DOM: `window.__hiperPedido.produtos()` /
`.descontos()` / `.store(id)` return the live stores the Hiper itself serializes on save.
`produtos().itens[*].idProdutoHiperOnline` is the same id the rest of the extension calls
`idProduto`. `extrairDadosPedido()` in `hiper-orcamento.js` (used by orçamento, lucro, resumido)
reads from here. `hiper-db.js` (recuperar orçamento) writes through it: items restored with the
saved quantities, kits re-linked to those lines via `codigosEquivalentes()` from `kit.js` (the DB
stores the line's final product, e.g. massa 25kg / montante 48, not the kit's base code), then the
difference to the saved total becomes a discount via `descontos().setValorDeDesconto()` once every
line's background price refresh (`isLoadingPrecoDeVenda`) settles. Auto-restore reads `recuperar=`
from the query string (new URL) or from inside the hash (old `/v1/#/pedido-venda/novo?recuperar=X`
links still sent by tagBot/hiper-sites).

### `hiper-cache.js` — shared state + Select2 override

Owns `window.__hiper` (`custos`, `master`, `vendedor`, `custosHash`) with legacy
`window.__hiperCustos`/`__hiperMaster`/`__hiperVendedor` getters/setters kept for other modules that
still reference the old names directly. When "otimização da busca" is on (toggle in the popup), it
replaces the Hiper product Select2's own `ajax` query with a local filter over a product master list
preloaded once from `GET /produtos/master` (via `interceptor.js`, since it's cross-origin) instead of
Hiper's own per-keystroke `GetSelect2ParaPedido` calls.

### `hiper-widgets.js` — deterministic discount algorithm

Clicking the "Valor total" value in the side-menu summary opens an input; typing a target total
applies the discount needed. It does **not** use Hiper's aggregate discount
(`descontos.setValorDeDesconto`): that one spreads proportionally and then sums per-line subtotals
each rounded to 2 decimals, so it can miss by cents. Instead it computes each line's target
subtotal in cents (largest-remainder, so the sum is exact) and writes the exact
`descontoUnitario = v − alvo/q` per line via `produtos().setDescontoUnitario()`, the same path as
typing a discount on the row. Verified against Hiper's formula
(`subtotal = round2(q × (v − d))`, `totalPedido = round2(Σ subtotal)`) on 3000 random orders, with
no misses. It calls `limparDescontos()` first so a leftover aggregate discount doesn't re-spread
itself when items change.

A target **above** the undiscounted total raises prices. This only happens after a deliberately
annoying confirmation modal: the confirm button stays disabled until the employee retypes the new
total. Every `valorUnitario` is scaled proportionally and rounded **up** to 2 decimals via
`setValorUnitario`, which lands at or a few cents over the target; the same discount pass then trims
it to the exact cent. Tested on 2000 random increases, all exact, with prices kept at 2 decimals.

Two more editable cards sit right above "Valor total": "Desconto (R$)" and "Desconto (%)", read from
`descontos().valorDeDescontoAplicado` / `percentualDeDescontoAplicado`. Editing either one converts
it to a target total and goes through the same `_irParaTotal`, so all three fields share one
algorithm and the same increase confirmation.

### `kit.js` — package-size-tier formulas ("kits rápidos")

`GRUPOS_VARIACAO` maps a logical material group (parafuso, massa, fita, etc.) to the different
package codes Hiper sells it in, keyed by a quantity threshold (e.g. avulso up to 899 units, then a
box-of-1000 SKU past that). Given a wall/ceiling area or an item count, it picks the right SKU tier
automatically instead of the user doing that math by hand.

Every formula table in this file (`GRUPOS_VARIACAO`, `KITS_GESSO`, `FORMULAS_GESSO`, all `PAREDE_*`
constants) is keyed by the real `idProduto` — migrated 2026-07-31 from the legacy 4-digit product
code (cod4). The ~190 cod4 literals across this file were mechanically substituted for their
real-`idProduto` equivalent and verified with a Node characterization test (pure
formula/tier-resolution logic extracted and run for 19 representative kit/wall configs, comparing
every resulting product quantity against the pre-migration output — see the reasoning trail in the
`project-refactoring` memory if you need the full before/after methodology). `idProduto` =
`idProdutoHiperOnline` on the new pedido screen.

Kit lines are tracked by the store line id (`estado.linhas[*] = { codigo, linhaId }`), never by DOM.
Lines are created/changed with `__hiperPedido.novaLinha()` / `preencherLinha()`, fed by
`obterProduto(id)` (a minimal `{ idProdutoHiperOnline, idProdutoGradeHiperOnline, nome,
precoDeVenda, casasDecimais }` — today from Hiper's API, meant to become our cached backend).
**Never call the store's `setProduto()` directly.** It works on the store, but the row's
product-name field then re-fetches the product and fires `setProduto()` again on an
already-filled line, which resets quantity to 1 and the price. `preencherLinha` instead builds
the line the way Hiper's own `initEdit` does (`produto: null`, numeric `produtoId` =
`id` or `id_grade`); the field then fetches `/produtos/{produtoId}` itself and its
`setProduto()` takes the "same ids, produto was null" branch, which keeps quantity and price. The "Calculado: ≈ x" hint (raw value before rounding;
the only output montante/guia get) lives in `window.__hiperKitHints` (linhaId → value) and is
rendered into the row's qty field, found via its validation class `Itens[<index in store.itens>].Quantidade`.
Indices shift when a line is removed, so `_renderizarHints()` always re-syncs from scratch (driven by a
MutationObserver; it only writes when something differs, so it can't loop).

### Popup (`popup.html`/`popup.js`)

Per-profile toggles stored in `chrome.storage.local`: extensão ativa, otimização de busca and
otimização de preço (see "Catálogo em cache" below; on the old screen they drove the custom Select2
and `/produtos/dados/{id}`), and the "letra do orçamento" prefix (only cosmetic — the sequential
number itself always comes from the server, so several people can share the same letter across
machines without collisions).

### Catálogo em cache (new pedido screen): `hiper-pedido-store.js` + `XHRProxy` in `hiper-sync.js`

The whole product catalog is ~124 products (5 pages of 30; the server ignores `pageSize`). It is
kept in the Hiper origin's `localStorage` (`hiperCache:catalogoPedido:v1`), refreshed in the
background when older than 10 min (checked every 30 s while the pedido screen is open), and on
demand by the ↻ in the lucro card. Only a complete load (`list.length === totalItems`) ever
replaces it. `responderDoCache(metodo, url, body)` answers three of Hiper's own XHRs, and the
`XHRProxy` fakes the response (`_simularResposta`) without touching the network:
- `GET produtos-list?search=&page=&naoMostrarNasVendas=true` (the search, on every keystroke, ~450 ms
  natively): accent-insensitive token match over codigo + nome + sinônimos (barcode), sorted by
  nome, 30 per page. Other params, or zero hits (a product created after the last load), go to
  Hiper. Controlled by "otimização de busca".
- `GET produtos/{id | id_grade}` (the row's name field): answered from the cache when known.
- `POST calcular-preco-venda`: answered with the `precoDeVenda` it was sent, but only when
  `tabelaDePrecoId` and `categoriaId` are both null (then Hiper just echoes it back; verified on
  30/30 products). Controlled by "otimização de preço".
- `GET obter-estoque-produto?produtoId=<GUID>` (the row's "Disponível"): answered with **our**
  stock (`quantidadeEmEstoqueDisponivel` from our `/produtos/dados/{GUID}`; the new screen's
  `produto.id` GUID is the backend's `integration_id`), not Hiper's. The two diverge (e.g.
  alçapão: Hiper −21, ours 51) and our `estoque` table is the trusted one. This matches what
  "otimização de preço" did on the old screen. It's the only async answer (`responderDoCache`
  returns a Promise and the `XHRProxy` waits); memoized 30 s per product; backend error or
  > 2.5 s → Hiper's own request. Controlled by "otimização de preço".
`obterProduto()` (kits, recuperar) also reads the cache first.

Hiper's selectors debounce the search for 1000 ms (`setTimeout(() => W(), 1e3)` in the bundle).
With the cache answering instantly, that became the only wait, so `window.setTimeout` is wrapped to
turn it into 200 ms. The wrap only fires when **all** of these hold: delay exactly 1000, callback
source exactly `() => X()`, scheduled within 100 ms of an `input` event in a search field
(id `hc-input-modo-leitor-search-*` / `hc-select-data-search-*`, or `type=search` inside the
microfrontend), and "otimização de busca" on. Every other timer passes through untouched. If
Hiper changes that debounce, the wrap simply stops matching.
