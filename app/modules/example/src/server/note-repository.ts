import { type Note, type NoteId, NoteIdSchema, NoteSchema, type TenantId } from "@core/contracts";
import { CORE_SCHEMA_VERSION, CorruptDocumentError } from "@core/services";
import { type DocumentData, type Firestore, Timestamp, type Transaction } from "firebase-admin/firestore";

/** Top-level collection of the module's notes; Security Rules deny every client (`firestore.rules`). */
export const NOTES_COLLECTION = "notes";

/** Driven port of the note use cases; writes join the caller's transaction. */
export type NoteRepository = {
  readonly newId: () => NoteId;
  /** A note of another organization reads as missing. */
  readonly get: (tx: Transaction | undefined, args: { tenantId: TenantId; noteId: NoteId }) => Promise<Note | null>;
  readonly create: (tx: Transaction, note: Note) => void;
  readonly replace: (tx: Transaction, note: Note) => void;
};

const TIMESTAMP_FIELDS = ["createdAt", "updatedAt", "archivedAt"] as const;

const toDocument = (note: Note): DocumentData => {
  const { id, ...fields } = note;
  void id;
  const timestamps = Object.fromEntries(TIMESTAMP_FIELDS.flatMap((key) => (note[key] === undefined ? [] : [[key, Timestamp.fromDate(new Date(note[key]))]])));
  return { ...fields, ...timestamps, schemaVersion: CORE_SCHEMA_VERSION };
};

/** @throws {CorruptDocumentError} when the stored document does not match `example.Note`. */
const fromSnapshot = (snapshot: { id: string; ref: { path: string }; data: () => DocumentData | undefined }): Note | null => {
  const data = snapshot.data();
  if (data === undefined) return null;
  const { schemaVersion, ...fields } = data;
  void schemaVersion;
  for (const key of TIMESTAMP_FIELDS) if (fields[key] instanceof Timestamp) fields[key] = fields[key].toDate().toISOString();
  const parsed = NoteSchema.safeParse({ ...fields, id: snapshot.id });
  if (parsed.success) return parsed.data;
  throw new CorruptDocumentError({ documentPath: snapshot.ref.path, issuePaths: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))] });
};

/**
 * Firestore `NoteRepository` over `notes/{autoId}`: automatic ids (framework ADR 0005),
 * `tenantId` on every document, timestamps as Firestore `Timestamp`, `schemaVersion`.
 */
export const createFirestoreNoteRepository = (deps: { firestore: Firestore }): NoteRepository => {
  const collection = () => deps.firestore.collection(NOTES_COLLECTION);
  return {
    newId: () => NoteIdSchema.parse(collection().doc().id),
    get: async (tx, { tenantId, noteId }) => {
      const ref = collection().doc(noteId);
      const note = fromSnapshot(tx === undefined ? await ref.get() : await tx.get(ref));
      return note?.tenantId === tenantId ? note : null;
    },
    create: (tx, note) => void tx.create(collection().doc(note.id), toDocument(note)),
    replace: (tx, note) => void tx.set(collection().doc(note.id), toDocument(note)),
  };
};

export type InMemoryNoteRepository = NoteRepository & { readonly all: () => readonly Note[] };

/** In-memory `NoteRepository` for unit tests; ids are 20-character strings ending in a counter. */
export const createInMemoryNoteRepository = (): InMemoryNoteRepository => {
  const notes = new Map<string, Note>();
  return {
    all: () => [...notes.values()],
    newId: () => NoteIdSchema.parse(`note${String(notes.size + 1).padStart(16, "0")}`),
    get: (_tx, { tenantId, noteId }) => {
      const note = notes.get(noteId);
      return Promise.resolve(note?.tenantId === tenantId ? note : null);
    },
    create: (_tx, note) => void notes.set(note.id, note),
    replace: (_tx, note) => void notes.set(note.id, note),
  };
};
