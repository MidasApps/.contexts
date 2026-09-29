import { z } from 'zod';


export const PersonaProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  layer: z.enum(['estrategica', 'tatica', 'operacional']),
  language: z.enum(['tecnica', 'executiva', 'operacional']),
  horizon: z.enum(['curto', 'medio', 'longo']),
  priorityKpis: z.array(z.string()).min(1),
  preferredGranularity: z.enum(['contrato', 'safra', 'carteira']),
  preferredVisuals: z.array(z.string()).default([]),
  jargonAnchor: z.array(z.string()).default([]),
  forbidden: z.array(z.string()).default([]),
  _meta: z
    .object({
      refinedBySme: z.boolean().optional(),
      sourceDoc: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const IcpProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  segment: z.string().min(1),
  examples: z.array(z.string()).default([]),
  primaryKpis: z.array(z.string()).min(1),
  decisionJourney: z.string().min(1),
  _meta: z.object({ refinedBySme: z.boolean().optional() }).partial().optional(),
});

export type PersonaProfile = z.infer<typeof PersonaProfileSchema>;
export type IcpProfile = z.infer<typeof IcpProfileSchema>;
