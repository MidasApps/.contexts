import {
  defineContract,
  NodeNameSchema,
  type Project,
  ProjectDescriptionSchema,
  type UpdateProjectInput,
} from "@core/contracts";
import { z } from "zod";

const LABELS = "shell.projects.edit";

/** Name and description of a project; status (archive) and deletion are separate actions. */
export const ProjectFormSchema = z.object({
  name: NodeNameSchema.meta({
    description: "Name of the project.",
    pii: "none",
    ui: { labelKey: `${LABELS}.name`, order: 1 },
  }),
  description: ProjectDescriptionSchema.optional().meta({
    description: "What the project is for.",
    pii: "personal",
    ui: { widget: "textarea", labelKey: `${LABELS}.descriptionField`, order: 2 },
  }),
});
export type ProjectForm = z.infer<typeof ProjectFormSchema>;

export const ProjectFormContract = defineContract(ProjectFormSchema, {
  id: "client.ProjectForm",
  kind: "command",
  description: "Client form behind PATCH /v1/projects/{projectId} (name and description).",
  examples: [{ name: "Launch 2", description: "Rollout of the new catalog." }],
  pii: "personal",
  tenancyScope: "project",
  relations: [],
});

export const projectFormValues = (project: Project): ProjectForm => ({
  name: project.name,
  description: project.description ?? "",
});

/** The `PATCH` body with what changed, or `null`; an emptied description is removed (`null`). */
export const changedProject = (initial: ProjectForm, values: ProjectForm): UpdateProjectInput | null => {
  const description = values.description ?? "";
  const body = {
    ...(values.name === initial.name ? {} : { name: values.name }),
    ...(description === (initial.description ?? "") ? {} : { description: description === "" ? null : description }),
  };
  return Object.keys(body).length === 0 ? null : body;
};
