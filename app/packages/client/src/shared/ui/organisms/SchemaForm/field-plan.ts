import { isFieldOptional, listTopLevelFields, readFieldMeta, type ContractDefinition } from "@core/contracts";
import { z } from "zod";

/** Widgets SchemaForm renders (SP2 spec §3.1); `hidden` carries the value without a control. */
export const SCHEMA_FORM_WIDGETS = [
  "text",
  "textarea",
  "number",
  "money",
  "select",
  "switch",
  "date",
  "datetime",
  "locale",
  "timeZone",
  "currency",
  "hidden",
] as const;
export type SchemaFormWidget = (typeof SCHEMA_FORM_WIDGETS)[number];

/** One rendered field: what to draw and how to label it. */
export type FieldPlan = {
  readonly name: string;
  readonly widget: Exclude<SchemaFormWidget, "hidden">;
  /** i18n key of the label; `<labelKey>Hint` (optional) and `<labelKey>Options.<value>` hang off it. */
  readonly labelKey: string;
  readonly required: boolean;
  /** Enum values of a `select`, in declaration order. */
  readonly options: readonly string[];
  /** `number` fields declared with `z.int()`. */
  readonly integer: boolean;
  readonly group: string | undefined;
};

/** Consecutive fields that share `ui.group` (an i18n key used as the fieldset legend). */
export type FieldSection = { readonly group: string | undefined; readonly fields: readonly FieldPlan[] };

export type FormPlan = {
  readonly sections: readonly FieldSection[];
  /** Fields kept from `defaultValues` but not rendered (hidden widget, no permission, no widget). */
  readonly carried: readonly string[];
};

/** A contract that SchemaForm cannot render as declared (a declaration bug). */
export class SchemaFormDefinitionError extends Error {
  readonly code = "SCHEMA_FORM_DEFINITION";
  readonly contractId: string;
  readonly field: string;
  constructor(contractId: string, field: string, problem: string) {
    super(`SchemaForm cannot render ${contractId}.${field}: ${problem}`);
    this.name = "SchemaFormDefinitionError";
    this.contractId = contractId;
    this.field = field;
  }
}

type LooseDef = { type: string; innerType?: z.core.$ZodType; in?: z.core.$ZodType; format?: string; entries?: Record<string, string> };

const WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "readonly", "catch", "nonoptional"]);

/** The schema under optional/nullable/default wrappers and pipes (the input side). */
const unwrap = (schema: z.core.$ZodType): z.core.$ZodType => {
  let current = schema;
  for (;;) {
    const def = current._zod.def as LooseDef;
    const next = WRAPPERS.has(def.type) ? def.innerType : def.type === "pipe" ? def.in : undefined;
    if (next === undefined) return current;
    current = next;
  }
};

const isMoneyShape = (def: z.core.$ZodTypeDef): boolean => {
  if (def.type !== "object") return false;
  const keys = Object.keys((def as z.core.$ZodObjectDef).shape).sort();
  return keys.length === 2 && keys[0] === "amountMinor" && keys[1] === "currency";
};

const STRING_FORMAT_WIDGETS: Record<string, SchemaFormWidget> = { datetime: "datetime", date: "date" };

/** Widget implied by the field type, or `undefined` when no control fits (arrays, objects). */
const inferWidget = (core: z.core.$ZodType): SchemaFormWidget | undefined => {
  const def = core._zod.def as LooseDef;
  if (def.type === "enum") return "select";
  if (def.type === "boolean") return "switch";
  if (def.type === "number") return "number";
  if (def.type === "string") return STRING_FORMAT_WIDGETS[def.format ?? ""] ?? "text";
  if (isMoneyShape(core._zod.def)) return "money";
  return undefined;
};

const isWidget = (value: string): value is SchemaFormWidget => (SCHEMA_FORM_WIDGETS as readonly string[]).includes(value);

/** Declared widgets that need a specific type underneath. */
const fitsType = (widget: SchemaFormWidget, core: z.core.$ZodType): boolean => {
  const inferred = inferWidget(core);
  if (widget === "select" || widget === "switch" || widget === "money" || widget === "number") return inferred === widget;
  if (widget === "hidden") return true;
  return (core._zod.def as LooseDef).type === "string";
};

type Candidate = { plan: FieldPlan; order: number; index: number };

const planField = (contractId: string, name: string, field: z.core.$ZodType, index: number, can: (permission: string) => boolean) => {
  const meta = readFieldMeta(field, z.globalRegistry);
  const core = unwrap(field);
  const declared = meta?.ui?.widget;
  if (declared !== undefined && !isWidget(declared)) throw new SchemaFormDefinitionError(contractId, name, `unknown widget "${declared}"`);
  if (declared !== undefined && !fitsType(declared, core)) {
    throw new SchemaFormDefinitionError(contractId, name, `widget "${declared}" does not fit the field type`);
  }
  const widget = declared ?? inferWidget(core);
  const visibleWith = meta?.ui?.visibleWith;
  if (widget === undefined || widget === "hidden" || (visibleWith !== undefined && !can(visibleWith))) return undefined;
  const labelKey = meta?.ui?.labelKey;
  if (labelKey === undefined) throw new SchemaFormDefinitionError(contractId, name, "a rendered field needs ui.labelKey");
  const def = core._zod.def as LooseDef;
  const plan: FieldPlan = {
    name,
    widget,
    labelKey,
    // A switch always holds true or false, so it is never "required" to fill in.
    required: widget !== "switch" && !isFieldOptional(field),
    options: widget === "select" ? Object.values(def.entries ?? {}) : [],
    integer: def.type === "number" && def.format !== undefined && def.format.includes("int"),
    group: meta?.ui?.group,
  };
  return { plan, order: meta?.ui?.order ?? Number.MAX_SAFE_INTEGER, index } satisfies Candidate;
};

const toSections = (plans: readonly FieldPlan[]): FieldSection[] =>
  plans.reduce<{ group: string | undefined; fields: FieldPlan[] }[]>((sections, plan) => {
    const last = sections.at(-1);
    if (last !== undefined && last.group === plan.group) last.fields.push(plan);
    else sections.push({ group: plan.group, fields: [plan] });
    return sections;
  }, []);

/**
 * Turns an object contract into the fields SchemaForm draws (pure). Fields come from
 * `readFieldMeta`: `ui.widget` (else inferred from the type), `ui.labelKey`, `ui.order` (then
 * declaration order), `ui.group` (consecutive fields with the same group share a fieldset) and
 * `ui.visibleWith` (rendered only when `can(permission)`).
 *
 * @throws {SchemaFormDefinitionError} unknown widget, widget not fitting the type, or a rendered
 *   field without `ui.labelKey`.
 */
export const planSchemaForm = (contract: ContractDefinition, { can }: { can: (permission: string) => boolean }): FormPlan => {
  const candidates: Candidate[] = [];
  const carried: string[] = [];
  listTopLevelFields(contract.schema).forEach(([name, field], index) => {
    const candidate = planField(contract.id, name, field, index, can);
    if (candidate === undefined) carried.push(name);
    else candidates.push(candidate);
  });
  const ordered = candidates.toSorted((a, b) => a.order - b.order || a.index - b.index).map((candidate) => candidate.plan);
  return { sections: toSections(ordered), carried };
};
