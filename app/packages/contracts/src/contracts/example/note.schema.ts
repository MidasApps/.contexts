// Removable sample so the catalog is never empty. Delete this file and its
// re-exports in src/index.ts and src/composition.ts once a real contract exists.
import { z } from "zod";
import { defineContract } from "../contract.ts";
import { firestoreIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

export const NoteIdSchema = firestoreIdSchema<"NoteId">();
export type NoteId = z.infer<typeof NoteIdSchema>;

export const NoteSchema = z.object({
  id: NoteIdSchema.meta({ description: "Firestore automatic id of the note.", pii: "none", ui: { widget: "hidden" } }),
  tenantId: TenantIdSchema.meta({
    description: "Organization that owns the note.",
    pii: "none",
    ui: { widget: "hidden" },
  }),
  authorId: UserIdSchema.meta({
    description: "Firebase Auth uid of the author.",
    pii: "personal",
    ui: { widget: "hidden" },
  }),
  title: z
    .string()
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
    .meta({
      description: "Free text written by the author; may mention people.",
      pii: "personal",
      ui: { widget: "textarea", labelKey: "example.note.body", order: 2 },
      examples: ["Call Ana about the invoice on Monday."],
    }),
  createdAt: IsoDateTimeSchema.meta({
    description: "When the note was created (UTC).",
    pii: "none",
    ui: { widget: "hidden" },
  }),
  updatedAt: IsoDateTimeSchema.meta({
    description: "When the note last changed (UTC).",
    pii: "none",
    ui: { widget: "hidden" },
  }),
  archivedAt: IsoDateTimeSchema.optional().meta({
    description: "When the note was archived (UTC); absent while it is active.",
    pii: "none",
    ui: { widget: "hidden" },
  }),
});
export type Note = z.infer<typeof NoteSchema>;

export const NoteContract = defineContract(NoteSchema, {
  id: "example.Note",
  kind: "entity",
  description: "A free-text note inside an organization. Sample contract; remove it in derived apps.",
  examples: [
    {
      id: "Xk2mQ9vLr3TnB7pWc1aZ",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      authorId: "uA1b2C3d4E5f6G7h8I9j",
      title: "Supplier follow-up",
      body: "Call Ana about the invoice on Monday.",
      createdAt: "2026-09-29T14:30:00.000Z",
      updatedAt: "2026-09-29T14:30:00.000Z",
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "example.note.read",
});
