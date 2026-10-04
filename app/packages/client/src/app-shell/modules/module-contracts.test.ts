import { defineModule, type ModuleManifest } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { CreateTestNoteContract } from "#/features/generative-ui/testing/note-contract.fixture.ts";
import { ClientModuleError, defineClientModule } from "./define-client-module.ts";
import { createModuleRegistry } from "./module-registry.ts";

const manifestOf = (id: string): ModuleManifest =>
  defineModule({
    id,
    labelKey: `${id}.module.name`,
    permissions: [],
    messages: { "pt-BR": { module: { name: "Módulo" } }, "en-US": { module: { name: "Module" } } },
  });

describe("client module contracts", () => {
  it("exposes the contracts of every module through the registry", () => {
    const withContracts = defineClientModule({
      manifest: manifestOf("testnotes"),
      pages: {},
      contracts: [CreateTestNoteContract],
    });
    const without = defineClientModule({ manifest: manifestOf("plain"), pages: {} });
    expect(
      createModuleRegistry([withContracts, without])
        .contracts()
        .map((contract) => contract.id),
    ).toEqual(["testnotes.CreateNoteCommand"]);
  });

  it("rejects a contract of another namespace", () => {
    expect(() =>
      defineClientModule({ manifest: manifestOf("other"), pages: {}, contracts: [CreateTestNoteContract] }),
    ).toThrow(ClientModuleError);
  });
});
