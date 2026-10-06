// Public API of the agents context (SP3): the /v1 → Mastra gateway.

export { CHAT_ROUTES, createMastraChatGateway } from "./adapters/driven/mastra-chat-gateway.ts";
export { gatewayErrorResponse, mapMastraStatus } from "./adapters/driven/mastra-error-mapper.ts";
export {
  createMastraGateway,
  DEFAULT_GATEWAY_TIMEOUTS,
  type MastraGatewayOptions,
} from "./adapters/driven/mastra-gateway.ts";
export { MCP_REQUEST_HEADERS, mcpHeadersOf } from "./adapters/driven/mastra-request.ts";
export { createMastraVoiceGateway, mapVoiceStatus, VOICE_ROUTES } from "./adapters/driven/mastra-voice-gateway.ts";
export {
  createServerlessIdTokenSource,
  type IdTokenMinter,
  ServerlessIdTokenError,
  type ServerlessIdTokenSource,
} from "./adapters/driven/serverless-id-token.ts";
export { buildMcpRoutes, CORE_MCP_SERVER, MCP_USE_PERMISSION } from "./adapters/driving/mcp-route-handler.ts";
export { buildVoiceRoutes } from "./adapters/driving/realtime-session-route-handler.ts";
export { sniffAudioType, VOICE_USE_PERMISSION, type VoiceRoutesDeps } from "./adapters/driving/voice-http.ts";
// Agent commands outside the runtime: the SP1 `agent-command` approval handler and command idempotency (follow-up #26).
export {
  AGENT_COMMAND_HANDLER_KIND,
  type AgentCommandApprovalDeps,
  createAgentCommandApprovalHandler,
} from "./application/commands/agent-command-approval-handler.ts";
export { AgentCommandError, type AgentCommandErrorCode } from "./application/commands/agent-command-error.ts";
export {
  type AgentCommandExecution,
  type AgentCommandExecutor,
  type AgentCommandExecutorSpec,
  type AgentCommandExecutors,
  agentCommandExecutors,
  DuplicateCommandError,
  defineAgentCommandExecutor,
} from "./application/commands/agent-command-executor.ts";
export {
  CommandContractError,
  type CommandContractErrorCode,
  type CommandPreview,
  type ContractCommand,
  type ContractCommandSpec,
  defineContractCommand,
} from "./application/commands/contract-command.ts";
export {
  CREATE_PROJECT_COMMAND_ID,
  createCoreAgentCommandExecutors,
} from "./application/commands/core-agent-command-executors.ts";
export { registerAgentCommandApprovals } from "./application/commands/register-agent-command-approvals.ts";
export {
  type CommandIdempotency,
  type CommandRun,
  type CommandRunResult,
  createCommandIdempotency,
} from "./application/commands/run-command-once.ts";
export type {
  AgentCallScope,
  AgentMessage,
  AgentRunInput,
  AgentRunOptions,
  AgentRuntimeGateway,
  GatewayError,
  GatewayErrorCode,
  GatewayResult,
  GatewayStream,
  McpCallInput,
  McpGatewayResponse,
  ThreadInput,
  ToolCallDecisionInput,
  WorkflowResumeInput,
  WorkflowStartInput,
} from "./application/ports/agent-runtime-gateway.ts";
// SP4 chat and voice routes of Mastra (decisions 0031, 0034).
export type {
  ChatMessagesPage,
  ChatRuntimeGateway,
  ChatStreamAnswer,
  ChatTurnBody,
  VoiceRuntimeGateway,
} from "./application/ports/chat-runtime-gateway.ts";
