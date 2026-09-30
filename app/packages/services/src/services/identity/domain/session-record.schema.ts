import { IsoDateTimeSchema, SessionIdSchema, SessionKindSchema, UserIdSchema } from "@core/contracts";
import { z } from "zod";

const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** How many rotated desktop secrets a session remembers for reuse detection (decision 0007 §5). */
export const MAX_PREVIOUS_SECRET_HASHES = 10;

/**
 * A `sessions/{id}` record as the server stores it (SP1 spec §4; decision 0007). Only
 * hashes of the cookie or secret are kept; `previousSecretHashes` lets a rotated secret
 * be recognized (theft signal). Never leaves the server: lists use `SessionSummary`.
 */
export const SessionRecordSchema = z.object({
  id: SessionIdSchema,
  uid: UserIdSchema,
  kind: SessionKindSchema,
  mfa: z.boolean(),
  userAgent: z.string().max(120),
  cookieHash: Sha256HexSchema.nullable(),
  secretHash: Sha256HexSchema.nullable(),
  previousSecretHashes: z.array(Sha256HexSchema).max(MAX_PREVIOUS_SECRET_HASHES),
  createdAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.nullable(),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
