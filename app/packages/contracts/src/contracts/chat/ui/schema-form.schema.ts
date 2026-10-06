import { z } from "zod";
import { defineContract } from "../../contract.ts";
import { none, personal } from "../../field-docs.ts";

const contractIdPattern = /^[a-z][a-z0-9-]*\.[A-Z][A-Za-z0-9]*$/;

/** Props of `schema-form` (SP4 spec §5.2): the SP2 `SchemaForm` of a command contract. */
export const SchemaFormPropsSchema = z.strictObject({
  contractId: z.string().regex(contractIdPattern).meta(none("Contract whose schema renders the form.")),
  commandId: z.string().regex(contractIdPattern).meta(none("Command the submitted values feed.")),
  mode: z.enum(["create", "update"]).meta(none("Create a record or update one.")),
  initialValues: z.record(z.string(), z.unknown()).meta(personal("Values proposed by the agent; may hold user data.")),
});
export type SchemaFormProps = z.infer<typeof SchemaFormPropsSchema>;

export const SchemaFormPropsContract = defineContract(SchemaFormPropsSchema, {
  id: "chat.SchemaFormProps",
  kind: "ui-component",
  description: "A form for a command contract that the member reviews and submits inside the chat.",
  examples: [
    {
      contractId: "example.Note",
      commandId: "example.CreateNoteCommand",
      mode: "create",
      initialValues: { title: "Kickoff" },
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
