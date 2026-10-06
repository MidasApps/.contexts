import type { PlatformRole, PlatformStaff, UserId } from "@core/contracts";
import { SYSTEM_ACTOR } from "#/services/audit/domain/audit-actor.ts";
import type { PlatformDeps } from "../platform-deps.ts";

export type GrantPlatformStaff = (command: {
  uid: UserId;
  role: PlatformRole;
  requestId: string;
}) => Promise<PlatformStaff>;

/**
 * Makes a user active platform staff with `role` (SP1 spec §3.4). Only operator tooling
 * calls it (`pnpm platform:grant-staff`, `pnpm seed:local`), never `/v1`: the actor is
 * `system` and `PLATFORM_STAFF_GRANTED` goes to the platform log in the same transaction.
 * Claims are synced afterwards (`platformRole`); staff access still needs MFA.
 */
export const makeGrantPlatformStaff =
  (deps: PlatformDeps): GrantPlatformStaff =>
  async ({ uid, role, requestId }) => {
    const staff = await deps.unitOfWork.run(async (tx) => {
      const existing = await deps.staff.get(tx, uid);
      const now = deps.clock.now().toISOString();
      const next: PlatformStaff = { uid, role, isActive: true, createdAt: existing?.createdAt ?? now, updatedAt: now };
      deps.staff.put(tx, { staff: next, actorId: SYSTEM_ACTOR });
      await deps.audit.record(
        {
          log: "platform",
          action: "PLATFORM_STAFF_GRANTED",
          actor: { type: "system", id: SYSTEM_ACTOR },
          target: { type: "user", id: uid },
          outcome: "success",
          requestId,
        },
        tx,
      );
      return next;
    });
    await deps.syncClaims(uid);
    return staff;
  };
