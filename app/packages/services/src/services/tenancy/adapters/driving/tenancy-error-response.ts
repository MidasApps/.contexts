import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { mapDomainError, type DomainErrorMapping } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";

/** Wire status of each tenancy domain error code (SP1 spec §7.3). */
export const TENANCY_ERROR_MAPPING: DomainErrorMapping = {
  NOT_FOUND: { status: 404 },
  INVALID_UNIT_PARENT: { status: 422 },
  SUBTREE_TOO_LARGE: { status: 422 },
};

/**
 * Maps an expected tenancy error to its response (a denial through `deniedResponse`).
 * @throws the error when it is not an expected one (the boundary answers 500).
 */
export const tenancyErrorResponse = (error: Error & { readonly code: string }, requestId: string): Response =>
  error instanceof AccessDeniedError ? deniedResponse(error.reason, requestId) : mapDomainError(error, TENANCY_ERROR_MAPPING, requestId);
