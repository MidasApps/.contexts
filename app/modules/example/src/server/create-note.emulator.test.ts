import { randomBytes } from "node:crypto";
import { NoteIdSchema, PrincipalSchema, TenantIdSchema } from "@core/contracts";
import {
  createAccessCore,
  createFirebaseAdmin,
  createFirestoreAuditLogWriter,
  createInMemoryAccessStore,
  decodeCursor,
  makeRecordAudit,
  systemClock,
} from "@core/services";
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { exampleManifest } from "../manifest.ts";
import { createExampleNotes } from "./example-commands.ts";
import { createFirestoreNoteRepository, NOTES_COLLECTION } from "./note-repository.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`): the note use cases over the
// real Firestore repository, unit of work and audit writer. Access readers are in memory.
const RUN = randomBytes(4).toString("hex");
const TENANT = TenantIdSchema.parse(`EmuNotes${RUN}0000`.slice(0, 20));
const OTHER = TenantIdSchema.parse(`EmuOther${RUN}0000`.slice(0, 20));
const MEMBER = PrincipalSchema.parse({ type: "user", uid: "note-member-uid", mfa: false });
const VIEWER = PrincipalSchema.parse({ type: "user", uid: "note-viewer-uid", mfa: false });

const firebase = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});
const readers = createInMemoryAccessStore();
readers.putOrganization({ id: TENANT });
readers.putOrganization({ id: OTHER });
for (const [uid, key] of [
  ["note-member-uid", "member"],
  ["note-viewer-uid", "viewer"],
] as const) {
  readers.putUser(uid);
  readers.putGrant({ tenantId: TENANT, principalId: uid, nodeId: TENANT, roles: [{ kind: "system", key }] });
}
const access = createAccessCore({
  readers,
  permissions: [{ moduleId: exampleManifest.id, permissions: exampleManifest.permissions }],
});
const audit = makeRecordAudit({
  writer: createFirestoreAuditLogWriter({ firestore: firebase.firestore }),
  clock: systemClock,
});
const notes = createExampleNotes({ firestore: firebase.firestore, access, audit });
const command = (actor = MEMBER) =>
  ({ actor, tenantId: TENANT, node: { level: "organization", tenantId: TENANT }, requestId: `req-${RUN}` }) as const;
const auditOf = async (action: string) =>
  (await firebase.firestore.collection("audit-logs").where("tenantId", "==", TENANT).get()).docs
    .map((doc) => doc.data())
    .filter((entry) => entry["action"] === action);

describe("example notes (Firestore emulator)", () => {
  it("stores a note with the tenant, Firestore timestamps and a schema version, and audits it in the same transaction", async () => {
    const result = await notes.createNote({
      ...command(),
      input: { title: "Supplier follow-up", body: "Call Ana on Monday." },
    });
    if (!result.ok) throw new Error("the member may create notes");
    const stored = await firebase.firestore.collection(NOTES_COLLECTION).doc(result.data.id).get();
    expect(stored.data()).toMatchObject({
      tenantId: TENANT,
      authorId: "note-member-uid",
      title: "Supplier follow-up",
      body: "Call Ana on Monday.",
      schemaVersion: 1,
    });
    expect(stored.get("createdAt")).toBeInstanceOf(Timestamp);
    expect(stored.get("id")).toBeUndefined();
    const entries = await auditOf("MODULE_RECORD_CREATED");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      target: { type: "example-note", id: result.data.id },
      actor: { type: "user", id: "note-member-uid" },
      outcome: "success",
    });
    expect(JSON.stringify(entries)).not.toContain("Call Ana");
  });

  it("refuses a member without the permission and writes nothing", async () => {
    const before = (await firebase.firestore.collection(NOTES_COLLECTION).where("tenantId", "==", TENANT).get()).size;
    const result = await notes.createNote({ ...command(VIEWER), input: { title: "Viewer note" } });
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "PERMISSION_NOT_GRANTED" } });
    expect((await firebase.firestore.collection(NOTES_COLLECTION).where("tenantId", "==", TENANT).get()).size).toBe(
      before,
    );
  });

  it("reads a note of another organization as missing and archives its own once", async () => {
    const created = await notes.createNote({ ...command(), input: { title: "To archive" } });
    if (!created.ok) throw new Error("the member may create notes");
    const repository = createFirestoreNoteRepository({ firestore: firebase.firestore });
    expect(await repository.get(undefined, { tenantId: OTHER, noteId: created.data.id })).toBeNull();
    expect(await repository.get(undefined, { tenantId: TENANT, noteId: created.data.id })).toMatchObject({
      id: created.data.id,
      title: "To archive",
      body: "",
    });
    const archived = await notes.archiveNote({ ...command(), noteId: created.data.id });
    const again = await notes.archiveNote({ ...command(), noteId: created.data.id });
    expect(archived.ok && again.ok && archived.data.archivedAt === again.data.archivedAt).toBe(true);
    expect(
      (await auditOf("MODULE_RECORD_UPDATED")).filter(
        (entry) => (entry["target"] as { id?: string }).id === created.data.id,
      ),
    ).toHaveLength(1);
    expect(await notes.archiveNote({ ...command(), noteId: NoteIdSchema.parse("Missing0000000000001") })).toMatchObject(
      { ok: false, error: { code: "NOTE_NOT_FOUND" } },
    );
  });

  it("lists the organization's notes newest first in cursor pages and none of another organization", async () => {
    // One second apart and after every other note of this run, so the order does not depend on timing.
    let seconds = 0;
    const listing = createExampleNotes({
      firestore: firebase.firestore,
      access,
      audit,
      clock: { now: () => new Date(Date.UTC(2030, 0, 1, 0, 0, (seconds += 1))) },
    });
    for (const title of ["List one", "List two", "List three"]) {
      const created = await listing.createNote({ ...command(), input: { title } });
      if (!created.ok) throw new Error("the member may create notes");
    }
    const firstPage = await notes.listNotes({ actor: VIEWER, tenantId: TENANT, page: { after: undefined, limit: 2 } });
    const after = firstPage.ok && firstPage.data.nextCursor !== null ? decodeCursor(firstPage.data.nextCursor) : null;
    if (!firstPage.ok || after === null) throw new Error("expected a second page");
    const rest = await notes.listNotes({ actor: VIEWER, tenantId: TENANT, page: { after, limit: 100 } });
    if (!rest.ok) throw new Error("the viewer may read notes");
    const listed = [...firstPage.data.items, ...rest.data.items];
    expect(listed.slice(0, 3).map((note) => note.title)).toEqual(["List three", "List two", "List one"]);
    expect(new Set(listed.map((note) => note.id)).size).toBe(listed.length);
    expect(listed.every((note) => note.tenantId === TENANT)).toBe(true);
    const other = await notes.listNotes({ actor: MEMBER, tenantId: OTHER, page: { after: undefined, limit: 20 } });
    expect(other).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
  });
});
