import type { KnowledgeDocument, RegionalSettings, StoredFile } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { AgentRuntimeGateway, WorkflowStartInput } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { GetReadyFile } from "../../../files/application/use-cases/read-file-bytes.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import type { ErrorEnvelope } from "../../../shared/http/error-envelope.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { KnowledgeRepository } from "../../application/ports/knowledge-repository.ts";
import { createKnowledgeServices } from "../../composition.ts";
import { buildKnowledgeDocumentsRoutes } from "./knowledge-documents-route-handler.ts";
import { buildKnowledgeSourcesRoutes } from "./knowledge-sources-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const PROJECT_A = "ProjAaaaaaaaaaaaaaaaa";
const PROJECT_B = "ProjBbbbbbbbbbbbbbbbb";
const DOC_ID = "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f";
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };

const documentOf = (tenantId: string): KnowledgeDocument =>
  ({
    id: DOC_ID,
    tenantId,
    namespace: "tenant",
    source: "upload",
    sourceRef: "file-1",
    title: "Guide",
    sourceUrl: null,
    mimeType: "text/markdown",
    contentHash: "a".repeat(64),
    status: "ready",
    createdBy: "alice",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  }) as KnowledgeDocument;

// Rows by tenant: a tenant only ever sees its own rows, like the row level security.
const fakeRepository = (): KnowledgeRepository & { deleted: string[] } => {
  const rows = new Map([[ORG_A, [documentOf(ORG_A)]]]);
  const deleted: string[] = [];
  const own = (tenantId: string) => rows.get(tenantId) ?? [];
  return {
    deleted,
    upsertDocument: () => Promise.reject(new Error("unused")),
    replaceChunks: () => Promise.reject(new Error("unused")),
    searchChunks: () => Promise.resolve([]),
    getDocument: ({ tenantId, documentId }) => Promise.resolve(own(tenantId).find((doc) => doc.id === documentId) ?? null),
    deleteDocument: ({ tenantId, documentId }) => {
      const found = own(tenantId).some((doc) => doc.id === documentId);
      if (found) deleted.push(documentId);
      return Promise.resolve(found);
    },
    listDocuments: ({ tenantId }) => Promise.resolve({ documents: own(tenantId), nextCursor: null }),
  };
};

const readyFile = { id: "file-1", tenantId: ORG_A, purpose: "knowledge", status: "ready" } as StoredFile;

const setup = () => {
  const { pipeline, store } = makeInMemoryPipeline({
    now: "2026-09-29T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
  });
  store.putProject({ id: PROJECT_A, tenantId: ORG_A });
  store.putProject({ id: PROJECT_B, tenantId: ORG_B });
  const repository = fakeRepository();
  const launched: WorkflowStartInput[] = [];
  const gateway = {
    launchWorkflow: (input: WorkflowStartInput) => {
      launched.push(input);
      return Promise.resolve({ ok: true as const, data: { runId: "run-42" } });
    },
  } as unknown as AgentRuntimeGateway;
  const getReadyFile: GetReadyFile = ({ fileId }) =>
    Promise.resolve(fileId === "file-1" ? { ok: true, data: readyFile } : fileId === "pending" ? { ok: false, error: { code: "FILE_NOT_READY" } } : { ok: false, error: { code: "FILE_NOT_FOUND" } });
  const resolveAccessContext: ResolveAccessContext = ({ principal, node }) =>
    Promise.resolve(
      node.level === "organization"
        ? { tenantId: node.tenantId, principal, permissions: [], regional: REGIONAL }
        : node.level === "project"
          ? { tenantId: node.tenantId, projectId: node.projectId, principal, permissions: [], regional: REGIONAL }
          : null,
    );
  const routes = {
    ...buildKnowledgeDocumentsRoutes({ pipeline, knowledge: createKnowledgeServices({ repository, embeddingModel: "fake/fake-embedding" }) }),
    ...buildKnowledgeSourcesRoutes({ pipeline, gateway, getReadyFile, resolveAccessContext }),
  };
  return { routes, repository, launched };
};

const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;
const docs = (tenantId: string) => `/v1/organizations/${tenantId}/knowledge/documents`;
const sources = (tenantId: string) => `/v1/organizations/${tenantId}/knowledge/sources`;

