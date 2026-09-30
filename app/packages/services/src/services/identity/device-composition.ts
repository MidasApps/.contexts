// Composition root of the device vertical (SP1 Task 15, decision 0008).
import type { Firestore } from "firebase-admin/firestore";
import { createFirestoreUnitOfWork } from "../shared/firestore/unit-of-work.ts";
import { createFirestoreDeviceActivationRepository, createFirestoreDeviceRepository } from "./adapters/driven/firestore-device-repositories.ts";
import type { DeviceDeps } from "./application/device-deps.ts";
import { makeCreateDeviceActivation, type CreateDeviceActivation } from "./application/use-cases/create-device-activation.ts";
import { makeListDevices, type ListDevices } from "./application/use-cases/list-devices.ts";
import { makeRedeemDeviceActivation, type RedeemDeviceActivation } from "./application/use-cases/redeem-device-activation.ts";
import { makeRevokeDevice, type RevokeDevice } from "./application/use-cases/revoke-device.ts";

export type DeviceServices = {
  readonly createDeviceActivation: CreateDeviceActivation;
  readonly redeemDeviceActivation: RedeemDeviceActivation;
  readonly listDevices: ListDevices;
  readonly revokeDevice: RevokeDevice;
};

/** Binds the device use cases to their adapters. */
export const createDeviceServices = (deps: DeviceDeps): DeviceServices => ({
  createDeviceActivation: makeCreateDeviceActivation(deps),
  redeemDeviceActivation: makeRedeemDeviceActivation(deps),
  listDevices: makeListDevices(deps),
  revokeDevice: makeRevokeDevice(deps),
});

/** The device vertical over Firestore (`createCoreServer`). */
export const createFirestoreDeviceServices = (deps: Omit<DeviceDeps, "devices" | "activations" | "unitOfWork"> & { firestore: Firestore }): DeviceServices => {
  const { firestore, ...rest } = deps;
  return createDeviceServices({
    ...rest,
    devices: createFirestoreDeviceRepository({ firestore }),
    activations: createFirestoreDeviceActivationRepository({ firestore }),
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
  });
};
