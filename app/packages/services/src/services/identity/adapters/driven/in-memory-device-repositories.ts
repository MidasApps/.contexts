import { type Device, DeviceActivationIdSchema, DeviceIdSchema } from "@core/contracts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { DeviceActivationRepository } from "../../application/ports/driven/device-activation-repository.ts";
import type { DeviceRepository } from "../../application/ports/driven/device-repository.ts";
import type { DeviceActivationRecord } from "../../domain/device-activation-record.schema.ts";

export type InMemoryDeviceRepository = DeviceRepository & { readonly rowOf: (id: string) => Device | undefined };

const newestFirst = (left: Device, right: Device): number =>
  left.createdAt === right.createdAt ? (left.id < right.id ? 1 : -1) : left.createdAt < right.createdAt ? 1 : -1;

const isAfter = (device: Device, after: readonly [string, string]): boolean =>
  device.createdAt === after[0] ? device.id < after[1] : device.createdAt < after[0];

/** In-memory `DeviceRepository` for unit tests; transactions are ignored. */
export const createInMemoryDeviceRepository = (): InMemoryDeviceRepository => {
  const rows = new Map<string, Device>();
  let sequence = 0;
  return {
    newId: () => DeviceIdSchema.parse(`device-${String((sequence += 1)).padStart(3, "0")}`),
    create: (_tx, { device }) => void rows.set(device.id, device),
    get: (_tx, id) => Promise.resolve(rows.get(id) ?? null),
    list: ({ tenantId, page }) => {
      const matching = [...rows.values()]
        .filter((device) => device.tenantId === tenantId)
        .sort(newestFirst)
        .filter((device) => page.after === undefined || isAfter(device, page.after));
      return Promise.resolve(
        pageFromOverfetch({
          fetched: matching.slice(0, page.limit + 1),
          limit: page.limit,
          positionOf: (d) => [d.createdAt, d.id],
        }),
      );
    },
    revoke: (_tx, { id, updatedAt }) => {
      const row = rows.get(id);
      if (row !== undefined) rows.set(id, { ...row, status: "revoked", updatedAt });
    },
    rowOf: (id) => rows.get(id),
  };
};

type ActivationRow = { activation: DeviceActivationRecord; codeHash: string };

export type InMemoryDeviceActivationRepository = DeviceActivationRepository & {
  readonly rowOf: (id: string) => ActivationRow | undefined;
};

/** In-memory `DeviceActivationRepository` for unit tests; transactions are ignored. */
export const createInMemoryDeviceActivationRepository = (): InMemoryDeviceActivationRepository => {
  const rows = new Map<string, ActivationRow>();
  let sequence = 0;
  return {
    newId: () => DeviceActivationIdSchema.parse(`activation-${String((sequence += 1)).padStart(3, "0")}`),
    create: (_tx, { activation, codeHash }) => void rows.set(activation.id, { activation, codeHash }),
    get: (_tx, id) => Promise.resolve(rows.get(id)?.activation ?? null),
    findByCodeHash: (codeHash) =>
      Promise.resolve([...rows.values()].find((row) => row.codeHash === codeHash)?.activation ?? null),
    markRedeemed: (_tx, { id, deviceId, updatedAt }) => {
      const row = rows.get(id);
      if (row !== undefined) row.activation = { ...row.activation, status: "redeemed", deviceId, updatedAt };
    },
    rowOf: (id) => rows.get(id),
  };
};
