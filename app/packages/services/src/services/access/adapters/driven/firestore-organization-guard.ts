import { IsoDateTimeSchema } from "@core/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { OrganizationGuard } from "../../application/ports/driven/organization-guard.ts";

// Only the soft-delete field; tenancy owns the collection.
const converter = createContractConverter({ schema: z.object({ deletedAt: IsoDateTimeSchema.nullable() }) });

/** Firestore `OrganizationGuard`: reads `organizations/{id}` in the caller's transaction. */
export const createFirestoreOrganizationGuard = (deps: { firestore: Firestore }): OrganizationGuard => ({
  isLive: async (tx, tenantId) => {
    const fields = (await tx.get(deps.firestore.collection(CORE_COLLECTIONS.organizations).withConverter(converter).doc(tenantId))).data();
    return fields !== undefined && fields.deletedAt === null;
  },
});
