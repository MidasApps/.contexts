// Module contracts for the generated catalog (decision 0015, "module contracts join the catalog").
// The workspace lists installed modules in `app/catalog.modules.ts` (a composition file, like the
// apps' `modules.ts`); this loader reads it by path at generation time, so @core/contracts itself
// never imports a module (umbrella D6).
import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ContractDefinition } from "../../src/contracts/contract.ts";
import type { EndpointDefinition } from "../../src/contracts/http/endpoint.ts";
import { WORKSPACE_ROOT } from "./artifact-files.ts";

/** Composition file at the workspace root; it exports `CATALOG_MODULES`. */
export const CATALOG_MODULES_FILE = "catalog.modules.ts";

/**
 * A module listed for the catalog: its id, the contracts it owns (ids `<moduleId>.<Name>`) and,
 * optionally, its `/v1` endpoints (ids `<moduleId>.<operation>`), which join the OpenAPI.
 */
export type CatalogModule = {
  readonly moduleId: string;
  readonly contracts: readonly ContractDefinition[];
  readonly endpoints?: readonly EndpointDefinition[];
};

/** `catalog.modules.ts` is malformed: raised before any artifact is written. */
export class ModuleCatalogError extends Error {
  readonly code = "INVALID_MODULE_CATALOG";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`${CATALOG_MODULES_FILE}: ${problems.join("; ")}`);
    this.name = "ModuleCatalogError";
    this.problems = problems;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// Structural check (not `instanceof`): the module resolves zod through its own node_modules link.
const isContractDefinition = (value: unknown): value is ContractDefinition =>
  isRecord(value) && typeof value["id"] === "string" && isRecord(value["meta"]) && isRecord(value["schema"]) && typeof value["schema"]["safeParse"] === "function";

const isEndpointDefinition = (value: unknown): value is EndpointDefinition =>
  isRecord(value) && typeof value["id"] === "string" && typeof value["path"] === "string" && typeof value["method"] === "string" && isRecord(value["responses"]);

const problemsOfEndpoints = (moduleId: string, endpoints: unknown): string[] => {
  if (endpoints === undefined) return [];
  if (!Array.isArray(endpoints)) return [`${moduleId} endpoints must be an array`];
  return endpoints.flatMap((endpoint: unknown, position) => {
    if (!isEndpointDefinition(endpoint)) return [`${moduleId} endpoints[${String(position)}] is not a defineEndpoint() result`];
    return endpoint.id.startsWith(`${moduleId}.`) ? [] : [`${endpoint.id} must start with ${moduleId}.`];
  });
};

const problemsOfModule = (entry: unknown, index: number): string[] => {
  if (!isRecord(entry) || typeof entry["moduleId"] !== "string" || !Array.isArray(entry["contracts"])) {
    return [`CATALOG_MODULES[${String(index)}] must be { moduleId, contracts, endpoints? }`];
  }
  const { moduleId, contracts } = entry as { moduleId: string; contracts: unknown[] };
  const contractProblems = contracts.flatMap((contract, position) => {
    if (!isContractDefinition(contract)) return [`${moduleId} contracts[${String(position)}] is not a defineContract() result`];
    return contract.id.startsWith(`${moduleId}.`) ? [] : [`${contract.id} must start with ${moduleId}.`];
  });
  return [...contractProblems, ...problemsOfEndpoints(moduleId, entry["endpoints"])];
};

const exists = async (file: string): Promise<boolean> => {
  try {
    await access(file);
    return true;
  } catch {
    // Absent file = no module installed; `access` has no other expected failure here.
    return false;
  }
};

/**
 * The modules listed in `<root>/catalog.modules.ts`, or none when the file is absent.
 * @throws {ModuleCatalogError} the list is malformed or an id is outside its module prefix.
 */
export const loadCatalogModules = async (root: string = WORKSPACE_ROOT): Promise<CatalogModule[]> => {
  const file = join(root, CATALOG_MODULES_FILE);
  if (!(await exists(file))) return [];
  const loaded = (await import(pathToFileURL(file).href)) as { CATALOG_MODULES?: unknown };
  const modules = loaded.CATALOG_MODULES;
  if (!Array.isArray(modules)) throw new ModuleCatalogError(["must export CATALOG_MODULES (an array)"]);
  const problems = modules.flatMap(problemsOfModule);
  if (problems.length > 0) throw new ModuleCatalogError(problems);
  return modules as CatalogModule[];
};

/** Contracts of the listed modules (see `loadCatalogModules`). */
export const loadModuleContracts = async (root: string = WORKSPACE_ROOT): Promise<ContractDefinition[]> =>
  (await loadCatalogModules(root)).flatMap((module) => [...module.contracts]);

/** `/v1` endpoints of the listed modules (see `loadCatalogModules`). */
export const loadModuleEndpoints = async (root: string = WORKSPACE_ROOT): Promise<EndpointDefinition[]> =>
  (await loadCatalogModules(root)).flatMap((module) => [...(module.endpoints ?? [])]);
