import { z } from 'zod';
import { AiEnvelopeBase } from './common';
import { Slug } from '../identifier';

export const ModelTier = z.enum(['router', 'fast', 'flash', 'reasoning']);
export const AgentKind = z.enum(['worker', 'orchestrator']);

export const AiAgentDoc = AiEnvelopeBase.extend({
  kind: AgentKind.default('worker'),
  instructions: z.string().max(20000).default(''),
  model: ModelTier.default('fast'),
  skillRefs: z.array(Slug).default([]),
  toolRefs: z.array(z.string()).default([]),
  knowledgeBaseRefs: z.array(Slug).default([]),
});

export type ModelTier = z.infer<typeof ModelTier>;
export type AgentKind = z.infer<typeof AgentKind>;
export type AiAgentDoc = z.infer<typeof AiAgentDoc>;
