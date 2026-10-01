import type { CoreServerModule } from "@core/services/composition";
import { INSTALLED_MODULES } from "@/modules";

/**
 * Modules whose permissions, unit types and settings the server registers (decision 0015 §4): the
 * installed list of `src/modules.ts`; a `defineModule()` manifest satisfies `CoreServerModule`.
 */
export const serverModules: readonly CoreServerModule[] = INSTALLED_MODULES;
