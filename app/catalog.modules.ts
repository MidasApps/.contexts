// Installed modules whose contracts join the generated catalog (`pnpm contracts:catalog` and
// `contracts:check`, decision 0015). A composition file like `apps/*/src/modules.ts`: add a module
// here when it is installed. @core/contracts loads this file by path and never imports a module.
import { EXAMPLE_CONTRACTS } from "@core/module-example/contracts";

export const CATALOG_MODULES = [{ moduleId: "example", contracts: EXAMPLE_CONTRACTS }];
