import { type StoredFile, StoredFileSchema } from "@core/contracts";
import { RequestContext } from "@mastra/core/request-context";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildAgentContextEntries, TEST_UID } from "../../testing/agent-context-fixture.ts";
import {
  createFakeAccessPort,
  createFakeFilesPort,
  createFakeWebContentPort,
  createRecordingKnowledgeEvents,
} from "../../testing/fake-ports.ts";
import { EMBEDDING_VERSION } from "../embed-chunks.ts";
import { createKnowledgeIngestWorkflow, type KnowledgeIngestResult } from "./knowledge-ingest.workflow.ts";
import { makeKnowledgePostgresWorld } from "./knowledge-postgres.fixture.ts";

const TENANT = "kbIngestTenant000001";
const OTHER_TENANT = "kbIngestTenant000002";
const WRITER = ["core.chat.use", "core.knowledge.write", "core.knowledge.read"];

const GUIDE = [
  "# Onboarding guide",
  "New members get access after an owner approves the invitation.",
  "## Roles",
  "Owners manage billing; admins manage members; members use the workspace.",
].join("\n\n");

const fileOf = (id: string, tenantId: string, overrides: Partial<StoredFile> = {}): StoredFile =>
  StoredFileSchema.parse({
    id,
    tenantId,
    purpose: "knowledge",
    fileName: "onboarding-guide.md",
    contentType: "text/markdown",
    sizeBytes: GUIDE.length,
    status: "ready",
    rejectionReason: null,
    storagePath: `tenants/${tenantId}/files/${id}`,
    createdBy: TEST_UID,
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
    ...overrides,
  });

const world = makeKnowledgePostgresWorld();
const events = createRecordingKnowledgeEvents();
const webContent = createFakeWebContentPort([
  {
    url: "https://docs.example.com/guide",
    title: "Public guide",
    markdown: "# Public guide\n\nThe public guide explains invitations.",
  },
]);
const encoder = new TextEncoder();
const workflow = createKnowledgeIngestWorkflow({
  knowledge: world.knowledge,
  embedding: world.embedding,
  embeddingModelId: world.embeddingModelId,
  access: createFakeAccessPort({
    memberships: [
      { tenantId: TENANT, uid: TEST_UID, permissions: WRITER },
      { tenantId: OTHER_TENANT, uid: TEST_UID, permissions: ["core.chat.use"] },
    ],
  }),
  files: createFakeFilesPort([
    { file: fileOf("fileGuide01", TENANT), bytes: encoder.encode(GUIDE) },
    {
      file: fileOf("filePdf0001", TENANT, { fileName: "g.pdf", contentType: "application/pdf" }),
      bytes: encoder.encode("%PDF-1.7"),
    },
    { file: fileOf("fileOther01", OTHER_TENANT), bytes: encoder.encode(GUIDE) },
  ]),
  webContent,
  events,
});

const run = async (
  source: unknown,
  context: Parameters<typeof buildAgentContextEntries>[0] = {},
): Promise<KnowledgeIngestResult> => {
  const requestContext = new RequestContext<unknown>(
    buildAgentContextEntries({ tenantId: TENANT, permissions: WRITER, ...context }),
  );
  const result = await (await workflow.createRun()).start({ inputData: { source } as never, requestContext });
  if (result.status !== "success")
    throw new Error(`workflow ${result.status}: ${JSON.stringify(result).slice(0, 400)}`);
  return result.result;
};

beforeEach(async () => {
  events.events.length = 0;
  await world.deleteTenant(TENANT);
});

afterAll(async () => {
  await world.deleteTenant(TENANT);
  await world.sql.end();
});

describe("knowledge-ingest workflow (Postgres, fake embeddings)", () => {
  it("indexes a markdown upload: chunks stored with embedding model and version, event emitted", async () => {
    const result = await run({ kind: "file", fileId: "fileGuide01" });
    expect(result).toMatchObject({ status: "indexed", code: null });
    const { documents, chunks } = await world.rowsOf(TENANT);
    expect(documents).toEqual([
      expect.objectContaining({
        source: "upload",
        source_ref: "fileGuide01",
        namespace: "tenant",
        status: "ready",
        title: "onboarding-guide.md",
      }),
    ]);
    expect(chunks.length).toBe(result.chunkCount);
    expect(
      chunks.every(
        (chunk) => chunk.embedding_model === "fake/fake-embedding" && chunk.embedding_version === EMBEDDING_VERSION,
      ),
    ).toBe(true);
    expect(events.events).toEqual([
      expect.objectContaining({ tenantId: TENANT, documentId: result.documentId, source: "upload" }),
    ]);
    const hits = await world.knowledge.searchChunks({
      tenantId: TENANT,
      namespaces: ["tenant"],
      embedding: await embedQuery("who approves new members"),
      topK: 3,
    });
    expect(hits[0]?.citationId).toMatch(new RegExp(`^kb:${result.documentId ?? "x"}#\\d+$`));
  });

  it("is idempotent: the same content again changes nothing and emits nothing", async () => {
    const first = await run({ kind: "file", fileId: "fileGuide01" });
    const before = await world.rowsOf(TENANT);
    events.events.length = 0;
    const second = await run({ kind: "file", fileId: "fileGuide01" });
    expect(second).toEqual({ status: "unchanged", documentId: first.documentId, chunkCount: null, code: null });
    expect(await world.rowsOf(TENANT)).toEqual(before);
    expect(events.events).toEqual([]);
  });

  it("ingests a URL through the (fake) Firecrawl port", async () => {
    const result = await run({ kind: "url", url: "https://docs.example.com/guide" });
    expect(result.status).toBe("indexed");
    expect((await world.rowsOf(TENANT)).documents).toEqual([
      expect.objectContaining({ source: "url", source_ref: "https://docs.example.com/guide", title: "Public guide" }),
    ]);
  });

  it("puts project-scoped runs in the project namespace", async () => {
    await run({ kind: "file", fileId: "fileGuide01" }, { projectId: "proj1" });
    expect((await world.rowsOf(TENANT)).documents[0]?.namespace).toBe("project:proj1");
  });

  it("fails closed without core.knowledge.write, for another tenant's file and for an unsupported type", async () => {
    expect(
      await run({ kind: "file", fileId: "fileGuide01" }, { permissions: ["core.chat.use"], tenantId: OTHER_TENANT }),
    ).toMatchObject({ status: "failed", code: "FORBIDDEN" });
    expect(await run({ kind: "file", fileId: "fileOther01" })).toMatchObject({
      status: "failed",
      code: "FILE_NOT_FOUND",
    });
    expect(await run({ kind: "file", fileId: "filePdf0001" })).toMatchObject({
      status: "failed",
      code: "UNSUPPORTED_MEDIA",
    });
    expect((await world.rowsOf(TENANT)).documents).toEqual([]);
  });
});

const embedQuery = async (text: string): Promise<number[]> => {
  const { embeddings } = await world.embedding().doEmbed({ values: [text] });
  return embeddings[0] ?? [];
};
