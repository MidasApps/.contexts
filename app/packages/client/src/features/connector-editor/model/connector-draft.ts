import {
  type Connector,
  type ConnectorType,
  type CreateConnectorInput,
  CreateConnectorInputSchema,
  type ErrorDetail,
} from "@core/contracts";

/** The form as the user types it: lists are text (one entry per line or comma), nothing is trusted yet. */
export type ConnectorDraft = {
  readonly type: ConnectorType;
  readonly name: string;
  /** OpenAPI document URL (`openapi`). */
  readonly specUrl: string;
  /** Endpoint of the MCP or browser server (`mcp`, `browser`). */
  readonly url: string;
  readonly allowedHosts: string;
  readonly allowedRelations: string;
  readonly auth: ConnectorAuth;
  readonly apiKeyHeader: string;
  /** Tool names agents may call. */
  readonly allow: string;
  /** Allowed tools that run without approval. */
  readonly readOnly: readonly string[];
};

export type ConnectorAuth = "none" | "bearer" | "api-key" | "oauth";

export const CONNECTOR_TYPES: readonly ConnectorType[] = ["openapi", "mcp", "postgres", "browser"];

/** Authentication modes each type accepts (`connector.schema.ts`); the secret itself is set separately. */
export const AUTH_MODES: Record<ConnectorType, readonly ConnectorAuth[]> = {
  openapi: ["none", "bearer", "api-key"],
  mcp: ["none", "bearer", "oauth"],
  postgres: [],
  browser: [],
};

/** Fields of the form a problem can point at. */
export const DRAFT_FIELDS = [
  "name",
  "specUrl",
  "url",
  "allowedHosts",
  "allowedRelations",
  "auth",
  "apiKeyHeader",
  "allow",
  "readOnly",
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];
export type DraftProblems = Partial<Record<DraftField, true>>;

export const emptyConnectorDraft = (type: ConnectorType = "openapi"): ConnectorDraft => ({
  type,
  name: "",
  specUrl: "",
  url: "",
  allowedHosts: "",
  allowedRelations: "",
  auth: "none",
  apiKeyHeader: "",
  allow: "",
  readOnly: [],
});

/** `a, b\n c` → `["a", "b", "c"]`, without blanks or duplicates. */
export const splitList = (text: string): string[] => [...new Set(text.split(/[\s,]+/u).filter((item) => item !== ""))];

const lines = (items: readonly string[]): string => items.join("\n");

/** The form of an existing connector. It never carries the secret or `secretRef`. */
export const draftFromConnector = (connector: Connector): ConnectorDraft => {
  const base = {
    ...emptyConnectorDraft(connector.type),
    name: connector.name,
    allow: lines(connector.toolPolicy.allow),
    readOnly: connector.toolPolicy.readOnly,
  };
  switch (connector.type) {
    case "openapi":
      return {
        ...base,
        specUrl: connector.config.specUrl,
        allowedHosts: lines(connector.config.allowedHosts),
        auth: connector.config.auth,
        apiKeyHeader: connector.config.apiKeyHeader ?? "",
      };
    case "mcp":
      return {
        ...base,
        url: connector.config.url,
        allowedHosts: lines(connector.config.allowedHosts),
        auth: connector.config.auth,
      };
    case "postgres":
      return { ...base, allowedRelations: lines(connector.config.allowedRelations) };
    case "browser":
      return { ...base, url: connector.config.url, allowedHosts: lines(connector.config.allowedHosts) };
  }
};

const configOf = (draft: ConnectorDraft): Record<string, unknown> => {
  const allowedHosts = splitList(draft.allowedHosts);
  switch (draft.type) {
    case "openapi":
      return {
        specUrl: draft.specUrl.trim(),
        allowedHosts,
        auth: draft.auth,
        apiKeyHeader: draft.auth === "api-key" ? draft.apiKeyHeader.trim() : null,
      };
    case "mcp":
      return { url: draft.url.trim(), allowedHosts, auth: draft.auth };
    case "postgres":
      return { allowedRelations: splitList(draft.allowedRelations) };
    case "browser":
      return { url: draft.url.trim(), allowedHosts };
  }
};

/** A dotted path of the wire input (`config.allowedHosts.0`, `toolPolicy.readOnly`) → the form field. */
export const draftFieldOf = (path: string): DraftField | undefined => {
  const [first, second] = path.split(".");
  const name = first === "config" || first === "toolPolicy" ? second : first;
  return DRAFT_FIELDS.find((field) => field === name);
};

/** Problems the API reported (`VALIDATION_FAILED` details), mapped to form fields. */
export const problemsFromDetails = (details: readonly ErrorDetail[] | undefined): DraftProblems => {
  const problems: DraftProblems = {};
  for (const detail of details ?? []) {
    const field = draftFieldOf(detail.field);
    if (field !== undefined) problems[field] = true;
  }
  return problems;
};

export type DraftResult =
  | { readonly ok: true; readonly input: CreateConnectorInput }
  | { readonly ok: false; readonly problems: DraftProblems };

/**
 * Builds the wire input and checks it with the contract schema, for early feedback only: the API
 * validates again (https, hosts, relations, tool names) and is the authority.
 */
export const connectorInputOf = (draft: ConnectorDraft): DraftResult => {
  const allow = splitList(draft.allow);
  const candidate = {
    name: draft.name.trim(),
    type: draft.type,
    config: configOf(draft),
    // A tool removed from the allow list cannot stay in the read-only subset.
    toolPolicy: { allow, readOnly: draft.readOnly.filter((tool) => allow.includes(tool)) },
  };
  const parsed = CreateConnectorInputSchema.safeParse(candidate);
  if (parsed.success) {
    // The contract accepts a null header with api-key auth, but then no credential would be sent.
    if (draft.type === "openapi" && draft.auth === "api-key" && draft.apiKeyHeader.trim() === "")
      return { ok: false, problems: { apiKeyHeader: true } };
    return { ok: true, input: parsed.data };
  }
  const problems: DraftProblems = {};
  for (const issue of parsed.error.issues) {
    const field = draftFieldOf(issue.path.map(String).join("."));
    if (field !== undefined) problems[field] = true;
  }
  return { ok: false, problems };
};
