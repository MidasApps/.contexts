import {
  IsoDateTimeSchema,
  OrganizationIdSchema,
  OrganizationStatusSchema,
  ProjectIdSchema,
  type TenantNodeRef,
  UnitIdSchema,
} from "@core/contracts";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { NodeChainReader } from "../../application/ports/driven/node-chain-reader.ts";
import type { ChainNode, ChainUnit, NodeChain } from "../../domain/node-chain.ts";

// Only the fields `authorize()` checks; soft-deleted nodes are read too (they deny).
const alive = { tenantId: OrganizationIdSchema, deletedAt: IsoDateTimeSchema.nullable() };
const organizationConverter = createContractConverter({
  schema: z.object({ ...alive, status: OrganizationStatusSchema }),
});
const projectConverter = createContractConverter({ schema: z.object(alive) });
const UnitChainFieldsSchema = z.object({ ...alive, projectId: ProjectIdSchema, ancestorIds: z.array(UnitIdSchema) });
const unitConverter = createContractConverter({ schema: UnitChainFieldsSchema });

const chainNode = (
  snapshot: DocumentSnapshot,
  fields: { tenantId: ChainNode["tenantId"]; deletedAt: string | null },
): ChainNode => ({
  id: snapshot.id,
  tenantId: fields.tenantId,
  isDeleted: fields.deletedAt !== null,
});

/**
 * Firestore `NodeChainReader` (SP1 spec §5.2 step 2): the organization, the project and,
 * for a unit, its ancestors (`ancestorIds`, root first) and itself, read in two rounds.
 * Tenancy owns these collections; this adapter only reads the fields access needs.
 */
export const createFirestoreNodeChainReader = (deps: { firestore: Firestore }): NodeChainReader => {
  const collection = (name: string) => deps.firestore.collection(name);
  const loadUnits = async (node: Extract<TenantNodeRef, { level: "unit" }>): Promise<ChainUnit[] | null> => {
    const leaf = await collection(CORE_COLLECTIONS.units).withConverter(unitConverter).doc(node.unitId).get();
    const leafFields = leaf.data();
    if (leafFields === undefined) return null;
    const refs = leafFields.ancestorIds.map((id) =>
      collection(CORE_COLLECTIONS.units).withConverter(unitConverter).doc(id),
    );
    // At most 6 ancestors, read in parallel (typed; `getAll` drops the converter type).
    const ancestors = await Promise.all(refs.map((ref) => ref.get()));
    const units: ChainUnit[] = [];
    for (const snapshot of [...ancestors, leaf]) {
      const fields = snapshot.data();
      if (fields === undefined) return null;
      units.push({ ...chainNode(snapshot, fields), projectId: fields.projectId });
    }
    return units;
  };
  return {
    loadChain: async (node) => {
      const organization = await collection(CORE_COLLECTIONS.organizations)
        .withConverter(organizationConverter)
        .doc(node.tenantId)
        .get();
      const organizationFields = organization.data();
      if (organizationFields === undefined) return null;
      const chain: NodeChain = {
        organization: { ...chainNode(organization, organizationFields), status: organizationFields.status },
        units: [],
      };
      if (node.level === "organization") return chain;
      const [project, units] = await Promise.all([
        collection(CORE_COLLECTIONS.projects).withConverter(projectConverter).doc(node.projectId).get(),
        node.level === "unit" ? loadUnits(node) : Promise.resolve([]),
      ]);
      const projectFields = project.data();
      if (projectFields === undefined || units === null) return null;
      return { ...chain, project: chainNode(project, projectFields), units };
    },
  };
};
