import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadModuleContracts, loadModuleEndpoints, ModuleCatalogError } from "./module-contracts.ts";

const fixture = (name: string): string => path.join(import.meta.dirname, "fixtures", name);

describe("loadModuleContracts", () => {
  it("returns the contracts every listed module contributes", async () => {
    const contracts = await loadModuleContracts(fixture("with-modules"));

    expect(contracts.map((contract) => contract.id)).toEqual(["sample.SampleSettings"]);
  });

  it("returns no contracts when the workspace has no catalog.modules.ts", async () => {
    expect(await loadModuleContracts(fixture("missing"))).toEqual([]);
  });

  it("rejects a contract outside the module namespace", async () => {
    await expect(loadModuleContracts(fixture("wrong-prefix"))).rejects.toThrow(/tenancy\.Stray must start with sample\./u);
  });

  it("rejects an entry that is not a defineContract() result", async () => {
    await expect(loadModuleContracts(fixture("invalid-export"))).rejects.toBeInstanceOf(ModuleCatalogError);
  });
});

describe("loadModuleEndpoints", () => {
  it("returns the /v1 endpoints every listed module contributes, for the OpenAPI", async () => {
    const endpoints = await loadModuleEndpoints(fixture("with-modules"));

    expect(endpoints.map((endpoint) => endpoint.id)).toEqual(["sample.getThing"]);
  });

  it("returns no endpoints when the workspace has no catalog.modules.ts", async () => {
    expect(await loadModuleEndpoints(fixture("missing"))).toEqual([]);
  });

  it("rejects an endpoint outside the module namespace", async () => {
    await expect(loadModuleEndpoints(fixture("wrong-prefix"))).rejects.toThrow(/tenancy\.stray must start with sample\./u);
  });
});
