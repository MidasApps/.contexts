// Contracts the example module owns (`@core/module-example/contracts`). Data only and loadable by
// Node, so `pnpm contracts:catalog` can list them through `app/catalog.modules.ts`.
import { ExampleSettingsContract } from "./example-settings.schema.ts";
import { ArchiveNoteCommandContract, CreateNoteCommandContract } from "./note-commands.schema.ts";

export { ExampleSettingsContract, ExampleSettingsSchema, type ExampleSettings } from "./example-settings.schema.ts";
export {
  ArchiveNoteCommandContract,
  ArchiveNoteCommandSchema,
  CreateNoteCommandContract,
  CreateNoteCommandSchema,
  NOTE_PERMISSIONS,
  type ArchiveNoteCommand,
  type CreateNoteCommand,
} from "./note-commands.schema.ts";

/**
 * Every contract of the module, for the workspace catalog (ids `example.<Name>`). The note
 * commands act on the sample entity `example.Note`, which `@core/contracts` ships.
 */
export const EXAMPLE_CONTRACTS = [ExampleSettingsContract, CreateNoteCommandContract, ArchiveNoteCommandContract] as const;
