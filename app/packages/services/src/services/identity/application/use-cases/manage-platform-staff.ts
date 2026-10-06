import type { PlatformRole, PlatformStaff, UserId, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { PlatformDeps } from "../platform-deps.ts";

/** Why a staff change was refused (decision 0075). */
export type StaffChangeError = { readonly code: "NOT_FOUND" } | { readonly code: "STAFF_SELF_CHANGE" };

type StaffCommand = { readonly actor: UserPrincipal; readonly userId: UserId; readonly requestId: string };

export type ListPlatformStaff = () => Promise<readonly PlatformStaff[]>;
export type SetPlatformStaffRole = (
  command: StaffCommand & { readonly role: PlatformRole },
) => Promise<Result<PlatformStaff, StaffChangeError>>;
export type RevokePlatformStaff = (command: StaffCommand) => Promise<Result<void, StaffChangeError>>;

/** `GET /v1/admin/staff`: every staff record, active and revoked (a short list). */
export const makeListPlatformStaff =
  (deps: Pick<PlatformDeps, "staff">): ListPlatformStaff =>
  () =>
    deps.staff.list();

/**
 * `PUT /v1/admin/staff/{userId}` (platform.staff.manage, checked by the route): makes an existing
 * user active staff with `role`, or changes the role. Never the caller's own record, so the
 * platform always keeps the admin doing the change. Audited `PLATFORM_STAFF_GRANTED` with the
 * calling staff as actor; claims are synced afterwards (staff access still needs MFA).
 */
export const makeSetPlatformStaffRole =
  (deps: PlatformDeps): SetPlatformStaffRole =>
  async ({ actor, userId, role, requestId }) => {
    if (userId === actor.uid) return err({ code: "STAFF_SELF_CHANGE" });
    if (!(await deps.users.exists(userId))) return err({ code: "NOT_FOUND" });
    const staff = await deps.unitOfWork.run(async (tx) => {
      const existing = await deps.staff.get(tx, userId);
      const now = deps.clock.now().toISOString();
      const next: PlatformStaff = {
        uid: userId,
        role,
        isActive: true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      deps.staff.put(tx, { staff: next, actorId: actor.uid });
      await deps.audit.record(
        {
          log: "platform",
          action: "PLATFORM_STAFF_GRANTED",
          actor: { type: "user", id: actor.uid },
          target: { type: "user", id: userId },
          outcome: "success",
          requestId,
          ...(existing === null ? {} : { changes: ["role", "isActive"] }),
        },
        tx,
      );
      return next;
    });
    await deps.syncClaims(userId);
    return ok(staff);
  };

/**
 * `DELETE /v1/admin/staff/{userId}`: marks the record inactive (authorization reads it, so the
 * platform permissions go at once), ends the member's open support sessions and syncs claims.
 * Never the caller's own record. Audited `PLATFORM_STAFF_REVOKED`.
 */
export const makeRevokePlatformStaff =
  (deps: PlatformDeps & { readonly endSessionsOf: (command: StaffCommand) => Promise<void> }): RevokePlatformStaff =>
  async (command) => {
    const { actor, userId, requestId } = command;
    if (userId === actor.uid) return err({ code: "STAFF_SELF_CHANGE" });
    const revoked = await deps.unitOfWork.run(async (tx) => {
      const existing = await deps.staff.get(tx, userId);
      if (existing === null || !existing.isActive) return false;
      deps.staff.put(tx, {
        staff: { ...existing, isActive: false, updatedAt: deps.clock.now().toISOString() },
        actorId: actor.uid,
      });
      await deps.audit.record(
        {
          log: "platform",
          action: "PLATFORM_STAFF_REVOKED",
          actor: { type: "user", id: actor.uid },
          target: { type: "user", id: userId },
          outcome: "success",
          requestId,
          changes: ["isActive"],
        },
        tx,
      );
      return true;
    });
    if (!revoked) return err({ code: "NOT_FOUND" });
    await deps.endSessionsOf(command);
    await deps.syncClaims(userId);
    return ok(undefined);
  };
