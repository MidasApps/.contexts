import { describe, expect, it } from "vitest";
import { AdminOverviewContract } from "./admin-overview.schema.ts";
import {
  FeatureFlagContract,
  FeatureFlagDefinitionContract,
  FeatureFlagDefinitionSchema,
  SetFeatureFlagValueInputContract,
} from "./feature-flag.schema.ts";
import { PlanContract, PlanSchema, UpsertPlanInputContract, UpsertPlanInputSchema } from "./plan.schema.ts";

const contracts = [
  PlanContract,
  UpsertPlanInputContract,
  FeatureFlagDefinitionContract,
  FeatureFlagContract,
  SetFeatureFlagValueInputContract,
  AdminOverviewContract,
];

describe("platform contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))(
    "%s: every example parses",
    (_id, contract) => {
      expect(contract.meta.examples.length).toBeGreaterThan(0);
      for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
    },
  );

  it.each(contracts.map((contract) => [contract.id, contract] as const))(
    "%s: rejects an unknown key",
    (_id, contract) => {
      const [example] = contract.meta.examples;
      expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
    },
  );
});

describe("AdminOverviewSchema", () => {
  const [overview] = AdminOverviewContract.meta.examples as [Record<string, unknown>];

  it("names the numbers that are not measured, none when an older answer omits the list", () => {
    expect(AdminOverviewContract.schema.parse({ ...overview, unmeasured: ["tripwireRate"] }).unmeasured).toEqual([
      "tripwireRate",
    ]);
    const older = Object.fromEntries(Object.entries(overview).filter(([key]) => key !== "unmeasured"));
    expect(AdminOverviewContract.schema.parse(older).unmeasured).toEqual([]);
    expect(AdminOverviewContract.schema.safeParse({ ...overview, unmeasured: ["organizations"] }).success).toBe(false);
  });
});

describe("PlanSchema", () => {
  const [plan] = PlanContract.meta.examples as [{ limits: Record<string, unknown> } & Record<string, unknown>];

  it("keeps limits as non-negative integers", () => {
    for (const key of ["monthlyMicroUsd", "monthlyTokens", "maxConnectors"]) {
      expect(PlanSchema.safeParse({ ...plan, limits: { ...plan.limits, [key]: -1 } }).success).toBe(false);
      expect(PlanSchema.safeParse({ ...plan, limits: { ...plan.limits, [key]: 1.5 } }).success).toBe(false);
      expect(PlanSchema.safeParse({ ...plan, limits: { ...plan.limits, [key]: 0 } }).success).toBe(true);
    }
    expect(
      UpsertPlanInputSchema.safeParse({ name: "Free", limits: { ...plan.limits, monthlyTokens: -5 } }).success,
    ).toBe(false);
  });

  it("refuses duplicated features", () => {
    expect(
      PlanSchema.safeParse({ ...plan, limits: { ...plan.limits, features: ["web-tools", "web-tools"] } }).success,
    ).toBe(false);
  });
});

describe("FeatureFlagDefinitionSchema", () => {
  const [flag] = FeatureFlagDefinitionContract.meta.examples as [Record<string, unknown>];

  it("requires an owner and a reason", () => {
    expect(FeatureFlagDefinitionSchema.safeParse({ ...flag, owner: "" }).success).toBe(false);
    expect(FeatureFlagDefinitionSchema.safeParse({ ...flag, owner: undefined }).success).toBe(false);
    expect(FeatureFlagDefinitionSchema.safeParse({ ...flag, reason: "" }).success).toBe(false);
  });

  it("requires expiresAt after createdAt", () => {
    expect(FeatureFlagDefinitionSchema.safeParse({ ...flag, expiresAt: flag["createdAt"] }).success).toBe(false);
    expect(FeatureFlagDefinitionSchema.safeParse({ ...flag, expiresAt: "2026-01-01T00:00:00.000Z" }).success).toBe(
      false,
    );
  });

  it("uses dotted kebab-case keys and a known kind", () => {
    expect(FeatureFlagDefinitionSchema.safeParse({ ...flag, key: "AI_KILL" }).success).toBe(false);
    expect(FeatureFlagDefinitionSchema.safeParse({ ...flag, kind: "experiment" }).success).toBe(false);
  });
});
