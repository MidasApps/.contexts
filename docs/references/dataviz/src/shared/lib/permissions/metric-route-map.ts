/**
 * Rota (página) que uma métrica serve, para enforcement server-side de
 * `canAccessRoute` no path semântico (`executeMetric`, usado por
 * `/api/metrics/[id]/data` e `/api/metrics/batch`).
 *
 * ─── Por que isto deixou de ser um mapa ─────────────────────────────────────
 * Havia aqui uma allowlist escrita à mão com 64 ids `covenants.*`. Dois
 * problemas, e o segundo é o que motivou a troca:
 *
 * 1. **Não carregava informação.** As 64 entradas apontavam para a MESMA rota,
 *    `/g`. Era uma lista de 64 nomes dizendo a mesma coisa.
 *
 * 2. **Era catálogo de produto em código.** Métrica e produto são gerenciados
 *    pela administração, em banco. Uma lista fixa no código significa que
 *    cadastrar métrica pela admin exigia um deploy para ela ser reconhecida —
 *    e, pior, quem não fosse cadastrado aqui perdia o gate de rota em silêncio
 *    (achado R5: fail-open por omissão).
 *
 * ─── A regra que substitui ──────────────────────────────────────────────────
 * Toda métrica executável é renderizada num relatório dinâmico, em
 * `/g/{groupId}/r/{reportId}`. Verificado: `executeMetric` só é alcançado por
 * `/api/metrics/batch` e `/api/metrics/[id]/data`, ambos chamados apenas por
 * `useReportData`, que só é usado por `ReportPage` e pelo `PageFilterBar` que
 * ela renderiza. As páginas de anexo não executam métrica, e
 * o canvas de `/explore` recebe dado inline do agente, sem passar por aqui.
 *
 * Logo: a rota de QUALQUER métrica é `/g`. `normalizeRoute` já colapsa
 * `/g/...` em `/g` do lado do cliente, então as duas pontas continuam casadas.
 *
 * Efeito colateral deliberado: métrica criada pelo usuário passa a exigir
 * acesso a `/g` como qualquer outra. Isso não tira acesso de ninguém legítimo —
 * quem vê o relatório tem `/g` por definição — e fecha o fail-open.
 */
/** Única superfície que executa métrica hoje. */
export const REPORT_ROUTE = '/g';

/**
 * Rota exigida para executar `metricId`.
 *
 * Assinatura mantida (`string | null`) porque o chamador trata `null` como
 * "sem gate de rota". Hoje nunca devolvemos `null`: se um dia existir uma
 * superfície que execute métrica fora de `/g`, é AQUI que a distinção volta —
 * e volta como regra, não como lista de nomes de produto.
 */
export function routeForMetric(_metricId: string): string | null {
  return REPORT_ROUTE;
}
