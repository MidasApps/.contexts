import { describe, expect, expectTypeOf, it } from "vitest";
import type { TenantId } from "../primitives/ids.schema.ts";
import { type Connector, ConnectorContract, ConnectorSchema, connectorNeedsSecret } from "./connector.schema.ts";
import { ConnectorToolPolicyContract, ConnectorToolPolicySchema } from "./connector-tool-policy.schema.ts";

const contracts = [ConnectorContract, ConnectorToolPolicyContract];

describe("connector contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))(
    "%s: every example parses",
    (_id, contract) => {
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

  it("brands tenant ids", () => {
    expectTypeOf<Connector["tenantId"]>().toEqualTypeOf<TenantId>();
  });
});

type ConnectorExample = Record<string, unknown> & { type: string; config: Record<string, unknown> };

describe("ConnectorSchema", () => {
  const examples = ConnectorContract.meta.examples as ConnectorExample[];
  const byType = (type: string): ConnectorExample => {
    const found = examples.find((example) => example.type === type);
    if (found === undefined) throw new Error(`missing ${type} example`);
    return found;
  };
  const mcp = byType("mcp");

  it("has one example per connector type", () => {
    expect(examples.map((example) => example.type).sort()).toEqual(["browser", "mcp", "openapi", "postgres"]);
  });

  it("never carries a secret value", () => {
    expect(ConnectorSchema.safeParse({ ...mcp, secret: "s3cr3t" }).success).toBe(false);
    expect(ConnectorSchema.safeParse({ ...mcp, config: { ...mcp.config, token: "s3cr3t" } }).success).toBe(false);
  });

  it("carries the runtime's last load error as a code and a time only", () => {
    const failing = { ...mcp, lastError: { code: "CONNECT_FAILED", at: "2026-10-01T10:00:00.000Z" } };
    expect(ConnectorSchema.safeParse(failing).success).toBe(true);
    expect(ConnectorSchema.safeParse({ ...mcp, lastError: null }).success).toBe(true);
    expect(
      ConnectorSchema.safeParse({
        ...mcp,
        lastError: { code: "CONNECT_FAILED", at: "2026-10-01T10:00:00.000Z", message: "ECONNREFUSED" },
      }).success,
    ).toBe(false);
    expect(
      ConnectorSchema.safeParse({ ...mcp, lastError: { code: "ECONNREFUSED", at: "2026-10-01T10:00:00.000Z" } })
        .success,
    ).toBe(false);
  });

  it("knows which connectors need a stored secret", () => {
    const need = examples.map((example) => [
      example.type,
      example.config["auth"] ?? null,
      connectorNeedsSecret(ConnectorSchema.parse(example)),
    ]);
    expect(need).toEqual([
      ["openapi", "bearer", true],
      ["mcp", "none", false],
      ["postgres", null, true],
      ["browser", null, false],
    ]);
  });

  it("requires https", () => {
    expect(
      ConnectorSchema.safeParse({ ...mcp, config: { ...mcp.config, url: "http://tools.example.com/mcp" } }).success,
    ).toBe(false);
  });

  it("requires at least one allowed host", () => {
    expect(ConnectorSchema.safeParse({ ...mcp, config: { ...mcp.config, allowedHosts: [] } }).success).toBe(false);
  });

  it.each(["localhost:8080", "https://x.com", "10.0.0.1 "])("rejects allowed host %j", (host) => {
    expect(ConnectorSchema.safeParse({ ...mcp, config: { ...mcp.config, allowedHosts: [host] } }).success).toBe(false);
  });

  it("rejects a config of another type", () => {
    expect(ConnectorSchema.safeParse({ ...mcp, config: byType("openapi").config }).success).toBe(false);
  });
});

describe("ConnectorToolPolicySchema", () => {
  it("requires readOnly to be a subset of allow", () => {
    expect(ConnectorToolPolicySchema.safeParse({ allow: ["listIssues"], readOnly: ["deleteIssue"] }).success).toBe(
      false,
    );
  });
});
