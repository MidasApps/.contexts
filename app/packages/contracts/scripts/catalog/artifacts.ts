import type { EndpointDefinition } from "../../src/contracts/http/endpoint.ts";
import type { RegisteredContract } from "../../src/contracts/registry.ts";
import { buildAiCatalog } from "./ai-catalog.ts";
import { buildCatalogEntry, type CatalogEntry } from "./catalog-entry.ts";
import { buildJsonSchemas } from "./json-schema.ts";
import { renderContractMarkdown } from "./render-markdown.ts";
import { renderOpenApi } from "./render-openapi.ts";
import { stableStringify } from "./stable-json.ts";

/** A generated file; `path` is relative to the workspace root (`app/`). */
export type CatalogArtifact = { path: string; content: string };

export const CATALOG_DIR = "docs/catalog";
export const OPENAPI_PATH = "docs/openapi/v1.yaml";

/** Bump when the catalog.json shape changes incompatibly. */
const CATALOG_VERSION = 1;

const perContractArtifacts = (entry: CatalogEntry): CatalogArtifact[] => [
  { path: `${CATALOG_DIR}/${entry.context}/${entry.name}.md`, content: renderContractMarkdown(entry) },
  { path: `${CATALOG_DIR}/${entry.context}/${entry.name}.schema.json`, content: stableStringify(entry.jsonSchema) },
];

const comparePaths = (left: CatalogArtifact, right: CatalogArtifact): number =>
  left.path < right.path ? -1 : left.path > right.path ? 1 : 0;

/** Pure: same contracts and endpoints in, byte-identical artifacts out (sorted keys, no timestamps). */
export const buildCatalogArtifacts = (
  contracts: readonly RegisteredContract[],
  endpoints: readonly EndpointDefinition[] = [],
): CatalogArtifact[] => {
  const schemas = buildJsonSchemas(contracts);
  const entries = contracts.map((contract) => buildCatalogEntry(contract, schemas.get(contract.id) ?? {}));
  const aiEntries = buildAiCatalog(entries);
  return [
    ...entries.flatMap(perContractArtifacts),
    {
      path: `${CATALOG_DIR}/catalog.json`,
      content: stableStringify({ catalogVersion: CATALOG_VERSION, contracts: entries }),
    },
    {
      path: `${CATALOG_DIR}/catalog.ai.json`,
      content: stableStringify({ catalogVersion: CATALOG_VERSION, contracts: aiEntries }),
    },
    { path: OPENAPI_PATH, content: renderOpenApi({ schemas, contracts, endpoints }) },
  ].sort(comparePaths);
};
