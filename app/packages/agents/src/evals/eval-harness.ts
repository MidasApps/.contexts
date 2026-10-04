import { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import { InMemoryStore } from "@mastra/core/storage";
import { embedMany } from "ai";
import { MEMBER_PERMISSIONS, noteModule, SUPERVISOR_TEST_ENV } from "../agents/supervisor.fixture.ts";
import { type AgentModels, createModelProvider, type ModelFactoryEnv } from "../models/model-factory.ts";
import { AgentEnvSchema, resolveAgentEnv } from "../runtime/agent-env.schema.ts";
import { composeAgentRuntime } from "../runtime/compose-agent-runtime.ts";
import type { KnowledgePort, PromptStorePort } from "../runtime/runtime-ports.ts";
import { type CoreScorer, createCoreScorers } from "../scorers/core-scorers.ts";
import { buildAgentContextEntries } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeRuntimePorts, createFakeSettingsPort } from "../testing/fake-ports.ts";
import { FIXTURE_AI_CATALOG } from "../tools/catalog/catalog-fixture.ts";
import { createCorpusKnowledgePort, EVAL_TENANT, FOREIGN_MARKERS } from "./eval-knowledge-corpus.ts";

export type EvalMode = "fake" | "real";

/**
 * The runtime the eval sets run against (decision 0028): the real agents, tools,
 * guardrails and skills of `composeAgentRuntime`, over fake ports (access, eval
 * knowledge corpus, projects) and in-memory storage, without memory (runs are
 * single-turn, so no thread is needed). Subagents are registered in this Mastra
 * too, so `mastra.getAgent("knowledge")` works for their own eval sets.
 */
export type EvalHarness = {
  readonly mode: EvalMode;
  readonly mastra: Mastra;
  readonly scorers: Readonly<Record<string, CoreScorer>>;
  /** A fresh request context of an eval tenant member, per case. */
  readonly requestContext: () => RequestContext<unknown>;
};

const REAL_MODE_KEYS = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_VERTEX_PROJECT",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

/**
 * Which mode the current eval process runs in (`AI_MODE` of the Vitest project), or
 * `null` to skip: real mode without any provider key skips cleanly.
 */
export const evalModeOf = (processEnv: Readonly<Record<string, string | undefined>>): EvalMode | null => {
  if (processEnv["AI_MODE"] !== "real") return "fake";
  return REAL_MODE_KEYS.some((key) => (processEnv[key] ?? "") !== "") ? "real" : null;
};

// Real mode validates the whole agent env (keys of every text role) like the app boot.
const realEnvOf = (processEnv: Readonly<Record<string, string | undefined>>): ModelFactoryEnv =>
  resolveAgentEnv({ ...AgentEnvSchema.parse(processEnv), APP_ENV: "local" as const, AI_MODE: "real" as const });

/** The model env of an eval run: the fixture env in fake mode, the validated process env in real mode. */
export const evalEnvOf = (
  mode: EvalMode,
  processEnv: Readonly<Record<string, string | undefined>> = {},
): ModelFactoryEnv => (mode === "fake" ? SUPERVISOR_TEST_ENV : realEnvOf(processEnv));

export const embedWith = (models: AgentModels) => async (texts: readonly string[]) =>
  (await embedMany({ model: models.embedding(), values: [...texts] })).embeddings;

/**
 * @param args.knowledge test seam: replaces the eval corpus port (the leak-detection eval
 * swaps in a port that ignores the tenant, to prove the gate fails).
 */
export const buildEvalHarness = (args: {
  readonly mode: EvalMode;
  readonly processEnv?: Readonly<Record<string, string | undefined>>;
  readonly knowledge?: (models: AgentModels) => KnowledgePort;
  /** The prompt store the agents read (a prompt eval injects its candidate here, decision 0038). */
  readonly prompts?: PromptStorePort;
}): EvalHarness => {
  const env = evalEnvOf(args.mode, args.processEnv);
  const models = createModelProvider(env);
  const access = createFakeAccessPort({
    memberships: [{ tenantId: EVAL_TENANT, uid: "member-uid", permissions: MEMBER_PERMISSIONS }],
  });
  const ports = createFakeRuntimePorts({
    access,
    settings: createFakeSettingsPort(),
    knowledge: args.knowledge?.(models) ?? createCorpusKnowledgePort(embedWith(models)),
    ...(args.prompts === undefined ? {} : { prompts: args.prompts }),
  });
  const runtime = composeAgentRuntime({
    env,
    ports,
    modules: [noteModule()],
    storage: new InMemoryStore(),
    serviceName: "evals",
    aiCatalog: FIXTURE_AI_CATALOG,
    models,
  });
  const scorers = createCoreScorers({
    foreignMarkers: FOREIGN_MARKERS,
    ...(args.mode === "real" ? { judgeModel: models.language("judge") } : {}),
  });
  const mastra = new Mastra({ agents: { ...runtime.agents, ...runtime.subagents }, scorers, storage: runtime.storage });
  return {
    mode: args.mode,
    mastra,
    scorers,
    requestContext: () =>
      new RequestContext<unknown>(buildAgentContextEntries({ tenantId: EVAL_TENANT, permissions: MEMBER_PERMISSIONS })),
  };
};
