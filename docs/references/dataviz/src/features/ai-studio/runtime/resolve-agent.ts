import { loadAgentConfig, loadSkillPlaybooks } from './config-loader';

/**
 * Instrução final estática do agente: config (Firestore) + playbooks das skills.
 * Em ausência/erro → codeFallback (baseline em código). Nunca vazia. Resiliente.
 */
export async function resolveAgentInstructions(systemKey: string, codeFallback: string): Promise<string> {
  try {
    const cfg = await loadAgentConfig(systemKey);
    if (cfg && typeof cfg.instructions === 'string' && cfg.instructions.trim()) {
      const playbooks = await loadSkillPlaybooks((cfg.skillRefs as string[]) ?? []);
      return [cfg.instructions, ...playbooks].join('\n\n');
    }
  } catch {
    // resiliente: cai no baseline de código
  }
  return codeFallback;
}
