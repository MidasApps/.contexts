import type { EndpointDefinition, InferEndpointInput, Principal, RequestId } from "@core/contracts";
import type { RequestAccess } from "../../access/composition.ts";
import type { DenyReason } from "../../access/domain/authorization.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { ImpersonatedRequest } from "../../identity/application/use-cases/audit-impersonated-request.ts";
import type { VerifyBearer } from "../../identity/application/use-cases/resolve-principal.ts";
import type { Clock } from "../clock/clock.ts";
import type { IdempotencyStore } from "../idempotency/idempotency-store.ts";
import type { Logger } from "../observability/logger.ts";
import type { RateLimitDecision } from "../rate-limit/fixed-window.ts";
import { rateLimitedResponse, rateLimitHeaders } from "../rate-limit/rate-limit-headers.ts";
import { getRateLimitPolicy, type RateLimitPolicy } from "../rate-limit/rate-limit-policies.ts";
import type { RateLimiter } from "../rate-limit/rate-limiter.ts";
import { apiError } from "./api-errors.ts";
import type { ApiHandler, EndpointPrincipal } from "./api-handler-context.ts";
import { beginIdempotentAttempt, ONE_TIME_SECRET_ENDPOINT_IDS, principalKey, replayResponse } from "./api-idempotency.ts";
import { createRateLimitGate, isCallerFailure, type RateLimitGate } from "./api-rate-limit.ts";
import { authenticateRequest } from "./authenticate-request.ts";
import { clientIpOf, DEFAULT_TRUSTED_PROXY_HOPS } from "./client-ip.ts";
import { readRequestInput } from "./request-input.ts";
import { withRouteBoundary, type RouteHandler } from "./route-boundary.ts";

/** Everything the `/v1` pipeline needs; built once by `createCoreServer`. */
export type ApiRouteDeps = {
  readonly logger: Logger;
  readonly clock: Clock;
  readonly rateLimiter: RateLimiter;
  /** Defaults to the core policies (decision 0009). */
  readonly rateLimitPolicies?: readonly RateLimitPolicy[];
  readonly idempotency: IdempotencyStore;
  /** Endpoint ids whose successes are never stored for replay (default `ONE_TIME_SECRET_ENDPOINT_IDS`). */
  readonly oneTimeSecretEndpoints?: ReadonlySet<string>;
  readonly verifyBearer: VerifyBearer;
  readonly apiKeyPrefix: string;
  /** `TRUSTED_PROXY_HOPS`: which `X-Forwarded-For` entry is the client IP (default 1). */
  readonly trustedProxyHops?: number;
  readonly access: { readonly forRequest: () => RequestAccess };
  readonly audit: AuditWriter;
  /** Audits each request of an impersonated principal (SP1 spec §6.6); a failure answers 500. */
  readonly onImpersonatedRequest?: (request: ImpersonatedRequest) => Promise<void>;
};

type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly response: Response };

type Pipeline<E extends EndpointDefinition> = {
  readonly endpoint: E;
  readonly deps: ApiRouteDeps;
  readonly handler: ApiHandler<E>;
  readonly request: Request;
  readonly requestId: RequestId;
  readonly clientIp: string;
  /** The last `authorize()` denial of this request (logged, never sent). */
  readonly trace: { denial: DenyReason | undefined };
};

/** `identity.getMe` → `identity_get_me` (log messages are snake_case). */
export const operationName = (endpointId: string): string =>
  endpointId.replace(".", "_").replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const withHeaders = (response: Response, headers: Record<string, string>): Response => {
  const copy = new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
  for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value);
  return copy;
};

const authenticate = async <E extends EndpointDefinition>(run: Pipeline<E>): Promise<Step<Principal | undefined>> => {
  const { endpoint, deps, request, requestId } = run;
  if (endpoint.auth === "none") return { ok: true, value: undefined };
  const result = await authenticateRequest({ ...deps, request, clientIp: run.clientIp, policies: deps.rateLimitPolicies });
  if (result.kind === "rate-limited") return { ok: false, response: rateLimitedResponse({ decision: result.decision, now: deps.clock.now(), requestId }) };
  if (result.kind === "unauthenticated") return { ok: false, response: apiError(401, "UNAUTHORIZED", requestId) };
  if (endpoint.auth === "user" && result.principal.type !== "user") return { ok: false, response: apiError(403, "FORBIDDEN", requestId) };
  return { ok: true, value: result.principal };
};

// Records the last denial, so the pipeline can log why a request was refused.
const tracedScope = (scope: RequestAccess, trace: { denial: DenyReason | undefined }): RequestAccess => ({
  ...scope,
  authorize: async (request) => {
    const decision = await scope.authorize(request);
    if (!decision.allowed) trace.denial = decision.reason;
    return decision;
  },
});

const callHandler = <E extends EndpointDefinition>(run: Pipeline<E>, principal: Principal | undefined, input: InferEndpointInput<E>) => {
  const scope = tracedScope(run.deps.access.forRequest(), run.trace);
  return run.handler({
    principal: principal as EndpointPrincipal<E>,
    input,
    requestId: run.requestId,
    authorize: scope.authorize,
    scope,
    audit: run.deps.audit,
    clientIp: run.clientIp,
    logger: run.deps.logger,
    request: run.request,
  });
};

