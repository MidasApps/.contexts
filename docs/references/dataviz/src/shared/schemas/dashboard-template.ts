import { z } from 'zod';
import { Slug } from './identifier';

/**
 * Dashboard Template — molde de página pronto (blocos + layout + metadados).
 * Migrado de `src/shared/config/dashboard-templates.ts` (código) para Firestore
 * `dashboardTemplates/{id}` para gestão em runtime via Admin Panel.
 *
 * `blockMap`/`layout` são persistidos como JSON livre — a validação estrutural
 * vive nos tipos do canvas (`@/shared/config/agents/types`).
 */

export const TemplateId = z.string().regex(/^[a-z][a-z0-9-]*$/, {
  message: 'TemplateId deve ser lowercase-slug (ex: "visao-geral", "pdd")',
});

export const TemplateSegment = z.enum(['sbpe', 'mcmv', 'both']);
export const TemplateCategory = z.enum(['Carteira', 'Risco', 'Operacional', 'Covenants', 'Imobiliária']);
export const TemplateStatus = z.enum(['active', 'draft', 'archived']);

export const DashboardTemplateDoc = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500),
  category: TemplateCategory,
  /** Produtos (slugs de products/) aos quais o template pertence. Pelo menos 1. */
  productRefs: z.array(Slug).min(1),
  segment: TemplateSegment.optional(),
  blockMap: z.record(z.string(), z.unknown()).default({}),
  layout: z.array(z.unknown()).default([]),
  filters: z.record(z.string(), z.unknown()).optional(),
  queries: z.array(z.unknown()).optional(),
  metricRefs: z.array(z.string()).default([]),
  status: TemplateStatus.default('active'),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const DashboardTemplate = DashboardTemplateDoc.extend({ id: TemplateId });

export type TemplateSegment = z.infer<typeof TemplateSegment>;
export type TemplateCategory = z.infer<typeof TemplateCategory>;
export type TemplateStatus = z.infer<typeof TemplateStatus>;
export type DashboardTemplateDoc = z.infer<typeof DashboardTemplateDoc>;
export type DashboardTemplate = z.infer<typeof DashboardTemplate>;
