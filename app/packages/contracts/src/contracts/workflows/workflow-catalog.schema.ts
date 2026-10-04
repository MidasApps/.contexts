import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { WorkflowIdSchema } from "./human-approval-resume.schema.ts";

/**
 * A workflow an organization may start or schedule (SP5 spec §3.5, §3.6; decisions 0037, 0040).
 * Workflows are defined in code (the core and the installed modules); platform-only ones are not listed.
 */
export const WorkflowCatalogEntrySchema = z.strictObject({
  id: WorkflowIdSchema.meta(none("Workflow id.")),
  description: z.string().max(1000).meta(none("What the workflow does.")),
  startable: z.boolean().meta(none("POST /v1/workflows/{workflowId}/runs may start it.")),
  schedulable: z.boolean().meta(none("A tenant schedule may start it.")),
  inputSchema: z
    .record(z.string(), z.unknown())
    .nullable()
    .meta(
      none("JSON Schema of the workflow input, when the workflow declares one; the server validates the input again."),
    ),
});
export type WorkflowCatalogEntry = z.infer<typeof WorkflowCatalogEntrySchema>;

export const WorkflowCatalogEntryContract = defineContract(WorkflowCatalogEntrySchema, {
  id: "workflows.WorkflowCatalogEntry",
  kind: "view",
  description: "A workflow the organization may start or put on a schedule, with the JSON Schema of its input.",
  examples: [
    {
      id: "usage-report",
      description: "Aggregates the organization's model usage and checks its budget.",
      startable: false,
      schedulable: true,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.workflow-run.read",
});
