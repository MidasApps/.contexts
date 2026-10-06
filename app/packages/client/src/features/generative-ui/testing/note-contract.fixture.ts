// Test fixture: a command contract a form can render, with its messages (the labels a module
// would ship in its own namespace).
import { defineContract } from "@core/contracts";
import type { ExtraNamespaces } from "@core/i18n";
import { z } from "zod";

export const CreateTestNoteSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .meta({
      description: "Short title.",
      pii: "none",
      ui: { widget: "text", labelKey: "testnotes.note.title", order: 1 },
      examples: ["Kickoff"],
    }),
  body: z
    .string()
    .max(200)
    .optional()
    .meta({
      description: "Free text.",
      pii: "none",
      ui: { widget: "textarea", labelKey: "testnotes.note.body", order: 2 },
      examples: ["Agenda."],
    }),
});

export const CreateTestNoteContract = defineContract(CreateTestNoteSchema, {
  id: "testnotes.CreateNoteCommand",
  kind: "command",
  description: "Creates a note.",
  examples: [{ title: "Kickoff" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "testnotes.note.create",
});

export const TEST_NOTE_MESSAGES: ExtraNamespaces = {
  testnotes: { "pt-BR": { note: { title: "Título", body: "Texto" } } },
};

export const NOTE_FORM_UI = {
  component: "schema-form",
  props: {
    contractId: "testnotes.Note",
    commandId: "testnotes.CreateNoteCommand",
    mode: "create",
    initialValues: { title: "Kickoff" },
  },
} as const;
