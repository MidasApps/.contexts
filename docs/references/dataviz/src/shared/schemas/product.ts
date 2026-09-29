import { z } from 'zod';
import { Slug, SqlIdentifier } from './identifier';
import { MetricId } from './metric';

/**
 * Product — vertical comercial (Credit, Covenants, etc.).
 *
 * Pós ADR-0015: Product passa a ser camada de packaging. O vocabulário
 * canônico (entities + attributes) vive em `dataContracts/*` e as
 * métricas em `metrics/*`. Product apenas referencia ambos via
 * `entityRefs[]` e `metricRefs[]`.
 *
 * O campo `indicators` permanece opcional durante a janela de coexistência
 * (Phase 5+6 do plano semantic-layer). `expectedTables` foi removido (G7).
 */

export const FieldType = z.enum([
  'STRING',
  'INT64',
  'NUMERIC',
  'BIGNUMERIC',
  'FLOAT64',
  'BOOL',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIME',
  'BYTES',
  'GEOGRAPHY',
  'JSON',
]);

export const ProductRoute = z.object({
  path: z.string().regex(/^\/[a-z0-9\-\/]+$/, 'Path inválido'),
  label: z.string().min(1).max(60),
  group: z.string().min(1).max(40),
  icon: z.string().max(40).optional().nullable(),
});

export const IndicatorType = z.enum(['kpi', 'chart', 'table']);

export const ProductIndicator = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'ID deve ser page.slug'),
  label: z.string().min(1).max(120),
  page: z.string().min(1).max(60),
  type: IndicatorType,
  /** Campos requeridos no formato "tabela.campo". */
  requiredFields: z.array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/)).default([]),
});

export const ProductStatus = z.enum(['active', 'draft', 'archived']);

export const ProductDoc = z.object({
  name: z.string().min(2).max(120),
  slug: Slug,
  icon: z.string().max(40),
  color: z.string().min(3).max(30),
  status: ProductStatus.default('draft'),
  description: z.string().max(1000).optional().nullable(),

  // ── Camada nova (ADR-0015) ───────────────────────────────────
  /** Contracts referenciados pelo produto. MVP: sempre `["canonical"]`. */
  contractRefs: z.array(Slug).default([]),
  /** IDs de entities (do contract) disponíveis neste produto. */
  entityRefs: z.array(SqlIdentifier).default([]),
  /** IDs de métricas (do catálogo global) oferecidas pelo produto. */
  metricRefs: z.array(MetricId).default([]),

  // ── Legado (mantido para coexistência — ADR-0015) ────────────
  /** @deprecated — migrado para metrics/*. */
  indicators: z.array(ProductIndicator).default([]),

  routes: z.array(ProductRoute).default([]),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const Product = ProductDoc.extend({
  id: Slug,
});

export type FieldType = z.infer<typeof FieldType>;
export type ProductRoute = z.infer<typeof ProductRoute>;
export type IndicatorType = z.infer<typeof IndicatorType>;
export type ProductIndicator = z.infer<typeof ProductIndicator>;
export type ProductStatus = z.infer<typeof ProductStatus>;
export type ProductDoc = z.infer<typeof ProductDoc>;
export type Product = z.infer<typeof Product>;
