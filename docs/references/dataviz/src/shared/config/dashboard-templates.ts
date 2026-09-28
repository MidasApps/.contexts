import type { CanvasBlock, CanvasRow, CanvasPageFilters } from '@/shared/config/agents/types';

/**
 * Tipos dos templates de dashboard/relatório.
 *
 * O array hard-coded `DASHBOARD_TEMPLATES` (40 templates) e seus seeds
 * foram removidos (Tier 2c) — o runtime lê templates do Firestore
 * (`dashboardTemplates/{id}`, via `getTemplate()`), seedados por
 * `scripts/seed-covenants-templates.ts` a partir de
 * `scripts/templates/*.template.mjs`. Estes tipos permanecem porque ainda
 * são o contrato compartilhado por: useReports/useReportData/firestore/reports
 * (TemplateQueryConfig), TemplateGallery (TemplateSegment/TEMPLATE_CATEGORIES),
 * agents/build-system (DashboardTemplate) e o JSDoc dos `.mjs`.
 */

export interface TemplateBlockMapping {
  /** Path in the query result to extract value (dot-notation). Use '_array' for the whole result array. */
  resultPath: string;
  /** For KPIs: how to format the value */
  format?: 'number' | 'currency' | 'percent';
  /** For KPIs: field name in kpi_history for sparkline data */
  historyField?: string;
}

export interface TemplateQueryConfig {
  /** BigQuery action name (e.g., 'contratos_aggregated') */
  action: string;
  /** Maps block IDs to result paths */
  blockMapping: Record<string, TemplateBlockMapping>;
}

/**
 * Segmento de carteira aplicável. Relevante principalmente para Play+
 * (covenants tem regras diferentes para SBPE × MCMV). `both` = vale para
 * os dois. `undefined` = não tem distinção (templates Play que servem
 * qualquer carteira).
 */
export type TemplateSegment = 'sbpe' | 'mcmv' | 'both';

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Carteira' | 'Risco' | 'Operacional' | 'Covenants' | 'Imobiliária';
  productRefs: string[];
  /** Segmento (Play+) — undefined em templates Play que não dependem disso. */
  segment?: TemplateSegment;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  /**
   * Filtros de página persistidos ao importar — inclui `metricPageFilters`
   * que diz a `useReportData` quais atributos default cada filtro mapeia
   * para recipes que usam `{filter.X}` sem override `:entity.attr`.
   */
  filters?: CanvasPageFilters;
  /** Query configs for auto-populating data when rendered */
  queries?: TemplateQueryConfig[];
  /**
   * Metric IDs (do produto Liquid Play / coleção `metrics/` no Firestore) que este
   * template cobre. Serve de contract schema para a IA: cada metric carrega
   * `requires[]` apontando para `<contract>.<entity>.<attribute>` no Data Contract,
   * permitindo descoberta automática dos atributos disponíveis ao gerar indicadores.
   */
  metricRefs: string[];
}

export const TEMPLATE_CATEGORIES = ['Carteira', 'Risco', 'Operacional', 'Covenants', 'Imobiliária'] as const;
