import { z } from 'zod';

export const PageSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
});

export const BlockSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  kind: z.string(),
  spec: z.record(z.string(), z.unknown()).optional(),
});

export const DecisionSchema = z.object({
  ts: z.string(),
  kind: z.string(),
  rationale: z.string(),
});

export const WorkingMemorySchema = z.object({
  clientId: z.string().min(1),
  personaId: z.string().min(1),
  icpId: z.string().min(1),
  productType: z.string().min(1),
  briefing: z.string().default(''),
  activeDashboardId: z.string().nullable().default(null),
  pages: z.array(PageSchema).max(10).default([]),
  blocks: z.array(BlockSchema).max(40).default([]),
  decisions: z.array(DecisionSchema).max(50).default([]),
  pendingQuestions: z.array(z.string()).max(10).default([]),
});

export type WorkingMemory = z.infer<typeof WorkingMemorySchema>;

export const WorkingMemoryPatchSchema = WorkingMemorySchema.partial();
export type WorkingMemoryPatch = z.infer<typeof WorkingMemoryPatchSchema>;
