import type { CoreServerModule } from "@core/services/composition";

/**
 * Modules whose permissions (and, from later tasks, unit types and settings) the server
 * registers (decision 0015 §4). Empty in SP1; the app's installed modules go here.
 */
export const serverModules: readonly CoreServerModule[] = [];