const inProgressResponse = (requestId: string): Response =>
  withHeaders(apiError(409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", requestId), { "retry-after": "1" });

// Validate → idempotency → handler. A throw frees the idempotency key and reaches the boundary (500).
const validateAndHandle = async <E extends EndpointDefinition>(run: Pipeline<E>, principal: Principal | undefined): Promise<Response> => {
  const parsed = await readRequestInput(run.endpoint, run.request);
  if (!parsed.ok) return apiError(400, "VALIDATION_FAILED", run.requestId, parsed.details);
  if (parsed.idempotencyKey === undefined) return callHandler(run, principal, parsed.input);
  const attempt = await beginIdempotentAttempt({
    store: run.deps.idempotency,
    principalKey: principalKey(principal, run.clientIp),
    endpointId: run.endpoint.id,
    idempotencyKey: parsed.idempotencyKey,
    input: parsed.input,
    redactSuccess: (run.deps.oneTimeSecretEndpoints ?? ONE_TIME_SECRET_ENDPOINT_IDS).has(run.endpoint.id),
  });
  if (attempt.begin.kind === "conflict") return apiError(409, "IDEMPOTENCY_KEY_REUSED", run.requestId);
  if (attempt.begin.kind === "in-flight") return inProgressResponse(run.requestId);
  if (attempt.begin.kind === "replay") return replayResponse(attempt.begin.response, run.requestId);
  try {
    const response = await callHandler(run, principal, parsed.input);
    await attempt.finish(response);
    return response;
  } catch (err: unknown) {
    await attempt.abandon();
    throw err;
  }
};

const gateFor = <E extends EndpointDefinition>(run: Pipeline<E>, subjectKind: "ip" | "principal", subject: string): RateLimitGate | undefined => {
  if (run.endpoint.rateLimit === undefined) return undefined;
  const policy = getRateLimitPolicy(run.endpoint.rateLimit, run.deps.rateLimitPolicies);
  return policy.subject === subjectKind ? createRateLimitGate({ limiter: run.deps.rateLimiter, policy, subject }) : undefined;
};

// Deny reasons go to logs only (the response says 403/404); impersonated requests are audited.
const reportRequest = async <E extends EndpointDefinition>(run: Pipeline<E>, principal: Principal | undefined, status: number): Promise<void> => {
  const denyReason = status >= 400 ? run.trace.denial : undefined;
  if (denyReason !== undefined) run.deps.logger.info("access_denied", { requestId: run.requestId, endpointId: run.endpoint.id, reason: denyReason });
  if (principal?.type !== "user" || principal.impersonation === undefined || run.deps.onImpersonatedRequest === undefined) return;
  const { impersonation } = principal;
  const request = { principal: { ...principal, impersonation }, endpointId: run.endpoint.id, method: run.request.method, status, denyReason, requestId: run.requestId };
  await run.deps.onImpersonatedRequest(request);
};

const runPipeline =async <E extends EndpointDefinition>(run: Pipeline<E>): Promise<Response> => {
  const refused = (decision: RateLimitDecision) => rateLimitedResponse({ decision, now: run.deps.clock.now(), requestId: run.requestId });
  // IP policies run before authentication (public endpoints), principal policies right after it.
  const ipGate = gateFor(run, "ip", run.clientIp);
  let decision = await ipGate?.before();
  if (decision?.allowed === false) return refused(decision);
  const principal = await authenticate(run);
  if (!principal.ok) return principal.response;
  const principalGate = ipGate === undefined ? gateFor(run, "principal", principalKey(principal.value, run.clientIp)) : undefined;
  decision = (await principalGate?.before()) ?? decision;
  if (decision?.allowed === false) return refused(decision);
  const response = await validateAndHandle(run, principal.value);
  await reportRequest(run, principal.value, response.status);
  decision = (await (ipGate ?? principalGate)?.after(isCallerFailure(response.status))) ?? decision;
  return decision === undefined ? response : withHeaders(response, rateLimitHeaders(decision, run.deps.clock.now()));
};

/**
 * Wraps a `/v1` handler in the SP1 pipeline (spec §7.2): route boundary (request id, one
 * log line, 500 on throw) → rate limit (IP policies) → Bearer authentication (401/403) →
 * rate limit (principal policies) → validation of params, query, body and Idempotency-Key
 * (400 with every issue) → idempotency (409 reuse / in progress, replay) → handler.
 * @example export const POST = withApiRoute(createProjectEndpoint, deps, async ({ principal, input, authorize }) => { ... });
 */
export const withApiRoute = <E extends EndpointDefinition>(endpoint: E, deps: ApiRouteDeps, handler: ApiHandler<E>): RouteHandler =>
  withRouteBoundary({ operation: operationName(endpoint.id), logger: deps.logger }, (request, { requestId }) =>
    runPipeline({ endpoint, deps, handler, request, requestId, trace: { denial: undefined }, clientIp: clientIpOf(request, { trustedProxyHops: deps.trustedProxyHops ?? DEFAULT_TRUSTED_PROXY_HOPS }) }),
  );
