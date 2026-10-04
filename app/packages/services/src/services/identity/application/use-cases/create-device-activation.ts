import {
  type CreateDeviceActivationInput,
  type CreateDeviceActivationResponse,
  DEVICE_ACTIVATION_TTL_MINUTES,
  type TenantId,
  type UserPrincipal,
} from "@core/contracts";
import type { GrantCheckError } from "#/services/access/application/grant-checks.ts";
import type { RequestAccess } from "#/services/access/composition.ts";
import { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { generateActivationCode, hashActivationCode } from "../../domain/activation-code.ts";
import type { DeviceActivationRecord } from "../../domain/device-activation-record.schema.ts";
import type { DeviceDeps } from "../device-deps.ts";

export type CreateDeviceActivation = (command: {
  actor: UserPrincipal;
  access: RequestAccess;
  tenantId: TenantId;
  input: CreateDeviceActivationInput;
  requestId: string;
}) => Promise<Result<CreateDeviceActivationResponse, GrantCheckError>>;

const MINUTE_MS = 60_000;

/**
 * `POST /v1/organizations/{organizationId}/device-activations` (SP1 spec §6.4):
 * `core.device.create` at the node and roles within the admin's permissions. Returns a
 * one-time 8-char code (40 bits, 10-minute TTL); only its sha256 is stored.
 */
export const makeCreateDeviceActivation =
  (deps: DeviceDeps): CreateDeviceActivation =>
  async ({ actor, access, tenantId, input, requestId }) => {
    if (input.node.tenantId !== tenantId) return err(new AccessDeniedError("NODE_NOT_FOUND"));
    const grantable = await deps.access.checkGrantable({
      access,
      actor,
      permission: "core.device.create",
      node: input.node,
      roles: input.roles,
    });
    if (!grantable.ok) return grantable;
    const now = deps.clock.now();
    const code = generateActivationCode(deps.randomBytes);
    const activation: DeviceActivationRecord = {
      id: deps.activations.newId(),
      tenantId,
      label: input.label,
      node: input.node,
      roles: [...input.roles],
      status: "pending",
      expiresAt: new Date(now.getTime() + DEVICE_ACTIVATION_TTL_MINUTES * MINUTE_MS).toISOString(),
      createdBy: actor.uid,
      deviceId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const auditActor = auditActorOf(actor);
    await deps.unitOfWork.run(async (tx) => {
      deps.activations.create(tx, { activation, codeHash: hashActivationCode(code) });
      await deps.audit.record(
        {
          log: "tenant",
          tenantId,
          action: "DEVICE_ACTIVATION_CREATED",
          actor: auditActor,
          target: { type: "device-activation", id: activation.id },
          node: input.node,
          outcome: "success",
          requestId,
        },
        tx,
      );
    });
    return ok({ id: activation.id, code, expiresAt: activation.expiresAt });
  };
