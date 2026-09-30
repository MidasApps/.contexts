import type { Device, DeviceId, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/** `devices` (SP1 spec §4, §6.4); the document id is also the device's Auth uid. */
export type DeviceRepository = {
  readonly newId: () => DeviceId;
  readonly create: (tx: Transaction, args: { device: Device; actorId: string }) => void;
  readonly get: (tx: Transaction | undefined, id: DeviceId) => Promise<Device | null>;
  /** Newest first (`createdAt desc`, id desc). */
  readonly list: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<Device>>;
  readonly revoke: (tx: Transaction, args: { id: DeviceId; updatedAt: string; actorId: string }) => void;
};
