import { IsoDateTimeSchema } from "@core/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { OrganizationDirectory } from "../../application/ports/driven/organization-directory.ts";

// Only the fields invitations need; tenancy owns the collection.
const converter = createContractConverter({
  // A doc without readable defaults still has a name; its link falls back to the source locale.
  schema: z.object({
    name: z.string().min(1),
    defaults: z
      .object({ locale: z.string().min(1) })
      .optional()
      .catch(undefined),
    deletedAt: IsoDateTimeSchema.nullable(),
  }),
});

/** Firestore `OrganizationDirectory` over `organizations/{id}`. */
export const createFirestoreOrganizationDirectory = (deps: { firestore: Firestore }): OrganizationDirectory => {
  const readLive = async (tenantId: string) => {
    const fields = (
      await deps.firestore.collection(CORE_COLLECTIONS.organizations).withConverter(converter).doc(tenantId).get()
    ).data();
    return fields === undefined || fields.deletedAt !== null ? null : fields;
  };
  return {
    getName: async (tenantId) => (await readLive(tenantId))?.name ?? null,
    getDefaultLocale: async (tenantId) => (await readLive(tenantId))?.defaults?.locale ?? null,
  };
};
