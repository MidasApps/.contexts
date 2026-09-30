// Public API of @core/agents. Explicit named re-exports only (no `export *`).
export {
  MODEL_ID_PATTERN,
  MODEL_PROVIDERS,
  MODEL_ROLE_NAMES,
  MODEL_ROLES,
  type ModelModality,
  type ModelProvider,
  type ModelRole,
  type ModelRoleSpec,
  parseModelId,
} from "./models/model-roles.ts";
export {
  type AgentEnv,
  type AgentEnvInput,
  AgentEnvSchema,
  type AgentRuntimeFlags,
  findAgentEnvIssues,
  LOCAL_MCP_REQUEST_STATE_KEY,
  providerKeysFor,
  resolveAgentEnv,
} from "./runtime/agent-env.schema.ts";
