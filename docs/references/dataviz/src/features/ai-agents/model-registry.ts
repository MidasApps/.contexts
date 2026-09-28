import { customProvider, wrapLanguageModel, defaultSettingsMiddleware } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import type { ModelTier } from '@/shared/config/agents/types';

/**
 * Orçamento de thinking por tier.
 *
 * `0` é diferente de "não declarado": sem `thinkingConfig` vale o default do
 * modelo — que na geração 3 é PENSAR. Os tiers `router` e `flash` diziam no
 * comentário que priorizavam latência e não mandavam config nenhuma, o oposto do
 * que o comentário afirmava. Passava despercebido porque o 2.5-flash-lite já não
 * pensava por padrão; medido no 3.6-flash, 4.691ms (default) × 1.654ms (zero).
 *
 * - router: zero — roteia, não delibera
 * - fast: leve — análise descritiva, query simples
 * - flash: zero — supervisor (escolhe ferramenta) e utilitários
 * - reasoning: fundo — projeção, simulação, diagnóstico
 */
const THINKING_BUDGET: Record<ModelTier, number> = {
  router: 0,
  fast: 2048,
  flash: 0,
  reasoning: 8192,
};

/**
 * Modelo com o thinking do seu tier embutido.
 *
 * O orçamento viaja DENTRO do modelo, não no ponto de chamada. `providerOptions`
 * vive em `AgentExecutionOptions` — no `stream()` —, e passá-lo lá cobre só quem
 * a gente lembrar de instrumentar: o supervisor sim, mas os 8 sub-agentes não,
 * porque quem os invoca é o próprio supervisor (chave `agents:` do Mastra),
 * dentro do runtime, fora do alcance de qualquer opção que a rota passe. O
 * sintoma era silencioso — tudo funcionava, só 2,7× mais devagar
 * (fluxo de autoria: 10.746ms contra 3.990ms).
 *
 * Como `defaultSettingsMiddleware`, o que a chamada passar continua vencendo:
 * é piso, não teto.
 */
function modelForTier(id: string, tier: ModelTier) {
  return wrapLanguageModel({
    model: vertex(id),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          google: { thinkingConfig: { thinkingBudget: THINKING_BUDGET[tier] } },
        },
      },
    }),
  });
}

let _models: ReturnType<typeof customProvider> | null = null;

function getModels() {
  if (!_models) {
    _models = customProvider({
      languageModels: {
        router: modelForTier('gemini-3.5-flash-lite', 'router'),
        fast: modelForTier('gemini-3.6-flash', 'fast'),
        // Mesmo modelo que 'fast', tier separado por causa do thinking: usado
        // pelo supervisor (escolhe ferramenta, não delibera) e por utilitários
        // leves como o summarizeStep.
        flash: modelForTier('gemini-3.6-flash', 'flash'),
        reasoning: modelForTier('gemini-3.1-pro-preview', 'reasoning'),
      },
    });
  }
  return _models;
}

/**
 * Quantas vezes insistir com o provedor antes de desistir do turno.
 *
 * O padrão do AI SDK é 2, e 2 não cobre o 429 do Vertex: o `RESOURCE_EXHAUSTED`
 * no endpoint `global` é capacidade compartilhada, some em segundos e volta —
 * mas duas tentativas com backoff curto acabam antes disso, e o usuário recebe
 * um erro por uma fila que já tinha andado.
 *
 * O custo é assimétrico e é por isso que o número sobe: tentativa extra só
 * acontece no caminho da falha, enquanto desistir cedo custa o turno inteiro,
 * que já gastou prompt, contexto semântico e memória.
 */
export const MAX_MODEL_RETRIES = 5;

export function getModel(tier: ModelTier) {
  return getModels().languageModel(tier);
}

// ProviderOptions = Record<string, JSONObject> where JSONObject = { [key: string]: JSONValue | undefined }
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue | undefined };
type ProviderOptions = Record<string, { [key: string]: JSONValue | undefined }>;

/**
 * Thinking config do tier, explícita.
 *
 * Os agentes não precisam disto — `getModel` já devolve o modelo com o
 * orçamento embutido. Existe para quem chama o modelo por fora do registry
 * (o judge de evals monta o seu com `generateObject`).
 */
export function getProviderOptions(tier: ModelTier): ProviderOptions {
  return {
    google: {
      thinkingConfig: {
        thinkingBudget: THINKING_BUDGET[tier],
      },
    },
  };
}
