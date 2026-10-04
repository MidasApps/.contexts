import {
  type Note,
  type NoteId,
  type Principal,
  type TenantId,
  type TenantNodeRef,
  UserIdSchema,
} from "@core/contracts";
import {
  type AccessCore,
  AccessDeniedError,
  type AuditWriter,
  auditActorOf,
  type Clock,
  err,
  ok,
  type Page,
  type PageRequest,
  type Result,
  type UnitOfWork,
} from "@core/services";
import { type CreateNoteCommand, NOTE_PERMISSIONS } from "../contracts/note-commands.schema.ts";
import type { NoteRepository } from "./note-repository.ts";

/** Audit `target.type` of a note (`MODULE_RECORD_*` actions). */
export const NOTE_AUDIT_TARGET = "example-note";

export type NotesDeps = {
  readonly notes: NoteRepository;
  readonly access: Pick<AccessCore, "forRequest">;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
};

/** Who acts, where and for which request; the tenant and the node come from the server, never from a body or a model. */
export type NoteCommand = {
  readonly actor: Principal;
  readonly tenantId: TenantId;
  readonly node: TenantNodeRef;
  readonly requestId: string;
};

/** The note does not exist in the caller's organization. */
export class NoteNotFoundError extends Error {
  readonly code = "NOTE_NOT_FOUND";
  readonly noteId: NoteId;

  constructor(noteId: NoteId) {
    super("note not found");
    this.name = "NoteNotFoundError";
    this.noteId = noteId;
  }
}

const authorizeAt = async (
  deps: NotesDeps,
  command: NoteCommand,
  permission: string,
): Promise<Result<void, AccessDeniedError>> => {
  if (command.node.tenantId !== command.tenantId) return err(new AccessDeniedError("NODE_NOT_FOUND"));
  const decision = await deps.access
    .forRequest()
    .authorize({ principal: command.actor, permission, node: command.node });
  return decision.allowed ? ok(undefined) : err(new AccessDeniedError(decision.reason));
};

const auditFields = (command: NoteCommand, note: Note) =>
  ({
    log: "tenant",
    tenantId: note.tenantId,
    actor: auditActorOf(command.actor),
    target: { type: NOTE_AUDIT_TARGET, id: note.id },
    node: command.node,
    outcome: "success",
    requestId: command.requestId,
  }) as const;

/**
 * Creates a note (`example.note.create` at the caller's node) and audits `MODULE_RECORD_CREATED`
 * in the same transaction. The audit entry carries the note id only, never its text.
 */
export const makeCreateNote =
  (deps: NotesDeps) =>
  async (command: NoteCommand & { readonly input: CreateNoteCommand }): Promise<Result<Note, AccessDeniedError>> => {
    const allowed = await authorizeAt(deps, command, NOTE_PERMISSIONS.create);
    if (!allowed.ok) return allowed;
    const now = deps.clock.now().toISOString();
    const note: Note = {
      id: deps.notes.newId(),
      tenantId: command.tenantId,
      // The author is the acting principal's id (uid, device id or API key id).
      authorId: UserIdSchema.parse(auditActorOf(command.actor).id),
      title: command.input.title,
      body: command.input.body ?? "",
      createdAt: now,
      updatedAt: now,
    };
    await deps.unitOfWork.run(async (tx) => {
      deps.notes.create(tx, note);
      await deps.audit.record({ ...auditFields(command, note), action: "MODULE_RECORD_CREATED" }, tx);
    });
    return ok(note);
  };

/**
 * Archives a note (`example.note.archive`). The permission needs four eyes: the entry points
 * (agent tool pipeline, SP1 approval requests) hold the action until a second member approves;
 * this use case checks the caller's own right and runs. Archiving twice keeps the first date.
 */
export const makeArchiveNote =
  (deps: NotesDeps) =>
  async (
    command: NoteCommand & { readonly noteId: NoteId },
  ): Promise<Result<Note, AccessDeniedError | NoteNotFoundError>> => {
    const allowed = await authorizeAt(deps, command, NOTE_PERMISSIONS.archive);
    if (!allowed.ok) return allowed;
    const now = deps.clock.now().toISOString();
    const archived = await deps.unitOfWork.run(async (tx) => {
      const note = await deps.notes.get(tx, { tenantId: command.tenantId, noteId: command.noteId });
      if (note === null || note.archivedAt !== undefined) return note;
      const next: Note = { ...note, archivedAt: now, updatedAt: now };
      deps.notes.replace(tx, next);
      await deps.audit.record(
        { ...auditFields(command, next), action: "MODULE_RECORD_UPDATED", changes: ["archivedAt"] },
        tx,
      );
      return next;
    });
    return archived === null ? err(new NoteNotFoundError(command.noteId)) : ok(archived);
  };

/**
 * Lists the organization's notes, newest first, archived ones included (`example.note.read` at
 * the organization: notes belong to the tenant, not to a project). Reads are not audited.
 */
export const makeListNotes =
  (deps: Pick<NotesDeps, "notes" | "access">) =>
  async (query: {
    readonly actor: Principal;
    readonly tenantId: TenantId;
    readonly page: PageRequest;
  }): Promise<Result<Page<Note>, AccessDeniedError>> => {
    const node = { level: "organization", tenantId: query.tenantId } as const;
    const decision = await deps.access
      .forRequest()
      .authorize({ principal: query.actor, permission: NOTE_PERMISSIONS.read, node });
    if (!decision.allowed) return err(new AccessDeniedError(decision.reason));
    return ok(await deps.notes.list({ tenantId: query.tenantId, page: query.page }));
  };

export type CreateNote = ReturnType<typeof makeCreateNote>;
export type ListNotes = ReturnType<typeof makeListNotes>;
export type ArchiveNote = ReturnType<typeof makeArchiveNote>;
