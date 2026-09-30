import { z } from "zod";
import { defineContract } from "../../contract.ts";
import { EXAMPLE_IDS } from "../../example-values.ts";
import { none, personal } from "../../field-docs.ts";

/** Props of `approval-pending` (SP4 spec §5.2): a four-eyes request waiting in the inbox (SP5). */
export const ApprovalPendingPropsSchema = z.strictObject({
  approvalId: z.string().min(1).max(128).meta(none("SP1 approval request id.")),
  summary: z.string().min(1).max(500).meta(personal("What waits for approval.")),
});
export type ApprovalPendingProps = z.infer<typeof ApprovalPendingPropsSchema>;

export const ApprovalPendingPropsContract = defineContract(ApprovalPendingPropsSchema, {
  id: "chat.ApprovalPendingProps",
  kind: "ui-component",
  description: "A card for an agent action waiting for another member's approval.",
  examples: [{ approvalId: EXAMPLE_IDS.approvalRequest, summary: "Create project Launch" }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
