import type { PlatformStaff, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/**
 * `platform-staff/{uid}` (SP1 spec §3.4, §4): the source `authorize()` reads for platform
 * permissions. Written by `grantPlatformStaff` (the `platform:grant-staff` script and
 * `pnpm seed:local`) and by staff with `platform.staff.manage` (decision 0075), never by clients.
 */
export type PlatformStaffRepository = {
  readonly get: (tx: Transaction | undefined, uid: UserId) => Promise<PlatformStaff | null>;
  /** Creates or replaces the staff doc (`createdAt` is kept by the caller). */
  readonly put: (tx: Transaction, args: { staff: PlatformStaff; actorId: string }) => void;
  /** Every staff record, active and revoked (staff are few: no paging). */
  readonly list: () => Promise<readonly PlatformStaff[]>;
};
