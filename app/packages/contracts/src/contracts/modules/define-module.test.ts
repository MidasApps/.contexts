import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineContract } from "../contract.ts";
import { MoneySchema } from "../primitives/money.schema.ts";
import { defineModule } from "./define-module.ts";
import { ModuleDefinitionError } from "./module-definition-error.ts";
import { type ModuleManifest, RESERVED_MODULE_IDS } from "./module-manifest.schema.ts";

const SettingsSchema = z.strictObject({
  greeting: z
    .string()
    .min(1)
    .max(80)
    .meta({ description: "Greeting.", pii: "none", ui: { labelKey: "sample.settings.greeting" } }),
  defaultBudget: MoneySchema.meta({
    description: "Default budget.",
    pii: "none",
    ui: { labelKey: "sample.settings.defaultBudget" },
  }),
});

const settingsContract = (kind: "settings" | "entity" = "settings") =>
  defineContract(SettingsSchema, {
    id: "sample.SampleSettings",
    kind,
    description: "Settings of the sample module.",
    examples: [{ greeting: "Hi", defaultBudget: { amountMinor: 1000, currency: "BRL" } }],
    pii: "none",
    tenancyScope: "organization",
    relations: [],
  });

const messages = {
  module: { name: "Amostra" },
  nav: { home: "Início" },
  permissions: { item: { read: "Ler itens", write: "Editar itens" } },
  unitTypes: { area: "Área" },
};

const validManifest = () => ({
  id: "sample",
  labelKey: "sample.module.name",
  permissions: [
    {
      id: "sample.item.read",
      descriptionKey: "sample.permissions.item.read",
      kind: "read",
      scope: "tenant",
      defaultRoles: ["owner", "viewer"],
    },
    {
      id: "sample.item.write",
      descriptionKey: "sample.permissions.item.write",
      kind: "write",
      scope: "tenant",
      defaultRoles: ["owner"],
    },
  ],
  unitTypes: [{ id: "sample.area", labelKey: "sample.unitTypes.area", allowedParents: ["project", "sample.area"] }],
  navigation: [
    {
      id: "home",
      slot: "project",
      labelKey: "sample.nav.home",
      icon: "layers",
      path: "",
      permission: "sample.item.read",
      order: 10,
    },
  ],
  settings: { contract: settingsContract(), readPermission: "sample.item.read", updatePermission: "sample.item.write" },
  messages: { "pt-BR": messages, "en-US": messages },
  agents: [{ id: "sample-helper" }],
  tools: [{ id: "sample.searchItems" }],
});

// Test manifests are built loosely (mutated per case); the cast keeps the runtime check under test.
const define = (manifest: unknown) => defineModule(manifest as ModuleManifest);

const problemsOf = (manifest: unknown): readonly string[] => {
  try {
    define(manifest);
  } catch (error: unknown) {
    if (error instanceof ModuleDefinitionError) return error.problems;
    throw error;
  }
  throw new Error("expected ModuleDefinitionError");
};

const expectProblem = (manifest: unknown, fragment: string) => {
  expect(problemsOf(manifest).some((problem) => problem.includes(fragment))).toBe(true);
};

