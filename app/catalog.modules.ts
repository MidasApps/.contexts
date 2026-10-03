// Installed modules whose contracts join the generated catalog and whose `/v1` endpoints join the
// OpenAPI (`pnpm contracts:catalog` and `contracts:check`, decisions 0015 and 0063). A composition
// file like `apps/*/src/modules.ts`: add a module here when it is installed. @core/contracts loads
// this file by path and never imports a module.
import { EXAMPLE_CONTRACTS, EXAMPLE_ENDPOINTS } from "@core/module-example/contracts";

export const CATALOG_MODULES = [{ moduleId: "example", contracts: EXAMPLE_CONTRACTS, endpoints: EXAMPLE_ENDPOINTS }];
