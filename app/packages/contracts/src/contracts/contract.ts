import type { z } from "zod";
import { ContractDefinitionError } from "./contract-definition-error.ts";
import { inspectSchema, isPiiBelow } from "./field-meta-rules.ts";
import { CatalogMetaSchema, type CatalogMeta } from "./primitives/catalog-meta.schema.ts";

/** A validated contract: schema plus catalog meta. Registering it is a composition step. */
export type ContractDefinition<Schema extends z.ZodType = z.ZodType> = {
  readonly id: string;
  readonly meta: CatalogMeta;
  readonly schema: Schema;
};

const readContractId = (meta: unknown): string =>
  typeof meta === "object" && meta !== null && "id" in meta && typeof meta.id === "string" ? meta.id : "<unknown>";

const parseMeta = (meta: unknown): CatalogMeta => {
  const parsed = CatalogMetaSchema.safeParse(meta);
  if (parsed.success) return parsed.data;
  const contractId = readContractId(meta);
  const fields = parsed.error.issues.map((issue) => issue.path.map(String).join("."));
  throw new ContractDefinitionError(
    { code: "INVALID_CONTRACT_META", contractId, fields, message: `Invalid catalog meta for ${contractId}: ${fields.join(", ")}` },
    { cause: parsed.error },
  );
};

const assertFieldMeta = (schema: z.ZodType, meta: CatalogMeta): void => {
  const { problems, maxPii } = inspectSchema(schema);
  const missing = problems.filter((problem) => problem.issue === "MISSING_FIELD_META").map((problem) => problem.path);
  if (missing.length > 0) {
    throw new ContractDefinitionError({
      code: "MISSING_FIELD_META",
      contractId: meta.id,
      fields: missing,
      message: `Fields of ${meta.id} need description and pii meta: ${missing.join(", ")}`,
    });
  }
  const below = problems.map((problem) => problem.path);
  if (isPiiBelow(meta.pii, maxPii)) below.push("<contract>");
  if (below.length === 0) return;
  throw new ContractDefinitionError({
    code: "PII_BELOW_FIELDS",
    contractId: meta.id,
    fields: below,
    message: `pii of ${meta.id} must cover its nested fields: ${below.join(", ")}`,
  });
};

/**
 * Validates a contract and returns its descriptor. Pure: nothing is registered;
 * `composition.ts` registers descriptors explicitly.
 *
 * @throws {ContractDefinitionError} on invalid meta, missing field meta, or a pii
 *   level lower than the fields it contains (a declaration bug, raised at startup).
 */
export const defineContract = <Schema extends z.ZodType>(schema: Schema, rawMeta: unknown): ContractDefinition<Schema> => {
  const meta = parseMeta(rawMeta);
  assertFieldMeta(schema, meta);
  return { id: meta.id, meta, schema };
};
