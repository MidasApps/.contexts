import { z } from 'zod';
import { AiEnvelopeBase } from './common';
import { Slug } from '../identifier';

export const AiSkillDoc = AiEnvelopeBase.extend({
  playbook: z.string().max(20000).default(''),
  toolRefs: z.array(z.string()).default([]),
  knowledgeBaseRefs: z.array(Slug).default([]),
});

export type AiSkillDoc = z.infer<typeof AiSkillDoc>;
