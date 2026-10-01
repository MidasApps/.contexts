import { CORE_MESSAGES, SOURCE_LOCALE } from "@core/i18n";
import { defineContract, defineModule, RESERVED_MODULE_IDS, type ModuleManifest } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ClientModuleError, defineClientModule, type ModulePageProps } from "./define-client-module.ts";
import { createModuleRegistry, ModuleRegistryError } from "./module-registry.ts";

const Page = (props: ModulePageProps) => props.moduleId;
const load = () => Promise.resolve({ default: Page });

const settingsContract = defineContract(z.strictObject({ greeting: z.string().meta({ description: "Greeting.", pii: "none" }) }), {
  id: "sample.SampleSettings",
  kind: "settings",
  description: "Sample settings.",
  examples: [{ greeting: "Oi" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});

const manifestOf = (id: string, overrides: Partial<ModuleManifest> = {}): ModuleManifest =>
  defineModule({
    id,
    labelKey: `${id}.module.name`,
    permissions: [{ id: `${id}.item.read`, descriptionKey: `${id}.perm`, kind: "read", scope: "tenant", defaultRoles: ["viewer"] }],
    navigation: [{ id: "home", slot: "project", labelKey: `${id}.module.name`, icon: "layers", path: "", permission: `${id}.item.read`, order: 5 }],
    messages: { "pt-BR": { module: { name: "Módulo" }, perm: "Ler" }, "en-US": { module: { name: "Module" }, perm: "Read" } },
    ...overrides,
  });

describe("defineClientModule", () => {
  it("keeps the manifest and lazy pages keyed by path", () => {
    const module = defineClientModule({ manifest: manifestOf("sample"), pages: { "": load, "items/:itemId": load } });
    expect(module.manifest.id).toBe("sample");
    expect(Object.keys(module.pages)).toEqual(["", "items/:itemId"]);
  });

  it("rejects bad page keys, unknown icons, unroutable slots and nav paths without a page", () => {
    const manifest = manifestOf("sample", {
      navigation: [
        { id: "home", slot: "project", labelKey: "sample.module.name", icon: "not-an-icon", path: "missing" },
        { id: "org", slot: "organization", labelKey: "sample.module.name", icon: "layers", path: "" },
      ],
    });
    try {
      defineClientModule({ manifest, pages: { "/bad": load } });
      expect.unreachable();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ClientModuleError);
      expect((error as ClientModuleError).problems).toEqual([
        "page key /bad must be a relative path of segments or :params",
        "navigation home: unknown icon not-an-icon",
        "navigation home: no page matches path missing",
        "navigation org: modules cannot add items to the organization slot (no module route there)",
      ]);
    }
  });
});

describe("createModuleRegistry", () => {
  const sample = defineClientModule({ manifest: manifestOf("sample", { settings: { contract: settingsContract, readPermission: "sample.item.read", updatePermission: "sample.item.read" } }), pages: { "": load, "items/:itemId": load } });
  const other = defineClientModule({ manifest: manifestOf("other"), pages: { "": load } });

  it("rejects two modules with the same id", () => {
    expect(() => createModuleRegistry([sample, sample])).toThrow(ModuleRegistryError);
  });

  it("merges messages under each module id", () => {
    const registry = createModuleRegistry([sample, other]);
    expect(registry.messages()).toEqual({
      sample: { "pt-BR": { module: { name: "Módulo" }, perm: "Ler" }, "en-US": { module: { name: "Module" }, perm: "Read" } },
      other: { "pt-BR": { module: { name: "Módulo" }, perm: "Ler" }, "en-US": { module: { name: "Module" }, perm: "Read" } },
    });
  });

  it("resolves a page by the (decoded) rest path with its params, and nothing for unknown modules or paths", () => {
    const registry = createModuleRegistry([sample]);
    expect(registry.resolvePage("sample", "")).toMatchObject({ key: "", params: {} });
    expect(registry.resolvePage("sample", "items/a b")).toMatchObject({ key: "items/:itemId", params: { itemId: "a b" } });
    expect(registry.resolvePage("sample", "items")).toBeNull();
    expect(registry.resolvePage("missing", "")).toBeNull();
  });

  it("turns module navigation and settings into shell navigation items", () => {
    const items = createModuleRegistry([sample]).navItems();
    expect(items).toEqual([
      expect.objectContaining({ id: "sample.home", slot: "project", permission: "sample.item.read", target: { kind: "module", moduleId: "sample", path: "" } }),
      expect.objectContaining({ id: "sample.settings", slot: "settings", permission: "sample.item.read", labelKey: "sample.module.name", target: { kind: "settings-module", moduleId: "sample" } }),
    ]);
  });
});

describe("reserved module ids", () => {
  it("cover every core message namespace (@core/contracts cannot import @core/i18n)", () => {
    const reserved: ReadonlySet<string> = new Set(RESERVED_MODULE_IDS);
    expect(Object.keys(CORE_MESSAGES[SOURCE_LOCALE]).filter((namespace) => !reserved.has(namespace))).toEqual([]);
  });
});
