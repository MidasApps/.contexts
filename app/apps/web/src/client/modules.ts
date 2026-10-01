import type { ClientModule } from "@core/client/app-shell";
import { exampleClientModule } from "@core/module-example/client";

/**
 * Client side of the installed modules (decision 0015 §5): one `defineClientModule()` per entry of
 * `src/modules.ts` (the manifests the server registers). A module installed on the server but
 * missing here would have permissions and settings without pages.
 */
export const WEB_CLIENT_MODULES: readonly ClientModule[] = [exampleClientModule];
