import type { DeviceActivationId, DeviceId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { DeviceActivationRecord } from "#/services/identity/domain/device-activation-record.schema.ts";

/** `device-activations` (SP1 spec §4, §6.4): the code is stored only as `codeHash`. */
export type DeviceActivationRepository = {
  readonly newId: () => DeviceActivationId;
  readonly create: (tx: Transaction, args: { activation: DeviceActivationRecord; codeHash: string }) => void;
  readonly get: (tx: Transaction, id: DeviceActivationId) => Promise<DeviceActivationRecord | null>;
  readonly findByCodeHash: (codeHash: string) => Promise<DeviceActivationRecord | null>;
  readonly markRedeemed: (
    tx: Transaction,
    args: { id: DeviceActivationId; deviceId: DeviceId; updatedAt: string },
  ) => void;
};
