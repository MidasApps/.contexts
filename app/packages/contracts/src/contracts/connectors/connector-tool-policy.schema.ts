import { z } from "zod";
import { defineContract } from "../contract.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/** Tool name as the external system exposes it (operationId, MCP tool name). */
export const ConnectorToolNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/, { error: "Expected a tool name." });

/**
 * Which tools of a connector agents may use (SP3 spec §9). Tools in `readOnly`
 * run without approval; every other allowed tool asks the user first.
 *
 * A factory, because a field must not reuse the registered contract schema:
 * `.meta()` clones inherit the parent's registry entry, so a nested copy would
 * carry contract meta (`kind`, `examples`) and fail the field meta check.
 */
export const buildConnectorToolPolicySchema = () =>
  z
    .strictObject({
      allow: z.array(ConnectorToolNameSchema).max(500).meta(none("Tools agents may call; anything else is hidden.")),
      readOnly: z.array(ConnectorToolNameSchema).max(500).meta(none("Subset of allow that runs without approval.")),
    })
    .refine((policy) => policy.readOnly.every((tool) => policy.allow.includes(tool)), {
      error: "readOnly must be a subset of allow.",
      path: ["readOnly"],
    });

export const ConnectorToolPolicySchema = buildConnectorToolPolicySchema();
export type ConnectorToolPolicy = z.infer<typeof ConnectorToolPolicySchema>;

export const ConnectorToolPolicyContract = defineContract(ConnectorToolPolicySchema, {
  id: "connectors.ConnectorToolPolicy",
  kind: "settings",
  description: "Allowlist of connector tools agents may call and which of them skip approval.",
  examples: [{ allow: ["listIssues", "getIssue", "createIssue"], readOnly: ["listIssues", "getIssue"] }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.connector.read",
});
