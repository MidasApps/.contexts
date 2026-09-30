import { createFirebaseAdmin, createInMemoryAccessStore, processLogger } from "@core/services";
import { describe, expect, it } from "vitest";
import { createRuntimePorts } from "./create-runtime-ports.ts";
import { KnowledgeSearchRejectedError } from "./knowledge-port-binding.ts";
import { PortNotWiredError } from "./unwired-ports.ts";

const ENV = {
  API_KEY_PREFIX: "core",
  DATABASE_URL: "postgres://nobody@127.0.0.1:1/none",
  AI_MODEL_EMBEDDING: "google/gemini-embedding-2",
  APP_ENV: "local",
  AI_MODE: "fake",
  FILES_BUCKET: "demo-core.appspot.com",
} as const;
const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const MEMBER = { type: "user", uid: "member-uid", mfa: false } as const;
const ORG = { level: "organization", tenantId: TENANT } as const;
const REGIONAL = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" } as never;

// No emulator host and no credentials: nothing below may reach Firebase or Postgres
// (access decisions use in-memory SP1 readers; the Firestore ones need the emulator).
const ports = () =>
  createRuntimePorts({
    env: ENV,
    firebase: createFirebaseAdmin({ env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" }, processEnv: {} }),
    logger: processLogger,
  });

describe("createRuntimePorts (default bindings)", () => {
  it("binds SP1 resolveAccessContext (overridable in tests) next to SP1 authorize", async () => {
    const store = createInMemoryAccessStore();
    store.putOrganization({ id: TENANT });
    store.putUser("member-uid");
    store.putGrant({ tenantId: TENANT, principalId: "member-uid", nodeId: TENANT, roles: [{ kind: "system", key: "member" }] });
    const bound = createRuntimePorts({
      env: ENV,
      firebase: createFirebaseAdmin({ env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" }, processEnv: {} }),
      logger: processLogger,
      adapters: {
        accessReaders: store,
        resolveAccessContext: ({ principal, node }) =>
          Promise.resolve(node.level === "organization" ? { tenantId: node.tenantId, principal, permissions: ["core.chat.use"], regional: REGIONAL } : null),
      },
    });
    expect(await bound.access.resolveAccessContext({ principal: MEMBER, node: ORG })).toEqual({ tenantId: TENANT, principal: MEMBER, permissions: ["core.chat.use"], regional: REGIONAL });
    expect(await bound.access.resolveAccessContext({ principal: MEMBER, node: { level: "platform" } })).toBeNull();
    expect(await bound.access.authorize({ principal: MEMBER, permission: "core.chat.use", node: ORG })).toEqual({ allowed: true, requiresApproval: false });
  });

  it("rejects every port whose service lands later", async () => {
    const bound = ports();
    const action = {} as never;
    await expect(bound.approvals.requestApproval({ principal: MEMBER, node: ORG, permission: "core.chat.use", action })).rejects.toBeInstanceOf(PortNotWiredError);
    await expect(bound.connectors.listActive({ tenantId: TENANT })).rejects.toBeInstanceOf(PortNotWiredError);
    await expect(bound.secrets.get("ref")).rejects.toBeInstanceOf(PortNotWiredError);
    await expect(bound.settings.getAgentSettings({ tenantId: TENANT })).rejects.toBeInstanceOf(PortNotWiredError);
    await expect(bound.webContent.scrape({ url: "https://docs.example.com", tenantId: TENANT })).rejects.toBeInstanceOf(PortNotWiredError);
  });

  it("binds the semantic runner with no registered view, so every view is refused before the database", async () => {
    const result = await ports().catalog.runSemanticQuery({
      principal: { tenantId: TENANT, nodeIds: [], permissions: new Set(["core.catalog.query"]) },
      sql: "SELECT * FROM semantic.anything",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "SQL_REJECTED" } });
  });

  it("binds knowledge search to the use case, which rejects a bad vector before the database", async () => {
    await expect(ports().knowledge.searchChunks({ tenantId: TENANT, namespaces: ["tenant"], embedding: [1, 2], topK: 1 })).rejects.toBeInstanceOf(
      KnowledgeSearchRejectedError,
    );
  });
});
