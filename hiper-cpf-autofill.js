(function _hiperCpfAutofill() {
  'use strict';

  const API_BASE = 'https://tag.santin.tec.br/api/consulta-pessoa';
  const ROTA     = /clientes\/cadastro/;

  const SEL_CPF  = '#cpf-edit > input';
  const SEL_NOME = '#nome-edit';
  const SEL_TEL  = '#telefone-principal-edit > input';

  function _estaNoFormulario() {
    return ROTA.test(location.hash) || ROTA.test(location.pathname);
  }

  function _limparCpf(str) {
    return (str || '').replace(/\D/g, '');
  }

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

  function _getOuCriarStatus() {
    let el = document.getElementById('hiper-cpf-status');
    if (el) return el;
    el = document.createElement('span');
    el.id = 'hiper-cpf-status';
    el.style.cssText = [
      'display:inline-block', 'margin-left:8px', 'font-size:11px',
      'padding:2px 7px', 'border-radius:3px', 'vertical-align:middle',
      'transition:opacity 0.3s',
    ].join(';');
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

  async function _consultarCpf(cpf) {
    const url = `${API_BASE}/${encodeURIComponent(cpf)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  let _ultimoCpf    = '';
  let _emAndamento  = false;

  async function _tentarAutoFill() {
    const cpfEl = document.querySelector(SEL_CPF);
    if (!cpfEl) return;
    const cpf = _limparCpf(cpfEl.value);
    if (cpf.length !== 11 || cpf === _ultimoCpf || _emAndamento) return;

    _ultimoCpf   = cpf;
    _emAndamento = true;
    _setStatus('loading', '⟳ consultando…');

    try {
      const dados = await _consultarCpf(cpf);
      if (!dados.encontrado) {
        _setStatus('warn', '⚠ CPF não encontrado');
        return;
      }
      const nomeEl = document.querySelector(SEL_NOME);
      if (nomeEl && dados.nome) _preencherCampo(nomeEl, dados.nome);
      const telEl = document.querySelector(SEL_TEL);
      if (telEl && dados.telefone) _preencherCampo(telEl, dados.telefone);
      _setStatus('ok', `✓ ${dados.nome}${dados.cache ? ' (cache)' : ''}`);
      console.info('[HiperCPF] ✅ Autopreenchido —', dados.nome, '| CPF:', cpf);
    } catch (e) {
      _setStatus('err', '✗ Erro na consulta');
      console.warn('[HiperCPF] ❌ Falha ao consultar CPF:', cpf, e.message);
    } finally {
      _emAndamento = false;
    }
  }

  let _debTimer = null;
  function _deb() {
    clearTimeout(_debTimer);
    _debTimer = setTimeout(_tentarAutoFill, 300);
  }

  // ── Rastreia o campo CPF atual para evitar duplicar listeners ────────────────
  let _cpfElAtual = null;

  function _ativarListener() {
    if (!_estaNoFormulario()) return;
    const cpfEl = document.querySelector(SEL_CPF);
    if (!cpfEl || cpfEl === _cpfElAtual) return; // mesmo elemento, nada a fazer

    _cpfElAtual = cpfEl;
    _ultimoCpf  = '';
    cpfEl.addEventListener('input', _deb);
    cpfEl.addEventListener('blur',  _tentarAutoFill);
    console.info('[HiperCPF] 👂 Listener ativo no campo CPF.');
  }

  // ── MutationObserver único: detecta campo CPF entrando/saindo do DOM ─────────
  new MutationObserver(() => {
    if (!_estaNoFormulario()) return;
    const cpfEl = document.querySelector(SEL_CPF);
    if (cpfEl && cpfEl !== _cpfElAtual) {
      _ativarListener(); // campo novo apareceu (re-render do Angular)
    }
    if (!cpfEl && _cpfElAtual) {
      _cpfElAtual = null; // campo sumiu, libera referência
      console.info('[HiperCPF] 🔄 Campo CPF removido, aguardando re-render.');
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── Intercepta pushState E replaceState para detectar navegação SPA ──────────
  function _patchHistory(method) {
    const original = history[method];
    history[method] = function (...args) {
      original.apply(this, args);
      _cpfElAtual = null;
      _ultimoCpf  = '';
      if (_estaNoFormulario()) _ativarListener();
    };
  }
  _patchHistory('pushState');
  _patchHistory('replaceState');
  window.addEventListener('popstate', () => {
    _cpfElAtual = null;
    _ultimoCpf  = '';
    if (_estaNoFormulario()) _ativarListener();
  });

  // ── Kick-off ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _ativarListener);
  } else {
    _ativarListener();
  }

  console.info('[HiperCPF] ✅ Script carregado.');
})();