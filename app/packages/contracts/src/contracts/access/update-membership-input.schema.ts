import { z } from "zod";
import { defineContract } from "../contract.ts";
import { roleRefsField } from "./role-ref.schema.ts";

export const UpdateMembershipInputSchema = z.strictObject({
  roles: roleRefsField("New roles of the grant; replaces the old ones (no escalation, last owner kept)."),
});
export type UpdateMembershipInput = z.infer<typeof UpdateMembershipInputSchema>;

export const UpdateMembershipInputContract = defineContract(UpdateMembershipInputSchema, {
  id: "access.UpdateMembershipInput",
  kind: "command",
  description: "Replaces the roles of a grant (core.member.update); removing the last owner answers 422 LAST_OWNER.",
  examples: [{ roles: [{ kind: "system", key: "member" }] }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.member.update",
});
