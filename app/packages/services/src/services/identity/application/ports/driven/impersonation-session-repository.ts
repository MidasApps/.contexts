import type { ImpersonationSession, ImpersonationSessionId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/**
 * `impersonation-sessions/{id}` (SP1 spec §4, §6.6): the session doc `authorize()` checks on
 * every impersonated request (open, unexpired, same staff, target and tenant).
 */
export type ImpersonationSessionRepository = {
  readonly newId: () => ImpersonationSessionId;
  readonly create: (tx: Transaction, args: { session: ImpersonationSession; actorId: string }) => void;
  readonly get: (tx: Transaction | undefined, id: ImpersonationSessionId) => Promise<ImpersonationSession | null>;
  readonly end: (tx: Transaction, args: { id: ImpersonationSessionId; endedAt: string; actorId: string }) => void;
};