describe("defineModule", () => {
  it("returns a valid manifest unchanged", () => {
    const manifest = validManifest();
    expect(define(manifest)).toBe(manifest);
  });

  it("accepts a minimal manifest (permissions and messages only)", () => {
    const manifest = {
      id: "minimal",
      labelKey: "minimal.name",
      permissions: [],
      messages: { "pt-BR": { name: "Mínimo" } },
    };
    expect(define(manifest).id).toBe("minimal");
  });

  it("rejects an id that is not kebab-case", () => {
    for (const id of ["Sample", "sample_mod", "-sample", "sample-", "1sample", ""]) {
      expectProblem({ ...validManifest(), id }, "id");
    }
  });

  it("rejects the reserved ids core, platform and every core message namespace", () => {
    expect(RESERVED_MODULE_IDS).toEqual(
      expect.arrayContaining([
        "core",
        "platform",
        "common",
        "errors",
        "shell",
        "auth",
        "profile",
        "settings",
        "admin",
        "permissions",
      ]),
    );
    for (const id of RESERVED_MODULE_IDS) expectProblem({ ...validManifest(), id }, "reserved");
  });

  it("requires permission ids to start with the module id", () => {
    const manifest = validManifest();
    manifest.permissions[0] = { ...manifest.permissions[0]!, id: "other.item.read" };
    expectProblem(manifest, "permissions[0].id must start with sample.");
  });

  it("rejects duplicate permission ids", () => {
    const manifest = validManifest();
    manifest.permissions[1] = { ...manifest.permissions[0]! };
    expectProblem(manifest, "duplicate permission sample.item.read");
  });

  it("rejects a permission definition that fails its schema (platform scope)", () => {
    const manifest = validManifest();
    manifest.permissions[0] = { ...manifest.permissions[0]!, scope: "platform" };
    expectProblem(manifest, "permissions.0");
  });

  it("requires unit type ids to start with the module id", () => {
    const manifest = validManifest();
    manifest.unitTypes[0] = { ...manifest.unitTypes[0]!, id: "other.area" };
    expectProblem(manifest, "unitTypes[0].id must start with sample.");
  });

  it("accepts only the navigation slots of the shell", () => {
    const manifest = validManifest();
    manifest.navigation[0] = { ...manifest.navigation[0]!, slot: "sidebar" };
    expectProblem(manifest, "navigation.0.slot");
  });

  it("rejects duplicate navigation ids and unknown navigation permissions", () => {
    const manifest = validManifest();
    manifest.navigation.push({ ...manifest.navigation[0]!, permission: "sample.item.delete" });
    const problems = problemsOf(manifest);
    expect(problems).toContain("duplicate navigation item home");
    expect(problems).toContain(
      "navigation[1].permission sample.item.delete is neither declared by the module nor a core permission",
    );
  });

  it("accepts a core permission on a navigation item", () => {
    const manifest = validManifest();
    manifest.navigation[0] = { ...manifest.navigation[0]!, permission: "core.project.read" };
    expect(() => define(manifest)).not.toThrow();
  });

  it("rejects a navigation path with a leading slash or params", () => {
    for (const path of ["/items", "items/:id", "Items"]) {
      const manifest = validManifest();
      manifest.navigation[0] = { ...manifest.navigation[0]!, path };
      expectProblem(manifest, "navigation.0.path");
    }
  });

  it("requires a settings contract of kind settings over an object schema", () => {
    const manifest = validManifest();
    expectProblem(
      { ...manifest, settings: { ...manifest.settings, contract: settingsContract("entity") } },
      "settings.contract must have kind settings",
    );
    const notObject = defineContract(z.string().meta({ description: "x", pii: "none" }), {
      id: "sample.Scalar",
      kind: "settings",
      description: "Scalar.",
      examples: ["x"],
      pii: "none",
      tenancyScope: "organization",
      relations: [],
    });
    expectProblem(
      { ...manifest, settings: { ...manifest.settings, contract: notObject } },
      "settings.contract must be an object schema",
    );
    expectProblem({ ...manifest, settings: { ...manifest.settings, contract: { id: "x" } } }, "settings.contract");
  });

  it("requires settings permissions declared by the module", () => {
    const manifest = validManifest();
    expectProblem(
      { ...manifest, settings: { ...manifest.settings, updatePermission: "core.organization.update" } },
      "settings.updatePermission",
    );
  });

  it("accepts any canonical BCP 47 locale and rejects non-canonical tags", () => {
    expect(() => define({ ...validManifest(), messages: { fr: messages } })).not.toThrow();
    expectProblem({ ...validManifest(), messages: { "pt-br": messages } }, "messages");
    expectProblem({ ...validManifest(), messages: {} }, "messages must have at least one locale");
  });

  it("requires message keys in the module namespace and present in every locale", () => {
    const manifest = validManifest();
    manifest.navigation[0] = { ...manifest.navigation[0]!, labelKey: "common.home" };
    expectProblem(manifest, "navigation[0].labelKey common.home must start with sample.");
    const missing = { ...validManifest(), messages: { "pt-BR": messages, "en-US": { ...messages, nav: {} } } };
    expectProblem(missing, "sample.nav.home is missing in en-US");
  });

  it("requires capability refs namespaced by the module id and unique per kind", () => {
    expectProblem(
      { ...validManifest(), agents: [{ id: "other-helper" }] },
      "agents[0].id must start with sample- or sample.",
    );
    expectProblem(
      { ...validManifest(), tools: [{ id: "sample.a" }, { id: "sample.a" }] },
      "duplicate tools ref sample.a",
    );
    expect(() =>
      define({ ...validManifest(), workflows: [{ id: "sample.nightly" }], skills: [{ id: "sample-faq" }] }),
    ).not.toThrow();
  });

  it("reports every problem at once with the module id", () => {
    const manifest = { ...validManifest(), labelKey: "other.name", agents: [{ id: "other-x" }] };
    try {
      define(manifest);
      expect.unreachable();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ModuleDefinitionError);
      const definitionError = error as ModuleDefinitionError;
      expect(definitionError.code).toBe("INVALID_MODULE");
      expect(definitionError.moduleId).toBe("sample");
      expect(definitionError.problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});
