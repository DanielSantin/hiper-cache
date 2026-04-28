// ═══════════════════════════════════════════════════════════════════════════════
// hiper-cpf-autofill.js — Autopreenchimento de nome/telefone via CPF
// Rota: /clientes/cadastro
// API: https://db.superaserver.com/api/consulta-pessoa/{cpf}
// ═══════════════════════════════════════════════════════════════════════════════

(function _hiperCpfAutofill() {
  'use strict';

  const API_BASE  = 'https://db.superaserver.com/api/consulta-pessoa';
  const ROTA      = /clientes\/cadastro/;

  // ── Só roda na rota certa ─────────────────────────────────────────────────────
  function _estaNoFormulario() {
    return ROTA.test(location.hash) || ROTA.test(location.pathname);
  }

  // ── Seletores ─────────────────────────────────────────────────────────────────
  const SEL_CPF   = '#cpf-edit > input';
  const SEL_NOME  = '#nome-edit';
  const SEL_TEL   = '#telefone-principal-edit > input';

  // ── Utilitários ───────────────────────────────────────────────────────────────
  function _limparCpf(str) {
    return (str || '').replace(/\D/g, '');
  }

  // Dispara eventos que o Vue/Angular costuma ouvir para detectar mudanças
  function _preencherCampo(el, valor) {
    if (!el) return;
    const nativeInput = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el), 'value'
    );
    if (nativeInput?.set) {
      nativeInput.set.call(el, valor);
    } else {
      el.value = valor;
    }
    ['input', 'change', 'blur'].forEach(t =>
      el.dispatchEvent(new Event(t, { bubbles: true }))
    );
  }

  // ── UI: indicador de status ───────────────────────────────────────────────────
  function _getOuCriarStatus() {
    let el = document.getElementById('hiper-cpf-status');
    if (el) return el;

    el = document.createElement('span');
    el.id = 'hiper-cpf-status';
    el.style.cssText = [
      'display:inline-block',
      'margin-left:8px',
      'font-size:11px',
      'padding:2px 7px',
      'border-radius:3px',
      'vertical-align:middle',
      'transition:opacity 0.3s',
    ].join(';');

    // Tenta ancorar próximo ao campo CPF
    const cpfWrap = document.querySelector('#cpf-edit');
    if (cpfWrap) {
      cpfWrap.style.display = 'flex';
      cpfWrap.style.alignItems = 'center';
      cpfWrap.appendChild(el);
    }

    return el;
  }

  function _setStatus(tipo, texto) {
    const el = _getOuCriarStatus();
    if (!el) return;

    const estilos = {
      loading: 'background:#e8f0fe;color:#1a73e8;border:1px solid #a8c7fa',
      ok:      'background:#d4f0dc;color:#1a7a1a;border:1px solid #6dbf8a',
      warn:    'background:#fff8e1;color:#b8860b;border:1px solid #ffe082',
      err:     'background:#fdd;color:#c00;border:1px solid #e57373',
      idle:    'background:transparent;color:transparent;border:none',
    };

    el.style.cssText += ';' + (estilos[tipo] || estilos.idle);
    el.textContent = texto;

    if (tipo === 'ok' || tipo === 'warn') {
      setTimeout(() => _setStatus('idle', ''), 5000);
    }
  }

  // ── Consulta na API ───────────────────────────────────────────────────────────
  async function _consultarCpf(cpf) {
    const url = `${API_BASE}/${encodeURIComponent(cpf)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  // ── Lógica principal ──────────────────────────────────────────────────────────
  let _ultimoCpf = '';
  let _emAndamento = false;

  async function _tentarAutoFill() {
    const cpfEl = document.querySelector(SEL_CPF);
    if (!cpfEl) return; // campo ainda não existe (tipo != Física)

    const cpf = _limparCpf(cpfEl.value);

    // Só dispara quando CPF estiver completo (11 dígitos) e diferente do último
    if (cpf.length !== 11 || cpf === _ultimoCpf || _emAndamento) return;

    _ultimoCpf    = cpf;
    _emAndamento  = true;
    _setStatus('loading', '⟳ consultando…');

    try {
      const dados = await _consultarCpf(cpf);

      if (!dados.encontrado) {
        _setStatus('warn', '⚠ CPF não encontrado');
        return;
      }

      // Preenche nome
      const nomeEl = document.querySelector(SEL_NOME);
      if (nomeEl && dados.nome) {
        _preencherCampo(nomeEl, dados.nome);
      }

      // Preenche telefone (só se existir)
      const telEl = document.querySelector(SEL_TEL);
      if (telEl && dados.telefone) {
        _preencherCampo(telEl, dados.telefone);
      }

      const cache = dados.cache ? ' (cache)' : '';
      _setStatus('ok', `✓ ${dados.nome}${cache}`);
      console.info('[HiperCPF] ✅ Autopreenchido —', dados.nome, '| CPF:', cpf);

    } catch (e) {
      _setStatus('err', '✗ Erro na consulta');
      console.warn('[HiperCPF] ❌ Falha ao consultar CPF:', cpf, e.message);
    } finally {
      _emAndamento = false;
    }
  }

  // ── Observa mudanças no campo CPF (com debounce) ──────────────────────────────
  let _debTimer = null;

  function _deb() {
    clearTimeout(_debTimer);
    _debTimer = setTimeout(_tentarAutoFill, 300);
  }

  // ── Injeta o listener assim que o campo aparecer no DOM ───────────────────────
  let _listenerAtivo = false;

  function _ativarListener() {
    const cpfEl = document.querySelector(SEL_CPF);
    if (!cpfEl || _listenerAtivo) return;

    cpfEl.addEventListener('input', _deb);
    cpfEl.addEventListener('blur',  _tentarAutoFill); // garante disparo no blur
    _listenerAtivo = true;
    _ultimoCpf = ''; // reseta ao reativar

    console.info('[HiperCPF] 👂 Listener ativo no campo CPF.');
  }

  // ── MutationObserver: espera o campo CPF aparecer ────────────────────────────
  const _obs = new MutationObserver(() => {
    if (!_estaNoFormulario()) return;

    if (!_listenerAtivo && document.querySelector(SEL_CPF)) {
      _ativarListener();
    }

    // Reseta ao trocar de rota (Angular pode re-renderizar o form)
    if (!document.querySelector(SEL_CPF)) {
      _listenerAtivo = false;
    }
  });

  function _iniciar() {
    if (!_estaNoFormulario()) return;
    _obs.observe(document.documentElement, { childList: true, subtree: true });
    _ativarListener(); // tenta imediatamente caso já exista
    console.info('[HiperCPF] ✅ Autopreenchimento de cliente ativo.');
  }

  // ── Detecta navegação SPA (hash ou pushState) ─────────────────────────────────
  let _hashAtual = location.hash;
  new MutationObserver(() => {
    if (location.hash !== _hashAtual) {
      _hashAtual     = location.hash;
      _listenerAtivo = false;
      _ultimoCpf     = '';
      if (_estaNoFormulario()) _iniciar();
    }
  }).observe(document.documentElement, { childList: true, subtree: false });

  // ── Kick-off ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _iniciar);
  } else {
    _iniciar();
  }

})();