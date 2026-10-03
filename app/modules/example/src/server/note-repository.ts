import { type Note, type NoteId, NoteIdSchema, NoteSchema, type TenantId } from "@core/contracts";
import { CORE_SCHEMA_VERSION, CorruptDocumentError, type CursorPosition, type Page, pageFromOverfetch, type PageRequest } from "@core/services";
import { type DocumentData, FieldPath, type Firestore, Timestamp, type Transaction } from "firebase-admin/firestore";

/** Top-level collection of the module's notes; Security Rules deny every client (`firestore.rules`). */
export const NOTES_COLLECTION = "notes";

/** Driven port of the note use cases; writes join the caller's transaction. */
export type NoteRepository = {
  readonly newId: () => NoteId;
  /** A note of another organization reads as missing. */
  readonly get: (tx: Transaction | undefined, args: { tenantId: TenantId; noteId: NoteId }) => Promise<Note | null>;
  /** The organization's notes, newest first (index `notes tenantId + createdAt desc`); the cursor is `[createdAt, id]`. */
  readonly list: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<Note>>;
  readonly create: (tx: Transaction, note: Note) => void;
  readonly replace: (tx: Transaction, note: Note) => void;
};

const positionOf = (note: Note): CursorPosition => [note.createdAt, note.id];

const TIMESTAMP_FIELDS =["createdAt", "updatedAt", "archivedAt"] as const;

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
    list: async ({ tenantId, page }) => {
      let query = collection().where("tenantId", "==", tenantId).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (page.after !== undefined) query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.flatMap((doc) => fromSnapshot(doc) ?? []);
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf });
    },
    create: (tx, note) => void tx.create(collection().doc(note.id), toDocument(note)),
    replace: (tx, note) => void tx.set(collection().doc(note.id), toDocument(note)),
  };
};

// Code-unit order like Firestore (ISO dates sort as text); positive when `left` comes after `right` newest first.
const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const compareDescending = (left: CursorPosition, right: CursorPosition): number =>
  left[0] === right[0] ? compareText(right[1], left[1]) : compareText(right[0], left[0]);

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
    // Same order and cursor as Firestore: `(createdAt, id)` descending, starting after `page.after`.
    list: ({ tenantId, page }) => {
      const { after } = page;
      const own = [...notes.values()].filter((note) => note.tenantId === tenantId && (after === undefined || compareDescending(positionOf(note), after) > 0));
      const fetched = own.sort((left, right) => compareDescending(positionOf(left), positionOf(right))).slice(0, page.limit + 1);
      return Promise.resolve(pageFromOverfetch({ fetched, limit: page.limit, positionOf }));
    },
    create: (_tx, note) => void notes.set(note.id, note),
    replace: (_tx, note) => void notes.set(note.id, note),
  };
};
