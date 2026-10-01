import { createExampleCommands, type ExampleServerDeps } from "@core/module-example/server";
import type { ContractCommand } from "@core/services";
import type { CoreServerModule } from "@core/services/composition";
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
