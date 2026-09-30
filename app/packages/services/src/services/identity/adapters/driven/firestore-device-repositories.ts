import { DeviceActivationIdSchema, DeviceIdSchema, DeviceSchema, type Device } from "@core/contracts";
import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { DeviceActivationRepository } from "../../application/ports/driven/device-activation-repository.ts";
import type { DeviceRepository } from "../../application/ports/driven/device-repository.ts";
import { DeviceActivationRecordSchema } from "../../domain/device-activation-record.schema.ts";

const deviceConverter = createContractConverter({ schema: DeviceSchema });
const activationContract = { schema: DeviceActivationRecordSchema };
const activationConverter = createContractConverter(activationContract);

/** Firestore `DeviceRepository` over `devices` (read by `authorize()` through the status reader). */
export const createFirestoreDeviceRepository = (deps: { firestore: Firestore }): DeviceRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.devices);
  const typed = () => raw().withConverter(deviceConverter);
  return {
    newId: () => DeviceIdSchema.parse(raw().doc().id),
    create: (tx, { device, actorId }) =>
      void tx.create(raw().doc(device.id), { ...deviceConverter.toFirestore(device), createdBy: actorId, updatedBy: actorId, schemaVersion: CORE_SCHEMA_VERSION }),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;
    },
    list: async ({ tenantId, page }) => {
      let query = typed().where("tenantId", "==", tenantId).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (page.after !== undefined) query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (device: Device) => [device.createdAt, device.id] });
    },
    revoke: (tx, { id, updatedAt, actorId }) =>
      void tx.update(raw().doc(id), toFirestoreUpdate({ schema: DeviceSchema }, { status: "revoked", updatedAt, updatedBy: actorId })),
  };
};

/**
 * Firestore `DeviceActivationRepository` over `device-activations` (server-only). Reads parse
 * with the record schema, which has no `codeHash`; `expiresAt` carries the TTL policy.
 */
export const createFirestoreDeviceActivationRepository = (deps: { firestore: Firestore }): DeviceActivationRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.deviceActivations);
  const typed = () => raw().withConverter(activationConverter);
  return {
    newId: () => DeviceActivationIdSchema.parse(raw().doc().id),
    create: (tx, { activation, codeHash }) =>
      void tx.create(raw().doc(activation.id), {
        ...activationConverter.toFirestore(activation),
        codeHash,
        updatedBy: activation.createdBy,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    get: async (tx, id) => (await tx.get(typed().doc(id))).data() ?? null,
    findByCodeHash: async (codeHash) => (await typed().where("codeHash", "==", codeHash).limit(1).get()).docs[0]?.data() ?? null,
    markRedeemed: (tx, { id, deviceId, updatedAt }) =>
      void tx.update(raw().doc(id), toFirestoreUpdate(activationContract, { status: "redeemed", deviceId, updatedAt, updatedBy: deviceId })),
  };
};
