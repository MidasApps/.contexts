import type { PlatformStaff, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/**
 * `platform-staff/{uid}` (SP1 spec §3.4, §4): the source `authorize()` reads for platform
 * permissions. Written only by `grantPlatformStaff` (the `platform:grant-staff` script and
 * `pnpm seed:local`), never by clients.
 */
export type PlatformStaffRepository = {
  readonly get: (tx: Transaction | undefined, uid: UserId) => Promise<PlatformStaff | null>;
  /** Creates or replaces the staff doc (`createdAt` is kept by the caller). */
  readonly put: (tx: Transaction, args: { staff: PlatformStaff; actorId: string }) => void;
};
