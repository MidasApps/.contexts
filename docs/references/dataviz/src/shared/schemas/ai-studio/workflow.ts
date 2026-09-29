import { z } from 'zod';
import { AiEnvelopeBase } from './common';

export const AiWorkflowDoc = AiEnvelopeBase.extend({
  instruction: z.string().max(20000).default(''),
  isDefault: z.boolean().default(false),
});

export type AiWorkflowDoc = z.infer<typeof AiWorkflowDoc>;
