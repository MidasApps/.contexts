// Server entry of the example module (`@core/module-example/server`): no React, loadable by the
// web server (`/v1`, where approvals are decided) and by the agent runtime (`apps/mastra`).
export { createExampleCommands, createExampleNotes, type ExampleNotes, type ExampleServerDeps } from "./example-commands.ts";
export { createFirestoreNoteRepository, createInMemoryNoteRepository, NOTES_COLLECTION, type InMemoryNoteRepository, type NoteRepository } from "./note-repository.ts";
export { makeArchiveNote, makeCreateNote, NOTE_AUDIT_TARGET, NoteNotFoundError, type ArchiveNote, type CreateNote, type NoteCommand, type NotesDeps } from "./note-use-cases.ts";
