import { z } from "zod";
import { defineContract } from "../contract.ts";

/**
 * Generative UI returned by a tool (SP3 spec §8.2): the chat (SP4) looks the
 * component up in its registry and renders it with `props`.
 */
export const ToolUiSchema = z.strictObject({
  component: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, { error: "Expected a kebab-case component id." })
    .meta({ description: "Component id in the client registry, e.g. schema-form.", pii: "none" }),
  props: z
    .record(z.string(), z.unknown())
    .meta({ description: "Props for the component; may hold form values typed by the user.", pii: "personal" }),
});
export type ToolUi = z.infer<typeof ToolUiSchema>;

export const ToolUiContract = defineContract(ToolUiSchema, {
  id: "agents.ToolUi",
  kind: "ui-component",
  description: "A UI component a tool asks the chat to render, such as a schema form for a command.",
  examples: [
    {
      component: "schema-form",
      props: { contractId: "example.Note", commandId: "example.CreateNoteCommand", mode: "create", initialValues: {} },
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
