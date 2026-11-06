// ═══════════════════════════════════════════════════════════════════════════════
// hiper-api.js — chamadas à nossa API (api.sistema.santin.tec.br) a partir dos
// módulos da página, COM a chave de acesso, sem a página ver a chave.
//
//   const r = await window.__hiperApi('/pedido', { method: 'POST', body: JSON.stringify(dados) });
//   if (r.ok) const j = await r.json();
//
// Quem chama de fato é o interceptor.js (content script), que guarda a chave
// no chrome.storage.local e só aceita os caminhos de API_PERMITIDOS lá. A
// resposta imita o necessário do fetch: ok, status, json(), text(). Falha de
// rede/timeout → rejeita com Error (como o fetch), status 0 + erro.
// Os avisos de hiper-sync.js (/hiper-pedido-mudou, /hiper-nfe-mudou) continuam
// com fetch direto (keepalive, sem chave): a API deixa eles livres.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  let seq = 0;
  const pendentes = new Map();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.data?.type !== 'HIPER_API_RES') return;
    const p = pendentes.get(ev.data.seq);
    if (!p) return;
    pendentes.delete(ev.data.seq);
    clearTimeout(p.timer);
    const d = ev.data;
    if (!d.status) { p.rejeitar(new Error(d.erro || 'falha de rede')); return; }
    const texto = d.texto ?? '';
    p.resolver({
      ok: !!d.ok,
      status: d.status,
      text: async () => texto,
      json: async () => JSON.parse(texto),
    });
  });

  window.__hiperApi = function (path, { method = 'GET', body = null, timeout = 15000 } = {}) {
    return new Promise((resolver, rejeitar) => {
      const id = 'api' + (++seq) + '_' + Date.now();
      // Folga além do timeout do interceptor: se ele nem responder
      // (extensão recarregada no meio), não fica pendurado para sempre.
      const timer = setTimeout(() => {
        pendentes.delete(id);
        rejeitar(new Error('timeout'));
      }, timeout + 3000);
      pendentes.set(id, { resolver, rejeitar, timer });
      window.postMessage({ type: 'HIPER_API_REQ', seq: id, path, method, body, timeout }, '*');
    });
  };
})();
