import { z } from "zod";

/**
 * Firestore automatic document id (ADR 0005): opaque, no type prefix.
 * Each context brands its own ids: `export const NoteIdSchema = firestoreIdSchema<"NoteId">()`.
 */
export const firestoreIdSchema = <const Brand extends string>() => z.string().min(1).brand<Brand>();

export const TenantIdSchema = firestoreIdSchema<"TenantId">();
export type TenantId = z.infer<typeof TenantIdSchema>;

/** Firebase Auth uid: a natural id, still opaque (ADR 0005 §2). */
export const UserIdSchema = firestoreIdSchema<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

// ULID is reserved for eventId, Idempotency-Key and X-Request-Id (ADR 0005 §4).
export const EventIdSchema = z.ulid().brand<"EventId">();
export type EventId = z.infer<typeof EventIdSchema>;

export const IdempotencyKeySchema = z.ulid().brand<"IdempotencyKey">();
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export const RequestIdSchema = z.ulid().brand<"RequestId">();
export type RequestId = z.infer<typeof RequestIdSchema>;
