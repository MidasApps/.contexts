// Helpers of the SP3 gate suite (`sp3-gate.emulator.test.ts`): Auth Emulator users, SP1
// access over in-memory readers, the Postgres knowledge base and usage ledger read as their
// runtime roles (row level security), and Mastra's SSE stream parsed into chunks.
import { createServer } from "node:net";
import { createFakeEmbeddingModel, FAKE_EMBEDDING_MODEL_ID, indexDocumentText, knowledgePortFromUseCases, type RegionalSettings } from "@core/agents";
import {
  createAccessCore,
  type createInMemoryAccessStore,
  createKnowledgeServices,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  KNOWLEDGE_RUNTIME_ROLE,
  type ResolveAccessContext,
  USAGE_RUNTIME_ROLE,
} from "@core/services";

export const GATE_DATABASE_URL = process.env["DATABASE_URL"] ?? "postgresql://app:app@127.0.0.1:5432/app";

const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Manaus", currency: "BRL" };

/** SP1 `resolveAccessContext` over in-memory readers (no seeded Firestore organizations needed). */
export const resolveFromReaders = (readers: ReturnType<typeof createInMemoryAccessStore>): ResolveAccessContext => {
  const access = createAccessCore({ readers });
  return async ({ principal, node }) => {
    if (node.level === "platform") return null;
    const effective = await access.forRequest().getEffectivePermissions({ principal, node });
    if (!effective.ok || effective.permissions.size === 0) return null;
    return { tenantId: node.tenantId, principal, permissions: [...effective.permissions].sort(), regional: REGIONAL };
  };
};

export type EmulatorUser = { readonly uid: string; readonly idToken: string };

export const signUp = async (label: string): Promise<EmulatorUser> => {
  const host = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
  if (host === undefined) throw new Error("FIREBASE_AUTH_EMULATOR_HOST is not set; run through pnpm test:emulators");
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${label}-${Date.now()}@example.test`, password: "secret-password", returnSecureToken: true }),
  });
  const body = (await response.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
};

export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

export type StreamChunk = { readonly type: string; readonly payload?: Record<string, unknown>; readonly [key: string]: unknown };

/** Mastra `/api/agents/:id/stream` answers SSE (`data: {chunk}` lines). */
export const chunksOf = async (response: Response): Promise<StreamChunk[]> =>
  (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as StreamChunk);

/** The knowledge base and ledger as the runtime roles see them (the app's binding, fake embeddings). */
export const makeGateDatabase = () => {
  const sql = createPostgresClient({ DATABASE_URL: GATE_DATABASE_URL }, { max: 2 });
  const knowledge = knowledgePortFromUseCases(createKnowledgeServices({ repository: createPostgresKnowledgeRepository(sql), embeddingModel: FAKE_EMBEDDING_MODEL_ID }));
  return {
    indexDocument: async (args: { tenantId: string; uid: string; sourceRef: string; title: string; text: string }) => {
      const outcome = await indexDocumentText(
        { knowledge, embedding: () => createFakeEmbeddingModel(), embeddingModelId: FAKE_EMBEDDING_MODEL_ID },
        {
          document: { tenantId: args.tenantId, namespace: "tenant", source: "upload", sourceRef: args.sourceRef, title: args.title, sourceUrl: null, mimeType: "text/markdown", metadata: {}, createdBy: args.uid },
          text: args.text,
          format: "markdown",
        },
      );
      if (outcome.status === "empty") throw new Error(`nothing indexed for ${args.sourceRef}`);
      return outcome.documentId;
    },
    deleteKnowledge: (tenantId: string) =>
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
        await tx`DELETE FROM ai.documents WHERE tenant_id = ${tenantId}`;
      }),
    usageRows: (tenantId: string) =>
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.unsafe(`SET LOCAL ROLE ${USAGE_RUNTIME_ROLE}`);
        return tx<{ request_id: string | null; agent_id: string; input_tokens: number; user_id: string | null }[]>`
          SELECT request_id, agent_id, input_tokens, user_id FROM usage.llm_calls WHERE tenant_id = ${tenantId}`;
      }),
    end: () => sql.end(),
  };
};
