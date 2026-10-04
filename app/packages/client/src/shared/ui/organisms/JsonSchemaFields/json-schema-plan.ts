/** Controls a JSON Schema property can be edited with. */
export type JsonFieldKind = "text" | "textarea" | "number" | "integer" | "switch" | "select";

/** One property of a flat object schema, as a form field. */
export type JsonFieldPlan = {
  readonly name: string;
  readonly kind: JsonFieldKind;
  /** The user must fill it in (a switch always holds a value; a default fills it in). */
  readonly required: boolean;
  /** The schema's `title`, a label of last resort (code-defined, not translated). */
  readonly title: string | undefined;
  /** `ui.labelKey` when the schema came from a contract (`defineContract` meta travels into the JSON Schema). */
  readonly labelKey: string | undefined;
  readonly options: readonly string[];
  readonly minLength: number | undefined;
  readonly maxLength: number | undefined;
  readonly minimum: number | undefined;
  readonly maximum: number | undefined;
  readonly defaultValue: unknown;
};

/**
 * `none`: nothing to ask (no schema, or an object without properties); `fields`: a flat object a
 * form can hold; `json`: anything else (arrays, nested objects, unions), edited as JSON text.
 */
export type JsonSchemaPlan =
  | { readonly kind: "none" }
  | { readonly kind: "fields"; readonly fields: readonly JsonFieldPlan[] }
  | { readonly kind: "json" };

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Long free text gets a textarea; short strings (titles, names) a single line.
const LONG_TEXT = 500;

// Zod writes the safe-integer bounds of `z.int()`; they are not limits a person needs to see.
const limit = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER ? value : undefined;

const stringOr = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

const kindOf = (property: JsonRecord): JsonFieldKind | undefined => {
  if (Array.isArray(property["enum"]))
    return property["enum"].every((option) => typeof option === "string") ? "select" : undefined;
  const ui = isRecord(property["ui"]) ? property["ui"] : {};
  switch (property["type"]) {
    case "boolean":
      return "switch";
    case "integer":
      return "integer";
    case "number":
      return "number";
    case "string": {
      const long = ui["widget"] === "textarea" || (limit(property["maxLength"]) ?? 0) > LONG_TEXT;
      return long ? "textarea" : "text";
    }
    default:
      return undefined;
  }
};

const planProperty = (name: string, property: JsonRecord, required: ReadonlySet<string>): JsonFieldPlan | undefined => {
  const kind = kindOf(property);
  if (kind === undefined) return undefined;
  const ui = isRecord(property["ui"]) ? property["ui"] : {};
  return {
    name,
    kind,
    required: kind !== "switch" && required.has(name) && property["default"] === undefined,
    title: stringOr(property["title"]),
    labelKey: stringOr(ui["labelKey"]),
    options: kind === "select" ? (property["enum"] as string[]) : [],
    minLength: limit(property["minLength"]),
    maxLength: limit(property["maxLength"]),
    minimum: limit(property["minimum"]),
    maximum: limit(property["maximum"]),
    defaultValue: property["default"],
  };
};

const orderOf = (property: unknown): number => {
  const ui = isRecord(property) && isRecord(property["ui"]) ? property["ui"] : {};
  return typeof ui["order"] === "number" ? ui["order"] : Number.MAX_SAFE_INTEGER;
};

/**
 * Turns a workflow's input JSON Schema (`WorkflowCatalogEntry.inputSchema`, what `z.toJSONSchema`
 * emits) into form fields, or says why it cannot (pure). Only a flat `object` of strings,
 * numbers, integers, booleans and string enums becomes a form; `ui.order` (contract meta) sorts
 * the fields, then declaration order.
 */
export const planJsonSchemaFields = (schema: JsonRecord | null): JsonSchemaPlan => {
  if (schema === null) return { kind: "none" };
  if (schema["type"] !== "object" || !isRecord(schema["properties"])) return { kind: "json" };
  const entries = Object.entries(schema["properties"]);
  if (entries.length === 0) return { kind: "none" };
  const required = new Set(
    Array.isArray(schema["required"])
      ? schema["required"].filter((name): name is string => typeof name === "string")
      : [],
  );
  const planned: { field: JsonFieldPlan; order: number; index: number }[] = [];
  for (const [index, [name, property]] of entries.entries()) {
    const field = isRecord(property) ? planProperty(name, property, required) : undefined;
    if (field === undefined) return { kind: "json" };
    planned.push({ field, order: orderOf(property), index });
  }
  return {
    kind: "fields",
    fields: planned.toSorted((a, b) => a.order - b.order || a.index - b.index).map(({ field }) => field),
  };
};
