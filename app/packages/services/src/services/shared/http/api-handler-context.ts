import type { EndpointDefinition, InferEndpointInput, Principal, RequestId, UserPrincipal } from "@core/contracts";
import type { Authorize } from "../../access/application/ports/driving/authorize.ts";
import type { RequestAccess } from "../../access/composition.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Logger } from "../observability/logger.ts";

/** The authenticated caller an endpoint admits: users only, any principal, or nobody (`none`). */
export type EndpointPrincipal<E extends EndpointDefinition> = E["auth"] extends "user"
  ? UserPrincipal
  : E["auth"] extends "principal"
    ? Principal
    : undefined;

/**
 * What a `/v1` handler receives once the pipeline authenticated and validated the request
 * (SP1 spec §7.2). The handler still calls `authorize()` for its node before any side effect.
 */
export type ApiHandlerContext<E extends EndpointDefinition> = {
  readonly principal: EndpointPrincipal<E>;
  readonly input: InferEndpointInput<E>;
  readonly requestId: RequestId;
  /** `scope.authorize`, the fail-closed decision of this request. */
  readonly authorize: Authorize;
  /** Access use cases bound to this request's memoized reads (authorize, effective permissions). */
  readonly scope: RequestAccess;
  readonly audit: AuditWriter;
  /** `X-Forwarded-For` entry of the outermost trusted proxy (see `clientIpOf`). */
  readonly clientIp: string;
  readonly logger: Logger;
  /** The raw request, already consumed for its body; for headers only. */
  readonly request: Request;
};

/** A `/v1` handler: maps domain results to responses (`dataResponse`, `apiError`, `mapDomainError`). */
export type ApiHandler<E extends EndpointDefinition> = (context: ApiHandlerContext<E>) => Promise<Response>;
