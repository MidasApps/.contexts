// Test world of the API key use cases: the access write world (org-a with an owner and an
// admin), an in-memory API key store and a movable clock.
import { OrganizationIdSchema, type ApiKeyId } from "@core/contracts";
import { makeAccessWriteWorld, nodes, system, user } from "../../../access/application/use-cases/access-write.fixture.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { inMemoryUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { createInMemoryApiKeyRepository } from "../../adapters/driven/in-memory-api-key-repository.ts";
import { createApiKeyServices } from "../../api-key-composition.ts";

export const API_KEY_NOW = "2026-09-30T12:00:00.000Z";

export const buildApiKeyWorld = async (options: { hashSecret?: (secret: string) => string } = {}) => {
  let now = new Date(API_KEY_NOW);
  const clock = { now: () => new Date(now.getTime()) };
  const world = makeAccessWriteWorld();
  await world.grant("owner", nodes.orgA, [system("owner")]);
  await world.grant("admin", nodes.orgA, [system("admin")]);
  world.store.putUser("stranger");
  const repository = createInMemoryApiKeyRepository();
  const writer = createInMemoryAuditLogWriter();
  let random = 0;
  const keys = createApiKeyServices({
    apiKeys: repository,
    audit: makeRecordAudit({ writer, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
    randomBytes: (size) => new Uint8Array(size).fill((random += 7) % 256),
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
    apiKeyPrefix: "core",
    ...(options.hashSecret === undefined ? {} : { hashSecret: options.hashSecret }),
  });
  const admin = user("admin");
  /** A key of the admin at the organization, with `core.project.read`. */
  const createKey = async (): Promise<{ key: string; apiKeyId: ApiKeyId }> => {
    const created = await keys.createApiKey({
      actor: admin,
      access: world.access(),
      tenantId: OrganizationIdSchema.parse("org-a"),
      input: { name: "Export", scopes: ["core.project.read"], node: nodes.orgA, expiresAt: "2026-12-30T12:00:00.000Z" },
      requestId: "seed",
    });
    if (!created.ok) throw created.error;
    return { key: created.data.secret, apiKeyId: created.data.apiKey.id };
  };
  return {
    ...world,
    keys,
    authenticator: keys.authenticator,
    repository,
    admin,
    stranger: user("stranger"),
    createKey,
    audited: () => writer.entries("tenant").map((entry) => entry.action),
    setNow: (iso: string) => {
      now = new Date(iso);
    },
  };
};
