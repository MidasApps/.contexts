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
