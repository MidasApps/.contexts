import { type Device, type DeviceId, type RedeemDeviceActivationResponse, type UserPrincipal } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { isAtOrBefore } from "#/services/shared/clock/clock.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { hashActivationCode, normalizeActivationCode } from "../../domain/activation-code.ts";
import type { DeviceActivationRecord } from "../../domain/device-activation-record.schema.ts";
import { SessionInvalidError } from "../../domain/errors/session-errors.ts";
import type { DeviceDeps } from "../device-deps.ts";

export type RedeemDeviceActivation = (command: {
  code: string;
  requestId: string;
}) => Promise<Result<RedeemDeviceActivationResponse, SessionInvalidError>>;

const refused = (reason: string) => err(new SessionInvalidError(reason));

// Like an invitation, an activation must not outlive its creator's right to grant it
// (decision 0030 A2): checked on every transaction attempt, on a fresh request scope, so
// a retry re-reads the grants. Any denial refuses; a reader error aborts (fail-closed).
const creatorCanStillGrant = async (deps: DeviceDeps, activation: DeviceActivationRecord): Promise<boolean> => {
  const creator: UserPrincipal = { type: "user", uid: activation.createdBy, mfa: false };
  const check = await deps.access.checkGrantable({
    access: deps.accessCore.forRequest(),
    actor: creator,
    permission: "core.device.create",
    node: activation.node,
    roles: activation.roles,
  });
  return check.ok;
};

type Activation = Result<DeviceId, SessionInvalidError>;

// One transaction: re-read the activation (single use under contention), re-check the
// creator's rights, then the grant's reads, then every write — device, grant + projection,
// activation redeemed, audit.
const activate = (deps: DeviceDeps, pending: DeviceActivationRecord, requestId: string): Promise<Activation> =>
  deps.unitOfWork.run(async (tx: Transaction): Promise<Activation> => {
    const activation = await deps.activations.get(tx, pending.id);
    const now = deps.clock.now();
    if (activation?.status !== "pending" || isAtOrBefore(activation.expiresAt, now)) return refused("CODE_NOT_USABLE");
    if (!(await creatorCanStillGrant(deps, activation))) return refused("CREATOR_CANNOT_GRANT");
    const deviceId = deps.devices.newId();
    const actor = { type: "device" as const, id: deviceId };
    const plan = await deps.access.prepareGrant(tx, {
      tenantId: activation.tenantId,
      principal: { type: "device", id: deviceId },
      node: activation.node,
      roles: activation.roles,
      grantedBy: activation.createdBy,
      actor,
      requestId,
    });
    if (!plan.ok) return refused("CODE_NOT_USABLE");
    const device: Device = {
      id: deviceId,
      tenantId: activation.tenantId,
      label: activation.label,
      node: activation.node,
      status: "active",
      lastSeenAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    deps.devices.create(tx, { device, actorId: activation.createdBy });
    deps.activations.markRedeemed(tx, { id: activation.id, deviceId, updatedAt: now.toISOString() });
    await plan.data.commit();
    await deps.audit.record(
      {
        log: "tenant",
        tenantId: activation.tenantId,
        action: "DEVICE_ACTIVATED",
        actor,
        target: { type: "device", id: deviceId },
        node: activation.node,
        outcome: "success",
        requestId,
      },
      tx,
    );
    return ok(deviceId);
  });

/**
 * `POST /v1/device-activations/redeem` (SP1 spec §6.4; no auth, 5 failures / 15 min per IP in
 * the pipeline). A pending, unexpired code whose creator may still grant its roles at its
 * node creates the device, its `device` grant and projection, an Auth account without
 * credentials, and a custom token `{ principalType: "device", tenantId }`. Every refusal is
 * the same 401; the reason is only logged.
 */
export const makeRedeemDeviceActivation =
  (deps: DeviceDeps): RedeemDeviceActivation =>
  async ({ code, requestId }) => {
    const normalized = normalizeActivationCode(code);
    if (normalized === null) return refused("CODE_MALFORMED");
    const pending = await deps.activations.findByCodeHash(hashActivationCode(normalized));
    if (pending === null) return refused("CODE_UNKNOWN");
    const activated = await activate(deps, pending, requestId);
    if (!activated.ok) return activated;
    const deviceId = activated.data;
    await deps.authUsers.createAccount(deviceId, { displayName: pending.label });
    const customToken = await deps.customTokens.createCustomToken(deviceId, {
      principalType: "device",
      tenantId: pending.tenantId,
    });
    return ok({ deviceId, tenantId: pending.tenantId, customToken });
  };
