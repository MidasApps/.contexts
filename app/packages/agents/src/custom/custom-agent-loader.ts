import { type CustomAgent, CustomAgentIdSchema, type CustomSkill } from "@core/contracts";
import { CUSTOM_AGENT_ID_KEY, type RequestContextReader, readAgentContext } from "../context/agent-request-context.ts";
import type { CustomAgentsPort } from "../runtime/runtime-ports.ts";

export { CUSTOM_AGENT_ID_KEY } from "../context/agent-request-context.ts";

/** Loaded records are re-read at most once a minute per (tenant, agent); a write asks for `invalidate`. */
export const CUSTOM_AGENT_CACHE_TTL_MS = 60_000;

/** An enabled custom agent with the enabled skills of its tenant it selected. */
export type LoadedCustomAgent = { readonly agent: CustomAgent; readonly skills: readonly CustomSkill[] };

export type CustomAgentLoader = {
  /**
   * The tenant's enabled agent, or `null` when it does not exist there, is disabled or the id is
   * malformed. Rejects when the store fails (callers fail closed).
   */
  readonly load: (input: { readonly tenantId: string; readonly agentId: string }) => Promise<LoadedCustomAgent | null>;
  /** The agent the run's context names (`CUSTOM_AGENT_ID_KEY`) in the run's tenant; `null` without one. */
  readonly ofRun: (requestContext: RequestContextReader | undefined) => Promise<LoadedCustomAgent | null>;
  /** Whether the context names a custom agent at all (the run is a custom agent's). */
  readonly isCustomRun: (requestContext: RequestContextReader | undefined) => boolean;
  /** Drops the cached records of a tenant (after a write through `/v1`). */
  readonly invalidate: (tenantId: string) => void;
};

type Entry = { readonly loaded: Promise<LoadedCustomAgent | null>; readonly at: number };

const SEPARATOR = "\u0000";

const customAgentIdOf = (requestContext: RequestContextReader | undefined): string | undefined => {
  const value = requestContext?.get(CUSTOM_AGENT_ID_KEY);
  return typeof value === "string" && value !== "" ? value : undefined;
};

/**
 * Loads custom agents for the runtime: tenant-scoped reads through the port, cached 60 s per
 * (tenant, agent). A failed read is not cached. The tenant always comes from the verified context
 * or the caller's argument, never from the record.
 */
export const createCustomAgentLoader = (
  port: CustomAgentsPort,
  options: { readonly ttlMs?: number; readonly now?: () => number } = {},
): CustomAgentLoader => {
  const ttl = options.ttlMs ?? CUSTOM_AGENT_CACHE_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, Entry>();
  const read = async (tenantId: string, agentId: string): Promise<LoadedCustomAgent | null> => {
    const agent = await port.getAgent({ tenantId, agentId });
    // Defence in depth: the port already filters by tenant.
    if (agent === null || agent.tenantId !== tenantId || !agent.enabled) return null;
    if (agent.customSkills.length === 0) return { agent, skills: [] };
    const selected = new Set<string>(agent.customSkills);
    const skills = (await port.listSkills({ tenantId })).filter(
      (skill) => skill.tenantId === tenantId && skill.enabled && selected.has(skill.id),
    );
    return { agent, skills };
  };
  const load: CustomAgentLoader["load"] = ({ tenantId, agentId }) => {
    if (!CustomAgentIdSchema.safeParse(agentId).success) return Promise.resolve(null);
    const key = `${tenantId}${SEPARATOR}${agentId}`;
    const cached = cache.get(key);
    if (cached !== undefined && now() - cached.at < ttl) return cached.loaded;
    const loaded = read(tenantId, agentId);
    cache.set(key, { loaded, at: now() });
    loaded.catch(() => {
      if (cache.get(key)?.loaded === loaded) cache.delete(key);
    });
    return loaded;
  };
  return {
    load,
    ofRun: (requestContext) => {
      const agentId = customAgentIdOf(requestContext);
      const context = readAgentContext(requestContext);
      if (agentId === undefined || !context.ok) return Promise.resolve(null);
      return load({ tenantId: context.data.context.tenantId, agentId });
    },
    isCustomRun: (requestContext) => requestContext?.get(CUSTOM_AGENT_ID_KEY) !== undefined,
    invalidate: (tenantId) => {
      for (const key of cache.keys()) if (key.startsWith(`${tenantId}${SEPARATOR}`)) cache.delete(key);
    },
  };
};
