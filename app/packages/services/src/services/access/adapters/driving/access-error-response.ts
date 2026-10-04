import { apiError, type DomainErrorMapping, mapDomainError } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { UnknownRoleError } from "../../domain/errors/unknown-role-error.ts";

/** Wire status of each access domain error code (SP1 spec §7.3). */
export const ACCESS_ERROR_MAPPING: DomainErrorMapping = {
  NOT_FOUND: { status: 404 },
  ESCALATION_FORBIDDEN: { status: 403 },
  UNKNOWN_PERMISSION: { status: 422 },
  ROLE_IN_USE: { status: 409 },
  LAST_OWNER: { status: 422 },
  MEMBERSHIP_EXISTS: { status: 409 },
  EMAIL_MISMATCH: { status: 403 },
  INVITATION_ALREADY_USED: { status: 409 },
  INVITATION_EXPIRED: { status: 410 },
};

/**
 * Maps an expected access error to its response: a denial through `deniedResponse`
 * (404 hides existence), an unknown custom role as `400 VALIDATION_FAILED` on `roles`.
 * @throws the error when it is not an expected one (the boundary answers 500).
 */
export const accessErrorResponse = (error: Error & { readonly code: string }, requestId: string): Response => {
  if (error instanceof AccessDeniedError) return deniedResponse(error.reason, requestId);
  if (error instanceof UnknownRoleError)
    return apiError(400, "VALIDATION_FAILED", requestId, [{ field: "roles", issue: "UNKNOWN_ROLE" }]);
  return mapDomainError(error, ACCESS_ERROR_MAPPING, requestId);
};
