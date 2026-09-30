// Unit-test harness of `/v1` routes: the SP1 pipeline over in-memory access, audit,
// rate-limit and idempotency adapters, with Bearer tokens `<uid>-token` for the given members.
import type { Principal } from "@core/contracts";
import { createInMemoryAccessStore } from "../../access/adapters/driven/in-memory-access-store.ts";
import { createAccessCore } from "../../access/composition.ts";
import { createInMemoryAuditLogWriter } from "../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../clock/clock.ts";
import type { ApiRouteDeps } from "../http/api-route.ts";
import type { RouteHandler } from "../http/route-boundary.ts";
import { createInMemoryIdempotencyStore } from "../idempotency/in-memory-idempotency-store.ts";
import { createLogger } from "../observability/logger.ts";
import { createInMemoryRateLimiter } from "../rate-limit/in-memory-rate-limiter.ts";

export type PipelineMember = { readonly uid: string; readonly tenantId: string; readonly role: "member" | "admin" | "owner" };

/** A pipeline whose `<uid>-token` Bearer authenticates each member (system role grant on the organization). */
export const makeInMemoryPipeline = (args: { readonly now: string; readonly members: readonly PipelineMember[] }) => {
  const clock = fixedClock(args.now);
  const store = createInMemoryAccessStore();
  const principals = new Map<string, Principal>();
  for (const { uid, tenantId, role } of args.members) {
    store.putOrganization({ id: tenantId });
    store.putUser(uid);
    store.putGrant({ tenantId, principalId: uid, nodeId: tenantId, roles: [{ kind: "system", key: role }] });
    principals.set(`${uid}-token`, { type: "user", uid, mfa: false } as Principal);
  }
  const pipeline: ApiRouteDeps = {
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
    clock,
    rateLimiter: createInMemoryRateLimiter({ clock }),
    idempotency: createInMemoryIdempotencyStore({ clock }),
    apiKeyPrefix: "core",
    verifyBearer: ({ token }) => Promise.resolve(principals.get(token) ?? null),
    access: createAccessCore({ readers: store, clock }),
    audit: makeRecordAudit({ writer: createInMemoryAuditLogWriter(), clock }),
  };
  return { pipeline, store, clock };
};

/** Calls a route of a route table with an optional `<uid>-token` Bearer and JSON body. */
export const callRoute = (
  routes: Readonly<Record<string, RouteHandler>>,
  endpointId: string,
  url: string,
  init: { readonly method?: string; readonly as?: string; readonly body?: unknown; readonly headers?: Record<string, string> } = {},
): Promise<Response> => {
  const route = routes[endpointId];
  if (route === undefined) throw new Error(`no route ${endpointId}`);
  const headers: Record<string, string> = { "content-type": "application/json", ...init.headers };
  if (init.as !== undefined) headers["authorization"] = `Bearer ${init.as}-token`;
  const body = init.body === undefined ? null : JSON.stringify(init.body);
  return route(new Request(`http://localhost${url}`, { method: init.method ?? "GET", headers, body }));
};
