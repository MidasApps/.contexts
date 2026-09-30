// Postgres test world of the knowledge workflows: the real knowledge use cases over the local
// container (row level security, role knowledge_runtime) bound to `KnowledgePort` the way
// apps/mastra binds them, plus fake embeddings. Needs `pnpm db:migrate`.
import { createKnowledgeServices, createPostgresClient, createPostgresKnowledgeRepository, KNOWLEDGE_RUNTIME_ROLE } from "@core/services";
import { FAKE_EMBEDDING_MODEL_ID, createFakeEmbeddingModel } from "../../models/fake/fake-embedding-model.ts";
import { knowledgePortFromUseCases } from "../knowledge-port-from-use-cases.ts";

const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";

export const makeKnowledgePostgresWorld = () => {
  const sql = createPostgresClient({ DATABASE_URL: process.env["DATABASE_URL"] ?? LOCAL_DATABASE_URL }, { max: 2 });
  const knowledge = createKnowledgeServices({ repository: createPostgresKnowledgeRepository(sql), embeddingModel: FAKE_EMBEDDING_MODEL_ID });
  const port = knowledgePortFromUseCases(knowledge);
  /** Rows of a tenant, read as the runtime role (row level security applies). */
  const rowsOf = async (tenantId: string) =>
    sql.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
      const documents = await tx<{ id: string; source: string; source_ref: string; namespace: string; status: string; title: string | null }[]>`
        SELECT id, source, source_ref, namespace, status, title FROM ai.documents WHERE tenant_id = ${tenantId} ORDER BY source_ref`;
      const chunks = await tx<{ document_id: string; chunk_index: number; embedding_model: string; embedding_version: string }[]>`
        SELECT document_id, chunk_index, embedding_model, embedding_version FROM ai.chunks_v1 WHERE tenant_id = ${tenantId} ORDER BY document_id, chunk_index`;
      return { documents, chunks };
    });
  const deleteTenant = async (tenantId: string, where: "all" | "catalog" = "all") => {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
      if (where === "all") await tx`DELETE FROM ai.documents WHERE tenant_id = ${tenantId}`;
      else await tx`DELETE FROM ai.documents WHERE tenant_id = ${tenantId} AND source = 'catalog'`;
    });
  };
  return { sql, knowledge: port, embedding: () => createFakeEmbeddingModel(), embeddingModelId: FAKE_EMBEDDING_MODEL_ID, rowsOf, deleteTenant };
};
