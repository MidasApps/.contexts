import { RequestIdSchema, type RequestId } from "@core/contracts";
import { ulid } from "ulid";

/** Correlation header set at the edge (web `src/proxy.ts`) and echoed on every response. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Keeps a well-formed incoming ULID and replaces anything else with a fresh
 * one, so a client can correlate its own retries but never inject arbitrary
 * text into logs (ADR 0005 §4: X-Request-Id is a ULID).
 */
export const resolveRequestId = (incoming: string | null | undefined): RequestId => {
  const parsed = RequestIdSchema.safeParse(incoming);
  return parsed.success ? parsed.data : RequestIdSchema.parse(ulid());
};
