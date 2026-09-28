/**
 * Helper genérico que constrói um Mastra Agent a partir da config do AI Studio,
 * encapsulando o wiring de instruções (static+dynamic), capacidades de skills,
 * KB retrieval e model tier. Compartilhado pelos 8 sub-agentes (ADR-0014/0016).
 */
import { Agent } from '@mastra/core/agent';
import type { AgentDynamicContext, ModelTier } from '@/shared/config/agents/types';
import { SQL_RULES, RESPONSE_GUIDELINES, buildBusinessContext } from '@/shared/config/agents';
import { buildAgentDynamicContext } from '@/shared/config/agents/dynamic-context';
import { getModel, MAX_MODEL_RETRIES } from '@/features/ai-agents/model-registry';
import { resolveAgentInstructions } from '@/features/ai-studio/runtime/resolve-agent';
import { resolveAgentCapabilities } from '@/features/ai-studio/runtime/resolve-capabilities';
import { loadAgentConfig } from '@/features/ai-studio/runtime/config-loader';
import { buildToolsFromKeys } from '@/features/ai-studio/runtime/tool-registry';
import { createKbRetrievalTool } from '@/features/ai-studio/runtime/kb-retrieval-tool';
import { DEFAULT_AGENT_TOOLS } from '@/shared/config/agents/default-agent-tools';
import { withImpliedTools } from '@/features/ai-studio/runtime/implied-tools';
import { withRedactedErrors } from '@/features/ai-studio/runtime/redact-tool-errors';

export interface MastraAgentFactoryInput {
  systemKey: string;
  name: string;
  description: string;
  defaultModelTier: ModelTier;                       // tier real do agente (fallback se config ausente)
  buildStatic: () => string;                          // texto estático do agente (Task 2)
  ctx: AgentDynamicContext;
  // buildToolsFactory removido — tools vêm do registry com fallback DEFAULT
}

/** Baseline em código = estático do agente + as 4 skills compartilhadas (espelha a config). */
function composeCodeBaseline(buildStatic: () => string): string {
  return [buildStatic(), RESPONSE_GUIDELINES, SQL_RULES, buildBusinessContext()].filter(Boolean).join('\n\n');
}

export async function createMastraAgentFromConfig(input: MastraAgentFactoryInput): Promise<Agent> {
  const { systemKey, name, description, defaultModelTier, buildStatic, ctx } = input;

  const cfg = await loadAgentConfig(systemKey).catch(() => null);
  const tier = (() => {
    const VALID_TIERS: readonly ModelTier[] = ['router', 'fast', 'flash', 'reasoning'];
    const t = cfg?.model as string | undefined;
    return VALID_TIERS.includes(t as ModelTier) ? (t as ModelTier) : defaultModelTier;
  })();

  const instructions = [
    await resolveAgentInstructions(systemKey, composeCodeBaseline(buildStatic)),
    buildAgentDynamicContext(ctx),
  ].join('\n\n');

  const caps = await resolveAgentCapabilities(systemKey);
  const toolKeys = withImpliedTools(caps.toolKeys.length > 0 ? caps.toolKeys : (DEFAULT_AGENT_TOOLS[systemKey] ?? []));
  const tools = buildToolsFromKeys(toolKeys, ctx, systemKey) as Record<string, unknown>;

  const kbRefs = Array.from(new Set([...((cfg?.knowledgeBaseRefs as string[] | undefined) ?? []), ...caps.kbRefs]));
  if (kbRefs.length > 0) {
    try {
      // Montada fora do registry: a redação de erro lançado vem daqui.
      tools.kb_retrieval = withRedactedErrors(
        createKbRetrievalTool({ clientId: (ctx as { clientId?: string }).clientId, knowledgeBaseRefs: kbRefs }),
      );
    } catch { /* fail-soft */ }
  }

  return new Agent({
    id: `${systemKey}_agent`,
    name, description, instructions,
    model: getModel(tier) as never,
    // Mesma política do supervisor: sub-agente que morre de 429 derruba a
    // delegação e, com ela, o turno.
    maxRetries: MAX_MODEL_RETRIES,
    tools: tools as never,
  });
}
