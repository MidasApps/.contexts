import { EXAMPLE_ENDPOINTS } from "@core/module-example/contracts";
import { createExampleCommands, createExampleRoutes, type ExampleServerDeps } from "@core/module-example/server";
import type { ApiRouteDeps, ContractCommand } from "@core/services";
import type { CoreRoutes, CoreServerModule } from "@core/services/composition";
import { INSTALLED_MODULES } from "@/modules";

/**
 * Modules whose permissions, unit types and settings the server registers (decision 0015 §4): the
 * installed list of `src/modules.ts`; a `defineModule()` manifest satisfies `CoreServerModule`.
 */
export const serverModules: readonly CoreServerModule[] = INSTALLED_MODULES;

/**
 * The installed modules' entries of the command registry (decision 0025): approvals are decided
 * in `/v1`, so an approved agent command of a module runs here, through the same definition the
 * agent runtime derives its tool from (`apps/mastra/src/modules.ts`).
 */
export const createModuleCommands = (deps: ExampleServerDeps): ContractCommand[] => [...createExampleCommands(deps)];

/** Ids of the installed modules' `/v1` endpoints, so `route(endpointId)` accepts them (`src/server/core.ts`). */
export const MODULE_ENDPOINT_IDS: readonly string[] = EXAMPLE_ENDPOINTS.map((endpoint) => endpoint.id);

/** The installed modules' `/v1` handlers, served next to the core routes (`src/server/runtime-routes.ts`). */
export const createModuleRoutes = (deps: ExampleServerDeps & { readonly pipeline: ApiRouteDeps }): CoreRoutes => ({ ...createExampleRoutes(deps) });