describe("/v1 knowledge documents", () => {
  it("lists and reads the organization's documents for knowledge readers", async () => {
    const { routes } = setup();
    const list = await callRoute(routes, "knowledge.listDocuments", `${docs(ORG_A)}?limit=10`, { as: "mia" });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ data: [{ id: DOC_ID }], meta: { page: { cursor: null, hasMore: false, limit: 10 } } });
    expect((await callRoute(routes, "knowledge.getDocument", `${docs(ORG_A)}/${DOC_ID}`, { as: "mia" })).status).toBe(200);
  });

  it("hides another organization's knowledge base (404) and rejects a bad cursor (400)", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "knowledge.listDocuments", docs(ORG_A), { as: "bob" })).status).toBe(404);
    expect((await callRoute(routes, "knowledge.getDocument", `${docs(ORG_B)}/${DOC_ID}`, { as: "bob" })).status).toBe(404);
    const badCursor = await callRoute(routes, "knowledge.listDocuments", `${docs(ORG_A)}?cursor=nope`, { as: "mia" });
    expect(badCursor.status).toBe(400);
  });

  it("deletes with core.knowledge.delete only", async () => {
    const { routes, repository } = setup();
    const byMember = await callRoute(routes, "knowledge.deleteDocument", `${docs(ORG_A)}/${DOC_ID}`, { method: "DELETE", as: "mia" });
    expect(byMember.status).toBe(403);
    expect(repository.deleted).toEqual([]);
    expect((await callRoute(routes, "knowledge.deleteDocument", `${docs(ORG_A)}/${DOC_ID}`, { method: "DELETE", as: "alice" })).status).toBe(204);
    expect(repository.deleted).toEqual([DOC_ID]);
  });
});

describe("POST /v1/organizations/{organizationId}/knowledge/sources", () => {
  it("starts knowledge-ingest with the caller's Bearer and answers 202 with the run id", async () => {
    const { routes, launched } = setup();
    const response = await callRoute(routes, "knowledge.addSource", sources(ORG_A), { method: "POST", as: "alice", body: { kind: "file", fileId: "file-1" } });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { runId: "run-42" } });
    expect(launched).toHaveLength(1);
    expect(launched[0]).toMatchObject({ workflowId: "knowledge-ingest", inputData: { source: { kind: "file", fileId: "file-1" } }, scope: { bearer: "alice-token", tenantId: ORG_A, regional: REGIONAL } });
  });

  it("indexes for one project when asked: authorized at the project, which goes into the run scope", async () => {
    const { routes, launched } = setup();
    const response = await callRoute(routes, "knowledge.addSource", `${sources(ORG_A)}?projectId=${PROJECT_A}`, { method: "POST", as: "alice", body: { kind: "url", url: "https://docs.example.com" } });
    expect(response.status).toBe(202);
    expect(launched[0]).toMatchObject({ scope: { tenantId: ORG_A, projectId: PROJECT_A } });
  });

  it("refuses a project of another organization and an unknown project without starting a run", async () => {
    const { routes, launched } = setup();
    for (const projectId of [PROJECT_B, "ProjNoneeeeeeeeeeeee0"]) {
      const response = await callRoute(routes, "knowledge.addSource", `${sources(ORG_A)}?projectId=${projectId}`, { method: "POST", as: "alice", body: { kind: "url", url: "https://docs.example.com" } });
      expect([403, 404]).toContain(response.status);
    }
    expect(launched).toEqual([]);
  });

  it("needs core.knowledge.write and a ready knowledge file of the organization", async () => {
    const { routes, launched } = setup();
    expect((await callRoute(routes, "knowledge.addSource", sources(ORG_A), { method: "POST", as: "mia", body: { kind: "url", url: "https://docs.example.com" } })).status).toBe(403);
    expect((await callRoute(routes, "knowledge.addSource", sources(ORG_A), { method: "POST", as: "alice", body: { kind: "file", fileId: "missing" } })).status).toBe(404);
    const pending = await callRoute(routes, "knowledge.addSource", sources(ORG_A), { method: "POST", as: "alice", body: { kind: "file", fileId: "pending" } });
    expect(pending.status).toBe(409);
    expect((await errorOf(pending)).code).toBe("CONFLICT");
    expect(launched).toEqual([]);
  });

  it("rejects a non-https URL and a tenant smuggled into the body (400)", async () => {
    const { routes, launched } = setup();
    for (const body of [{ kind: "url", url: "http://docs.example.com" }, { kind: "url", url: "https://docs.example.com", tenantId: ORG_B }]) {
      const response = await callRoute(routes, "knowledge.addSource", sources(ORG_A), { method: "POST", as: "alice", body });
      expect(response.status).toBe(400);
    }
    expect(launched).toEqual([]);
  });
});
