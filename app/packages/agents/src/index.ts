// Public API of @core/agents. Explicit named re-exports only (no `export *`).
export {
  type AgentPrincipal,
  buildAgentPrincipal,
  type ForwardedScope,
  nodeFromScope,
  principalIdentity,
  resourceIdOf,
  UNSCOPED_RESOURCE_PREFIX,
} from "./auth/agent-principal.ts";
export { readBearerToken, readForwardedHeader, readRequestPath, requiresRevocationCheck } from "./auth/bearer-only.ts";
export { DEFAULT_MASTRA_API_PREFIX, FirebaseMastraAuth, type FirebaseMastraAuthOptions, requiredPermissionFor } from "./auth/firebase-mastra-auth.ts";
export type {
  AccessContext,
  AccessPort,
  AccessPrincipal,
  AgentRuntimePorts,
  ApprovalPort,
  AuditEntry,
  AuditPort,
  AuthorizeDecision,
  AuthorizeRequest,
  BudgetCheck,
  ConnectorsPort,
  KnowledgePort,
  NodeRef,
  RegionalSettings,
  SecretStore,
  SemanticQueryPort,
  SettingsPort,
  UsagePort,
} from "./runtime/runtime-ports.ts";
export {
  type AgentModels,
  type CreateModelProviderOptions,
  createModelProvider,
  FakeModeNotAllowedError,
  type ModelFactoryEnv,
  type TextModelRole,
} from "./models/model-factory.ts";
export { estimateCostMicroUsd, MODEL_PRICES, type ModelPrice, PRICES_VERIFIED_AT, type TokenUsage } from "./models/model-prices.ts";
export {
  createProviderRegistry,
  DEFAULT_PROVIDER_FACTORIES,
  ModelProviderConfigError,
  type ProviderFactories,
  type ProviderRegistry,
  type ProviderSettings,
} from "./models/provider-registry.ts";
export { createFakeEmbeddingModel, embedFakeText, FAKE_EMBEDDING_DIMENSIONS } from "./models/fake/fake-embedding-model.ts";
export { createFakeLanguageModel, type FakeLanguageModelOptions } from "./models/fake/fake-language-model.ts";
export {
  createFakeScenarioRegistry,
  type FakeScenarioRegistry,
  type FakeScenarioRule,
  type FakeToolCall,
  type FakeTurn,
  type FakeTurnContext,
  InvalidFakeDirectiveError,
  parseFakeDirectives,
} from "./models/fake/fake-scenarios.ts";
export { buildSilentWav, createFakeSpeechModel, createFakeTranscriptionModel } from "./models/fake/fake-voice-models.ts";
export {
  EMBEDDING_DIMENSIONS,
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
  FAKE_MODE_APP_ENVS,
  findAgentEnvIssues,
  LOCAL_MCP_REQUEST_STATE_KEY,
  providerKeysFor,
  resolveAgentEnv,
} from "./runtime/agent-env.schema.ts";
export {
  AGENT_CONTEXT_KEYS,
  AGENT_PRINCIPAL_KEY,
  type AgentContextSnapshot,
  nodeOfContext,
  readAgentContext,
  type ReadAgentContextResult,
  type RequestContextReader,
} from "./context/agent-request-context.ts";
export { AGENT_TOOL_EXECUTED, runCoreTool } from "./tools/core-tool-pipeline.ts";
export {
  type CoreToolContext,
  type CoreToolDefinition,
  type CoreToolDeps,
  type CoreToolKind,
  type CoreToolPreview,
  DEFAULT_TIMEOUT_MS,
  defineCoreTool,
  hashToolInput,
  InvalidToolDefinitionError,
  type PendingApprovalResult,
  PendingApprovalResultSchema,
  type ToolCallInfo,
} from "./tools/define-core-tool.ts";
export {
  CORE_TOOL_ERROR_CODES,
  CoreToolError,
  type CoreToolErrorCode,
  type CoreToolErrorDetails,
  isCoreToolError,
  toolFailure,
} from "./tools/tool-errors.ts";
export { bindCoreTool, type BoundCoreTool, createToolRegistry, DuplicateToolError, type ToolRegistry } from "./tools/tool-registry.ts";
export {
  type AiCatalogReader,
  type AiEntityDescription,
  type AiEntityPage,
  type AiEntitySummary,
  type AiFieldDescription,
  createAiCatalogReader,
  InvalidAiCatalogError,
  REDACTED,
} from "./tools/catalog/ai-catalog-reader.ts";
export { loadBundledAiCatalog } from "./tools/catalog/ai-catalog-source.ts";
export { createDescribeEntityTool } from "./tools/catalog/describe-entity.tool.ts";
export { CATALOG_READ_PERMISSION, createListEntitiesTool, MAX_ENTITIES_PAGE } from "./tools/catalog/list-entities.tool.ts";
export {
  createRenderFormTool,
  type FormCommand,
  type FormCommandCatalog,
  type RenderFormDeps,
  SCHEMA_FORM_COMPONENT,
} from "./tools/catalog/render-form.tool.ts";
export { CATALOG_QUERY_PERMISSION, createQuerySemanticSqlTool, SEMANTIC_QUERY_EXECUTED } from "./tools/sql/query-semantic-sql.tool.ts";
export {
  AgentRuntimeContextSchema,
  buildAgentRequestContext,
  clearAgentContext,
  type RequestContextStore,
  writeAgentContext,
} from "./context/write-agent-context.ts";
export {
  type AgentMiddleware,
  type AgentMiddlewareContext,
  type AgentMiddlewareHandler,
  apiPathPattern,
  normalizeApiPrefix,
} from "./auth/agent-middleware.ts";
export { type ContextAuthenticator, createContextMiddleware, type ContextMiddlewareOptions } from "./auth/context-middleware.ts";
export { createRouteAllowlistMiddleware, isAllowedRoute } from "./auth/route-allowlist-middleware.ts";
export {
  type AgentCapabilityManifest,
  type AgentDefinition,
  type AgentFactoryDeps,
  type AgentModule,
  AgentModuleError,
  type AgentModuleErrorCode,
  defineAgentModule,
} from "./runtime/agent-module.ts";
export { composeAgentRuntime, type ComposeAgentRuntimeArgs, type RuntimeParts } from "./runtime/compose-agent-runtime.ts";
export { PING_AGENT, PING_AGENT_ID } from "./agents/ping-agent.ts";
export { createObservability, SPAN_CONTEXT_KEYS } from "./observability/create-observability.ts";
