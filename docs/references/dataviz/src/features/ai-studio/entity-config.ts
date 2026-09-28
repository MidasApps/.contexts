import type { z } from 'zod';
import type { AiEntityType } from './protection';
import { AiAgentDoc } from '@/shared/schemas/ai-studio/agent';
import { AiSkillDoc } from '@/shared/schemas/ai-studio/skill';
import { AiWorkflowDoc } from '@/shared/schemas/ai-studio/workflow';
import { KnowledgeBaseDoc } from '@/shared/schemas/ai-studio/knowledge-base';

export type { AiEntityType } from './protection';

export interface RefSpec {
  field: string;
  kind: 'collection' | 'toolManifest';
  collection?: string;
}

export interface EntityConfig {
  type: AiEntityType;
  collection: string;
  docSchema: z.ZodType;
  /** Campos que PATCH pode tocar (allowlist), espelha o PATCH de dashboard-templates. */
  editableOnPatch: string[];
  refSpecs: RefSpec[];
}

export const ENTITY_CONFIGS: Record<AiEntityType, EntityConfig> = {
  agent: {
    type: 'agent',
    collection: 'aiAgents',
    docSchema: AiAgentDoc,
    editableOnPatch: ['name', 'description', 'status', 'instructions', 'model', 'skillRefs', 'toolRefs', 'knowledgeBaseRefs'],
    refSpecs: [
      { field: 'skillRefs', kind: 'collection', collection: 'aiSkills' },
      { field: 'toolRefs', kind: 'toolManifest' },
      { field: 'knowledgeBaseRefs', kind: 'collection', collection: 'knowledgeBases' },
    ],
  },
  skill: {
    type: 'skill',
    collection: 'aiSkills',
    docSchema: AiSkillDoc,
    editableOnPatch: ['name', 'description', 'status', 'playbook', 'toolRefs', 'knowledgeBaseRefs'],
    refSpecs: [
      { field: 'toolRefs', kind: 'toolManifest' },
      { field: 'knowledgeBaseRefs', kind: 'collection', collection: 'knowledgeBases' },
    ],
  },
  workflow: {
    type: 'workflow',
    collection: 'aiWorkflows',
    docSchema: AiWorkflowDoc,
    editableOnPatch: ['name', 'description', 'status', 'instruction', 'isDefault'],
    refSpecs: [],
  },
  knowledgeBase: {
    type: 'knowledgeBase',
    collection: 'knowledgeBases',
    docSchema: KnowledgeBaseDoc,
    editableOnPatch: ['name', 'description', 'status'],
    refSpecs: [],
  },
};

export function getEntityConfig(type: AiEntityType): EntityConfig {
  const cfg = ENTITY_CONFIGS[type];
  if (!cfg) throw new Error(`Entidade AI Studio desconhecida: ${type}`);
  return cfg;
}
