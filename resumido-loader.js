// ═══════════════════════════════════════════════════════════════════════════════
// resumido-loader.js — Carregador: inicializa todos os módulos na ordem certa
//
// COMO USAR: inclua apenas este arquivo no seu HTML principal (ou no manifest).
//
// <script src="resumido-loader.js"></script>
//
// OU, se preferir controlar o carregamento manualmente, carregue nesta ordem:
//   1. resumido-dados.js
//   2. resumido-runtime-src.js  (runtime embutido como string)
//   3. resumido-gerador.js
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  // Detecta o diretório base relativo a este script
  const scripts    = document.querySelectorAll('script[src]');
  const thisScript = Array.from(scripts).find(s => s.src.includes('resumido-loader'));
  const base       = thisScript
    ? thisScript.src.replace(/resumido-loader\.js.*$/, '')
    : './';

  function carregarScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = res;
      s.onerror = () => rej(new Error('Falha ao carregar: ' + url));
      document.head.appendChild(s);
    });
  }

  // Sequência de inicialização:
  // 1. Carrega dados (constantes, textos, funções puras)
  // 2. Carrega o runtime como string (window.RESUMIDO_RUNTIME_SRC)
  // 3. Carrega o gerador (que usa window.RESUMIDO_RUNTIME_SRC)
  carregarScript(base + 'resumido-dados.js')
    .then(() => carregarScript(base + 'resumido-runtime-src.js'))
    .then(() => carregarScript(base + 'resumido-gerador.js'))
    .then(() => {
      console.info('[HiperResumido] ✅ Todos os módulos carregados.');
    })
    .catch(err => {
      console.error('[HiperResumido] ❌ Erro ao carregar módulos:', err);
    });
})();