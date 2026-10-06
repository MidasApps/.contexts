import { z } from "zod";
import { defineContract } from "../../contract.ts";
import { none, personal } from "../../field-docs.ts";

const OptionSchema = z.strictObject({
  value: z.string().min(1).max(200).meta(none("Value returned to the tool.")),
  label: z.string().min(1).max(200).meta(personal("Shown label.")),
});

/** Props of `picker` (SP4 spec §5.2): a choice returned to the tool with `addToolOutput`. */
export const PickerPropsSchema = z.strictObject({
  options: z.array(OptionSchema).min(1).max(50).meta(personal("Choices.")),
  multiple: z.boolean().meta(none("Whether several options may be chosen.")),
});
export type PickerProps = z.infer<typeof PickerPropsSchema>;

export const PickerPropsContract = defineContract(PickerPropsSchema, {
  id: "chat.PickerProps",
  kind: "ui-component",
  description: "A single or multiple choice the member answers inside the chat.",
  examples: [
    {
      options: [
        { value: "north", label: "North" },
        { value: "south", label: "South" },
      ],
      multiple: false,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
