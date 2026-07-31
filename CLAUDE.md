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
input rather than coercing to `0` — `hiper-widgets.js`'s discount math depends on that `NaN`
propagating through `isNaN(...)` checks to detect corrupt/unreadable fields; `kit.js`/
`hiper-orcamento.js` want a plain `0` and add `isNaN(v) ? 0 : v` themselves at the call site. Don't
"simplify" that split — the two contracts aren't interchangeable.

### `background.js` (service worker) only exists for two `chrome.*`-only jobs

1. `chrome.scripting.executeScript({ world: 'MAIN' })` to blank out `window.print` on the
   `/Imprimir?tag_view=1` page — bypasses page CSP, which only a background/service-worker context
   can do.
2. `chrome.webRequest.onCompleted` on `atualizar-situacao` PUT requests — Hiper caches a reference to
   the native `fetch` before this extension's scripts load, so the normal "hook `fetch`" trick
   (`hiper-sync.js`) misses this specific endpoint; only network-layer `webRequest` sees it. Relayed
   `background.js → chrome.tabs.sendMessage → interceptor.js → postMessage → hiper-sync.js`.

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

### `hiper-ui.js` — single mount point for the order-form action bar

Other modules never touch the DOM of the pedido-venda action bar directly; they call
`window.__hiperUI.registrar({ id, ordem, render })` once, and `hiper-ui.js` finds the anchor
(`.parte-4 > div`, with fallback selectors for markup drift) and mounts every registered widget in
`ordem`. Handles the case where a module registers before the anchor exists in the DOM yet (SPA
route not rendered) as well as after.

### `hiper-cache.js` — shared state + Select2 override

Owns `window.__hiper` (`custos`, `master`, `vendedor`, `custosHash`) with legacy
`window.__hiperCustos`/`__hiperMaster`/`__hiperVendedor` getters/setters kept for other modules that
still reference the old names directly. When "otimização da busca" is on (toggle in the popup), it
replaces the Hiper product Select2's own `ajax` query with a local filter over a product master list
preloaded once from `GET /produtos/master` (via `interceptor.js`, since it's cross-origin) instead of
Hiper's own per-keystroke `GetSelect2ParaPedido` calls.

### `hiper-widgets.js` — deterministic discount algorithm

Clicking the total or discount amount lets you type a target value directly; the code then computes,
**before touching the DOM at all**, the exact per-line discount (in cents) needed to hit that target —
simulating Hiper's own rounding formula (`quantidade * (unitário − desconto)`, rounded to 2 decimals
per line) rather than writing a guess and re-reading the rendered total in a retry loop. If a clean
2-decimal solution isn't reachable on any single line, it falls back to giving one line extra decimal
precision as a last resort. See the file's own comments for the exact fallback order — it went
through several iterations and the reasoning for each step matters if you touch it.

### `kit.js` — package-size-tier formulas ("kits rápidos")

`GRUPOS_VARIACAO` maps a logical material group (parafuso, massa, fita, etc.) to the different
package codes Hiper sells it in, keyed by a quantity threshold (e.g. avulso up to 899 units, then a
box-of-1000 SKU past that). Given a wall/ceiling area or an item count, it picks the right SKU tier
automatically instead of the user doing that math by hand.

Every formula table in this file (`GRUPOS_VARIACAO`, `KITS_GESSO`, `FORMULAS_GESSO`, all `PAREDE_*`
constants — ~150 references total) is keyed by the legacy 4-digit product code (cod4), **not** the
real `idProduto`. Unlike the equivalent situation that used to exist in `ia_parser` (removed
2026-07-31 — there it really was dead legacy, a static translation table nothing else depended on),
here cod4 is load-bearing: `buscarNaMaster()` uses it to find the matching product in
`window.__hiperMaster`. It first tries an exact match on `codigo4` (a field `/produtos/master` added
2026-07-31 specifically for this), falling back to parsing the cod4 prefix off `Nome`/`text`
(`"3073 - Chapa..."`) for any master still cached from before that field existed. Products registered
without a cod4 have no prefix in `Nome` at all (see `produtos_hiper.py:listar_master`) — the old
prefix-parsing path silently couldn't find those; `codigo4` fixes that going forward, but the ~150
cod4 keys throughout this file were deliberately left alone (migrating those to `idProduto` would
touch the whole file and affect live Select2/DOM interaction with no easy way to test it in isolation
the way the Python side could be characterization-tested).

### Popup (`popup.html`/`popup.js`)

Per-profile toggles stored in `chrome.storage.local`: extensão ativa, otimização de busca (custom
Select2, see above), otimização de preço (serves `/produtos/dados/{id}` from cache instead of
Hiper's slower native call), and the "letra do orçamento" prefix (only cosmetic — the sequential
number itself always comes from the server, so several people can share the same letter across
machines without collisions).
