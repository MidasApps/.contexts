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
  CommandIdempotencyPort,
  AuditEntry,
  AuditPort,
  AuthorizeDecision,
  AuthorizeRequest,
  BudgetCheck,
  ConnectorsPort,
  FileReadError,
  FilesPort,
  KnowledgeChunkInput,
  KnowledgeDocumentInput,
  KnowledgeEventsPort,
  KnowledgePort,
  NodeRef,
  RegionalSettings,
  SecretStore,
  SemanticQueryPort,
  ProjectsPort,
  SettingsPort,
  UsagePort,
  WebContentPort,
  WebPage,
} from "./runtime/runtime-ports.ts";
export {
  type AgentModels,
  type CreateModelProviderOptions,
  createModelProvider,
  embeddingModelIdOf,
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
export { createFakeEmbeddingModel, embedFakeText, FAKE_EMBEDDING_DIMENSIONS, FAKE_EMBEDDING_MODEL_ID } from "./models/fake/fake-embedding-model.ts";
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
export { composeAgentRuntime, type ComposeAgentRuntimeArgs, MEMORY_VECTOR_KEY, type RuntimeParts } from "./runtime/compose-agent-runtime.ts";
export { PING_AGENT, PING_AGENT_ID } from "./agents/ping-agent.ts";
export { createObservability, SPAN_CONTEXT_KEYS } from "./observability/create-observability.ts";
// SP3 knowledge ingestion (Task 14).
export { chunkDocument, type ChunkFormat, type ChunkOptions, DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, type DocumentChunk, estimateTokens } from "./knowledge/chunk-document.ts";
export { CITATION_MARKER_PATTERN, citationIdOf, contentHashOf, extractCitationIds } from "./knowledge/citation.ts";
export { EMBED_BATCH_SIZE, EmbeddingDimensionError, embedChunks, EMBEDDING_VERSION } from "./knowledge/embed-chunks.ts";
export { type ExtractedText, extractText, type ExtractTextError, type ExtractTextResult, htmlToText, type PdfParser } from "./knowledge/extract-text.ts";
export { embedAndStoreChunks, indexDocumentText, type IndexOutcome, type KnowledgeIndexingDeps } from "./knowledge/index-document.ts";
export {
  createKnowledgeIngestWorkflow,
  IngestTenantMismatchError,
  KNOWLEDGE_INGEST_WORKFLOW_ID,
  KNOWLEDGE_WRITE_PERMISSION,
  KnowledgeIngestInputSchema,
  type KnowledgeIngestResult,
  KnowledgeIngestResultSchema,
  type KnowledgeWorkflowDeps,
} from "./knowledge/workflows/knowledge-ingest.workflow.ts";
export {
  CATALOG_NAMESPACE,
  CATALOG_REINDEX_WORKFLOW_ID,
  type CatalogReindexResult,
  CatalogReindexResultSchema,
  createCatalogReindexWorkflow,
  renderContractDocument,
} from "./knowledge/workflows/catalog-reindex.workflow.ts";
export { KnowledgeUseCaseError, knowledgePortFromUseCases } from "./knowledge/knowledge-port-from-use-cases.ts";
// SP3 knowledge agent, search tool and citation guard (Task 15).
export {
  allowedNamespacesOf,
  createSearchKnowledgeTool,
  effectiveNamespaces,
  KNOWLEDGE_READ_PERMISSION,
  MAX_KNOWLEDGE_RESULTS,
  SEARCH_KNOWLEDGE_TOOL_ID,
  type SearchKnowledgeDeps,
} from "./tools/knowledge/search-knowledge.tool.ts";
export { CITATION_GUARD_ID, type CitationConfidence, createCitationGuard, type GuardedAnswer, guardCitations } from "./processors/citation-guard.ts";
export { createKnowledgeAgentDefinition, KNOWLEDGE_AGENT_ID, KNOWLEDGE_AGENT_MAX_STEPS, KNOWLEDGE_INSTRUCTIONS } from "./agents/knowledge-agent.ts";
export { InstructionsNotFoundError, loadInstructions, PACKAGE_INSTRUCTIONS_DIR } from "./agents/load-instructions.ts";
// SP3 usage ledger exporter and tenant budget guard (Task 16).
export {
  createUsageLedgerExporter,
  LEDGER_FLUSH_MS,
  LEDGER_FLUSH_ROWS,
  LEDGER_MAX_BUFFERED_ROWS,
  type LedgerLogger,
  USAGE_LEDGER_EXPORTER_NAME,
  type UsageLedgerExporterOptions,
} from "./observability/usage-ledger-exporter.ts";
export { uuidv7 } from "./observability/uuidv7.ts";
export { type BudgetGuardCode, type BudgetGuardTripwire, createTenantBudgetGuard, TENANT_BUDGET_GUARD_ID } from "./processors/tenant-budget-guard.ts";
export { TOKEN_COST_CONTROL_ENABLED } from "./processors/guardrail-profile.ts";
// SP3 guardrail profile and tracing configuration (Task 17).
export {
  createGuardrailProfile,
  DAILY_SOFT_CAP_USD,
  type GuardrailProfile,
  type GuardrailProfileDeps,
  type GuardrailProfileKind,
  INPUT_TOKEN_LIMIT,
  PROMPT_INJECTION_THRESHOLD,
  SYSTEM_PROMPT_SCRUBBER_RESULT_ID,
  TENANT_PII_DETECTOR_ID,
} from "./processors/guardrail-profile.ts";
export {
  buildExporters,
  type CreateObservabilityArgs,
  DEFAULT_SENSITIVE_FIELDS,
  EXTRA_SENSITIVE_FIELDS,
  type ObservabilityEnv,
  REMOTE_TRACE_SAMPLE_RATIO,
  SENSITIVE_FIELDS,
} from "./observability/create-observability.ts";
export { hashResourceId, isTraceSampled, sampleTraces, scrubSpanForExport, type SpanExportPolicy } from "./observability/span-export-policy.ts";
export { parseTraceparent, SERVER_OWNED_RUN_OPTIONS, type TraceContext, withServerTracingOptions } from "./observability/trace-context.ts";
// SP3 memory with tenant-scoped resources (Task 18).
export {
  createMemory,
  type CreateMemoryArgs,
  MEMORY_LAST_MESSAGES,
  MEMORY_RECALL_MESSAGE_RANGE,
  MEMORY_RECALL_TOP_K,
  MEMORY_VECTOR_DIMENSIONS,
  MEMORY_VECTOR_INDEX,
} from "./memory/create-memory.ts";
export { type MastraEmbeddingModelV3, toEmbeddingModelV3 } from "./memory/embedding-model-v3.ts";
export { type WorkingMemory, WorkingMemorySchema } from "./memory/working-memory.schema.ts";
// SP3 supervisor, data, action and web subagents with skills (Task 20).
export { createDelegationGuard, createSupervisorAgent, SUPERVISOR_AGENT_ID, SUPERVISOR_INSTRUCTIONS, SUPERVISOR_MAX_STEPS } from "./agents/supervisor-agent.ts";
export { createDataAgentDefinition, DATA_AGENT_ID, DATA_AGENT_TOOLS, DATA_INSTRUCTIONS, SUBAGENT_MAX_STEPS } from "./agents/data-agent.ts";
export { ACTION_AGENT_ID, ACTION_INSTRUCTIONS, actionCeilingOf, createActionAgentDefinition } from "./agents/action-agent.ts";
export { createWebAgentDefinition, WEB_AGENT_ID, WEB_INSTRUCTIONS, WEB_TOOLS_PERMISSION } from "./agents/web-agent.ts";
export {
  createTenantAgentSettingsReader,
  DEFAULT_ENABLED_SUBAGENTS,
  type TenantAgentSettings,
  type TenantAgentSettingsReader,
  WEB_AGENT_KEY,
} from "./agents/tenant-agent-settings.ts";
export { CORE_SKILL_DIRS, CORE_SKILLS, createSkillsResolver, isModuleEnabled, loadSkill, SkillLoadError, skillFromContent } from "./skills/resolve-skills.ts";
export { type AgentCommand, commandIdOf, formCommandsOf } from "./tools/commands/agent-command.ts";
export { CREATE_PROJECT_PERMISSION, createCreateProjectCommand } from "./tools/commands/create-project-command.tool.ts";
export { coreFakeRules, type FakeCommandRef } from "./models/fake/fake-scenarios.ts";
// SP3 OpenAPI, MCP client, browser and Postgres connectors; SSRF guard (Task 22).
export {
  CONNECTOR_CACHE_TTL_MS,
  type ConnectorAgentKind,
  type ConnectorLoaders,
  type ConnectorTool,
  type ConnectorToolsResolver,
  createConnectorToolResolver,
  defaultConnectorLoaders,
} from "./connectors/connector-registry.ts";
export { API_TIMEOUT_MS, CONNECTOR_TOOL_PERMISSION, MAX_RESPONSE_BYTES, OpenApiResultSchema, openApiToolId, openApiToTools, type OpenApiToolOptions } from "./connectors/openapi/openapi-to-tools.ts";
export { dereferenceOpenApi, loadOpenApiDocument, MAX_SPEC_BYTES, OpenApiConnectorError, type OpenApiDocument } from "./connectors/openapi/openapi-document.ts";
export {
  createMcpConnectorClient,
  loadMcpConnectorToolset,
  MCP_TIMEOUT_MS,
  McpConnectorError,
  type McpConnectorOptions,
  type McpConnectorToolset,
  type McpStdioOverride,
  type McpTool,
} from "./connectors/mcp/mcp-connector.ts";
export { assertPublicDatabaseHost, DB_QUERY_PERMISSION, type PostgresConnectorRunner, postgresConnectorTools, runReadOnlyQuery } from "./connectors/db/postgres-readonly-connector.ts";
export { assertPublicUrl, guardedFetch, isNonPublicAddress, MAX_REDIRECTS, type ResolveHost, UrlGuardError, type UrlGuardReason } from "./tools/web/url-guard.ts";
