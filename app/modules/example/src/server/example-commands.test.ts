// @vitest-environment node
import { NoteIdSchema, PrincipalSchema, TenantIdSchema } from "@core/contracts";
import {
  createAccessCore,
  createInMemoryAccessStore,
  createInMemoryAuditLogWriter,
  fixedClock,
  inMemoryUnitOfWork,
  makeRecordAudit,
} from "@core/services";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { exampleManifest } from "../manifest.ts";
import { createExampleCommands } from "./example-commands.ts";
import { createInMemoryNoteRepository } from "./note-repository.ts";

const TENANT = TenantIdSchema.parse("Jd8sK2lPq0WnR5tYu3bV");
const OTHER_TENANT = TenantIdSchema.parse("Zz8sK2lPq0WnR5tYu3bV");
const NOW = "2026-10-01T12:00:00.000Z";
const user = (uid: string) => PrincipalSchema.parse({ type: "user", uid, mfa: false });
const MEMBER = user("uMember0000000000001");
const VIEWER = user("uViewer0000000000001");

const setup = () => {
  const readers = createInMemoryAccessStore();
  for (const id of [TENANT, OTHER_TENANT]) readers.putOrganization({ id });
  for (const principal of [MEMBER, VIEWER]) if (principal.type === "user") readers.putUser(principal.uid);
  readers.putGrant({
    tenantId: TENANT,
    principalId: "uMember0000000000001",
    nodeId: TENANT,
    roles: [{ kind: "system", key: "member" }],
  });
  readers.putGrant({
    tenantId: TENANT,
    principalId: "uViewer0000000000001",
    nodeId: TENANT,
    roles: [{ kind: "system", key: "viewer" }],
  });
  const access = createAccessCore({
    readers,
    permissions: [{ moduleId: exampleManifest.id, permissions: exampleManifest.permissions }],
  });
  const writer = createInMemoryAuditLogWriter();
  const clock = fixedClock(NOW);
  const notes = createInMemoryNoteRepository();
  // The in-memory repository and unit of work replace Firestore; the handle is never used.
  const firestore = {} as Firestore;
  const [create, archive] = createExampleCommands({
    firestore,
    access,
    audit: makeRecordAudit({ writer, clock }),
    clock,
    notes,
    unitOfWork: inMemoryUnitOfWork,
  });
  if (create === undefined || archive === undefined) throw new Error("the module must define two commands");
  return { create, archive, notes, writer };
};

const execution = (principal = MEMBER, tenantId = TENANT) =>
  ({
    principal,
    tenantId,
    node: { level: "organization", tenantId },
    requestId: "req-1",
    idempotencyKey: "run-1:call-1",
  }) as const;

describe("createExampleCommands", () => {
  it("defines the note commands from their contracts", () => {
    const { create, archive } = setup();
    expect(
      [create, archive].map(({ commandId, permission, targetContractId }) => ({
        commandId,
        permission,
        targetContractId,
      })),
    ).toEqual([
      { commandId: "example.CreateNoteCommand", permission: "example.note.create", targetContractId: "example.Note" },
      { commandId: "example.ArchiveNoteCommand", permission: "example.note.archive", targetContractId: "example.Note" },
    ]);
  });

  it("creates a note for a member and audits the note id, never its text", async () => {
    const { create, notes, writer } = setup();
    const output = await create.prepare({ title: "  Supplier follow-up ", body: "Call Ana on Monday." })?.(execution());
    const [note] = notes.all();
    expect(output).toEqual({ noteId: note?.id, title: "Supplier follow-up" });
    expect(note).toMatchObject({
      tenantId: TENANT,
      authorId: "uMember0000000000001",
      title: "Supplier follow-up",
      body: "Call Ana on Monday.",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const [entry] = writer.entries("tenant");
    expect(entry).toMatchObject({
      action: "MODULE_RECORD_CREATED",
      tenantId: TENANT,
      target: { type: "example-note", id: note?.id },
      actor: { type: "user", id: "uMember0000000000001" },
      outcome: "success",
      requestId: "req-1",
    });
    expect(JSON.stringify(entry)).not.toContain("Call Ana");
    expect(writer.transactions()).toHaveLength(1);
  });

  it("refuses a caller without example.note.create and writes nothing", async () => {
    const { create, notes, writer } = setup();
    await expect(create.prepare({ title: "Nope" })?.(execution(VIEWER))).rejects.toMatchObject({
      code: "COMMAND_REFUSED",
    });
    expect(notes.all()).toEqual([]);
    expect(writer.entries("tenant")).toEqual([]);
  });

  it("refuses a node of another organization", async () => {
    const { create, notes } = setup();
    const call = { ...execution(), node: { level: "organization", tenantId: OTHER_TENANT } } as const;
    await expect(create.prepare({ title: "Nope" })?.(call)).rejects.toMatchObject({ code: "COMMAND_REFUSED" });
    expect(notes.all()).toEqual([]);
  });

  it("rejects an input outside the contract (no tenant or author from the caller)", () => {
    const { create } = setup();
    expect(create.prepare({ title: "x", tenantId: OTHER_TENANT })).toBeNull();
    expect(create.prepare({ title: "" })).toBeNull();
  });

  it("archives a note once and audits the changed field", async () => {
    const { create, archive, notes, writer } = setup();
    await create.prepare({ title: "Old note" })?.(execution());
    const noteId = notes.all()[0]?.id;
    expect(await archive.prepare({ noteId })?.(execution())).toEqual({ noteId, archivedAt: NOW });
    expect(await archive.prepare({ noteId })?.(execution())).toEqual({ noteId, archivedAt: NOW });
    expect(notes.all()[0]).toMatchObject({ archivedAt: NOW });
    expect(writer.entries("tenant").map((entry) => [entry.action, entry.changes])).toEqual([
      ["MODULE_RECORD_CREATED", undefined],
      ["MODULE_RECORD_UPDATED", ["archivedAt"]],
    ]);
  });

  it("refuses to archive a note that is missing or belongs to another organization", async () => {
    const { archive } = setup();
    await expect(
      archive.prepare({ noteId: NoteIdSchema.parse("Xk2mQ9vLr3TnB7pWc1aZ") })?.(execution()),
    ).rejects.toMatchObject({ code: "COMMAND_REFUSED" });
  });
});
