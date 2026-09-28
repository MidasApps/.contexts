/**
 * Helpers do catálogo `imobiliaria.*`.
 *
 * Convenções de período (decididas contra `useReportData.pageFiltersFor` e
 * `period-sensitivity.ts`):
 *
 *  - SÉRIE (`bucket` mensal): `{filter.date_range:ent.col}` — obedece à faixa
 *    escolhida. O modo "Último mês" não a alcança (`isSeries`).
 *  - CARTÃO / COMPOSIÇÃO / LISTA sobre EVENTOS: `monthEnd(ent, col)` — o mês
 *    calendário do último evento dentro do período (`{filter.ate}`). Nasceu
 *    porque o "Último mês" do app traduzia `{filter.date_range}` para
 *    `col = @fim` — só o último dia numa tabela de eventos. Desde 2026-09-26 o
 *    modo manda a faixa do mês do fim do período, e `{filter.date_range}` já
 *    serviria; o helper segue por ter semântica própria (o mês do ÚLTIMO
 *    EVENTO, não o do fim do período) e para não mexer em 200+ métricas.
 *  - FOTO MENSAL (`*_snapshot`): `pin(ent)` — idêntico ao `pinClause()` do
 *    Vila Rosa, para herdar sparkline e regime `posicao`.
 *  - JANELA de 12 meses (heatmap, dispersão): `window12(ent, col)`.
 *
 * `requires` é derivado do próprio template: todo `{entidade.atributo}` vira
 * `imobiliaria.entidade.atributo`. O prefixo é o `contractRef` do binding.
 */
export const CONTRACT = 'imobiliaria';
const RE_ATTR = /\{([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\}/g;

export function requiresFrom(template) {
  const set = new Set();
  for (const m of template.matchAll(RE_ATTR)) set.add(`${CONTRACT}.${m[1]}.${m[2]}`);
  return [...set];
}

/**
 * `scale: ['col', …]` — devolve essas colunas em PONTOS percentuais (×100).
 *
 * O app tem duas convenções de `format: 'percent'`: KPI e tabela multiplicam a
 * fração por 100 (`useReportData`); gauge, progress, gráfico, heatmap e
 * dispersão formatam o número como está (`formatted-value.ts`). Uma métrica em
 * pontos só pode alimentar o segundo grupo — o teste de templates cobra isso.
 *
 * O `ORDER BY` final do template é içado para fora do subselect (ordem de
 * subconsulta não é garantida no BigQuery).
 */
export function sql({ id, label, description, unit = null, category, shape, outputColumns, template, scale }) {
  let t = template.trim();
  if (scale) {
    const m = t.match(/\s+ORDER BY\s+([^()]*?)(\s+LIMIT\s+\d+)?\s*$/i);
    const inner = m ? t.slice(0, m.index) : t;
    const outer = m ? ` ORDER BY ${m[1]}${m[2] ?? ''}` : '';
    t = `SELECT * REPLACE (${scale.map((c) => `100 * ${c} AS ${c}`).join(', ')}) FROM (\n${inner}\n)${outer}`;
  }
  const requires = requiresFrom(t);
  if (!requires.length) throw new Error(`${id}: template sem {entidade.atributo}`);
  const type = shape === 'scalar' ? 'kpi' : shape === 'rows' ? 'table' : 'chart';
  return {
    id: `${CONTRACT}.${id}`, label, description: description ?? null, type, unit, category,
    shape, outputColumns, requires, recipe: { kind: 'sql', template: t },
    // A escala vira metadado da métrica: KPI e tabela leem isto (ADR-0032).
    ...(scale ? { percentPointColumns: [...scale] } : {}),
  };
}

/** Mês calendário do último evento ≤ fim do período. */
export const monthEnd = (e, col) =>
  `DATE_TRUNC({${e}.${col}}, MONTH) = (SELECT DATE_TRUNC(MAX({${e}.${col}}), MONTH) FROM {${e}} WHERE {filter.ate:${e}.${col}})`;
/** Primeiro dia do mês de referência de uma entidade de eventos (para subconsultas). */
export const monthRef = (e, col) => `(SELECT DATE_TRUNC(MAX({${e}.${col}}), MONTH) FROM {${e}} WHERE {filter.ate:${e}.${col}})`;
/** Pin de foto mensal — mesmo texto de `pinClause()` em covenants-v2.mjs. */
export const pin = (e) =>
  `{${e}.data_base_report} = (SELECT MAX({${e}.data_base_report}) FROM {${e}} WHERE {filter.ate:${e}.data_base_report})`;
/** Faixa escolhida na página. */
export const band = (e, col) => `{filter.date_range:${e}.${col}}`;
/** Bucket mensal. */
export const bucket = (e, col) => `DATE_TRUNC({${e}.${col}}, MONTH)`;
/** Últimos 12 meses até o fim do período. */
export const window12 = (e, col) =>
  `{${e}.${col}} >= DATE_SUB(${monthRef(e, col)}, INTERVAL 11 MONTH) AND {filter.ate:${e}.${col}}`;
/** Rótulo de mês para matrizes. */
export const monthLabel = (expr) => `FORMAT_DATE('%Y-%m', ${expr})`;

/** Quartis por grupo (shape distribution). */
export const quartiles = (value) => `
  MIN(${value}) AS min,
  APPROX_QUANTILES(${value}, 4)[OFFSET(1)] AS q1,
  APPROX_QUANTILES(${value}, 4)[OFFSET(2)] AS mediana,
  APPROX_QUANTILES(${value}, 4)[OFFSET(3)] AS q3,
  MAX(${value}) AS max`;

/** Meta consolidada por unidade (linhas sem departamento nem corretor). */
export const branchTarget = (field) =>
  `SELECT {metas.unidade_id} AS unidade_id, SUM({metas.${field}}) AS meta FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')} GROUP BY 1`;

export const BRANCH_IDS = ['centro', 'zona_sul', 'zona_norte', 'abc', 'campinas', 'litoral'];
export const pivotBranches = (expr) => BRANCH_IDS.map((u) => `SUM(IF(unidade_id = '${u}', ${expr}, 0)) AS ${u}`).join(',\n  ');
