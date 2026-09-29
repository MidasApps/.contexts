import { loadAgentConfig, loadSkills } from './config-loader';

export interface AgentCapabilities { toolKeys: string[]; kbRefs: string[]; }
const EMPTY: AgentCapabilities = { toolKeys: [], kbRefs: [] };

/** Une as capacidades declaradas pelo agente e pelas skills. Erro → vazio (fail-soft). */
export async function resolveAgentCapabilities(systemKey: string): Promise<AgentCapabilities> {
  try {
    const agent = await loadAgentConfig(systemKey);
    if (!agent) return EMPTY;
    const skills = await loadSkills((agent.skillRefs as string[] | undefined) ?? []);
    const toolKeys = new Set<string>((agent.toolRefs as string[] | undefined) ?? []);
    const kbRefs = new Set<string>((agent.knowledgeBaseRefs as string[] | undefined) ?? []);
    for (const skill of skills) {
      for (const t of (skill.toolRefs as string[] | undefined) ?? []) toolKeys.add(t);
      for (const k of (skill.knowledgeBaseRefs as string[] | undefined) ?? []) kbRefs.add(k);
    }
    return { toolKeys: Array.from(toolKeys), kbRefs: Array.from(kbRefs) };
  } catch {
    return EMPTY;
  }
}
