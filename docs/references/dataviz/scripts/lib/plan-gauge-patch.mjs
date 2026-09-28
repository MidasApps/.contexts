/**
 * O medidor "Dívida vs. Limite do Plano Empresário" antigo, e o que o troca.
 *
 * Função pura, separada do script que grava, para que a regra de "qual bloco
 * é o antigo" e "o que ele vira" seja testada sem Firestore.
 */
import template from '../templates/covenants-v2-plano-empresario.template.mjs';

export const OLD_METRIC_ID = 'covenants.plano_empresario_divida';
export const GAUGE_ID = 'gauge-pe-divida-limite';

/** O bloco do template, que é a fonte do que o medidor passa a ser. */
export const TARGET_GAUGE = template.blockMap[GAUGE_ID];

/**
 * O bloco é o medidor antigo? Só gauge que lê a dívida em reais — um gauge da
 * dívida que alguém configurou com limite próprio também seria reescrito, e
 * por isso o limite fixo de R$ 45 mi faz parte da assinatura.
 */
export const isOldPlanGauge = (block) =>
  block?.type === 'gauge' && block.metricId === OLD_METRIC_ID && block.threshold === 45000000;

/** O bloco novo, mantendo id e largura do que estava gravado. */
export const patchedPlanGauge = (block) => ({
  ...TARGET_GAUGE,
  id: block.id,
  colSpan: block.colSpan ?? TARGET_GAUGE.colSpan,
});

/**
 * Devolve o blockMap corrigido, ou `null` quando não há o que trocar.
 * @param {Record<string, Record<string, unknown>> | undefined} blockMap
 * @returns {Record<string, Record<string, unknown>> | null}
 */
export function patchBlockMap(blockMap) {
  let changed = false;
  /** @type {Record<string, Record<string, unknown>>} */
  const next = {};
  for (const [id, block] of Object.entries(blockMap ?? {})) {
    if (isOldPlanGauge(block)) {
      next[id] = patchedPlanGauge(block);
      changed = true;
    } else {
      next[id] = block;
    }
  }
  return changed ? next : null;
}
