import { ConnectorSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { connectorInputOf, draftFromConnector, emptyConnectorDraft, problemsFromDetails, splitList } from "./connector-draft.ts";

describe("connector draft", () => {
  it("splits lists by line or comma, without blanks or duplicates", () => {
    expect(splitList("a, b\n\n c a")).toEqual(["a", "b", "c"]);
  });

  it("builds an OpenAPI input and keeps read-only tools inside the allow list", () => {
    const result = connectorInputOf({
      ...emptyConnectorDraft("openapi"),
      name: " issues-api ",
      specUrl: "https://api.example.com/openapi.json",
      allowedHosts: "api.example.com",
      auth: "bearer",
      allow: "listIssues\ncreateIssue",
      readOnly: ["listIssues", "removed"],
    });
    expect(result).toEqual({
      ok: true,
      input: {
        name: "issues-api",
        type: "openapi",
        config: { specUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"], auth: "bearer", apiKeyHeader: null },
        toolPolicy: { allow: ["listIssues", "createIssue"], readOnly: ["listIssues"] },
      },
    });
  });

  it("points at each invalid field: http URL, bad host, missing name and bad tool name", () => {
    const result = connectorInputOf({ ...emptyConnectorDraft("mcp"), url: "http://mcp.example.com/mcp", allowedHosts: "Localhost", allow: "1bad" });
    expect(result).toEqual({ ok: false, problems: { name: true, url: true, allowedHosts: true, allow: true } });
  });

  it("requires relations as schema.table for Postgres and a header name for api-key auth", () => {
    expect(connectorInputOf({ ...emptyConnectorDraft("postgres"), name: "warehouse", allowedRelations: "orders" })).toEqual({ ok: false, problems: { allowedRelations: true } });
    const apiKey = { ...emptyConnectorDraft("openapi"), name: "x", specUrl: "https://a.example.com/o.json", allowedHosts: "a.example.com", auth: "api-key" as const };
    expect(connectorInputOf(apiKey)).toEqual({ ok: false, problems: { apiKeyHeader: true } });
    expect(connectorInputOf({ ...apiKey, apiKeyHeader: "X-Api-Key" })).toMatchObject({ ok: true, input: { config: { apiKeyHeader: "X-Api-Key" } } });
  });

  it("fills the form from a connector without its secret reference", () => {
    const connector = ConnectorSchema.parse({
      id: "Cn4sK2lPq0WnR5tYu3bV",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      name: "warehouse",
      type: "postgres",
      status: "active",
      secretRef: "connector-secret-name",
      toolPolicy: { allow: ["query"], readOnly: ["query"] },
      config: { allowedRelations: ["public.orders", "public.items"] },
      createdBy: "uA1b2C3d4E5f6G7h8I9j",
      createdAt: "2026-09-29T14:30:00.000Z",
      updatedAt: "2026-09-29T14:30:00.000Z",
    });
    const draft = draftFromConnector(connector);
    expect(draft).toMatchObject({ type: "postgres", name: "warehouse", allowedRelations: "public.orders\npublic.items", allow: "query", readOnly: ["query"] });
    expect(JSON.stringify(draft)).not.toContain("connector-secret-name");
  });

  it("maps API validation details to form fields", () => {
    const details = [
      { field: "config.allowedHosts.0", issue: "HOST_NOT_ALLOWED" },
      { field: "toolPolicy.readOnly", issue: "CUSTOM" },
      { field: "other", issue: "X" },
    ];
    expect(problemsFromDetails(details)).toEqual({ allowedHosts: true, readOnly: true });
  });
});
