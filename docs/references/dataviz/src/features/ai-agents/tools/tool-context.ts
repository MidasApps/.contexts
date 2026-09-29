import type { ChatRequestFilters } from '@/shared/config/agents/types';

/**
 * Shared context passed to all tool factories.
 * Replaces the bare `dataset: string` parameter.
 */
export interface ToolContext {
  dataset: string;
  filters: ChatRequestFilters;
  /** Unique session ID for BQML model scoping. Generated per API request. */
  sessionId: string;
  /** Tenant identifier for multi-tenancy/recall scoping (ADR-0006). */
  clientId?: string;
  /** Persona identifier for multi-tenancy/recall scoping (ADR-0006). */
  personaId?: string;
}

/**
 * Builds a WHERE clause fragment for the `contratos` table based on active filters.
 * Returns empty string if no filters are active beyond the required ones.
 * Does NOT include the WHERE keyword — caller must prepend it.
 */
export function buildFilterClause(
  ctx: ToolContext,
  opts: {
    dateColumn?: string;
    dateMode?: 'snapshot' | 'range' | 'none';
    tableAlias?: string;
  } = {},
): string {
  const defaultDateMode = ctx.filters.viewMode === 'accumulated' ? 'range' : 'snapshot';
  const { dateColumn = 'data_base_report', dateMode = defaultDateMode, tableAlias } = opts;
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const clauses: string[] = [];

  if (dateMode === 'snapshot') {
    clauses.push(`${prefix}${dateColumn} = '${ctx.filters.dateRange.end}'`);
  } else if (dateMode === 'range') {
    clauses.push(`${prefix}${dateColumn} BETWEEN '${ctx.filters.dateRange.start}' AND '${ctx.filters.dateRange.end}'`);
  }

  /*
   * Aqui entravam também `projeto IN (…)` e as seis faixas de carteira
   * (rating, elegibilidade, LTV, atraso, proponente, repasse), montadas a
   * partir dos filtros globais. Esses controles saíram da interface: as opções
   * eram literais no código e nada no catálogo as aplicava. Sem quem os
   * alimente, o que restava aqui era SQL que nunca seria emitido.
   */

  return clauses.length > 0 ? clauses.join(' AND ') : '';
}

/** Returns "WHERE <clauses>" or empty string. */
// buildWhereClause() removida — as tools montam o SQL com buildAndClause
// (abaixo), que anexa a um WHERE já existente. Nenhuma chamava a variante que
// emitia a cláusula inteira.

/** Returns "AND <clauses>" or empty string. For appending to existing WHERE. Skips date filter by default. */
export function buildAndClause(
  ctx: ToolContext,
  opts?: Parameters<typeof buildFilterClause>[1],
): string {
  const defaultDateMode = ctx.filters.viewMode === 'accumulated' ? 'range' : 'none';
  const clause = buildFilterClause(ctx, { dateMode: defaultDateMode, ...opts });
  return clause ? `AND ${clause}` : '';
}
