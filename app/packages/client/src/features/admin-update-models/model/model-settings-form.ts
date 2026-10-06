import {
  EDITABLE_MODEL_ROLES,
  type EditableModelRole,
  type ModelCatalogEntry,
  ModelIdSchema,
  type ModelSettings,
  type UpdateModelSettingsInput,
} from "@core/contracts";

export type PriceField = "inputMicroUsdPerMTok" | "outputMicroUsdPerMTok";
type Price = Readonly<Record<PriceField, number>>;

/** `UpdateModelSettingsInputSchema`: the most prices staff may set. */
export const MAX_STAFF_PRICES = 50;

/** One model of the price table as staff edit it; prices in micro-USD per 1M tokens. */
export type ModelRow = Price & {
  readonly modelId: string;
  /** Whether the runtime holds a key for the provider; `null` when nothing says so yet. */
  readonly available: boolean | null;
  /** Only text models can run a text role; models staff add are text. */
  readonly kind: ModelCatalogEntry["kind"];
  /** `code` and `staff` as the server answered; `added` was typed in this session. */
  readonly origin: ModelCatalogEntry["source"] | "added";
  /** The price that ships with the code (rows the server answered as `code`), else `null`. */
  readonly codePrice: Price | null;
  /** A staff price left out of the next save. */
  readonly dropped: boolean;
  /** Bumped on restore, so the price fields show the restored values again. */
  readonly revision: number;
};

export type ModelSettingsFormState = {
  readonly roles: Readonly<Record<EditableModelRole, string>>;
  readonly rows: readonly ModelRow[];
};

const priceOf = (entry: Price): Price => ({
  inputMicroUsdPerMTok: entry.inputMicroUsdPerMTok,
  outputMicroUsdPerMTok: entry.outputMicroUsdPerMTok,
});

const toRow = (entry: ModelCatalogEntry): ModelRow => ({
  modelId: entry.modelId,
  ...priceOf(entry),
  available: entry.available,
  kind: entry.kind,
  origin: entry.source,
  codePrice: entry.source === "code" ? priceOf(entry) : null,
  dropped: false,
  revision: 0,
});

/** The form of the settings the server answered. */
export const modelSettingsFormOf = (settings: ModelSettings): ModelSettingsFormState => {
  const modelOf = (role: EditableModelRole): string =>
    settings.roles.find((entry) => entry.role === role)?.modelId ?? "";
  return {
    roles: { chat: modelOf("chat"), fast: modelOf("fast"), reasoning: modelOf("reasoning"), judge: modelOf("judge") },
    rows: settings.models.map(toRow),
  };
};

const samePrice = (left: Price, right: Price): boolean =>
  left.inputMicroUsdPerMTok === right.inputMicroUsdPerMTok &&
  left.outputMicroUsdPerMTok === right.outputMicroUsdPerMTok;

/** Whether the row's price is one staff set, so it goes in the next save. */
export const isStaffPriced = (row: ModelRow): boolean =>
  row.codePrice === null ? !row.dropped : !samePrice(row, row.codePrice);

/** What taking the staff price off a row does: back to the code price, out of the save, or out of the table. */
export const resetActionOf = (row: ModelRow): "restore" | "remove" | null => {
  if (!isStaffPriced(row)) return null;
  return row.origin === "added" ? "remove" : "restore";
};

/** The editable roles that run on `modelId`. */
export const rolesUsing = (form: ModelSettingsFormState, modelId: string): EditableModelRole[] =>
  EDITABLE_MODEL_ROLES.filter((role) => form.roles[role] === modelId);

const updateRow = (
  form: ModelSettingsFormState,
  modelId: string,
  change: (row: ModelRow) => ModelRow,
): ModelSettingsFormState => ({
  ...form,
  rows: form.rows.map((row) => (row.modelId === modelId ? change(row) : row)),
});

export const setRoleModel = (
  form: ModelSettingsFormState,
  role: EditableModelRole,
  modelId: string,
): ModelSettingsFormState => ({ ...form, roles: { ...form.roles, [role]: modelId } });

export const setRowPrice = (
  form: ModelSettingsFormState,
  modelId: string,
  field: PriceField,
  microUsd: number,
): ModelSettingsFormState => updateRow(form, modelId, (row) => ({ ...row, [field]: microUsd }));

/**
 * Takes the staff price off a model. A code-priced model goes back to that price at once. The
 * answer marks a staff price over a code price as `staff` too, so for those rows the price is only
 * left out of the save: the code price returns then, or the model leaves the list.
 */
export const restoreRow = (form: ModelSettingsFormState, modelId: string): ModelSettingsFormState =>
  updateRow(form, modelId, (row) =>
    row.codePrice === null ? { ...row, dropped: true } : { ...row, ...row.codePrice, revision: row.revision + 1 },
  );

/** Undoes `restoreRow` on a staff price that was only left out of the save. */
export const keepRow = (form: ModelSettingsFormState, modelId: string): ModelSettingsFormState =>
  updateRow(form, modelId, (row) => ({ ...row, dropped: false }));

export const removeRow = (form: ModelSettingsFormState, modelId: string): ModelSettingsFormState => ({
  ...form,
  rows: form.rows.filter((row) => row.modelId !== modelId),
});

export type AddedModel = Price & { readonly modelId: string };
export type AddModelRefusal = "INVALID_ID" | "DUPLICATE" | "TOO_MANY";

/** Why `modelId` cannot be added, or `null`. */
export const addModelRefusal = (form: ModelSettingsFormState, modelId: string): AddModelRefusal | null => {
  if (!ModelIdSchema.safeParse(modelId).success) return "INVALID_ID";
  if (form.rows.some((row) => row.modelId === modelId)) return "DUPLICATE";
  return form.rows.filter(isStaffPriced).length >= MAX_STAFF_PRICES ? "TOO_MANY" : null;
};

/** Adds a model typed by staff; its provider is available when the catalog says so for another model of it. */
export const addRow = (form: ModelSettingsFormState, added: AddedModel): ModelSettingsFormState => {
  const provider = `${added.modelId.split("/")[0] ?? ""}/`;
  const sibling = form.rows.find((row) => row.available !== null && row.modelId.startsWith(provider));
  const row: ModelRow = {
    modelId: added.modelId,
    ...priceOf(added),
    available: sibling?.available ?? null,
    kind: "text",
    origin: "added",
    codePrice: null,
    dropped: false,
    revision: 0,
  };
  return { ...form, rows: [...form.rows, row] };
};

/** The `PUT /v1/admin/models` body of the form. */
export const toUpdateModelSettingsInput = (form: ModelSettingsFormState): UpdateModelSettingsInput => ({
  roles: { ...form.roles },
  models: form.rows.filter(isStaffPriced).map((row) => ({ modelId: row.modelId, ...priceOf(row) })),
});

/** Whether saving `form` would send something other than what the server holds (`initial`). */
export const isModelSettingsDirty = (form: ModelSettingsFormState, initial: ModelSettingsFormState): boolean =>
  JSON.stringify(toUpdateModelSettingsInput(form)) !== JSON.stringify(toUpdateModelSettingsInput(initial));
