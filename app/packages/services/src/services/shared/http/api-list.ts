import type { PageQuery } from "@core/contracts";
import type { DenyReason } from "../../access/domain/authorization.ts";
import { decodeCursor } from "../pagination/cursor.ts";
import { type Page, type PageRequest, pageMeta } from "../pagination/page.ts";
import { apiError, dataResponse } from "./api-errors.ts";

/**
 * Decodes `?cursor&limit` of a list endpoint.
 * @returns null for a cursor this API did not issue (answer `invalidCursorResponse`).
 */
export const pageRequestOf = (query: PageQuery): PageRequest | null => {
  if (query.cursor === undefined) return { after: undefined, limit: query.limit };
  const after = decodeCursor(query.cursor);
  return after === null ? null : { after, limit: query.limit };
};

/** `400 VALIDATION_FAILED` for a cursor this API did not issue. */
export const invalidCursorResponse = (requestId: string): Response =>
  apiError(400, "VALIDATION_FAILED", requestId, [{ field: "cursor", issue: "INVALID_CURSOR" }]);

/** `200 { data: [...], meta: { page } }` (contracts/api.md §5.2, §9.1). */
export const listResponse = <T>(page: Page<T>, limit: number): Response =>
  dataResponse({ data: page.items, meta: pageMeta(page, limit) });

// Existence of a node the caller has no grant on is not revealed (SP1 spec §7.2).
const HIDDEN_REASONS: ReadonlySet<DenyReason> = new Set(["NODE_NOT_FOUND", "NOT_A_MEMBER"]);

/**
 * Response for an `authorize()` denial: 404 when the caller may not learn that the node
 * exists, `403 MFA_REQUIRED` for staff without MFA, otherwise `403 FORBIDDEN`.
 */
export const deniedResponse = (reason: DenyReason, requestId: string): Response => {
  if (HIDDEN_REASONS.has(reason)) return apiError(404, "NOT_FOUND", requestId);
  return apiError(403, reason === "MFA_REQUIRED" ? "MFA_REQUIRED" : "FORBIDDEN", requestId);
};
