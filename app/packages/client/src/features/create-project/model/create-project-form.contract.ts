import { defineContract, NodeNameSchema, ProjectDescriptionSchema } from "@core/contracts";
import { z } from "zod";

const LABELS = "shell.projects.create";

/**
 * The create-project form: the fields of `CreateProjectInputSchema` people fill in (regional
 * overrides stay in project settings). The API validates the full input again.
 */
export const CreateProjectFormSchema = z.object({
  name: NodeNameSchema.meta({
    description: "Name of the new project.",
    pii: "none",
    ui: { labelKey: `${LABELS}.name`, order: 1 },
  }),
  description: ProjectDescriptionSchema.optional().meta({
    description: "What the project is for.",
    pii: "personal",
    ui: { widget: "textarea", labelKey: `${LABELS}.descriptionField`, order: 2 },
  }),
});
export type CreateProjectForm = z.infer<typeof CreateProjectFormSchema>;

export const CreateProjectFormContract = defineContract(CreateProjectFormSchema, {
  id: "client.CreateProjectForm",
  kind: "command",
  description: "Client form behind POST /v1/organizations/{organizationId}/projects.",
  examples: [{ name: "Launch", description: "Rollout of the new catalog." }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
