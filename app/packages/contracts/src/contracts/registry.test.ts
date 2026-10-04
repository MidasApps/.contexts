import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineContract } from "./contract.ts";
import { createContractRegistry } from "./registry.ts";

const buildThing = (
  id = "example.Thing",
  schema = z.object({ title: z.string().meta({ description: "Title.", pii: "none" }) }),
) =>
  defineContract(schema, {
    id,
    kind: "entity",
    description: "A thing used by registry tests.",
    examples: [{ title: "First" }],
    pii: "none",
    tenancyScope: "organization",
    relations: [],
  });

describe("createContractRegistry", () => {
  it("lists a registered contract with its metadata", () => {
    const thing = buildThing();
    const registry = createContractRegistry([thing]);
    expect(registry.listContracts()).toEqual([thing]);
  });

  it("populates the zod global registry with the contract meta on registration", () => {
    const thing = buildThing();
    createContractRegistry([thing]);
    expect(z.globalRegistry.get(thing.schema)).toMatchObject({ id: "example.Thing", pii: "none" });
  });

  it("rejects a duplicated id", () => {
    const registry = createContractRegistry([buildThing()]);
    expect(() => registry.register(buildThing())).toThrow(expect.objectContaining({ code: "DUPLICATE_CONTRACT_ID" }));
    expect(registry.listContracts()).toHaveLength(1);
  });

  it("rejects the same schema instance under a second id", () => {
    const first = buildThing("example.Thing");
    const registry = createContractRegistry([first]);
    expect(() => registry.register(buildThing("example.Other", first.schema))).toThrow(
      expect.objectContaining({ code: "DUPLICATE_CONTRACT_SCHEMA" }),
    );
  });

  it("lists contracts sorted by id", () => {
    const registry = createContractRegistry([buildThing("zeta.Thing"), buildThing("alpha.Thing")]);
    expect(registry.listContracts().map((contract) => contract.id)).toEqual(["alpha.Thing", "zeta.Thing"]);
  });
});
