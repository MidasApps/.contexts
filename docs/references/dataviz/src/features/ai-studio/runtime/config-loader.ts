import { AiStudioRepo, type AiStudioRecord } from '../repo';

// cache simples por TTL (evita ler Firestore a cada request)
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: AiStudioRecord | null }>();
const skillDocCache = new Map<string, { at: number; value: AiStudioRecord | null }>();
const workflowsCache = new Map<string, { at: number; value: AiStudioRecord[] }>();

/** Lê um agente de sistema pelo systemKey (== id do seed). */
export async function loadAgentConfig(systemKey: string): Promise<AiStudioRecord | null> {
  const hit = cache.get(systemKey);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = await new AiStudioRepo('agent').get(systemKey);
  cache.set(systemKey, { at: now, value });
  return value;
}

/** Carrega os docs completos das skills anexadas (existentes, na ordem), cacheado por TTL. */
export async function loadSkills(skillRefs: string[]): Promise<AiStudioRecord[]> {
  if (!skillRefs?.length) return [];
  const repo = new AiStudioRepo('skill');
  const now = Date.now();
  const out: AiStudioRecord[] = [];
  for (const ref of skillRefs) {
    const hit = skillDocCache.get(ref);
    let value: AiStudioRecord | null;
    if (hit && now - hit.at < TTL_MS) {
      value = hit.value;
    } else {
      value = await repo.get(ref);
      skillDocCache.set(ref, { at: now, value });
    }
    if (value) out.push(value);
  }
  return out;
}

/**
 * Resolve os playbooks (texto) das skills anexadas. Deriva de loadSkills.
 * O fallback `s.name ?? s.id` é equivalente ao `?? ref` da versão anterior:
 * AiStudioRepo.serialize sempre seta `id` = doc id requisitado no get(ref).
 */
export async function loadSkillPlaybooks(skillRefs: string[]): Promise<string[]> {
  const skills = await loadSkills(skillRefs);
  return skills
    .filter((s) => typeof s.playbook === 'string' && (s.playbook as string).trim())
    .map((s) => `## Skill: ${String(s.name ?? s.id)}\n${s.playbook}`);
}

/** Lista os workflows `active` do Firestore, cacheado por TTL. */
export async function loadWorkflows(): Promise<AiStudioRecord[]> {
  const WORKFLOWS_CACHE_KEY = '__workflows__';
  const now = Date.now();
  const hit = workflowsCache.get(WORKFLOWS_CACHE_KEY);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const all = await new AiStudioRepo('workflow').list();
  const active = all.filter((w) => (w.status as string) === 'active');
  workflowsCache.set(WORKFLOWS_CACHE_KEY, { at: now, value: active });
  return active;
}
