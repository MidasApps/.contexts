import { z } from "zod";
import { isFieldOptional, listTopLevelFields, readFieldMeta } from "../../src/contracts/field-meta.ts";
import type { CatalogMeta, FieldMeta } from "../../src/contracts/primitives/catalog-meta.schema.ts";
import type { RegisteredContract } from "../../src/contracts/registry.ts";
import type { JsonRecord } from "./stable-json.ts";

export type CatalogField = FieldMeta & { name: string; required: boolean };

export type CatalogEntry = Omit<CatalogMeta, "examples"> & {
  context: string;
  name: string;
  examples: unknown[];
  fields: CatalogField[];
  jsonSchema: JsonRecord;
};

/** Contract ids are `<context>.<Name>` (validated by CatalogMetaSchema). */
export const splitContractId = (id: string): { context: string; name: string } => {
  const separator = id.indexOf(".");
  return { context: id.slice(0, separator), name: id.slice(separator + 1) };
};

const compareNames = (left: CatalogField, right: CatalogField): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0;

const buildFields = (contract: RegisteredContract): CatalogField[] =>
  listTopLevelFields(contract.schema)
    .flatMap(([name, field]) => {
      // Missing meta is rejected by defineContract and reported by contracts:check.
      const meta = readFieldMeta(field, z.globalRegistry);
      return meta === undefined ? [] : [{ ...meta, name, required: !isFieldOptional(field) }];
    })
    .sort(compareNames);

export const buildCatalogEntry = (contract: RegisteredContract, jsonSchema: JsonRecord): CatalogEntry => ({
  ...contract.meta,
  ...splitContractId(contract.id),
  fields: buildFields(contract),
  jsonSchema,
});
