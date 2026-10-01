// Test fixture (not exported): an `example.Note`-like contract that exercises every widget
// SchemaForm supports, plus the messages its label keys point to.
import { defineContract, IsoDateTimeSchema, MoneySchema, TimeZoneSchema } from "@core/contracts";
import { z } from "zod";

const none = (description: string) => ({ description, pii: "none" as const });

export const FixtureNoteSchema = z.object({
  id: z.string().min(1).meta({ ...none("Automatic id."), ui: { widget: "hidden" } }),
  body: z
    .string()
    .max(500)
    .optional()
    .meta({ ...none("Free text."), ui: { labelKey: "fixture.note.body", order: 2 } }),
  title: z
    .string()
    .min(3)
    .max(60)
    .meta({ ...none("Short title."), ui: { widget: "text", labelKey: "fixture.note.title", order: 1 } }),
  priority: z
    .enum(["low", "normal", "high"])
    .meta({ ...none("Priority."), ui: { labelKey: "fixture.note.priority", order: 3, group: "fixture.groups.details" } }),
  budget: MoneySchema.meta({ ...none("Budget."), ui: { labelKey: "fixture.note.budget", order: 4, group: "fixture.groups.details" } }),
  copies: z
    .int()
    .min(1)
    .max(10)
    .optional()
    .meta({ ...none("Copies."), ui: { labelKey: "fixture.note.copies", order: 5, group: "fixture.groups.details" } }),
  dueAt: IsoDateTimeSchema.optional().meta({
    ...none("Due instant (UTC)."),
    ui: { labelKey: "fixture.note.dueAt", order: 6, group: "fixture.groups.schedule" },
  }),
  timeZone: TimeZoneSchema.optional().meta({
    ...none("Zone of the reminder."),
    ui: { widget: "timeZone", labelKey: "fixture.note.timeZone", order: 7, group: "fixture.groups.schedule" },
  }),
  pinned: z.boolean().meta({ ...none("Pinned to the top."), ui: { labelKey: "fixture.note.pinned", order: 8 } }),
  internalCode: z
    .string()
    .optional()
    .meta({ ...none("Admin-only code."), ui: { labelKey: "fixture.note.internalCode", order: 9, visibleWith: "fixture.note.admin" } }),
});

export const FixtureNoteContract = defineContract(FixtureNoteSchema, {
  id: "fixture.Note",
  kind: "command",
  description: "SchemaForm test fixture.",
  examples: [{ id: "a1", title: "Hello", priority: "normal", budget: { amountMinor: 100, currency: "BRL" }, pinned: false }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});

const PT_BR = {
  groups: { details: "Detalhes", schedule: "Agenda" },
  note: {
    title: "Título",
    titleHint: "Aparece nas listas.",
    body: "Texto",
    priority: "Prioridade",
    priorityOptions: { low: "Baixa", normal: "Normal", high: "Alta" },
    budget: "Orçamento",
    copies: "Cópias",
    dueAt: "Prazo",
    timeZone: "Fuso do lembrete",
    pinned: "Fixar no topo",
    internalCode: "Código interno",
  },
  submit: "Salvar nota",
};

export const FIXTURE_MESSAGES = { fixture: { "pt-BR": PT_BR } };
