import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { firestoreIdSchema } from "../primitives/ids.schema.ts";
import { SystemRoleKeySchema } from "./system-roles.ts";

export const RoleIdSchema = firestoreIdSchema<"RoleId">();
export type RoleId = z.infer<typeof RoleIdSchema>;

/** A grant holds 1-10 roles (SP1 spec §4, memberships). */
export const MAX_ROLES_PER_GRANT = 10;

const roleRefOptions = () =>
  [
    z.strictObject({
      kind: z.literal("system").meta(none("A system role of every organization.")),
      key: SystemRoleKeySchema.meta(none("System role key.")),
    }),
    z.strictObject({
      kind: z.literal("custom").meta(none("A custom role of this organization.")),
      roleId: RoleIdSchema.meta(none("Id of the custom role.")),
    }),
  ] as const;

/** Reference to a system role or a custom role (SP1 spec §4). */
export const RoleRefSchema = z.discriminatedUnion("kind", [...roleRefOptions()]);
export type RoleRef = z.infer<typeof RoleRefSchema>;

/** Stable key of a role ref, for de-duplication and comparisons. */
export const roleRefKey = (ref: RoleRef): string => (ref.kind === "system" ? `system:${ref.key}` : `custom:${ref.roleId}`);

const hasDistinctRoles = (refs: readonly RoleRef[]): boolean => new Set(refs.map(roleRefKey)).size === refs.length;

const roleRefList = () =>
  z
    .array(z.discriminatedUnion("kind", [...roleRefOptions()]))
    .min(1)
    .max(MAX_ROLES_PER_GRANT)
    .refine(hasDistinctRoles, { error: "Roles must be distinct." });

/** 1-10 distinct role refs. */
export const RoleRefListSchema = roleRefList();

/**
 * A role list field for another contract (fresh schema, so it carries no catalog meta).
 * @example roles: roleRefsField("Roles granted at the node.")
 */
export const roleRefsField = (description: string) => roleRefList().meta(none(description));

export const RoleRefContract = defineContract(RoleRefSchema, {
  id: "access.RoleRef",
  kind: "view",
  description: "Reference to a system role (owner, admin, member, viewer, device) or a custom role.",
  examples: [
    { kind: "system", key: "admin" },
    { kind: "custom", roleId: EXAMPLE_IDS.role },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});
