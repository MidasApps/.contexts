// Public API of the agents context (SP3): the /v1 → Mastra gateway.
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
  ThreadInput,
  ToolCallDecisionInput,
  WorkflowResumeInput,
  WorkflowStartInput,
  McpCallInput,
  McpGatewayResponse,
} from "./application/ports/agent-runtime-gateway.ts";
export { buildMcpRoutes, CORE_MCP_SERVER, MCP_USE_PERMISSION } from "./adapters/driving/mcp-route-handler.ts";
export { MCP_REQUEST_HEADERS, mcpHeadersOf } from "./adapters/driven/mastra-request.ts";
export { createMastraGateway, DEFAULT_GATEWAY_TIMEOUTS, type MastraGatewayOptions } from "./adapters/driven/mastra-gateway.ts";
export { gatewayErrorResponse, mapMastraStatus } from "./adapters/driven/mastra-error-mapper.ts";
export { createServerlessIdTokenSource, type IdTokenMinter, ServerlessIdTokenError, type ServerlessIdTokenSource } from "./adapters/driven/serverless-id-token.ts";
// Agent commands outside the runtime: the SP1 `agent-command` approval handler and command idempotency (follow-up #26).
export { AGENT_COMMAND_HANDLER_KIND, createAgentCommandApprovalHandler, type AgentCommandApprovalDeps } from "./application/commands/agent-command-approval-handler.ts";
export { AgentCommandError, type AgentCommandErrorCode } from "./application/commands/agent-command-error.ts";
export {
  agentCommandExecutors,
  defineAgentCommandExecutor,
  type AgentCommandExecution,
  type AgentCommandExecutor,
  type AgentCommandExecutors,
  type AgentCommandExecutorSpec,
} from "./application/commands/agent-command-executor.ts";
export { CREATE_PROJECT_COMMAND_ID, createCoreAgentCommandExecutors } from "./application/commands/core-agent-command-executors.ts";
export { registerAgentCommandApprovals } from "./application/commands/register-agent-command-approvals.ts";
export { createCommandIdempotency, type CommandIdempotency, type CommandRun, type CommandRunResult } from "./application/commands/run-command-once.ts";
