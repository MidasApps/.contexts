import {
  ApiKeyStatusSchema,
  DeviceStatusSchema,
  IsoDateTimeSchema,
  OrganizationIdSchema,
  PlatformRoleSchema,
  TenantNodeRefSchema,
  UserIdSchema,
  UserStatusSchema,
} from "@core/contracts";
import type { Firestore, FirestoreDataConverter } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { PrincipalStatusReader } from "../../application/ports/driven/principal-status-reader.ts";

// Each reader parses only the status fields `authorize()` needs from the source docs,
// which the identity context writes with its entity contracts (SP1 Tasks 12-16).
const converters = {
  user: createContractConverter({ schema: z.object({ status: UserStatusSchema }) }),
  device: createContractConverter({ schema: z.object({ tenantId: OrganizationIdSchema, status: DeviceStatusSchema }) }),
  apiKey: createContractConverter({
    schema: z.object({
      tenantId: OrganizationIdSchema,
      ownerUid: UserIdSchema,
      status: ApiKeyStatusSchema,
      expiresAt: IsoDateTimeSchema,
      scopes: z.array(z.string()),
      node: TenantNodeRefSchema,
    }),
  }),
  staff: createContractConverter({ schema: z.object({ role: PlatformRoleSchema, isActive: z.boolean() }) }),
  impersonation: createContractConverter({
    schema: z.object({
      staffUid: UserIdSchema,
      targetUid: UserIdSchema,
      tenantId: OrganizationIdSchema,
      expiresAt: IsoDateTimeSchema,
      endedAt: IsoDateTimeSchema.nullable(),
    }),
  }),
};

/** Firestore `PrincipalStatusReader`: one document read per getter; a missing doc is null. */
export const createFirestorePrincipalStatusReader = (deps: { firestore: Firestore }): PrincipalStatusReader => {
  const read = async <T>(collection: string, id: string, converter: FirestoreDataConverter<T>): Promise<T | null> =>
    (await deps.firestore.collection(collection).withConverter(converter).doc(id).get()).data() ?? null;
  return {
    getUser: (uid) => read(CORE_COLLECTIONS.users, uid, converters.user),
    getDevice: (deviceId) => read(CORE_COLLECTIONS.devices, deviceId, converters.device),
    getApiKey: (apiKeyId) => read(CORE_COLLECTIONS.apiKeys, apiKeyId, converters.apiKey),
    getPlatformStaff: (uid) => read(CORE_COLLECTIONS.platformStaff, uid, converters.staff),
    getImpersonationSession: (sessionId) => read(CORE_COLLECTIONS.impersonationSessions, sessionId, converters.impersonation),
  };
};
