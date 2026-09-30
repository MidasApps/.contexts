/** Response kept for replay: status, body as sent (JSON text or null) and `Location` of a 201. */
export type StoredResponse = { readonly status: number; readonly body: string | null; readonly location?: string };

/** What `IdempotencyStore.begin` tells the pipeline to do. */
export type IdempotencyBegin =
  | { readonly kind: "new" }
  | { readonly kind: "replay"; readonly response: StoredResponse }
  | { readonly kind: "conflict" }
  | { readonly kind: "in-flight" };

/** Stored record (decision 0009 §3); `leaseUntil` frees a record whose request died mid-flight. */
export type IdempotencyRecord = {
  readonly requestHash: string;
  readonly state: "in-flight" | "done";
  readonly response: StoredResponse | null;
  readonly expiresAt: Date;
  readonly leaseUntil: Date;
};

/** Results are kept at least 24 h (rules/api-design.md). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** A crashed request (no `complete`/`release`) blocks its key for at most this long. */
export const IN_FLIGHT_LEASE_MS = 60_000;

const freshRecord = (requestHash: string, now: Date): IdempotencyRecord => ({
  requestHash,
  state: "in-flight",
  response: null,
  expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
  leaseUntil: new Date(now.getTime() + IN_FLIGHT_LEASE_MS),
});

/**
 * Pure decision of `begin` shared by every store adapter: missing or expired → new;
 * other request hash → conflict; done → replay; in-flight → in-flight until the lease
 * ends, then the new request takes the key over.
 * @returns what to answer and the record to write (`null`: write nothing).
 */
export const decideBegin = (args: {
  record: IdempotencyRecord | null;
  requestHash: string;
  now: Date;
}): { begin: IdempotencyBegin; write: IdempotencyRecord | null } => {
  const { record, requestHash, now } = args;
  const nowMs = now.getTime();
  if (record === null || record.expiresAt.getTime() <= nowMs) return { begin: { kind: "new" }, write: freshRecord(requestHash, now) };
  if (record.requestHash !== requestHash) return { begin: { kind: "conflict" }, write: null };
  if (record.state === "done" && record.response !== null) return { begin: { kind: "replay", response: record.response }, write: null };
  if (record.leaseUntil.getTime() > nowMs) return { begin: { kind: "in-flight" }, write: null };
  return { begin: { kind: "new" }, write: freshRecord(requestHash, now) };
};
