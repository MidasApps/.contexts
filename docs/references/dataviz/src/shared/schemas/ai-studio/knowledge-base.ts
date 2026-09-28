import { z } from 'zod';
import { AiEnvelopeBase } from './common';

export const KnowledgeBaseDoc = AiEnvelopeBase.extend({
  clientId: z.string().nullable().default(null),
  embeddingModel: z.string().default('gemini-embedding-001'),
  docCount: z.number().int().nonnegative().default(0),
  chunkCount: z.number().int().nonnegative().default(0),
});

export type KnowledgeBaseDoc = z.infer<typeof KnowledgeBaseDoc>;
