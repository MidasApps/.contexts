import { describe, it, expect } from 'vitest';
import { ENTITY_CONFIGS, getEntityConfig } from './entity-config';

describe('entity-config', () => {
  it('mapeia as 4 entidades às coleções corretas', () => {
    expect(ENTITY_CONFIGS.agent.collection).toBe('aiAgents');
    expect(ENTITY_CONFIGS.skill.collection).toBe('aiSkills');
    expect(ENTITY_CONFIGS.workflow.collection).toBe('aiWorkflows');
    expect(ENTITY_CONFIGS.knowledgeBase.collection).toBe('knowledgeBases');
  });
  it('agente define refSpecs de skill/tool/kb', () => {
    const fields = ENTITY_CONFIGS.agent.refSpecs.map((r) => r.field);
    expect(fields).toEqual(expect.arrayContaining(['skillRefs', 'toolRefs', 'knowledgeBaseRefs']));
    const toolSpec = ENTITY_CONFIGS.agent.refSpecs.find((r) => r.field === 'toolRefs');
    expect(toolSpec?.kind).toBe('toolManifest');
  });
  it('getEntityConfig lança em tipo inválido', () => {
    // @ts-expect-error tipo inválido proposital
    expect(() => getEntityConfig('foo')).toThrow();
  });
});
