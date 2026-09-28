import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  vertexMock: vi.fn((id: string) => ({ __id: id })),
  wrapMock: vi.fn((args: Record<string, unknown>) => ({ __wrapped: args.model, __mw: args.middleware })),
  middlewareMock: vi.fn((args: Record<string, unknown>) => ({ __settings: args.settings })),
}));

vi.mock('@ai-sdk/google-vertex', () => ({ vertex: h.vertexMock }));
vi.mock('ai', () => ({
  wrapLanguageModel: h.wrapMock,
  defaultSettingsMiddleware: h.middlewareMock,
  customProvider: (cfg: { languageModels: Record<string, unknown> }) => ({
    languageModel: (tier: string) => cfg.languageModels[tier],
  }),
}));

import { getModel, getProviderOptions } from './model-registry';

/** thinkingBudget que o middleware embutiu no modelo do tier. */
function modelBudget(tier: 'router' | 'fast' | 'flash' | 'reasoning'): unknown {
  const m = getModel(tier) as unknown as { __mw: { __settings: Record<string, never> } };
  const po = m.__mw.__settings.providerOptions as unknown as {
    google: { thinkingConfig: { thinkingBudget: number } };
  };
  return po.google.thinkingConfig.thinkingBudget;
}

/**
 * O orçamento viaja dentro do modelo, não no ponto de chamada.
 *
 * `providerOptions` vive em `AgentExecutionOptions` — no `stream()` — e passá-lo
 * lá cobre só quem a gente lembrar de instrumentar. Os 8 sub-agentes ficavam de
 * fora: quem os invoca é o supervisor, pela chave `agents:` do Mastra, dentro do
 * runtime. Sintoma silencioso — funcionava, só 2,7× mais devagar.
 */
describe('model-registry — thinking embutido no modelo', () => {
  it('cada tier carrega o próprio orçamento', () => {
    expect(modelBudget('router')).toBe(0);
    expect(modelBudget('fast')).toBe(2048);
    expect(modelBudget('flash')).toBe(0);
    expect(modelBudget('reasoning')).toBe(8192);
  });

  // `undefined` não envia config e deixa valer o default do modelo, que na
  // geração 3 é pensar — o oposto do que "sem thinking" quer dizer.
  it('"sem thinking" é zero explícito, nunca ausência de config', () => {
    for (const tier of ['router', 'flash'] as const) {
      expect(modelBudget(tier)).toBe(0);
      expect(modelBudget(tier)).not.toBeUndefined();
    }
  });

  it('os tiers rápidos compartilham modelo e diferem só no thinking', () => {
    const fast = getModel('fast') as unknown as { __wrapped: { __id: string } };
    const flash = getModel('flash') as unknown as { __wrapped: { __id: string } };
    expect(fast.__wrapped.__id).toBe(flash.__wrapped.__id);
    expect(modelBudget('fast')).not.toBe(modelBudget('flash'));
  });

  it('getProviderOptions segue disponível para quem chama o modelo por fora', () => {
    expect(getProviderOptions('reasoning')).toEqual({
      google: { thinkingConfig: { thinkingBudget: 8192 } },
    });
  });
});
