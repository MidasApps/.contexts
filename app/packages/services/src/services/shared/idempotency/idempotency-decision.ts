/**
 * Response kept for replay: status, body as sent (JSON text or null) and `Location` of a 201.
 * `redacted`: a success of an endpoint that returns a one-time secret; its body was never
 * stored and a replay answers 409 CONFLICT (decision 0030 §5).
 */
export type StoredResponse = { readonly status: number; readonly body: string | null; readonly location?: string; readonly redacted?: boolean };

/** What `IdempotencyStore.begin` tells the pipeline to do; `attemptId` owns a new attempt. */
export type IdempotencyBegin =
  | { readonly kind: "new"; readonly attemptId: string }
  | { readonly kind: "replay"; readonly response: StoredResponse }
  | { readonly kind: "conflict" }
  | { readonly kind: "in-flight" };

/**
 * Stored record (decision 0009 §3); `leaseUntil` frees a record whose request died
 * mid-flight, and `attemptId` names the attempt allowed to complete or release it.
 */
export type IdempotencyRecord = {
  readonly requestHash: string;
  readonly state: "in-flight" | "done";
  readonly response: StoredResponse | null;
  readonly expiresAt: Date;
  readonly leaseUntil: Date;
  readonly attemptId: string;
};

/** Results are kept at least 24 h (rules/api-design.md). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** A crashed request (no `complete`/`release`) blocks its key for at most this long. */
export const IN_FLIGHT_LEASE_MS = 60_000;

const freshRecord = (requestHash: string, now: Date, attemptId: string): IdempotencyRecord => ({
  requestHash,
  state: "in-flight",
  response: null,
  expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
  leaseUntil: new Date(now.getTime() + IN_FLIGHT_LEASE_MS),
  attemptId,
});

/**
 * Pure decision of `begin` shared by every store adapter: missing or expired → new;
 * other request hash → conflict; done → replay; in-flight → in-flight until the lease
 * ends, then the new request takes the key over (with its own `attemptId`).
 * @param attemptId id the adapter generated for this attempt, used only when it is new.
 * @returns what to answer and the record to write (`null`: write nothing).
 */
export const decideBegin = (args: {
  record: IdempotencyRecord | null;
  requestHash: string;
  now: Date;
  attemptId: string;
}): { begin: IdempotencyBegin; write: IdempotencyRecord | null } => {
  const { record, requestHash, now, attemptId } = args;
  const nowMs = now.getTime();
  const fresh = () => ({ begin: { kind: "new", attemptId } as const, write: freshRecord(requestHash, now, attemptId) });
  if (record === null || record.expiresAt.getTime() <= nowMs) return fresh();
  if (record.requestHash !== requestHash) return { begin: { kind: "conflict" }, write: null };
  if (record.state === "done" && record.response !== null) return { begin: { kind: "replay", response: record.response }, write: null };
  if (record.leaseUntil.getTime() > nowMs) return { begin: { kind: "in-flight" }, write: null };
  return fresh();
};

/**
 * Whether `attemptId` may still complete or release `record`: a late attempt whose lease
 * another attempt took over must not overwrite or free that attempt's record.
 */
export const ownsAttempt = (record: IdempotencyRecord | null, attemptId: string): record is IdempotencyRecord =>
  record !== null && record.state === "in-flight" && record.attemptId === attemptId;
