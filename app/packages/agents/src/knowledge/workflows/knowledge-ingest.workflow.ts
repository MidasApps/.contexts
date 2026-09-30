import { KnowledgeSourceSchema } from "@core/contracts";
import type { RequestContext } from "@mastra/core/request-context";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { readAgentContext } from "../../context/agent-request-context.ts";
import type { AccessPort, FilesPort, KnowledgeEventsPort, WebContentPort } from "../../runtime/runtime-ports.ts";
import { chunkDocument } from "../chunk-document.ts";
import { contentHashOf } from "../citation.ts";
import { extractText, type PdfParser } from "../extract-text.ts";
import { embedAndStoreChunks, type KnowledgeIndexingDeps } from "../index-document.ts";

export const KNOWLEDGE_INGEST_WORKFLOW_ID = "knowledge-ingest";
export const KNOWLEDGE_WRITE_PERMISSION = "core.knowledge.write";

export type KnowledgeWorkflowDeps = KnowledgeIndexingDeps & {
  readonly access: AccessPort;
  readonly files: FilesPort;
  readonly webContent: WebContentPort;
  readonly events: KnowledgeEventsPort;
  /** PDF → Markdown (Firecrawl `parse`, Task 23); without it PDFs are `UNSUPPORTED_MEDIA`. */
  readonly parsePdf?: PdfParser;
};

export const KnowledgeIngestInputSchema = z.strictObject({ source: KnowledgeSourceSchema });

export const KnowledgeIngestResultSchema = z.strictObject({
  status: z.enum(["indexed", "unchanged", "failed"]),
  documentId: z.string().nullable(),
  chunkCount: z.int().min(0).nullable(),
  /** Why ingestion stopped: CONTEXT_MISSING, FORBIDDEN, FILE_*, UNSUPPORTED_MEDIA, EMPTY_CONTENT. */
  code: z.string().nullable(),
});
export type KnowledgeIngestResult = z.infer<typeof KnowledgeIngestResultSchema>;

const failed = (code: string): KnowledgeIngestResult => ({ status: "failed", documentId: null, chunkCount: null, code });

const DescriptorSchema = z.strictObject({
  tenantId: z.string().min(1),
  namespace: z.string().min(1),
  createdBy: z.string().nullable(),
  requestId: z.string().nullable(),
  source: z.enum(["upload", "url"]),
  sourceRef: z.string().min(1),
  title: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  fetch: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("file"), fileId: z.string() }), z.strictObject({ kind: z.literal("url"), url: z.string() })]),
});
type Descriptor = z.infer<typeof DescriptorSchema>;

const ExtractedSchema = DescriptorSchema.extend({ text: z.string(), format: z.enum(["markdown", "text"]), contentHash: z.string() });
const ChunkedSchema = DescriptorSchema.extend({
  contentHash: z.string(),
  chunks: z.array(z.strictObject({ index: z.int(), text: z.string(), tokenCount: z.int() })),
});
const StoredSchema = ChunkedSchema.extend({ documentId: z.string(), unchanged: z.boolean() });
const EmbeddedSchema = z.strictObject({ tenantId: z.string(), requestId: z.string().nullable(), source: z.enum(["upload", "url"]), documentId: z.string(), unchanged: z.boolean(), chunkCount: z.int().nullable() });

/** Bug: a later step runs under another tenant than the one that resolved the source. */
export class IngestTenantMismatchError extends Error {
  readonly code = "INGEST_TENANT_MISMATCH";
  constructor() {
    super("the request context tenant changed during ingestion");
    this.name = "IngestTenantMismatchError";
  }
}

// Every step re-reads the tenant from the server-side request context (never from step data).
const assertSameTenant = (requestContext: RequestContext<unknown>, tenantId: string): void => {
  const snapshot = readAgentContext(requestContext);
  if (!snapshot.ok || snapshot.data.context.tenantId !== tenantId) throw new IngestTenantMismatchError();
};

type Writer = { custom: (chunk: { type: `data-${string}`; data: unknown; transient?: boolean }) => Promise<void> } | undefined;

