import type { DeviceId, UserPrincipal } from "@core/contracts";
import { requirePermission } from "../../../access/application/grant-checks.ts";
import type { RequestAccess } from "../../../access/composition.ts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { AccessNotFoundError } from "../../../access/domain/errors/access-not-found-error.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { DeviceDeps } from "../device-deps.ts";

export type RevokeDevice = (command: {
  actor: UserPrincipal;
  access: RequestAccess;
  deviceId: DeviceId;
  requestId: string;
}) => Promise<Result<void, AccessDeniedError | AccessNotFoundError>>;

/**
 * `DELETE /v1/devices/{deviceId}` (SP1 spec §6.4; `core.device.revoke` at the device's node):
 * one transaction marks the device revoked, soft-deletes its grants and revokes its
 * projection; then its refresh tokens are revoked and its Auth account disabled. Every
 * request of the device already re-checks `devices/{id}`, so it stops at once even if the
 * Auth calls fail (they are retried by revoking again: a revoked device answers 204).
 */
export const makeRevokeDevice =
  (deps: DeviceDeps): RevokeDevice =>
  async ({ actor, access, deviceId, requestId }) => {
    const device = await deps.devices.get(undefined, deviceId);
    if (device === null) return err(new AccessNotFoundError("device"));
    const allowed = await requirePermission({ access, actor, permission: "core.device.revoke", node: device.node });
    if (!allowed.ok) return allowed;
    const auditActor = auditActorOf(actor);
    if (device.status === "active") {
      await deps.unitOfWork.run(async (tx) => {
        const plan = await deps.access.prepareRevokeAllGrants(tx, {
          tenantId: device.tenantId,
          principal: { type: "device", id: deviceId },
          actorId: auditActor.id,
        });
        deps.devices.revoke(tx, { id: deviceId, updatedAt: deps.clock.now().toISOString(), actorId: auditActor.id });
        plan.commit();
        await deps.audit.record(
          {
            log: "tenant",
            tenantId: device.tenantId,
            action: "DEVICE_REVOKED",
            actor: auditActor,
            target: { type: "device", id: deviceId },
            node: device.node,
            outcome: "success",
            requestId,
          },
          tx,
        );
      });
    }
    await deps.authUsers.revokeRefreshTokens(deviceId);
    await deps.authUsers.disable(deviceId);
    return ok(undefined);
  };
