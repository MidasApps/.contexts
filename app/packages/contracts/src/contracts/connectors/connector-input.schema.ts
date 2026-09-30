import { z } from "zod";
import { defineContract } from "../contract.ts";
import { buildConnectorToolPolicySchema } from "./connector-tool-policy.schema.ts";
import { ConnectorSchema } from "./connector.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

// Server-owned fields (id, tenant, status, secretRef, audit fields) never come from a client.
const [openapi, mcp, postgres, browser] = ConnectorSchema.options;
const createShape = { name: true, type: true, config: true, toolPolicy: true } as const;

/** Body of `POST /v1/organizations/{organizationId}/connectors` (SP3 spec §9, decision 0027). */
export const CreateConnectorInputSchema = z.discriminatedUnion("type", [
  openapi.pick(createShape),
  mcp.pick(createShape),
  postgres.pick(createShape),
  browser.pick(createShape),
]);
export type CreateConnectorInput = z.infer<typeof CreateConnectorInputSchema>;

export const CreateConnectorInputContract = defineContract(CreateConnectorInputSchema, {
  id: "connectors.CreateConnectorInput",
  kind: "command",
  description: "Registers an OpenAPI, MCP, Postgres or browser connector for the organization; its secret is set separately.",
  examples: [
    {
      name: "docs-mcp",
      type: "mcp",
      toolPolicy: { allow: ["search"], readOnly: ["search"] },
      config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.connector.write",
});

/**
 * Body of `PATCH .../connectors/{connectorId}`: absent fields keep their value. `config`
 * replaces the whole config and must match the connector's type (checked by the use case).
 */
export const UpdateConnectorInputSchema = z
  .strictObject({
    name: z.string().min(1).max(100).optional().meta(none("New display name.")),
    status: z.enum(["active", "disabled"]).optional().meta(none("Enable or disable the connector for agents.")),
    toolPolicy: buildConnectorToolPolicySchema().optional().meta(none("New tool allowlist.")),
    config: z.record(z.string(), z.unknown()).optional().meta(none("New config for the connector's type.")),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), { error: "Change at least one field." });
export type UpdateConnectorInput = z.infer<typeof UpdateConnectorInputSchema>;

export const UpdateConnectorInputContract = defineContract(UpdateConnectorInputSchema, {
  id: "connectors.UpdateConnectorInput",
  kind: "command",
  description: "Changes a connector's name, status, tool allowlist or config.",
  examples: [{ status: "disabled" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.connector.write",
});

/** Body of `PUT .../connectors/{connectorId}/secret`: write-only, never returned or logged. */
export const SetConnectorSecretInputSchema = z.strictObject({
  value: z.string().min(1).max(8192).meta({ description: "Bearer token, API key or DSN of the connector.", pii: "sensitive" }),
});
export type SetConnectorSecretInput = z.infer<typeof SetConnectorSecretInputSchema>;

export const SetConnectorSecretInputContract = defineContract(SetConnectorSecretInputSchema, {
  id: "connectors.SetConnectorSecretInput",
  kind: "command",
  description: "Stores or replaces the connector's secret in the secret store (write-only).",
  examples: [{ value: "<secret>" }],
  pii: "sensitive",
  tenancyScope: "organization",
  relations: [],
  permission: "core.connector.write",
});
