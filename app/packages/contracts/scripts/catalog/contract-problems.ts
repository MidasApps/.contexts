import { parse as parseYaml } from "yaml";
import { inspectSchema, isPiiBelow } from "../../src/contracts/field-meta-rules.ts";
import type { RegisteredContract } from "../../src/contracts/registry.ts";
import type { CatalogArtifact } from "./artifacts.ts";
import { findRawMetaKeys } from "./json-schema.ts";
import { findDanglingRefs } from "./openapi-paths.ts";
import type { JsonRecord } from "./stable-json.ts";

const ISSUE_LABELS = {
  MISSING_FIELD_META: "missing field meta (description + pii)",
  PII_BELOW_FIELDS: "pii below nested fields",
} as const;

const findFieldMetaProblems = (contract: RegisteredContract): string[] => {
  const { problems, maxPii } = inspectSchema(contract.schema);
  const lines = problems.map((problem) => `${ISSUE_LABELS[problem.issue]}: ${contract.id}.${problem.path}`);
  if (isPiiBelow(contract.meta.pii, maxPii)) lines.push(`${ISSUE_LABELS.PII_BELOW_FIELDS}: ${contract.id}`);
  return lines;
};

const findDanglingRelations = (contract: RegisteredContract, knownIds: ReadonlySet<string>): string[] =>
  contract.meta.relations
    .filter((relation) => !knownIds.has(relation.target))
    .map((relation) => `unknown relation target: ${contract.id} -> ${relation.target}`);

/** Defense in depth: re-checks what defineContract enforces, plus cross-contract relations. */
export const findContractProblems = (contracts: readonly RegisteredContract[]): string[] => {
  const knownIds = new Set(contracts.map((contract) => contract.id));
  return contracts.flatMap((contract) => [
    ...findFieldMetaProblems(contract),
    ...findDanglingRelations(contract, knownIds),
  ]);
};

type CatalogFileShape = { contracts?: { id?: string; jsonSchema?: unknown }[] };

/** Every JSON Schema tree inside an artifact, as [label, schema]. */
const schemaTreesOf = (artifact: CatalogArtifact): [string, unknown][] => {
  if (artifact.path.endsWith(".schema.json")) return [[artifact.path, JSON.parse(artifact.content)]];
  if (artifact.path.endsWith(".yaml")) {
    const document = parseYaml(artifact.content) as { components?: unknown; paths?: unknown };
    return [
      [`${artifact.path} components`, document.components],
      [`${artifact.path} paths`, document.paths],
    ];
  }
  if (artifact.path.endsWith(".json")) {
    const catalog = JSON.parse(artifact.content) as CatalogFileShape;
    return (catalog.contracts ?? []).map((entry) => [`${artifact.path} ${entry.id ?? "?"}`, entry.jsonSchema]);
  }
  return [];
};

/** Every `$ref` of the OpenAPI artifact must resolve to a component schema. */
export const findDanglingRefsInArtifacts = (artifacts: readonly CatalogArtifact[]): string[] =>
  artifacts
    .filter((artifact) => artifact.path.endsWith(".yaml"))
    .flatMap((artifact) =>
      findDanglingRefs(parseYaml(artifact.content) as JsonRecord).map((problem) => `${artifact.path}: ${problem}`),
    );

/** JSON Schema in any artifact must carry custom meta only as `x-*` keys. */
export const findRawMetaInArtifacts = (artifacts: readonly CatalogArtifact[]): string[] =>
  artifacts.flatMap((artifact) =>
    schemaTreesOf(artifact).flatMap(([label, schema]) =>
      findRawMetaKeys(schema).map((pointer) => `raw meta key: ${label} ${pointer}`),
    ),
  );
