import { describe, expect, it } from "vitest";
import { SAMPLE_SETTINGS } from "../application/use-cases/module-settings.fixture.ts";
import {
  createModuleSettingsRegistry,
  ModuleSettingsRegistryError,
  moduleSettingsDefinitionsOf,
} from "./module-settings-registry.ts";

describe("module settings registry", () => {
  it("finds a definition by module id and nothing for other ids", () => {
    const registry = createModuleSettingsRegistry([SAMPLE_SETTINGS]);
    expect(registry.get("sample")).toBe(SAMPLE_SETTINGS);
    expect(registry.get("other")).toBeUndefined();
  });

  it("rejects two definitions for the same module (startup bug)", () => {
    expect(() => createModuleSettingsRegistry([SAMPLE_SETTINGS, SAMPLE_SETTINGS])).toThrow(ModuleSettingsRegistryError);
  });

  it("collects the settings of the modules that declare them", () => {
    const { moduleId, ...settings } = SAMPLE_SETTINGS;
    const definitions = moduleSettingsDefinitionsOf([{ id: moduleId, settings }, { id: "plain" }]);
    expect(definitions).toEqual([SAMPLE_SETTINGS]);
  });
});
