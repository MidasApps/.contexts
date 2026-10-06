import { processLogger } from "@core/services";
import type { Agent } from "@mastra/core/agent";
import type { ApiRoute } from "@mastra/core/server";
import { createPromptEvalRoutes } from "../agents/prompt-eval-route.ts";
import { createPromptSeedReader } from "../agents/prompt-seed.ts";
import { SUPERVISOR_AGENT_ID } from "../agents/supervisor-agent.ts";
import type { AgentMiddleware } from "../auth/agent-middleware.ts";
import { createContextMiddleware } from "../auth/context-middleware.ts";
import type { FirebaseMastraAuth } from "../auth/firebase-mastra-auth.ts";
import { createRouteAllowlistMiddleware } from "../auth/route-allowlist-middleware.ts";
import { threadOwnerFromStorage } from "../auth/thread-ownership.ts";
import type { ChatRuntime } from "../chat/chat-http.ts";
import { CHAT_ROUTES_PATTERN, createChatRoutes, MAX_CHAT_BODY_BYTES } from "../chat/chat-routes.ts";
import { createWorkflowChatRoutes } from "../chat/workflow-chat-route.ts";
import { buildAgentCatalog } from "../console/agent-catalog.ts";
import { createConsoleRoutes } from "../console/console-routes.ts";
import { createModelConsoleRoutes } from "../console/model-console-routes.ts";
import type { ModelSettingsService } from "../models/model-settings.ts";
import type { CustomAgentRuntime } from "../custom/compose-custom-agents.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import { MAX_AUDIO_BYTES, VOICE_ROUTES_PATTERN } from "../voice/voice-routes.ts";
import { createWorkflowRunRoutes, WORKFLOW_RUN_ROUTES_PATTERN } from "../workflows/runs/workflow-run-routes.ts";
import { minIntervalMinutesOf } from "../workflows/schedules/schedule-policy.ts";
import {
  createTenantScheduleRoutes,
  TENANT_SCHEDULE_ROUTES_PATTERN,
} from "../workflows/schedules/tenant-schedule-routes.ts";
import { createWorkflowApprovalRoutes } from "../workflows/workflow-approval-routes.ts";
import type { WorkflowCatalog } from "../workflows/workflow-catalog.ts";
import type { AgentDefinition } from "./agent-module.ts";
import type { ComposeAgentRuntimeArgs } from "./compose-agent-runtime-args.ts";
import { CORE_FLAG_KEYS, isAgentRunPath } from "./core-flag-keys.ts";
import type { FlagReader } from "./flag-reader.ts";
import { isEntry, SUPERVISOR_CEILING } from "./runtime-agents.ts";
import { createTenantCatalogRoutes, TENANT_CATALOG_ROUTES_PATTERN } from "./tenant-catalog-routes.ts";

/** The HTTP surface of the runtime (`composeAgentRuntime`): its middleware chain and custom API routes. */

/** Route allowlist first, then the context middleware of each custom route family. */
export const buildRuntimeMiddleware = (args: {
  readonly runtime: ComposeAgentRuntimeArgs;
  readonly auth: FirebaseMastraAuth;
  readonly flags: FlagReader;
  readonly hiddenAgentIds: string[];
}): AgentMiddleware[] => {
  const { apiPrefix } = args.runtime;
  const prefix = apiPrefix === undefined ? {} : { apiPrefix };
  // Decision 0039: `ai.kill-switch` stops agent, chat and voice runs (fails closed on a store failure).
  const killSwitch = {
    appliesTo: isAgentRunPath(apiPrefix),
    isKilled: (tenantId: string) => args.flags.isEnabled({ key: CORE_FLAG_KEYS.killSwitch, tenantId, fallback: true }),
  };
  const contextMiddleware = (path?: string, maxBodyBytes?: number) =>
    createContextMiddleware({
      auth: args.auth,
      aiMode: args.runtime.env.AI_MODE,
      killSwitch,
      threadOwnerOf: threadOwnerFromStorage(args.runtime.storage),
      ...prefix,
      ...(path === undefined ? {} : { path }),
      ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
    });
  return [
    createRouteAllowlistMiddleware({ ...prefix, hiddenAgentIds: args.hiddenAgentIds }),
    contextMiddleware(),
    contextMiddleware(CHAT_ROUTES_PATTERN, MAX_CHAT_BODY_BYTES),
    contextMiddleware(WORKFLOW_RUN_ROUTES_PATTERN),
    contextMiddleware(TENANT_SCHEDULE_ROUTES_PATTERN),
    contextMiddleware(TENANT_CATALOG_ROUTES_PATTERN),
    // Voice routes (SP4 Task 7): the caller's context for the budget, ledger and audit; body capped first.
    contextMiddleware(VOICE_ROUTES_PATTERN, MAX_AUDIO_BYTES),
  ];
};

