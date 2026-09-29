import { z } from "zod";
import { ContractDefinitionError } from "./contract-definition-error.ts";
import { listTopLevelFields, readFieldMeta, type ZodMetaRegistry } from "./field-meta.ts";
import { CatalogMetaSchema, type CatalogMeta } from "./primitives/catalog-meta.schema.ts";

export type RegisteredContract = {
  readonly id: string;
  readonly meta: CatalogMeta;
  readonly schema: z.ZodType;
};

export type ContractRegistry = {
  readonly zodRegistry: ZodMetaRegistry;
  readonly defineContract: <Schema extends z.ZodType>(schema: Schema, meta: unknown) => Schema;
  readonly listContracts: () => RegisteredContract[];
};

const readContractId = (meta: unknown): string =>
  typeof meta === "object" && meta !== null && "id" in meta && typeof meta.id === "string" ? meta.id : "<unknown>";

const parseMeta = (meta: unknown): CatalogMeta => {
  const parsed = CatalogMetaSchema.safeParse(meta);
  if (parsed.success) return parsed.data;
  const contractId = readContractId(meta);
  const fields = parsed.error.issues.map((issue) => issue.path.map(String).join("."));
  throw new ContractDefinitionError(
    {
      code: "INVALID_CONTRACT_META",
      contractId,
      fields,
      message: `Invalid catalog meta for ${contractId}: ${fields.join(", ")}`,
    },
    { cause: parsed.error },
  );
};

const assertFieldsHaveMeta = (schema: z.ZodType, contractId: string, zodRegistry: ZodMetaRegistry): void => {
  const missing = listTopLevelFields(schema)
    .filter(([, field]) => readFieldMeta(field, zodRegistry) === undefined)
    .map(([name]) => name);
  if (missing.length === 0) return;
  throw new ContractDefinitionError({
    code: "MISSING_FIELD_META",
    contractId,
    fields: missing,
    message: `Fields of ${contractId} need description and pii meta: ${missing.join(", ")}`,
  });
};

const compareIds = (left: RegisteredContract, right: RegisteredContract): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

/**
 * Zod's registry is not enumerable and does not reject a repeated `id`, so the
 * catalog keeps its own map next to it (spec §16.4).
 */
export const createContractRegistry = (): ContractRegistry => {
  // Field `.meta()` writes to the global registry, so contracts live there too.
  const zodRegistry: ZodMetaRegistry = z.globalRegistry;
  const contracts = new Map<string, RegisteredContract>();

  const defineContract = <Schema extends z.ZodType>(schema: Schema, rawMeta: unknown): Schema => {
    const meta = parseMeta(rawMeta);
    if (contracts.has(meta.id)) {
      throw new ContractDefinitionError({
        code: "DUPLICATE_CONTRACT_ID",
        contractId: meta.id,
        message: `Contract ${meta.id} is already defined.`,
      });
    }
    assertFieldsHaveMeta(schema, meta.id, zodRegistry);
    // Registers this instance; `.meta()` would register a clone instead.
    zodRegistry.add(schema, meta);
    contracts.set(meta.id, { id: meta.id, meta, schema });
    return schema;
  };

  const listContracts = (): RegisteredContract[] => [...contracts.values()].sort(compareIds);

  return { zodRegistry, defineContract, listContracts };
};

/** Process-wide registry backed by `z.globalRegistry`; contract modules register on import. */
export const defaultContractRegistry = createContractRegistry();
export const defineContract = defaultContractRegistry.defineContract;
export const listContracts = defaultContractRegistry.listContracts;
