import { describe, it, expect } from 'vitest';
import { AiAgentDoc, ModelTier } from '../agent';

describe('AiAgentDoc — enum ModelTier (a6-ia-01)', () => {
  it('enum canônico = router|fast|flash|reasoning (sem slow)', () => {
    expect(ModelTier.options).toEqual(['router', 'fast', 'flash', 'reasoning']);
  });

  it("aceita model:'flash' (tier oferecido no dropdown e no model-registry)", () => {
    const doc = AiAgentDoc.parse({ name: 'Agente X', model: 'flash' });
    expect(doc.model).toBe('flash');
  });

  it("rejeita model:'slow' (removido; inexistente no runtime/registry)", () => {
    expect(() => AiAgentDoc.parse({ name: 'Agente X', model: 'slow' })).toThrow();
  });
});
