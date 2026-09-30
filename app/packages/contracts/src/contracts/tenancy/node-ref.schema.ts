import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { ProjectIdSchema, UnitIdSchema } from "./ids.schema.ts";

const level = <const Level extends string>(value: Level) => z.literal(value).meta(none("Level of the node."));
const tenantId = TenantIdSchema.meta(none("Organization (tenant) of the node."));
const projectId = ProjectIdSchema.meta(none("Project of the node."));

const PlatformNodeSchema = z.strictObject({ level: level("platform") });
const OrganizationNodeSchema = z.strictObject({ level: level("organization"), tenantId });
const ProjectNodeSchema = z.strictObject({ level: level("project"), tenantId, projectId });
const UnitNodeSchema = z.strictObject({
  level: level("unit"),
  tenantId,
  projectId,
  unitId: UnitIdSchema.meta(none("Unit of the node.")),
});

/** A node of the access tree (SP1 spec §5.2): where a permission is checked or granted. */
export const NodeRefSchema = z.discriminatedUnion("level", [PlatformNodeSchema, OrganizationNodeSchema, ProjectNodeSchema, UnitNodeSchema]);
export type NodeRef = z.infer<typeof NodeRefSchema>;

const tenantNodeOptions = () => [OrganizationNodeSchema, ProjectNodeSchema, UnitNodeSchema] as const;

/** A node inside a tenant: where grants, invitations, devices and API keys live. */
export const TenantNodeRefSchema = z.discriminatedUnion("level", [...tenantNodeOptions()]);
export type TenantNodeRef = z.infer<typeof TenantNodeRefSchema>;

/**
 * A `TenantNodeRef` field for another contract. It is a fresh schema on purpose:
 * `.meta()` on the registered one would inherit its catalog meta (Zod registries
 * merge the parent's meta into a clone).
 * @example node: tenantNodeRefField("Node the grant applies to.")
 */
export const tenantNodeRefField = (description: string) =>
  z.discriminatedUnion("level", [...tenantNodeOptions()]).meta(none(description));

const TENANT_NODE_EXAMPLES = [
  { level: "organization", tenantId: EXAMPLE_IDS.organization },
  { level: "project", tenantId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project },
  { level: "unit", tenantId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project, unitId: EXAMPLE_IDS.unit },
];

export const NodeRefContract = defineContract(NodeRefSchema, {
  id: "tenancy.NodeRef",
  kind: "view",
  description: "Reference to a node of the access tree: platform, organization, project or unit.",
  examples: [{ level: "platform" }, ...TENANT_NODE_EXAMPLES],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
});

export const TenantNodeRefContract = defineContract(TenantNodeRefSchema, {
  id: "tenancy.TenantNodeRef",
  kind: "view",
  description: "Reference to a node inside one organization: the organization, a project or a unit.",
  examples: TENANT_NODE_EXAMPLES,
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});
