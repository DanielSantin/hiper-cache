// ═══════════════════════════════════════════════════════════════════════
// hiper-custos-padrao.js — Valores padrão de custo por código de produto
// ═══════════════════════════════════════════════════════════════════════
// Chave = 4 primeiros dígitos do nome do produto (igual ao idProduto)
// Valor = custo unitário em R$
//
// Para forçar atualização em todos os funcionários:
// → Mude o valor de VERSAO_CUSTOS para uma data nova (ex: "2025-02")
// → Suba a extensão atualizada
// → Na próxima abertura, os custos serão sobrescritos automaticamente

const VERSAO_CUSTOS = "2026-02";

const CUSTOS_PADRAO = {
  "3073": 60.26,
  "3076": 25.93,
  "3006": 11.27,
  "3007": 12.89,
  "3008": 15.12,
  "3010": 11.20,
  "3014": 12.16,
  "3017":  0.92,
  "3018":  9.48,
  "3019":  0.24,
  "3020":  0.02,
  "3021":  0.02,
  "3022": 10.36,
  "3023": 14.61,
  "3029":  0.69,
  "3032": 21.85,
  "3035":  9.79,
  "3037": 39.74,
  "3058":  0.02,
  "3113": 72.59,
  "3132":  6.21,
};

window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  if (ev.data?.type !== 'HIPER_CUSTO_LOADED') return;

  const salvos = ev.data.custos || {};
  const versaoSalva = salvos['_versao'];

  // Se a versão já está atualizada, não faz nada
  if (versaoSalva === VERSAO_CUSTOS) {
    console.info('[HiperCustos] ℹ Custos já na versão', VERSAO_CUSTOS, '— nenhuma alteração.');
    return;
  }

  const bc = new BroadcastChannel('hiper_custo_channel');
  let atualizados = 0;

  for (const [id, val] of Object.entries(CUSTOS_PADRAO)) {
    // Só sobrescreve se não existir OU se a versão mudou
    if (salvos[id] === undefined || versaoSalva !== VERSAO_CUSTOS) {
      bc.postMessage({ type: 'HIPER_CUSTO_SAVE', id, nome: id, val });
      atualizados++;
    }
  }

  // Salva a versão atual para não rodar de novo
  bc.postMessage({ type: 'HIPER_CUSTO_SAVE', id: '_versao', nome: '_versao', val: VERSAO_CUSTOS });
  bc.close();

  console.info(`[HiperCustos] ✅ ${atualizados} custo(s) aplicado(s) — versão ${VERSAO_CUSTOS}`);
});