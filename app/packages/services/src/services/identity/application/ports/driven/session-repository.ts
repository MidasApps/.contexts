import type { ImpersonationSessionId, SessionId, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";
import type { SessionRecord } from "../../../domain/session-record.schema.ts";

/** Rotation of a desktop secret (sliding expiry). */
export type SessionRotation = {
  readonly id: SessionId;
  readonly secretHash: string;
  readonly previousSecretHashes: readonly string[];
  readonly expiresAt: string;
  readonly lastSeenAt: string;
};

/** `sessions` (SP1 spec §4, decision 0007): web cookie and desktop session records. */
export type SessionRepository = {
  readonly newId: () => SessionId;
  readonly create: (record: SessionRecord) => Promise<void>;
  readonly get: (tx: Transaction | undefined, id: SessionId) => Promise<SessionRecord | null>;
  readonly findByCookieHash: (cookieHash: string) => Promise<SessionRecord | null>;
  readonly findBySecretHash: (secretHash: string) => Promise<SessionRecord | null>;
  /** The session a rotated (dead) secret belonged to. */
  readonly findByPreviousSecretHash: (secretHash: string) => Promise<SessionRecord | null>;
  /** Not revoked, newest first (`createdAt desc`, id desc); expired ones are filtered by the caller. */
  readonly listOpen: (args: { uid: UserId; page: PageRequest }) => Promise<Page<SessionRecord>>;
  readonly touch: (args: { id: SessionId; lastSeenAt: string }) => Promise<void>;
  /** Marks (or clears, with `null`) the impersonation session a web session is in (decision 0047). */
  readonly setImpersonation: (args: {
    id: SessionId;
    impersonationSessionId: ImpersonationSessionId | null;
  }) => Promise<void>;
  readonly rotate: (tx: Transaction, rotation: SessionRotation) => void;
  readonly revoke: (tx: Transaction | undefined, args: { id: SessionId; revokedAt: string }) => Promise<void>;
  /** Marks every open session of the user revoked. @returns how many. */
  readonly revokeAllOf: (args: { uid: UserId; revokedAt: string }) => Promise<number>;
};
