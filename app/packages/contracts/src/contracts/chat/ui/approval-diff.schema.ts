import { z } from "zod";
import { defineContract } from "../../contract.ts";
import { none, personal } from "../../field-docs.ts";

/** Props of `approval-diff` (SP4 spec §5.2): the before/after table inside a confirmation. */
export const ApprovalDiffPropsSchema = z.strictObject({
  before: z.record(z.string(), z.unknown()).nullable().meta(personal("Current values; null for a create.")),
  after: z.record(z.string(), z.unknown()).meta(personal("Values after the change.")),
  fields: z.array(z.string().min(1).max(200)).max(100).meta(none("Changed fields, in display order.")),
});
export type ApprovalDiffProps = z.infer<typeof ApprovalDiffPropsSchema>;

export const ApprovalDiffPropsContract = defineContract(ApprovalDiffPropsSchema, {
  id: "chat.ApprovalDiffProps",
  kind: "ui-component",
  description: "What an approved tool call would change, shown before the member decides.",
  examples: [{ before: null, after: { name: "Launch" }, fields: ["name"] }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
