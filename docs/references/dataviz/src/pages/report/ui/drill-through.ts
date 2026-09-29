/**
 * Drill-through entre reports (G5): propaga a seleção dos dropdowns de
 * página (`usePageFilterValues`) via querystring `pf.<attribute>=v1,v2` e
 * resolve tokens `{groupId}` / `{report:<templateId>}` / `{pageFilters}`
 * em conteúdo de blocos `text`, replicando o botão "Extrato Detalhado →"
 * do Looker do cliente na engine de reports.
 *
 * Funções puras — sem dependência de Next.js/React, testáveis isoladamente.
 * `URLSearchParams` é usado nos dois sentidos (serialize/parse) para que a
 * codificação de `.` no atributo e de espaço/acento nos valores seja
 * simétrica.
 */

const PF_PREFIX = 'pf.';

/**
 * Serializa `pageFilterValues` (estado de `usePageFilterValues`) como
 * querystring `pf.<attr>=v1,v2&...` (sem `?` inicial). Chaves com array
 * vazio/ausente são omitidas.
 */
export function serializePageFilters(values: Record<string, string[]>): string {
  const params = new URLSearchParams();
  for (const [key, selected] of Object.entries(values)) {
    if (!selected?.length) continue;
    params.set(`${PF_PREFIX}${key}`, selected.join(','));
  }
  return params.toString();
}

/**
 * Extrai os pares `pf.<attr>=v1,v2` de um `URLSearchParams` (ex.: o
 * retorno de `useSearchParams()`) para o shape de `pageFilterValues`.
 * Pares fora do namespace `pf.` são ignorados; `searchParams` nulo/
 * indefinido retorna `{}`.
 */
export function parsePageFiltersFromSearch(
  searchParams: URLSearchParams | null | undefined,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!searchParams) return result;

  searchParams.forEach((value, key) => {
    if (!key.startsWith(PF_PREFIX)) return;
    const attribute = key.slice(PF_PREFIX.length);
    if (!attribute) return;
    const selected = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (selected.length) result[attribute] = selected;
  });

  return result;
}

export interface ReportTokenContext {
  /** Grupo atual — substitui o token `{groupId}`. */
  groupId: string;
  /** Serialização atual dos dropdowns (`serializePageFilters`) — substitui `{pageFilters}`. */
  pageFilters: string;
  /**
   * Resolve o `templateId` de um token `{report:<templateId>}` para o id do
   * report do grupo atual cuja lineage (`Report.templateId`) bate. Retorna
   * `undefined` quando não encontrado — o token é mantido literal (soft
   * failure, mesmo padrão de refs de catálogo do projeto).
   */
  resolveReportId?: (templateId: string) => string | undefined;
}

const REPORT_TOKEN_RE = /\{report:([^}]+)\}/g;

/**
 * Substitui os tokens `{groupId}`, `{pageFilters}` e `{report:<templateId>}`
 * em conteúdo markdown de blocos `text`. Uso opt-in: conteúdo sem tokens
 * volta inalterado.
 */
export function substituteReportTokens(content: string, ctx: ReportTokenContext): string {
  if (!content) return content;

  let result = content
    .split('{groupId}').join(ctx.groupId)
    .split('{pageFilters}').join(ctx.pageFilters);

  result = result.replace(REPORT_TOKEN_RE, (match, templateId: string) => {
    const reportId = ctx.resolveReportId?.(templateId);
    if (!reportId) {
      console.warn(`[drill-through] report não encontrado para templateId="${templateId}"`);
      return match;
    }
    return reportId;
  });

  return result;
}