/** Voice, chat, approval settle, prompt eval, console, workflow, schedule, catalog and custom agent routes. */
export const buildRuntimeApiRoutes = (args: {
  readonly runtime: ComposeAgentRuntimeArgs;
  readonly voiceRoutes: readonly ApiRoute[];
  readonly chat: ChatRuntime;
  readonly definitions: readonly AgentDefinition[];
  readonly agents: Record<string, Agent>;
  readonly subagents: Record<string, Agent>;
  readonly workflowCatalog: WorkflowCatalog;
  readonly tools: ToolRegistry;
  readonly custom: CustomAgentRuntime;
  readonly modelSettings: ModelSettingsService;
}): ApiRoute[] => {
  const { ports } = args.runtime;
  return [
    ...args.voiceRoutes,
    ...createChatRoutes({ ...args.chat, logger: processLogger }),
    ...createWorkflowApprovalRoutes({ approvals: ports.workflowApprovals, logger: processLogger }),
    // SP5 prompt store (decision 0038): candidate prompts on the isolated eval harness, verdict recorded here.
    ...createPromptEvalRoutes({ prompts: ports.prompts, runner: args.runtime.promptEvalRunner, logger: processLogger }),
    // SP5 console (decision 0040): traces, experiments, datasets and eval runs over Mastra storage, tenant-filtered.
    ...createConsoleRoutes({
      access: ports.access,
      approvals: ports.workflowApprovals,
      aiMode: args.runtime.env.AI_MODE,
      logger: processLogger,
      promptSeed: createPromptSeedReader(args.runtime.instructionsDirs),
      // Decision 0044: the staff catalog of what this runtime registered.
      agentCatalog: () =>
        buildAgentCatalog({
          definitions: args.definitions,
          built: { ...args.agents, ...args.subagents },
          isEntry,
          supervisor: { id: SUPERVISOR_AGENT_ID, ceiling: SUPERVISOR_CEILING },
        }),
    }),
    // Decision 0072: the model of each role and the model prices, for `/v1/admin/models`.
    ...createModelConsoleRoutes({ modelSettings: args.modelSettings, logger: processLogger }),
    ...createWorkflowRunRoutes({
      access: ports.access,
      approvals: ports.workflowApprovals,
      catalog: args.workflowCatalog,
      logger: processLogger,
    }),
    ...createWorkflowChatRoutes({ access: ports.access, catalog: args.workflowCatalog, logger: processLogger }),
    ...createTenantScheduleRoutes({
      access: ports.access,
      catalog: args.workflowCatalog,
      minIntervalMinutes: minIntervalMinutesOf(args.runtime.env),
      logger: processLogger,
    }),
    // SP5 tenant settings (Task 14): the subagents, tools, skills and workflows an organization has, read only.
    ...createTenantCatalogRoutes({
      access: ports.access,
      subagents: args.subagents,
      moduleIds: args.runtime.modules.map((module) => module.id),
      isRegisteredTool: args.tools.has,
      settings: ports.settings,
      catalog: args.workflowCatalog,
      customEntries: args.custom.catalogEntries,
      logger: processLogger,
    }),
    // Decision 0046: what a custom agent may select here, and the cache invalidation `/v1` asks for after a write.
    ...args.custom.routes,
  ];
};
