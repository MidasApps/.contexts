import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { listTopLevelFields, readFieldMeta } from "../../src/contracts/field-meta.ts";
import type { RegisteredContract } from "../../src/contracts/registry.ts";
import type { CatalogArtifact } from "./artifacts.ts";
import { findRawMetaKeys } from "./json-schema.ts";

const findMissingFieldMeta = (contract: RegisteredContract): string[] =>
  listTopLevelFields(contract.schema)
    .filter(([, field]) => readFieldMeta(field, z.globalRegistry) === undefined)
    .map(([name]) => `missing field meta (description + pii): ${contract.id}.${name}`);

const findDanglingRelations = (contract: RegisteredContract, knownIds: ReadonlySet<string>): string[] =>
  contract.meta.relations
    .filter((relation) => !knownIds.has(relation.target))
    .map((relation) => `unknown relation target: ${contract.id} -> ${relation.target}`);

/** Defense in depth for contracts that bypassed defineContract's checks. */
export const findContractProblems = (contracts: readonly RegisteredContract[]): string[] => {
  const knownIds = new Set(contracts.map((contract) => contract.id));
  return contracts.flatMap((contract) => [
    ...findMissingFieldMeta(contract),
    ...findDanglingRelations(contract, knownIds),
  ]);
};

type CatalogFileShape = { contracts?: { id?: string; jsonSchema?: unknown }[] };

/** Every JSON Schema tree inside an artifact, as [label, schema]. */
const schemaTreesOf = (artifact: CatalogArtifact): [string, unknown][] => {
  if (artifact.path.endsWith(".schema.json")) return [[artifact.path, JSON.parse(artifact.content)]];
  if (artifact.path.endsWith(".yaml")) {
    const document = parseYaml(artifact.content) as { components?: unknown };
    return [[artifact.path, document.components]];
  }
  if (artifact.path.endsWith(".json")) {
    const catalog = JSON.parse(artifact.content) as CatalogFileShape;
    return (catalog.contracts ?? []).map((entry) => [`${artifact.path} ${entry.id ?? "?"}`, entry.jsonSchema]);
  }
  return [];
};

/** JSON Schema in any artifact must carry custom meta only as `x-*` keys. */
export const findRawMetaInArtifacts = (artifacts: readonly CatalogArtifact[]): string[] =>
  artifacts.flatMap((artifact) =>
    schemaTreesOf(artifact).flatMap(([label, schema]) =>
      findRawMetaKeys(schema).map((pointer) => `raw meta key: ${label} ${pointer}`),
    ),
  );
