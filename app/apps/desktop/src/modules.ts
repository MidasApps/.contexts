import type { ClientModule } from "@core/client/app-shell";
import { exampleClientModule } from "@core/module-example/client";

/**
 * Modules installed in the desktop app (decision 0015 §5): the only place the desktop names a
 * module. Their pages open under `/o/:organizationId/p/:projectId/m/:moduleId/*` without route files.
 */
export const DESKTOP_MODULES: readonly ClientModule[] = [exampleClientModule];