const progress = async (writer: Writer, step: string, data: Record<string, unknown> = {}): Promise<void> => {
  await writer?.custom({ type: "data-ingest-progress", data: { step, ...data }, transient: true });
};

const describeSource = async (deps: KnowledgeWorkflowDeps, base: Omit<Descriptor, "source" | "sourceRef" | "title" | "sourceUrl" | "mimeType" | "fetch">, source: z.infer<typeof KnowledgeSourceSchema>) => {
  if (source.kind === "url") {
    return { ok: true as const, data: { ...base, source: "url" as const, sourceRef: source.url, title: null, sourceUrl: source.url, mimeType: "text/markdown", fetch: source } };
  }
  const file = await deps.files.getReadyFile({ tenantId: base.tenantId, fileId: source.fileId, purpose: "knowledge" });
  if (!file.ok) return { ok: false as const, code: file.error };
  const { fileName, contentType } = file.data;
  return { ok: true as const, data: { ...base, source: "upload" as const, sourceRef: source.fileId, title: fileName, sourceUrl: null, mimeType: contentType, fetch: source } };
};

const createResolveSourceStep = (deps: KnowledgeWorkflowDeps) =>
  createStep({
    id: "resolve-source",
    description: "Checks core.knowledge.write and resolves the file or URL to ingest.",
    inputSchema: KnowledgeIngestInputSchema,
    outputSchema: DescriptorSchema,
    execute: async (params) => {
      const { inputData, requestContext, writer } = params;
      const bail = (result: KnowledgeIngestResult) => params.bail(result);
      const snapshot = readAgentContext(requestContext);
      if (!snapshot.ok) return bail(failed("CONTEXT_MISSING"));
      const { context, principal } = snapshot.data;
      const decision = await deps.access.authorize({ principal, permission: KNOWLEDGE_WRITE_PERMISSION, node: { level: "organization", tenantId: context.tenantId } });
      if (!decision.allowed) return bail(failed("FORBIDDEN"));
      const namespace = context.projectId === undefined ? "tenant" : `project:${context.projectId}`;
      const base = { tenantId: context.tenantId, namespace, createdBy: context.userId, requestId: context.requestId };
      const described = await describeSource(deps, base, inputData.source);
      if (!described.ok) return bail(failed(described.code));
      await progress(writer, "resolve-source", { source: described.data.source });
      return described.data;
    },
  });

const createExtractTextStep = (deps: KnowledgeWorkflowDeps) =>
  createStep({
    id: "extract-text",
    description: "Reads the file bytes or scrapes the URL and extracts indexable text.",
    inputSchema: DescriptorSchema,
    outputSchema: ExtractedSchema,
    execute: async (params) => {
      const { inputData, requestContext, writer, abortSignal } = params;
      const bail = (result: KnowledgeIngestResult) => params.bail(result);
      assertSameTenant(requestContext, inputData.tenantId);
      if (inputData.fetch.kind === "url") {
        const page = await deps.webContent.scrape({ url: inputData.fetch.url, tenantId: inputData.tenantId, abortSignal });
        if (page.markdown.trim() === "") return bail(failed("EMPTY_CONTENT"));
        await progress(writer, "extract-text", { characters: page.markdown.length });
        return { ...inputData, title: page.title, text: page.markdown, format: "markdown" as const, contentHash: contentHashOf(page.markdown) };
      }
      const read = await deps.files.readFileBytes({ tenantId: inputData.tenantId, fileId: inputData.fetch.fileId, purpose: "knowledge" });
      if (!read.ok) return bail(failed(read.error));
      const extracted = await extractText({ bytes: read.data.bytes, contentType: read.data.file.contentType, ...(deps.parsePdf === undefined ? {} : { parsePdf: deps.parsePdf }) });
      if (!extracted.ok) return bail(failed(extracted.error.code));
      await progress(writer, "extract-text", { characters: extracted.data.text.length });
      return { ...inputData, ...extracted.data, contentHash: contentHashOf(extracted.data.text) };
    },
  });

