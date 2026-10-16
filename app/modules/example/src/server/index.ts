// Server entry of the example module (`@core/module-example/server`): no React, loadable by the
// web server (`/v1`, where approvals are decided) and by the agent runtime (`apps/mastra`).
export {
  createExampleCommands,
  createExampleNotes,
  type ExampleNotes,
  type ExampleServerDeps,
} from "./example-commands.ts";
export { createExampleRoutes } from "./example-routes.ts";
export {
  createExampleLabels,
  createPostgresLabelRepository,
  EXAMPLE_RUNTIME_ROLE,
  type Label,
  LabelNotReturnedError,
  type LabelRepository,
} from "./label-repository.ts";
export {
  createFirestoreNoteRepository,
  createInMemoryNoteRepository,
  type InMemoryNoteRepository,
  NOTES_COLLECTION,
  type NoteRepository,
} from "./note-repository.ts";
export {
  type ArchiveNote,
  type CreateNote,
  type ListNotes,
  makeArchiveNote,
  makeCreateNote,
  makeListNotes,
  NOTE_AUDIT_TARGET,
  type NoteCommand,
  NoteNotFoundError,
  type NotesDeps,
} from "./note-use-cases.ts";
