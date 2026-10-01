// Unit-test harness of the `/v1/chat` and `/v1/conversations` routes: in-memory pipeline,
// conversations and files, and a scripted chat gateway that records every call.
import type { StoredFile, TenantId } from "@core/contracts";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import type { AgentCallScope, GatewayResult } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { ChatRuntimeGateway, ChatStreamAnswer, ChatTurnBody } from "../../../agents/application/ports/chat-runtime-gateway.ts";
import { createInMemoryFileRepository, createInMemoryObjectStore } from "../../../files/adapters/driven/in-memory-file-adapters.ts";
import { makeGetReadyFile, makeReadFileBytes } from "../../../files/application/use-cases/read-file-bytes.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import { createInMemoryConversationRepository } from "../driven/in-memory-conversation-repository.ts";
import { createConversationsServices } from "../../composition.ts";
import type { ChatRoutesDeps } from "./chat-http.ts";

export const ORG_A = "OrgAaaaaaaaaaaaaaaaaa" as TenantId;
export const ORG_B = "OrgBbbbbbbbbbbbbbbbbb" as TenantId;
export const NOW = "2026-09-30T12:00:00.000Z";
export const UI_STREAM = 'data: {"type":"start"}\n\ndata: {"type":"text-delta","id":"t","delta":"Hi"}\n\ndata: [DONE]\n\n';

export type GatewayCall = { readonly kind: string; readonly scope: AgentCallScope; readonly body?: ChatTurnBody; readonly runId?: string };

const streamOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

const answerOf = (runId: string | null): ChatStreamAnswer => ({ body: streamOf(UI_STREAM), contentType: "text/event-stream", runId, streamProtocol: "v1" });

/** Scripted gateway: `send` answers a UI stream with `x-run-id` run-1 unless a failure is set. */
export const createFakeChatGateway = () => {
  const calls: GatewayCall[] = [];
  const script = {
    sendResult: undefined as GatewayResult<ChatStreamAnswer> | undefined,
    observeRun: true,
    title: "Generated title" as string | null,
    /** Answers of the first title reads, in order (Mastra writes the title a moment after the stream closes). */
    earlierTitles: [] as (string | null)[],
    messages: [] as unknown[],
    summary: "A short summary of the plan." as string,
    summaryResult: undefined as GatewayResult<{ readonly summary: string }> | undefined,
    deleteThread: { ok: true, data: null } as GatewayResult<null>,
    hasMore: false,
  };
  const gateway: ChatRuntimeGateway = {
    send: ({ scope, body }) => {
      calls.push({ kind: "send", scope, body });
      return Promise.resolve(script.sendResult ?? { ok: true, data: answerOf("run-1") });
    },
    observe: ({ scope, runId }) => {
      calls.push({ kind: "observe", scope, runId });
      return Promise.resolve({ ok: true, data: script.observeRun ? answerOf(runId) : null });
    },
    abort: ({ scope, runId }) => {
      calls.push({ kind: "abort", scope, runId });
      return Promise.resolve({ ok: true, data: null });
    },
    threadTitle: ({ scope }) => {
      calls.push({ kind: "title", scope });
      return Promise.resolve({ ok: true, data: script.earlierTitles.length > 0 ? (script.earlierTitles.shift() ?? null) : script.title });
    },
    deleteThread: ({ scope }) => {
      calls.push({ kind: "deleteThread", scope });
      return Promise.resolve(script.deleteThread);
    },
    listMessages: ({ scope }) => {
      calls.push({ kind: "messages", scope });
      return Promise.resolve({ ok: true, data: { messages: script.messages, hasMore: script.hasMore } });
    },
    summarize: ({ scope }) => {
      calls.push({ kind: "summary", scope });
      return Promise.resolve(script.summaryResult ?? { ok: true, data: { summary: script.summary } });
    },
  };
  return { gateway, calls, script };
};

const REGIONAL = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };

const resolveAccessContextFor =
  (members: ReadonlyMap<string, string>): ResolveAccessContext =>
  ({ principal, node }) => {
    const uid = principal.type === "user" ? principal.uid : "";
    if (node.level === "platform" || members.get(uid) !== node.tenantId) return Promise.resolve(null);
    return Promise.resolve({ tenantId: node.tenantId, principal: principal, permissions: [], regional: REGIONAL });
  };

/** A ready file in the in-memory files context. */
export const storedFileOf = (fields: Partial<StoredFile> & Pick<StoredFile, "id">): StoredFile => ({
  tenantId: ORG_A,
  purpose: "chat-attachment",
  fileName: "diagram.png",
  contentType: "image/png",
  sizeBytes: 4,
  status: "ready",
  rejectionReason: null,
  createdBy: "alice" as StoredFile["createdBy"],
  createdAt: NOW,
  updatedAt: NOW,
  ...fields,
  storagePath: `tenants/${fields.tenantId ?? ORG_A}/files/${fields.id}`,
});

export const setupChatRoutes = () => {
  const members = [
    { uid: "alice", tenantId: ORG_A, role: "member" as const },
    { uid: "carol", tenantId: ORG_A, role: "member" as const },
    { uid: "bob", tenantId: ORG_B, role: "member" as const },
  ];
  const { pipeline: base, clock } = makeInMemoryPipeline({ now: NOW, members });
  const auditLog = createInMemoryAuditLogWriter();
  const pipeline = { ...base, audit: makeRecordAudit({ writer: auditLog, clock }) };
  const repository = createInMemoryConversationRepository();
  const conversations = createConversationsServices({ conversations: repository, clock });
  const files = createInMemoryFileRepository();
  const objects = createInMemoryObjectStore();
  const chat = createFakeChatGateway();
  const deps: ChatRoutesDeps = {
    pipeline,
    chat: chat.gateway,
    conversations,
    resolveAccessContext: resolveAccessContextFor(new Map(members.map((member) => [member.uid, member.tenantId]))),
    files: { getReadyFile: makeGetReadyFile({ files }), readFileBytes: makeReadFileBytes({ files, objects }) },
    wait: () => Promise.resolve(),
  };
  return { deps, repository, conversations, files, objects, chat, auditLog };
};