const createChunkStep = () =>
  createStep({
    id: "chunk",
    description: "Splits the text into chunks of at most 2000 characters with 200 of overlap.",
    inputSchema: ExtractedSchema,
    outputSchema: ChunkedSchema,
    execute: async (params) => {
      const { inputData, requestContext, writer } = params;
      assertSameTenant(requestContext, inputData.tenantId);
      const { text, format, ...rest } = inputData;
      const chunks = chunkDocument(text, { format });
      if (chunks.length === 0) return params.bail(failed("EMPTY_CONTENT"));
      await progress(writer, "chunk", { chunkCount: chunks.length });
      return { ...rest, chunks };
    },
  });

const createStoreStep = (deps: KnowledgeWorkflowDeps) =>
  createStep({
    id: "store",
    description: "Upserts the document by tenant, source and source ref; unchanged content skips embedding.",
    inputSchema: ChunkedSchema,
    outputSchema: StoredSchema,
    execute: async ({ inputData, requestContext, writer }) => {
      assertSameTenant(requestContext, inputData.tenantId);
      const { document, unchanged } = await deps.knowledge.registerDocument({
        tenantId: inputData.tenantId,
        namespace: inputData.namespace,
        source: inputData.source,
        sourceRef: inputData.sourceRef,
        title: inputData.title,
        sourceUrl: inputData.sourceUrl,
        mimeType: inputData.mimeType,
        contentHash: inputData.contentHash,
        metadata: {},
        createdBy: inputData.createdBy,
      });
      await progress(writer, "store", { unchanged });
      return { ...inputData, documentId: document.id, unchanged };
    },
  });

const createEmbedStep = (deps: KnowledgeWorkflowDeps) =>
  createStep({
    id: "embed",
    description: "Embeds the chunks in batches of 64 and replaces the document's chunks in one transaction.",
    inputSchema: StoredSchema,
    outputSchema: EmbeddedSchema,
    execute: async ({ inputData, requestContext, writer, abortSignal }) => {
      assertSameTenant(requestContext, inputData.tenantId);
      const { tenantId, requestId, source, documentId, unchanged } = inputData;
      if (unchanged) return { tenantId, requestId, source, documentId, unchanged, chunkCount: null };
      const chunkCount = await embedAndStoreChunks(deps, { tenantId, documentId, chunks: inputData.chunks, abortSignal });
      await progress(writer, "embed", { chunkCount });
      return { tenantId, requestId, source, documentId, unchanged, chunkCount };
    },
  });

const createEmitStep = (deps: KnowledgeWorkflowDeps) =>
  createStep({
    id: "emit",
    description: "Emits KNOWLEDGE_DOCUMENT_INDEXED for a newly indexed document.",
    inputSchema: EmbeddedSchema,
    outputSchema: KnowledgeIngestResultSchema,
    execute: async ({ inputData, requestContext }) => {
      assertSameTenant(requestContext, inputData.tenantId);
      const { tenantId, documentId, source, chunkCount, requestId } = inputData;
      if (inputData.unchanged || chunkCount === null) return { status: "unchanged" as const, documentId, chunkCount: null, code: null };
      await deps.events.documentIndexed({ tenantId, documentId, source, chunkCount, requestId });
      return { status: "indexed" as const, documentId, chunkCount, code: null };
    },
  });

/**
 * `knowledge-ingest` (SP3 spec §11): resolve-source → extract-text → chunk → store →
 * embed → emit, 3 attempts 2 s apart on infrastructure errors. Tenant, namespace
 * and author come from the typed request context; expected failures end the run
 * with `status: "failed"` and a code instead of retrying. The document is upserted
 * before embedding so vectors never enter the workflow snapshot.
 */
export const createKnowledgeIngestWorkflow = (deps: KnowledgeWorkflowDeps) =>
  createWorkflow({
    id: KNOWLEDGE_INGEST_WORKFLOW_ID,
    description: "Indexes an uploaded knowledge file or a public web page into the organization knowledge base.",
    inputSchema: KnowledgeIngestInputSchema,
    outputSchema: KnowledgeIngestResultSchema,
    retryConfig: { attempts: 3, delay: 2000 },
  })
    .then(createResolveSourceStep(deps))
    .then(createExtractTextStep(deps))
    .then(createChunkStep())
    .then(createStoreStep(deps))
    .then(createEmbedStep(deps))
    .then(createEmitStep(deps))
    .commit();
