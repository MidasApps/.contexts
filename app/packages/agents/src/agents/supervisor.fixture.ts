import type { AgentSettings } from "@core/contracts";
import { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import { InMemoryStore } from "@mastra/core/storage";
import { z } from "zod";
import { type AgentModule, defineAgentModule } from "../runtime/agent-module.ts";
import { composeAgentRuntime, type RuntimeParts } from "../runtime/compose-agent-runtime.ts";
import type { AgentRuntimePorts } from "../runtime/runtime-ports.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeRuntimePorts, createFakeSettingsPort } from "../testing/fake-ports.ts";
import { FIXTURE_AI_CATALOG } from "../tools/catalog/catalog-fixture.ts";
import { defineCoreTool } from "../tools/define-core-tool.ts";
import type { WebToolsRuntime } from "../tools/web/web-tools-runtime.ts";

/** Test-only fixtures of the supervisor tests: a fake-mode runtime inside a real `Mastra`. */

export const SUPERVISOR_TEST_ENV = {
  APP_ENV: "local",
  AI_MODE: "fake",
  AI_MODEL_CHAT: "google/gemini-3.5-flash",
  AI_MODEL_FAST: "google/gemini-3.5-flash-lite",
  AI_MODEL_REASONING: "google/gemini-3.5-flash",
  AI_MODEL_JUDGE: "google/gemini-3.5-flash",
  AI_MODEL_EMBEDDING: "google/gemini-embedding-2",
  AI_MODEL_TRANSCRIPTION: "openai/gpt-4o-mini-transcribe",
  AI_MODEL_SPEECH: "openai/gpt-4o-mini-tts",
  GOOGLE_AI_BACKEND: "ai-studio",
} as const;

export const MEMBER_PERMISSIONS = [
  "core.chat.use",
  "core.catalog.read",
  "core.catalog.query",
  "core.knowledge.read",
  "core.project.create",
  "core.web-tools.use",
  "example.note.read",
  "example.note.create",
];

/** A module command shaped like the SP2 example module's (the real one lands with Task 19). */
export const noteModule = (executed: string[] = []): AgentModule =>
  defineAgentModule({
    id: "example",
    commands: [
      {
        targetContractId: "example.Note",
        tool: defineCoreTool({
          id: "command.example.CreateNoteCommand",
          description: "Creates a note, for supervisor tests only.",
          kind: "mutation",
          permission: "example.note.create",
          inputSchema: z.strictObject({ text: z.string().min(1).describe("Note body.") }),
          outputSchema: z.strictObject({ noteId: z.string() }),
          execute: (input) => {
            executed.push(input.text);
            return Promise.resolve({ noteId: `note-${executed.length}` });
          },
        }),
      },
    ],
  });

export type SupervisorHarness = { readonly mastra: Mastra; readonly runtime: RuntimeParts; readonly ports: AgentRuntimePorts };

export const buildSupervisorHarness = (
  args: { settings?: Partial<AgentSettings>; ports?: Partial<AgentRuntimePorts>; modules?: readonly AgentModule[]; webTools?: WebToolsRuntime } = {},
): SupervisorHarness => {
  const access = createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: MEMBER_PERMISSIONS }] });
  const ports = createFakeRuntimePorts({ access, settings: createFakeSettingsPort(args.settings), ...args.ports });
  const runtime = composeAgentRuntime({
    env: SUPERVISOR_TEST_ENV,
    ports,
    modules: args.modules ?? [noteModule()],
    storage: new InMemoryStore(),
    serviceName: "mastra",
    aiCatalog: FIXTURE_AI_CATALOG,
    ...(args.webTools === undefined ? {} : { webTools: args.webTools }),
  });
  const mastra = new Mastra({ agents: runtime.agents, storage: runtime.storage, observability: runtime.observability });
  return { mastra, runtime, ports };
};

export const memberContext = (): RequestContext<unknown> => new RequestContext<unknown>(buildAgentContextEntries({ permissions: MEMBER_PERMISSIONS }));

export type StreamChunk = { readonly type: string; readonly runId?: string; readonly payload?: Record<string, unknown> };

/** Reads a Mastra agent stream to the end. */
export const collectChunks = async (stream: { fullStream: AsyncIterable<unknown> | ReadableStream<unknown> }): Promise<StreamChunk[]> => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream.fullStream as AsyncIterable<StreamChunk>) chunks.push(chunk);
  return chunks;
};

export const toolNamesCalled = (chunks: readonly StreamChunk[]): string[] =>
  chunks.filter((chunk) => chunk.type === "tool-call").map((chunk) => String(chunk.payload?.toolName));
