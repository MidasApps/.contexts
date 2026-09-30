import { z } from "zod";
import { defineContract } from "../contract.ts";
import { firestoreIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { buildConnectorToolPolicySchema } from "./connector-tool-policy.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

export const ConnectorIdSchema = firestoreIdSchema<"ConnectorId">();
export type ConnectorId = z.infer<typeof ConnectorIdSchema>;

/** DNS host name without scheme or port; IP literals and single-label hosts (`localhost`) are rejected (SSRF). */
export const AllowedHostSchema = z
  .string()
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, { error: "Expected a lowercase DNS host name." });

const httpsUrl = (description: string) => z.url({ protocol: /^https$/ }).max(2048).meta(none(description));
const allowedHosts = z.array(AllowedHostSchema).min(1).max(20).meta(none("Hosts requests may reach, redirects included."));

const OpenApiConfigSchema = z.strictObject({
  specUrl: httpsUrl("URL of the OpenAPI 3.0/3.1 document."),
  allowedHosts,
  auth: z.enum(["none", "bearer", "api-key"]).meta(none("How the secret is sent; the secret itself is in the secret store.")),
  apiKeyHeader: z.string().regex(/^[A-Za-z0-9-]{1,100}$/).nullable().meta(none("Header name for api-key auth; null otherwise.")),
});

const McpConfigSchema = z.strictObject({
  url: httpsUrl("Streamable HTTP endpoint of the MCP server."),
  allowedHosts,
  auth: z.enum(["none", "bearer", "oauth"]).meta(none("How the connector authenticates; tokens live in the secret store.")),
});

const PostgresConfigSchema = z.strictObject({
  allowedRelations: z
    .array(z.string().regex(/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/))
    .min(1)
    .max(200)
    .meta(none("schema.table or schema.view names the read-only SQL tool may read.")),
});

const BrowserConfigSchema = z.strictObject({
  url: httpsUrl("Playwright MCP server endpoint."),
  allowedHosts,
});

const baseShape = {
  id: ConnectorIdSchema.meta(none("Firestore automatic id of the connector.")),
  tenantId: TenantIdSchema.meta(none("Owning organization.")),
  name: z.string().min(1).max(100).meta(none("Display name; also the prefix of the generated tool names.")),
  status: z.enum(["active", "disabled", "error"]).meta(none("Whether agents can use the connector.")),
  secretRef: z.string().min(1).max(255).nullable().meta(none("Name of the secret in the secret store; never the secret.")),
  toolPolicy: buildConnectorToolPolicySchema().meta(none("Tools agents may call and which skip approval.")),
  createdBy: UserIdSchema.meta({ description: "Uid of the admin who created it.", pii: "personal" }),
  createdAt: IsoDateTimeSchema.meta(none("When the connector was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the connector last changed (UTC).")),
};

/** Tenant connector (SP3 spec §9, decision 0027), discriminated by `type`. Secrets never appear here. */
export const ConnectorSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...baseShape, type: z.literal("openapi").meta(none("HTTP API described by OpenAPI.")), config: OpenApiConfigSchema.meta(none("OpenAPI settings.")) }),
  z.strictObject({ ...baseShape, type: z.literal("mcp").meta(none("Remote MCP server.")), config: McpConfigSchema.meta(none("MCP settings.")) }),
  z.strictObject({ ...baseShape, type: z.literal("postgres").meta(none("Tenant-owned Postgres, read only.")), config: PostgresConfigSchema.meta(none("Postgres settings; the DSN is the secret.")) }),
  z.strictObject({ ...baseShape, type: z.literal("browser").meta(none("Browser automation via Playwright MCP.")), config: BrowserConfigSchema.meta(none("Browser settings.")) }),
]);
export type Connector = z.infer<typeof ConnectorSchema>;
export type ConnectorType = Connector["type"];

const common = {
  id: "Cn4sK2lPq0WnR5tYu3bV",
  tenantId: "Jd8sK2lPq0WnR5tYu3bV",
  status: "active",
  createdBy: "uA1b2C3d4E5f6G7h8I9j",
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T14:30:00.000Z",
};

export const ConnectorContract = defineContract(ConnectorSchema, {
  id: "connectors.Connector",
  kind: "entity",
  description: "An external system (OpenAPI, MCP, Postgres or browser) an organization lets its agents use.",
  examples: [
    {
      ...common,
      name: "issues-api",
      type: "openapi",
      secretRef: "connector-Jd8sK2lPq0WnR5tYu3bV-Cn4sK2lPq0WnR5tYu3bV",
      toolPolicy: { allow: ["listIssues", "createIssue"], readOnly: ["listIssues"] },
      config: { specUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"], auth: "bearer", apiKeyHeader: null },
    },
    {
      ...common,
      name: "docs-mcp",
      type: "mcp",
      secretRef: null,
      toolPolicy: { allow: ["search"], readOnly: ["search"] },
      config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
    },
    {
      ...common,
      name: "warehouse",
      type: "postgres",
      secretRef: "connector-Jd8sK2lPq0WnR5tYu3bV-Pg4sK2lPq0WnR5tYu3bV",
      toolPolicy: { allow: ["query"], readOnly: ["query"] },
      config: { allowedRelations: ["public.orders_summary"] },
    },
    {
      ...common,
      name: "browser",
      type: "browser",
      secretRef: null,
      toolPolicy: { allow: ["browser_navigate"], readOnly: [] },
      config: { url: "https://browser.example.com/mcp", allowedHosts: ["browser.example.com"] },
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.connector.read",
});
