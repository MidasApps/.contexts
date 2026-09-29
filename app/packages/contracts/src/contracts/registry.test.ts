import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createContractRegistry } from "./registry.ts";

// Each test gets its own catalog map; z.globalRegistry tolerates repeated ids across tests.
const makeRegistry = () => createContractRegistry();

const buildMeta = (overrides: Record<string, unknown> = {}) => ({
  id: "example.Thing",
  kind: "entity",
  description: "A thing used by registry tests.",
  examples: [{ title: "First" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  ...overrides,
});

const omitKey = (record: Record<string, unknown>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

const buildThingSchema = () =>
  z.object({ title: z.string().meta({ description: "Title shown in lists.", pii: "none" }) });

describe("createContractRegistry", () => {
  it("lists a registered contract with its metadata", () => {
    const registry = makeRegistry();
    const schema = registry.defineContract(buildThingSchema(), buildMeta());
    const contracts = registry.listContracts();
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.schema).toBe(schema);
    expect(contracts[0]).toMatchObject({ id: "example.Thing", meta: { kind: "entity", tenancyScope: "organization" } });
  });

  it("registers the same schema instance in the zod global registry", () => {
    const registry = makeRegistry();
    const schema = registry.defineContract(buildThingSchema(), buildMeta());
    expect(z.globalRegistry.get(schema)).toMatchObject({ id: "example.Thing", pii: "none" });
  });

  it("rejects a contract without description", () => {
    const registry = makeRegistry();
    const meta = omitKey(buildMeta(), "description");
    expect(() => registry.defineContract(buildThingSchema(), meta)).toThrow(expect.objectContaining({ code: "INVALID_CONTRACT_META" }));
  });

  it("rejects a contract without pii", () => {
    const registry = makeRegistry();
    const meta = omitKey(buildMeta(), "pii");
    expect(() => registry.defineContract(buildThingSchema(), meta)).toThrow(expect.objectContaining({ code: "INVALID_CONTRACT_META" }));
  });

  it("rejects an id outside the <context>.<Name> format", () => {
    const registry = makeRegistry();
    expect(() => registry.defineContract(buildThingSchema(), buildMeta({ id: "Thing" }))).toThrow(expect.objectContaining({ code: "INVALID_CONTRACT_META" }));
  });

  it("rejects a contract without examples", () => {
    const registry = makeRegistry();
    expect(() => registry.defineContract(buildThingSchema(), buildMeta({ examples: [] }))).toThrow(expect.objectContaining({ code: "INVALID_CONTRACT_META" }));
  });

  it("rejects a top-level field without description or pii", () => {
    const registry = makeRegistry();
    const schema = z.object({
      title: z.string().meta({ description: "Title.", pii: "none" }),
      owner: z.string().meta({ description: "Owner without pii." }),
      tag: z.string(),
    });
    expect(() => registry.defineContract(schema, buildMeta())).toThrow(
      expect.objectContaining({ code: "MISSING_FIELD_META", fields: ["owner", "tag"] }),
    );
  });

  it("reads field metadata through optional and nullable wrappers", () => {
    const registry = makeRegistry();
    const schema = z.object({
      note: z.string().meta({ description: "Optional note.", pii: "personal" }).optional(),
      memo: z.string().nullable().meta({ description: "Nullable memo.", pii: "none" }),
    });
    expect(() => registry.defineContract(schema, buildMeta())).not.toThrow();
  });

  it("rejects a duplicated id", () => {
    const registry = makeRegistry();
    registry.defineContract(buildThingSchema(), buildMeta());
    expect(() => registry.defineContract(buildThingSchema(), buildMeta())).toThrow(
      expect.objectContaining({ code: "DUPLICATE_CONTRACT_ID" }),
    );
    expect(registry.listContracts()).toHaveLength(1);
  });

  it("lists contracts sorted by id", () => {
    const registry = makeRegistry();
    registry.defineContract(buildThingSchema(), buildMeta({ id: "zeta.Thing" }));
    registry.defineContract(buildThingSchema(), buildMeta({ id: "alpha.Thing" }));
    expect(registry.listContracts().map((contract) => contract.id)).toEqual(["alpha.Thing", "zeta.Thing"]);
  });
});
