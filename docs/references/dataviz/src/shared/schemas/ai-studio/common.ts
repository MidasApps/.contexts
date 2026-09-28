import { z } from 'zod';

export const AiStatus = z.enum(['active', 'draft', 'archived']);
export const AiOrigin = z.enum(['system', 'user']);

/** Campos comuns a todas as 4 entidades do AI Studio (sem `id`). */
export const AiEnvelopeBase = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  status: AiStatus.default('active'),
  origin: AiOrigin.default('user'),
  systemKey: z.string().optional(),
});

export type AiStatus = z.infer<typeof AiStatus>;
export type AiOrigin = z.infer<typeof AiOrigin>;
export type AiEnvelopeBase = z.infer<typeof AiEnvelopeBase>;
