// Test world of the files routes: the SP1 pipeline over in-memory access, audit and
// idempotency adapters, plus in-memory files adapters. Two organizations, one member each.
import type { Principal } from "@core/contracts";
import { createInMemoryAccessStore } from "../../../access/adapters/driven/in-memory-access-store.ts";
import { createAccessCore } from "../../../access/composition.ts";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import type { ApiRouteDeps } from "../../../shared/http/api-route.ts";
import { createInMemoryIdempotencyStore } from "../../../shared/idempotency/in-memory-idempotency-store.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { createInMemoryRateLimiter } from "../../../shared/rate-limit/in-memory-rate-limiter.ts";
import {
  createFakeUrlSigner,
  createInMemoryFileRepository,
  createInMemoryObjectStore,
  createRecordingFileEvents,
} from "../../adapters/driven/in-memory-file-adapters.ts";
import { buildFilesRoutes } from "../../adapters/driving/files-route-handler.ts";
import { createFilesServices } from "../../composition.ts";

export const NOW = "2026-09-29T12:00:00.000Z";
export const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
export const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";

const PRINCIPALS: Record<string, Principal> = {
  "alice-token": { type: "user", uid: "alice", mfa: false } as Principal,
  "bob-token": { type: "user", uid: "bob", mfa: false } as Principal,
  "carol-token": { type: "user", uid: "carol", mfa: false } as Principal,
};

/** A fresh world: alice and carol are members of ORG_A, bob of ORG_B (system `member` role). */
export const makeFilesWorld = () => {
  const clock = fixedClock(NOW);
  const store = createInMemoryAccessStore();
  for (const [uid, tenantId] of [
    ["alice", ORG_A],
    ["bob", ORG_B],
    ["carol", ORG_A],
  ] as const) {
    store.putOrganization({ id: tenantId });
    store.putUser(uid);
    store.putGrant({ tenantId, principalId: uid, nodeId: tenantId, roles: [{ kind: "system", key: "member" }] });
  }
  const pipeline: ApiRouteDeps = {
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
    clock,
    rateLimiter: createInMemoryRateLimiter({ clock }),
    idempotency: createInMemoryIdempotencyStore({ clock }),
    apiKeyPrefix: "core",
    verifyBearer: ({ token }) => Promise.resolve(PRINCIPALS[token] ?? null),
    access: createAccessCore({ readers: store, clock }),
    audit: makeRecordAudit({ writer: createInMemoryAuditLogWriter(), clock }),
  };
  const repository = createInMemoryFileRepository();
  const objects = createInMemoryObjectStore();
  const events = createRecordingFileEvents();
  const files = createFilesServices({
    files: repository,
    objects,
    signer: createFakeUrlSigner(),
    events,
    clock,
    logger: pipeline.logger,
  });
  const routes = buildFilesRoutes({ pipeline, files });
  const call = (endpointId: string, url: string, init: { method?: string; token?: string; body?: unknown } = {}) => {
    const route = routes[endpointId];
    if (route === undefined) throw new Error(`no route ${endpointId}`);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (init.token !== undefined) headers["authorization"] = `Bearer ${init.token}`;
    const body = init.body === undefined ? null : JSON.stringify(init.body);
    return route(new Request(`http://localhost${url}`, { method: init.method ?? "GET", headers, body }));
  };
  return { store, repository, objects, events, files, call, clock };
};
