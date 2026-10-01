import { MastraClient } from "@mastra/client-js";
import type { AgentCallScope, AgentRunInput, AgentRuntimeGateway } from "../../application/ports/agent-runtime-gateway.ts";
import { buildForwardedHeaders, type MastraConnection, postForStream, postMcp, stripServerOwnedKeys, withDeadline } from "./mastra-request.ts";
import type { ServerlessIdTokenSource } from "./serverless-id-token.ts";

/** A JSON generate can take a long model turn; streams only wait for their first byte. */
export const DEFAULT_GATEWAY_TIMEOUTS = { jsonMs: 120_000, streamConnectMs: 30_000 } as const;

export type MastraGatewayOptions = {
  /** `MASTRA_URL` (private Cloud Run URL outside local). */
  readonly baseUrl: string;
  /** Mastra `server.apiPrefix` (default `/api`). */
  readonly apiPrefix?: string;
  /** `null` in local; `createServerlessIdTokenSource({ audience: MASTRA_AUDIENCE })` elsewhere. */
  readonly serverlessToken: ServerlessIdTokenSource | null;
  readonly timeouts?: { readonly jsonMs?: number; readonly streamConnectMs?: number };
  /** Test seam; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
};

/** The connection of every gateway built from the same options (JSON, stream, chat and voice calls). */
export const connectionOf = (options: MastraGatewayOptions): MastraConnection => ({
  baseUrl: options.baseUrl.replace(/\/+$/, ""),
  apiPrefix: `/${(options.apiPrefix ?? "/api").replace(/^\/+|\/+$/g, "")}`,
  fetch: options.fetch ?? fetch,
  timeouts: { ...DEFAULT_GATEWAY_TIMEOUTS, ...options.timeouts },
  serverlessToken: options.serverlessToken,
});

// One client per call: the headers carry this caller's credential. No retries: a
// generate is not idempotent, and the SDK would re-run it on a 5xx.
export const clientFor = async (connection: MastraConnection, scope: AgentCallScope, signal: AbortSignal): Promise<MastraClient> =>
  new MastraClient({
    baseUrl: connection.baseUrl,
    apiPrefix: connection.apiPrefix,
    headers: await buildForwardedHeaders(connection, scope),
    retries: 0,
    fetch: connection.fetch,
    abortSignal: signal,
  });

// Narrows each turn to one role literal so the SDK sees its own message union.
const toSdkMessages = (messages: AgentRunInput["messages"]) =>
  typeof messages === "string"
    ? messages
    : messages.map(({ role, content }) =>
        role === "user" ? { role, content } : role === "assistant" ? { role, content } : { role, content },
      );

const pathSegment = (value: string): string => encodeURIComponent(value);

/**
 * The only caller of Mastra (SP3 spec §4.1, decision 0019): `@mastra/client-js`
 * for JSON calls, raw `fetch` for streams and MCP, the caller's Bearer and the
 * `/v1` scope as headers, `runId = requestId`, no client `requestContext`, and
 * Mastra errors mapped by status only (the upstream body never passes through).
 */
export const createMastraGateway = (options: MastraGatewayOptions): AgentRuntimeGateway => {
  const connection = connectionOf(options);
  const json = <T>(scope: AgentCallScope, run: (client: MastraClient) => Promise<T>) =>
    withDeadline(scope, connection.timeouts.jsonMs, async (signal) => run(await clientFor(connection, scope, signal)));
  const stream = (scope: AgentCallScope, path: string, body: unknown, accept?: string) =>
    postForStream({ connection, scope, path, body, ...(accept === undefined ? {} : { accept }) });
  const runBody = (input: AgentRunInput) => ({
    ...stripServerOwnedKeys(input.options),
    messages: input.messages,
    runId: input.scope.requestId,
  });
  return {
    generate: (input) =>
      json(input.scope, (client) => client.getAgent(input.agentId).generate(toSdkMessages(input.messages), { ...stripServerOwnedKeys(input.options), runId: input.scope.requestId })),
    stream: (input) => stream(input.scope, `/agents/${pathSegment(input.agentId)}/stream`, runBody(input)),
    approveToolCall: (input) => stream(input.scope, `/agents/${pathSegment(input.agentId)}/approve-tool-call`, { runId: input.runId, toolCallId: input.toolCallId }),
    declineToolCall: (input) =>
      stream(input.scope, `/agents/${pathSegment(input.agentId)}/decline-tool-call`, {
        runId: input.runId,
        toolCallId: input.toolCallId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      }),
    startWorkflow: (input) =>
      json(input.scope, async (client) => {
        const run = await client.getWorkflow(input.workflowId).createRun(input.runId === undefined ? {} : { runId: input.runId });
        return { runId: run.runId, result: await run.startAsync({ inputData: { ...input.inputData } }) };
      }),
    launchWorkflow: (input) =>
      json(input.scope, async (client) => {
        const run = await client.getWorkflow(input.workflowId).createRun(input.runId === undefined ? {} : { runId: input.runId });
        await run.start({ inputData: { ...input.inputData } });
        return { runId: run.runId };
      }),
    resumeWorkflow: (input) =>
      json(input.scope, async (client) => {
        const run = await client.getWorkflow(input.workflowId).createRun({ runId: input.runId });
        const step = typeof input.step === "string" || input.step === undefined ? input.step : [...input.step];
        return run.resumeAsync({ resumeData: input.resumeData, ...(step === undefined ? {} : { step }) });
      }),
    streamWorkflow: (input) =>
      stream(input.scope, `/workflows/${pathSegment(input.workflowId)}/stream${input.runId === undefined ? "" : `?runId=${pathSegment(input.runId)}`}`, {
        inputData: input.inputData,
      }),
    listThreadMessages: (input) => json(input.scope, (client) => client.getMemoryThread({ threadId: input.threadId, agentId: input.agentId }).listMessages()),
    deleteThread: (input) =>
      json(input.scope, async (client) => {
        await client.getMemoryThread({ threadId: input.threadId, agentId: input.agentId }).delete({ agentId: input.agentId });
        return null;
      }),
    callMcp: (input) => postMcp({ connection, scope: input.scope, path: `/mcp/${pathSegment(input.serverId)}/mcp`, body: input.body, headers: input.headers ?? {} }),
  };
};
