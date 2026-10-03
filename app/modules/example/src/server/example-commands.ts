import {
  type AccessCore,
  AgentCommandError,
  type AuditWriter,
  type Clock,
  type ContractCommand,
  createFirestoreUnitOfWork,
  defineContractCommand,
  systemClock,
  type UnitOfWork,
} from "@core/services";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { ArchiveNoteCommandContract, CreateNoteCommandContract } from "../contracts/note-commands.schema.ts";
import { createFirestoreNoteRepository, type NoteRepository } from "./note-repository.ts";
import { type ArchiveNote, type CreateNote, type ListNotes, makeArchiveNote, makeCreateNote, makeListNotes, type NotesDeps } from "./note-use-cases.ts";

/** What the apps hand to the module's server side: the core server's access, audit and Firestore. */
export type ExampleServerDeps = {
  readonly firestore: Firestore;
  readonly access: Pick<AccessCore, "forRequest">;
  readonly audit: AuditWriter;
  readonly clock?: Clock;
  /** Test seams (in-memory repository and unit of work). */
  readonly notes?: NoteRepository;
  readonly unitOfWork?: UnitOfWork;
};

export type ExampleNotes = { readonly createNote: CreateNote; readonly archiveNote: ArchiveNote; readonly listNotes: ListNotes };

/** The module's note use cases over Firestore `notes`. */
export const createExampleNotes = (deps: ExampleServerDeps): ExampleNotes => {
  const bound: NotesDeps = {
    notes: deps.notes ?? createFirestoreNoteRepository({ firestore: deps.firestore }),
    access: deps.access,
    audit: deps.audit,
    unitOfWork: deps.unitOfWork ?? createFirestoreUnitOfWork({ firestore: deps.firestore }),
    clock: deps.clock ?? systemClock,
  };
  return { createNote: makeCreateNote(bound), archiveNote: makeArchiveNote(bound), listNotes: makeListNotes(bound) };
};

const TARGET_CONTRACT = "example.Note";

/**
 * The module's entries of the command registry (decision 0025). Each one is defined once, from
 * its command contract: the agent tool `command.example.<Name>`, the `agent-command` approval
 * handler (four eyes, `/v1`) and workflows run the same use case with the same schema and
 * permission. The apps add them next to the core commands in their composition files.
 */
export const createExampleCommands = (deps: ExampleServerDeps): ContractCommand[] => {
  const notes = createExampleNotes(deps);
  return [
    defineContractCommand({
      contract: CreateNoteCommandContract,
      targetContractId: TARGET_CONTRACT,
      outputSchema: z.strictObject({ noteId: z.string().min(1), title: z.string().min(1) }),
      summarize: (input) => `Create the note "${input.title}"`,
      preview: (input) => ({ before: null, after: { title: input.title, hasBody: (input.body ?? "") !== "" } }),
      execute: async ({ principal, tenantId, node, input, requestId }) => {
        const result = await notes.createNote({ actor: principal, tenantId, node, requestId, input });
        if (!result.ok) throw new AgentCommandError("COMMAND_REFUSED", CreateNoteCommandContract.id, { cause: result.error });
        return { noteId: result.data.id, title: result.data.title };
      },
    }),
    defineContractCommand({
      contract: ArchiveNoteCommandContract,
      targetContractId: TARGET_CONTRACT,
      outputSchema: z.strictObject({ noteId: z.string().min(1), archivedAt: z.string().min(1) }),
      summarize: (input) => `Archive the note ${input.noteId}`,
      execute: async ({ principal, tenantId, node, input, requestId }) => {
        const result = await notes.archiveNote({ actor: principal, tenantId, node, requestId, noteId: input.noteId });
        if (!result.ok) throw new AgentCommandError("COMMAND_REFUSED", ArchiveNoteCommandContract.id, { cause: result.error });
        return { noteId: result.data.id, archivedAt: result.data.archivedAt ?? result.data.updatedAt };
      },
    }),
  ];
};
