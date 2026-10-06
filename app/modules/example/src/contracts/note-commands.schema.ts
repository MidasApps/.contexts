import { defineContract, NoteIdSchema } from "@core/contracts";
import { z } from "zod";

/** Permissions of the note commands; the manifest declares them (`example.note.archive` needs four eyes). */
export const NOTE_PERMISSIONS = {
  read: "example.note.read",
  create: "example.note.create",
  archive: "example.note.archive",
} as const;

/**
 * Input of `example.CreateNoteCommand`: the same schema for the form (`SchemaForm`), the agent
 * tool `command.example.CreateNoteCommand`, the approval handler and workflows (decision 0025).
 */
export const CreateNoteCommandSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .meta({
      description: "Short title shown in lists.",
      pii: "none",
      ui: { widget: "text", labelKey: "example.note.title", order: 1 },
      examples: ["Supplier follow-up"],
    }),
  body: z
    .string()
    .max(10_000)
    .optional()
    .meta({
      description: "Free text of the note; may mention people.",
      pii: "personal",
      ui: { widget: "textarea", labelKey: "example.note.body", order: 2 },
      examples: ["Call Ana about the invoice on Monday."],
    }),
});
export type CreateNoteCommand = z.infer<typeof CreateNoteCommandSchema>;

export const CreateNoteCommandContract = defineContract(CreateNoteCommandSchema, {
  id: "example.CreateNoteCommand",
  kind: "command",
  description: "Creates a note in the organization (`example.note.create`).",
  examples: [{ title: "Supplier follow-up", body: "Call Ana about the invoice on Monday." }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: NOTE_PERMISSIONS.create,
});

export const ArchiveNoteCommandSchema = z.strictObject({
  noteId: NoteIdSchema.meta({
    description: "Id of the note to archive.",
    pii: "none",
    ui: { widget: "text", labelKey: "example.note.noteId", order: 1 },
    examples: ["Xk2mQ9vLr3TnB7pWc1aZ"],
  }),
});
export type ArchiveNoteCommand = z.infer<typeof ArchiveNoteCommandSchema>;

export const ArchiveNoteCommandContract = defineContract(ArchiveNoteCommandSchema, {
  id: "example.ArchiveNoteCommand",
  kind: "command",
  description: "Archives a note of the organization (`example.note.archive`, which needs a second member's approval).",
  examples: [{ noteId: "Xk2mQ9vLr3TnB7pWc1aZ" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [{ target: "example.Note", type: "references", field: "noteId" }],
  permission: NOTE_PERMISSIONS.archive,
});
