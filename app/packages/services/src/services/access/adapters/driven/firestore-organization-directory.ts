import { IsoDateTimeSchema } from "@core/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { OrganizationDirectory } from "../../application/ports/driven/organization-directory.ts";

// Only the fields the preview needs; tenancy owns the collection.
const converter = createContractConverter({ schema: z.object({ name: z.string().min(1), deletedAt: IsoDateTimeSchema.nullable() }) });

/** Firestore `OrganizationDirectory` over `organizations/{id}`. */
export const createFirestoreOrganizationDirectory = (deps: { firestore: Firestore }): OrganizationDirectory => ({
  getName: async (tenantId) => {
    const fields = (await deps.firestore.collection(CORE_COLLECTIONS.organizations).withConverter(converter).doc(tenantId).get()).data();
    return fields === undefined || fields.deletedAt !== null ? null : fields.name;
  },
});
