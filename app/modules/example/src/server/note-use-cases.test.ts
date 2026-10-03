// @vitest-environment node
import { type Note, NoteIdSchema, PrincipalSchema, TenantIdSchema, UserIdSchema } from "@core/contracts";
import { createAccessCore, createInMemoryAccessStore, decodeCursor, inMemoryUnitOfWork } from "@core/services";
import { describe, expect, it } from "vitest";
import { exampleManifest } from "../manifest.ts";
import { createInMemoryNoteRepository } from "./note-repository.ts";
import { makeListNotes } from "./note-use-cases.ts";

const TENANT = TenantIdSchema.parse("Jd8sK2lPq0WnR5tYu3bV");
const OTHER_TENANT = TenantIdSchema.parse("Zz8sK2lPq0WnR5tYu3bV");
const VIEWER = PrincipalSchema.parse({ type: "user", uid: "uViewer0000000000001", mfa: false });
const STRANGER = PrincipalSchema.parse({ type: "user", uid: "uStranger00000000001", mfa: false });

const note = (args: { id: string; tenantId?: typeof TENANT; createdAt: string }): Note => ({
  id: NoteIdSchema.parse(args.id),
  tenantId: args.tenantId ?? TENANT,
  authorId: UserIdSchema.parse("uViewer0000000000001"),
  title: `Note ${args.id}`,
  body: "",
  createdAt: args.createdAt,
  updatedAt: args.createdAt,
});

const setup = async (notes: readonly Note[]) => {
  const readers = createInMemoryAccessStore();
  for (const id of [TENANT, OTHER_TENANT]) readers.putOrganization({ id });
  for (const uid of ["uViewer0000000000001", "uStranger00000000001"]) readers.putUser(uid);
  readers.putGrant({ tenantId: TENANT, principalId: "uViewer0000000000001", nodeId: TENANT, roles: [{ kind: "system", key: "viewer" }] });
  const access = createAccessCore({ readers, permissions: [{ moduleId: exampleManifest.id, permissions: exampleManifest.permissions }] });
  const repository = createInMemoryNoteRepository();
  await inMemoryUnitOfWork.run((tx) => Promise.resolve(notes.forEach((item) => repository.create(tx, item))));
  return { listNotes: makeListNotes({ notes: repository, access }) };
};

const query = (actor = VIEWER, page: { after?: readonly [string, string]; limit: number } = { limit: 20 }) =>
  ({ actor, tenantId: TENANT, page: { after: page.after, limit: page.limit } }) as const;

describe("makeListNotes", () => {
  it("lists the organization's notes newest first for a member with example.note.read", async () => {
    const { listNotes } = await setup([
      note({ id: "NoteOld0000000000001", createdAt: "2026-10-01T09:00:00.000Z" }),
      note({ id: "NoteNew0000000000001", createdAt: "2026-10-02T09:00:00.000Z" }),
      note({ id: "NoteOther00000000001", tenantId: OTHER_TENANT, createdAt: "2026-10-02T10:00:00.000Z" }),
    ]);

    const result = await listNotes(query());

    expect(result.ok && result.data.items.map((item) => item.id)).toEqual(["NoteNew0000000000001", "NoteOld0000000000001"]);
    expect(result.ok && result.data.nextCursor).toBeNull();
  });

  it("continues on the next page from the cursor", async () => {
    const { listNotes } = await setup(
      ["01", "02", "03"].map((day) => note({ id: `Note${day}00000000000001`.slice(0, 20), createdAt: `2026-10-${day}T09:00:00.000Z` })),
    );

    const first = await listNotes(query(VIEWER, { limit: 2 }));
    const after = first.ok && first.data.nextCursor !== null ? decodeCursor(first.data.nextCursor) : null;
    if (!first.ok || after === null) throw new Error("expected a second page");
    const second = await listNotes(query(VIEWER, { after, limit: 2 }));

    expect(first.data.items.map((item) => item.createdAt.slice(8, 10))).toEqual(["03", "02"]);
    expect(second.ok && second.data.items.map((item) => item.createdAt.slice(8, 10))).toEqual(["01"]);
  });

  it("refuses a principal without a grant in the organization", async () => {
    const { listNotes } = await setup([note({ id: "NoteOld0000000000001", createdAt: "2026-10-01T09:00:00.000Z" })]);

    expect(await listNotes(query(STRANGER))).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
  });
});
