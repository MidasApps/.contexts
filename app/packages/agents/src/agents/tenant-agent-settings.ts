import type { AgentSettings } from "@core/contracts";
import { type RequestContextReader, readAgentContext } from "../context/agent-request-context.ts";
import type { SettingsPort } from "../runtime/runtime-ports.ts";

/**
 * What the supervisor may use in one tenant (spec §6, §8.5, decision 0019 amendment):
 * the subagents of `agent-settings.enabledAgents`, and `web` only when the tenant also
 * opted in to a web tool. Settings are read once per run (keyed by the request context).
 */

/** Core subagents when a tenant's settings cannot be read: never `web` (an opt-in) and no module agent. */
export const DEFAULT_ENABLED_SUBAGENTS: readonly string[] = ["knowledge", "data", "action"];

export const WEB_AGENT_KEY = "web";

export type TenantAgentSettings = {
  /** Subagent keys the supervisor may delegate to. */
  readonly enabledAgents: ReadonlySet<string>;
  readonly webTools: AgentSettings["webTools"];
  /** `false` when the settings were unreadable and the defaults apply. */
  readonly fromStore: boolean;
};

const WEB_OFF: AgentSettings["webTools"] = { firecrawl: false, browser: false };

const DEFAULTS: TenantAgentSettings = { enabledAgents: new Set(DEFAULT_ENABLED_SUBAGENTS), webTools: WEB_OFF, fromStore: false };

/** No subagent at all: the context is incomplete (the run then fails on its schema anyway). */
const NOTHING: TenantAgentSettings = { enabledAgents: new Set(), webTools: WEB_OFF, fromStore: false };

const fromSettings = (settings: AgentSettings): TenantAgentSettings => {
  const webOptIn = settings.webTools.firecrawl || settings.webTools.browser;
  const enabled = settings.enabledAgents.filter((key) => key !== WEB_AGENT_KEY || webOptIn);
  return { enabledAgents: new Set(enabled), webTools: settings.webTools, fromStore: true };
};

export type TenantAgentSettingsReader = (requestContext: RequestContextReader | undefined) => Promise<TenantAgentSettings>;

/**
 * Reads the tenant settings of a run through the settings port, memoized per request
 * context object (Mastra resolves agents, skills and delegation hooks several times per run).
 * An unreadable store falls back to the core defaults with the web off.
 */
export const createTenantAgentSettingsReader = (settings: SettingsPort): TenantAgentSettingsReader => {
  const memo = new WeakMap<object, Promise<TenantAgentSettings>>();
  const load = async (requestContext: RequestContextReader | undefined): Promise<TenantAgentSettings> => {
    const read = readAgentContext(requestContext);
    if (!read.ok) return NOTHING;
    try {
      return fromSettings(await settings.getAgentSettings({ tenantId: read.data.context.tenantId }));
    } catch {
      // Store unreachable (unwired until SP5): core subagents only, never an opt-in.
      return DEFAULTS;
    }
  };
  return (requestContext) => {
    if (requestContext === undefined) return load(undefined);
    const cached = memo.get(requestContext);
    if (cached !== undefined) return cached;
    const pending = load(requestContext);
    memo.set(requestContext, pending);
    return pending;
  };
};
