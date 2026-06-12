// ═══════════════════════════════════════════════════════════════════════════════
// hiper-ui.js — Sidebar lateral para widgets do pedido-venda
//
// API pública (window.__hiperUI):
//   .registrar({ id, ordem, render })
//     → id      : string única do widget
//     → ordem   : número — menor = mais acima no sidebar
//     → render  : função () => HTMLElement
//
// O sidebar aparece no lado direito da tela apenas nas rotas de pedido-venda.
// Um botão de toggle (aba verde) fica sempre visível para abrir/fechar.
// Estado de aberto/fechado é salvo em sessionStorage.
// ═══════════════════════════════════════════════════════════════════════════════

const ROTA_FORMULARIO = /pedido-venda\/(novo|editar|duplicar|visualizar)(\/|$)/;

function _estaNoFormulario() {
  return ROTA_FORMULARIO.test(location.hash);
}

(function () {
  'use strict';

  const STORAGE_KEY = 'hiper-sidebar-open';

  // Labels exibidos no cabeçalho de cada card de widget
  const WIDGET_LABELS = {
    'hiper-btn-orcamento':    'Orçamento',
    'hiper-lucro-widget':     'Margem',
    'hiper-painel-recuperar': 'Recuperar',
    'hiper-painel-kits':      'Kits',
    'hiper-mov-widget':       'Estoque',
  };

  // ── Estado interno ────────────────────────────────────────────────────────────
  const _widgets   = [];
  let _sidebar     = null;
  let _container   = null;
  let _toggleArrow = null;
  let _hashAtual   = location.hash;

  // ── CSS do sidebar ────────────────────────────────────────────────────────────
  function _injetarEstilos() {
    if (document.getElementById('hiper-sidebar-style')) return;
    const s = document.createElement('style');
    s.id = 'hiper-sidebar-style';
    s.textContent = `
/* ── Sidebar container ── */
#hiper-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 320px;
  display: flex;
  flex-direction: row;
  transform: translateX(calc(100% - 28px));
  transition: transform .28s cubic-bezier(.4,0,.2,1);
  z-index: 9990;
  visibility: hidden;
  pointer-events: none;
  font-family: Arial, sans-serif;
}
#hiper-sidebar.hsb-visivel {
  visibility: visible;
  pointer-events: auto;
}
#hiper-sidebar.hsb-open {
  transform: translateX(0);
}

/* ── Aba de toggle ── */
#hiper-sidebar-toggle {
  width: 28px;
  min-width: 28px;
  background: #1a7a4a;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #fff;
  user-select: none;
  border-radius: 8px 0 0 8px;
  box-shadow: -3px 0 10px rgba(0,0,0,.2);
  transition: background .15s;
  flex-shrink: 0;
}
#hiper-sidebar-toggle:hover { background: #155f3a; }
.hsb-arrow {
  font-size: 12px;
  line-height: 1;
  transition: transform .28s;
}
.hsb-tag-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  opacity: .75;
}

/* ── Painel de conteúdo ── */
#hiper-sidebar-panel {
  flex: 1;
  background: #f2f5f2;
  border-left: 2px solid #1a7a4a;
  box-shadow: -5px 0 20px rgba(0,0,0,.13);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Cabeçalho do painel ── */
.hsb-header {
  padding: 9px 12px;
  background: #1a7a4a;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.hsb-logo-badge {
  background: rgba(255,255,255,.22);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: .5px;
}
.hsb-header-title {
  font-size: 11px;
  font-weight: 600;
  opacity: .9;
  flex: 1;
}
.hsb-fechar-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,.7);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  border-radius: 3px;
  transition: color .15s;
}
.hsb-fechar-btn:hover { color: #fff; }

/* ── Área de widgets (scroll) ── */
#hiper-sidebar-widgets {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
#hiper-sidebar-widgets::-webkit-scrollbar { width: 4px; }
#hiper-sidebar-widgets::-webkit-scrollbar-track { background: transparent; }
#hiper-sidebar-widgets::-webkit-scrollbar-thumb {
  background: #b0c8b0;
  border-radius: 2px;
}

/* ── Card de widget ── */
.hsb-card {
  background: #fff;
  border: 1px solid #d8e8d8;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.hsb-card-label {
  font-size: 8px;
  font-weight: 700;
  color: #5a8a5a;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 5px 10px 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid #edf3ed;
  background: #f8fbf8;
}
.hsb-card-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e8f0e8;
}
.hsb-card-body {
  padding: 0;
}
/* Dentro do card: remove bordas/raio próprios do widget (card já envolve) */
.hsb-card-body > [data-hiper-widget] {
  margin-top: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
    `;
    document.head.appendChild(s);
  }

  // ── Cria o sidebar no DOM ─────────────────────────────────────────────────────
  function _criarSidebar() {
    if (document.getElementById('hiper-sidebar')) {
      _sidebar     = document.getElementById('hiper-sidebar');
      _container   = document.getElementById('hiper-sidebar-widgets');
      _toggleArrow = document.querySelector('#hiper-sidebar-toggle .hsb-arrow');
      return;
    }

    _injetarEstilos();

    const aberto = sessionStorage.getItem(STORAGE_KEY) === 'true';

    _sidebar = document.createElement('div');
    _sidebar.id = 'hiper-sidebar';
    if (aberto) _sidebar.classList.add('hsb-open');

    // ── Aba de toggle ──
    const toggle = document.createElement('div');
    toggle.id = 'hiper-sidebar-toggle';
    toggle.title = aberto ? 'Fechar painel (Esc)' : 'Abrir painel TAG';
    toggle.innerHTML =
      '<span class="hsb-arrow">' + (aberto ? '▶' : '◀') + '</span>' +
      '<span class="hsb-tag-label">TAG</span>';
    toggle.addEventListener('click', _toggleSidebar);
    _toggleArrow = toggle.querySelector('.hsb-arrow');

    // ── Painel de conteúdo ──
    const panel = document.createElement('div');
    panel.id = 'hiper-sidebar-panel';

    const header = document.createElement('div');
    header.className = 'hsb-header';
    header.innerHTML =
      '<span class="hsb-logo-badge">TAG</span>' +
      '<span class="hsb-header-title">Ferramentas</span>' +
      '<button class="hsb-fechar-btn" title="Fechar (Esc)">✕</button>';
    header.querySelector('.hsb-fechar-btn').addEventListener('click', _fecharSidebar);

    _container = document.createElement('div');
    _container.id = 'hiper-sidebar-widgets';

    panel.appendChild(header);
    panel.appendChild(_container);
    _sidebar.appendChild(toggle);
    _sidebar.appendChild(panel);
    document.body.appendChild(_sidebar);
  }

  // ── Controle de abrir/fechar ──────────────────────────────────────────────────
  function _toggleSidebar() {
    const isOpen = _sidebar.classList.toggle('hsb-open');
    sessionStorage.setItem(STORAGE_KEY, String(isOpen));
    _toggleArrow.textContent = isOpen ? '▶' : '◀';
    document.getElementById('hiper-sidebar-toggle').title =
      isOpen ? 'Fechar painel (Esc)' : 'Abrir painel TAG';
  }

  function _fecharSidebar() {
    _sidebar.classList.remove('hsb-open');
    sessionStorage.setItem(STORAGE_KEY, 'false');
    if (_toggleArrow) _toggleArrow.textContent = '◀';
    const t = document.getElementById('hiper-sidebar-toggle');
    if (t) t.title = 'Abrir painel TAG';
  }

  // ── Visibilidade do sidebar ───────────────────────────────────────────────────
  function _mostrarSidebar() {
    if (!_sidebar) _criarSidebar();
    _sidebar.classList.add('hsb-visivel');
  }

  function _esconderSidebar() {
    if (_sidebar) _sidebar.classList.remove('hsb-visivel');
  }

  // ── Monta um widget como card no container ────────────────────────────────────
  function _mountWidget(w) {
    if (w.mounted && document.getElementById(w.id)) return;
    if (!_container) return;

    let el;
    try { el = w.render(); } catch (e) {
      console.error('[HiperUI] Erro ao renderizar widget "' + w.id + '":', e);
      return;
    }
    if (!el) return;

    el.id = w.id;
    el.dataset.hiperWidget = '1';
    el.dataset.hiperOrdem  = String(w.ordem);

    const card = document.createElement('div');
    card.className = 'hsb-card';
    card.dataset.widgetCard = w.id;
    card.dataset.hiperOrdem = String(w.ordem);

    if (WIDGET_LABELS[w.id]) {
      const lbl = document.createElement('div');
      lbl.className = 'hsb-card-label';
      lbl.textContent = WIDGET_LABELS[w.id];
      card.appendChild(lbl);
    }

    const body = document.createElement('div');
    body.className = 'hsb-card-body';
    body.appendChild(el);
    card.appendChild(body);

    // Insere em ordem crescente
    const cards = _container.querySelectorAll(':scope > .hsb-card');
    let inserido = false;
    for (const c of cards) {
      if (w.ordem < parseInt(c.dataset.hiperOrdem || '0', 10)) {
        _container.insertBefore(card, c);
        inserido = true;
        break;
      }
    }
    if (!inserido) _container.appendChild(card);

    w.mounted = true;
    console.info('[HiperUI] Widget "' + w.id + '" montado no sidebar (ordem ' + w.ordem + ').');
  }

  // ── Tenta montar todos os widgets ────────────────────────────────────────────
  function _tentarMontar() {
    if (!_estaNoFormulario()) return false;
    _criarSidebar();
    _mostrarSidebar();
    _widgets.sort((a, b) => a.ordem - b.ordem);
    _widgets.forEach(w => _mountWidget(w));
    return true;
  }

  // ── Desmonta tudo ao mudar de rota ────────────────────────────────────────────
  function _desmontar() {
    _widgets.forEach(w => { w.mounted = false; });
    _esconderSidebar();
    if (_container) _container.innerHTML = '';
    console.info('[HiperUI] Rota mudou — sidebar limpo.');
  }

  // ── Retry periódico ───────────────────────────────────────────────────────────
  let _retryTimer = null;

  function _iniciarRetry() {
    if (_retryTimer) return;
    let tentativas = 0;
    _retryTimer = setInterval(() => {
      tentativas++;
      if (_tentarMontar() || tentativas >= 60) {
        clearInterval(_retryTimer);
        _retryTimer = null;
        if (tentativas >= 60) console.warn('[HiperUI] Timeout ao tentar montar widgets.');
      }
    }, 250);
  }

  // ── MutationObserver (detecta re-render do Angular) ──────────────────────────
  new MutationObserver(() => {
    const hash = location.hash;

    if (hash !== _hashAtual) {
      _hashAtual = hash;
      _desmontar();
      if (ROTA_FORMULARIO.test(hash)) _iniciarRetry();
      return;
    }

    if (ROTA_FORMULARIO.test(hash)) {
      const algumFaltando = _widgets.some(
        w => w.mounted && !document.getElementById(w.id)
      );
      if (algumFaltando) {
        _widgets.forEach(w => { w.mounted = false; });
        if (_container) _container.innerHTML = '';
        _iniciarRetry();
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Tentativa imediata se já estiver na rota
  if (ROTA_FORMULARIO.test(location.hash)) _iniciarRetry();

  // Fechar com Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _sidebar && _sidebar.classList.contains('hsb-open')) {
      _fecharSidebar();
    }
  });

  // ── API pública ───────────────────────────────────────────────────────────────
  window.__hiperUI = {
    registrar(cfg) {
      if (!cfg?.id || typeof cfg.render !== 'function') {
        console.warn('[HiperUI] registrar() requer { id, render }.');
        return;
      }
      if (_widgets.find(w => w.id === cfg.id)) return;

      _widgets.push({ id: cfg.id, ordem: cfg.ordem ?? 50, render: cfg.render, mounted: false });

      // Se já na rota e sidebar criado, monta imediatamente
      if (_container && _estaNoFormulario()) {
        _widgets.sort((a, b) => a.ordem - b.ordem);
        _mountWidget(_widgets.find(w => w.id === cfg.id));
      }
    },
  };

  console.info('[HiperUI] Sidebar lateral ativo.');
})();
