import { z } from 'zod';
// `Slug` e não um enum de tenants: cliente é cadastro da administração, então
// validar contra lista fixa recusaria dado de cliente novo até um deploy.
import { Slug } from '@/shared/schemas/identifier';

export const RetrievedChunkSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(1),
  text: z.string().min(1),
  metadata: z.object({
    clientId: Slug,
    sourceDoc: z.string(),
    themes: z.array(z.string()).default([]),
    productType: z.string().optional(),
    regulatoryArea: z.string().optional(),
  }),
});

export const KpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  formula: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium']),
});

export const VisualSchema = z.object({
  type: z.string(),
  title: z.string(),
  kpis: z.array(z.string()).min(1),
});

export const DashboardTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  persona: z.string(),
  client: Slug,
  kpis: z.array(KpiSchema).min(3),
  visuals: z.array(VisualSchema).min(1),
  tables: z.array(z.object({ title: z.string(), columns: z.array(z.string()).min(1) })).default([]),
});

export const BusinessContextSchema = z.object({
  static: z.record(z.string(), z.unknown()),
  retrieved: z.array(RetrievedChunkSchema),
  macro: z.unknown(),
  template: DashboardTemplateSchema.nullable(),
  glossaryVersion: z.string(),
  retrievalMeta: z.object({
    latencyMs: z.number(),
    cacheHit: z.boolean(),
    source: z.enum(['rag', 'fallback', 'partial']),
  }),
});

export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;
export type DashboardTemplate = z.infer<typeof DashboardTemplateSchema>;
export type BusinessContext = z.infer<typeof BusinessContextSchema>;
