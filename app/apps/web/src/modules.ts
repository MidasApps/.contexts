import { exampleManifest } from "@core/module-example/manifest";

/**
 * Modules installed in the web app (decision 0015 §5): the only list of them. Manifests are data
 * only, so the server (`src/server/modules.ts`) and the client module list built in SP2 Task 18
 * both derive from here; no core package imports a module (umbrella D6).
 */
export const INSTALLED_MODULES = [exampleManifest] as const;
