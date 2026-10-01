// Contracts the example module owns (`@core/module-example/contracts`). Data only and loadable by
// Node, so `pnpm contracts:catalog` can list them through `app/catalog.modules.ts`.
import { ExampleSettingsContract } from "./example-settings.schema.ts";

export { ExampleSettingsContract, ExampleSettingsSchema, type ExampleSettings } from "./example-settings.schema.ts";

/** Every contract of the module, for the workspace catalog (ids `example.<Name>`). */
export const EXAMPLE_CONTRACTS = [ExampleSettingsContract] as const;
