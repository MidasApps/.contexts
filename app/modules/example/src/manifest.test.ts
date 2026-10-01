import { CORE_PERMISSIONS, defineModule, ModuleManifestSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { EXAMPLE_CONTRACTS } from "./contracts/index.ts";
import { exampleManifest } from "./manifest.ts";

describe("exampleManifest", () => {
  it("is a valid module manifest", () => {
    expect(ModuleManifestSchema.safeParse(exampleManifest).success).toBe(true);
    expect(defineModule(exampleManifest)).toBe(exampleManifest);
  });

  it("declares read and write permissions with the SP2 default roles", () => {
    expect(exampleManifest.permissions.map(({ id, kind, defaultRoles }) => ({ id, kind, defaultRoles }))).toEqual([
      { id: "example.item.read", kind: "read", defaultRoles: ["owner", "admin", "member", "viewer"] },
      { id: "example.item.write", kind: "write", defaultRoles: ["owner", "admin"] },
      { id: "example.note.read", kind: "read", defaultRoles: ["owner", "admin", "member", "viewer"] },
      { id: "example.note.create", kind: "write", defaultRoles: ["owner", "admin", "member"] },
      { id: "example.note.archive", kind: "write", defaultRoles: ["owner", "admin", "member"] },
    ]);
    expect(exampleManifest.permissions.filter((permission) => "requiresApproval" in permission && permission.requiresApproval).map((permission) => permission.id)).toEqual(["example.note.archive"]);
    const coreIds = new Set(CORE_PERMISSIONS.map((permission) => permission.id));
    expect(exampleManifest.permissions.some((permission) => coreIds.has(permission.id))).toBe(false);
  });

  it("declares the example.area unit type under projects and other areas", () => {
    expect(exampleManifest.unitTypes).toEqual([{ id: "example.area", labelKey: "example.unitTypes.area", allowedParents: ["project", "example.area"] }]);
  });

  it("adds one project navigation item at the module root, gated by the read permission", () => {
    expect(exampleManifest.navigation).toEqual([
      { id: "home", slot: "project", labelKey: "example.nav.home", icon: "puzzle", path: "", permission: "example.item.read", order: 100 },
    ]);
  });

  it("uses the settings contract listed for the catalog, read with read and changed with write", () => {
    expect(exampleManifest.settings.contract.id).toBe("example.ExampleSettings");
    expect(exampleManifest.settings.contract.meta.kind).toBe("settings");
    expect(EXAMPLE_CONTRACTS).toContain(exampleManifest.settings.contract);
    expect(exampleManifest.settings).toMatchObject({ readPermission: "example.item.read", updatePermission: "example.item.write" });
  });

  it("ships messages for the three supported locales with the same keys", () => {
    const keysOf = (tree: unknown, prefix = ""): string[] =>
      Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === "string" ? [`${prefix}${key}`] : keysOf(value, `${prefix}${key}.`),
      );
    expect(Object.keys(exampleManifest.messages).sort()).toEqual(["en-US", "es-419", "pt-BR"]);
    const source = keysOf(exampleManifest.messages["pt-BR"]).sort();
    expect(keysOf(exampleManifest.messages["en-US"]).sort()).toEqual(source);
    expect(keysOf(exampleManifest.messages["es-419"]).sort()).toEqual(source);
  });

  it("names the skill and the workflow its agent entry implements; commands are contracts, not tool refs", () => {
    expect({ agents: exampleManifest.agents, tools: exampleManifest.tools, workflows: exampleManifest.workflows, skills: exampleManifest.skills }).toEqual({
      agents: [],
      tools: [],
      workflows: [{ id: "example-note-intake" }],
      skills: [{ id: "example-notes" }],
    });
  });

  it("lists its command contracts for the catalog with permissions the manifest declares", () => {
    const commands = EXAMPLE_CONTRACTS.filter((contract) => contract.meta.kind === "command");
    expect(commands.map((contract) => [contract.id, contract.meta.permission])).toEqual([
      ["example.CreateNoteCommand", "example.note.create"],
      ["example.ArchiveNoteCommand", "example.note.archive"],
    ]);
    const declared = new Set<string>(exampleManifest.permissions.map((permission) => permission.id));
    expect(commands.every((contract) => contract.meta.permission !== undefined && declared.has(contract.meta.permission))).toBe(true);
  });
});
