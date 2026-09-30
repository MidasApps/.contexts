import { type Connector, ConnectorSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort } from "../../testing/fake-ports.ts";
import type { CoreToolContext } from "../../tools/define-core-tool.ts";
import { createToolRegistry } from "../../tools/tool-registry.ts";
import { dereferenceOpenApi, loadOpenApiDocument, OpenApiConnectorError } from "./openapi-document.ts";
import { MAX_RESPONSE_BYTES, openApiToolId, openApiToTools } from "./openapi-to-tools.ts";

const SPEC = {
  openapi: "3.1.0",
  info: { title: "Issues", version: "1.0.0" },
  servers: [{ url: "https://api.example.com/v1" }],
  paths: {
    "/issues": {
      get: { operationId: "listIssues", summary: "Lists issues.", parameters: [{ name: "state", in: "query", schema: { type: "string", enum: ["open", "closed"] } }], responses: { "200": { description: "ok" } } },
      post: {
        operationId: "createIssue",
        summary: "Creates an issue.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NewIssue" } } } },
        responses: { "201": { description: "created" } },
      },
    },
    "/issues/{issueId}": {
      parameters: [{ name: "issueId", in: "path", required: true, schema: { type: "string" } }],
      get: { operationId: "getIssue", responses: { "200": { description: "ok" } } },
      delete: { operationId: "deleteIssue", responses: { "204": { description: "gone" } } },
    },
  },
  components: { schemas: { NewIssue: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } } },
};

const connectorOf = (allowedHosts = ["api.example.com"]): Connector =>
  ConnectorSchema.parse({
    id: "Cn4sK2lPq0WnR5tYu3bV",
    tenantId: "Jd8sK2lPq0WnR5tYu3bV",
    name: "issues-api",
    type: "openapi",
    status: "active",
    secretRef: "connector-Jd8sK2lPq0WnR5tYu3bV-Cn4sK2lPq0WnR5tYu3bV",
    toolPolicy: { allow: ["listIssues", "getIssue", "createIssue"], readOnly: ["listIssues", "getIssue"] },
    config: { specUrl: "https://api.example.com/openapi.json", allowedHosts, auth: "bearer", apiKeyHeader: null },
    createdBy: "uA1b2C3d4E5f6G7h8I9j",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  });

const publicDns = () => Promise.resolve(["93.184.216.34"]);
const ctx = { abortSignal: new AbortController().signal } as CoreToolContext;

const recordingFetch = (respond: () => Response = () => Response.json({ items: [] })) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init });
    return Promise.resolve(respond());
  }) as typeof fetch;
  return { calls, fetchFn };
};

const toolsOf = async (fetchFn: typeof fetch, connector = connectorOf()) =>
  openApiToTools({ connector, document: await dereferenceOpenApi(SPEC), secret: "tok_secret", fetch: fetchFn, resolve: publicDns });

describe("openapi to tools", () => {
  it("makes one tool per allowed operation: GET is a read, POST a mutation, others are hidden", async () => {
    const tools = await toolsOf(recordingFetch().fetchFn);
    expect(tools.map((tool) => [tool.id, tool.kind])).toEqual([
      ["api.issues-api.listIssues", "read"],
      ["api.issues-api.createIssue", "mutation"],
      ["api.issues-api.getIssue", "read"],
    ]);
    const registry = createToolRegistry({ access: createFakeAccessPort({}), audit: createFakeAuditPort(), approvals: createFakeApprovalPort() });
    for (const tool of tools) registry.register(tool);
    const bound = registry.toMastraTools(tools.map((tool) => tool.id));
    expect(bound[openApiToolId("issues-api", "createIssue")]?.requireApproval).toBe(true);
    expect(bound[openApiToolId("issues-api", "listIssues")]?.requireApproval).toBe(false);
  });

  it("validates the operation input strictly (path, query, body from the spec)", async () => {
    const tools = await toolsOf(recordingFetch().fetchFn);
    const create = tools.find((tool) => tool.id.endsWith("createIssue"));
    expect(create?.inputSchema.safeParse({ body: { title: "Bug" } }).success).toBe(true);
    expect(create?.inputSchema.safeParse({ body: { title: "Bug", extra: 1 } }).success).toBe(false);
    expect(create?.inputSchema.safeParse({ body: { title: "Bug" }, other: 1 }).success).toBe(false);
    const get = tools.find((tool) => tool.id.endsWith("getIssue"));
    expect(get?.inputSchema.safeParse({}).success).toBe(false);
  });

  it("calls the spec's server with the secret, path and query, and wraps the answer as untrusted", async () => {
    const { calls, fetchFn } = recordingFetch();
    const get = (await toolsOf(fetchFn)).find((tool) => tool.id.endsWith("getIssue"));
    const result = await get?.execute({ path: { issueId: "a/b" } }, ctx);
    expect(calls[0]?.url).toBe("https://api.example.com/v1/issues/a%2Fb");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer tok_secret");
    expect(result).toMatchObject({ status: 200, truncated: false });
    expect(String((result as { body: string }).body)).toMatch(/^<untrusted_api_response>/);
  });

  it("caps the response body at 100 KB", async () => {
    const { fetchFn } = recordingFetch(() => new Response("x".repeat(MAX_RESPONSE_BYTES + 5000)));
    const list = (await toolsOf(fetchFn)).find((tool) => tool.id.endsWith("listIssues"));
    const result = (await list?.execute({ query: { state: "open" } }, ctx)) as { body: string; truncated: boolean };
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThan(MAX_RESPONSE_BYTES + 100);
  });

  it("refuses a spec whose server host is not in allowedHosts", async () => {
    await expect(toolsOf(recordingFetch().fetchFn, connectorOf(["other.example.com"]))).rejects.toThrow(OpenApiConnectorError);
  });

  it("refuses a redirect of an API call to a private address", async () => {
    const redirect = (() => Promise.resolve(new Response(null, { status: 302, headers: { location: "https://internal.example.com/" } }))) as typeof fetch;
    const tools = openApiToTools({ connector: connectorOf(), document: await dereferenceOpenApi(SPEC), secret: null, fetch: redirect, resolve: (host) => Promise.resolve(host === "internal.example.com" ? ["10.0.0.9"] : ["93.184.216.34"]) });
    await expect(tools[0]?.execute({}, ctx)).rejects.toMatchObject({ code: "URL_REJECTED" });
  });

  it("loads the spec through the guard and rejects external refs and non-JSON specs", async () => {
    const { fetchFn } = recordingFetch(() => Response.json(SPEC));
    const document = await loadOpenApiDocument({ specUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"], fetch: fetchFn, resolve: publicDns });
    expect(Object.keys(document.paths ?? {})).toContain("/issues");
    const external = { ...SPEC, components: { schemas: { NewIssue: { $ref: "https://evil.example.net/schema.json" } } } };
    await expect(dereferenceOpenApi(external)).rejects.toThrow(OpenApiConnectorError);
    const yaml = recordingFetch(() => new Response("openapi: 3.1.0"));
    await expect(loadOpenApiDocument({ specUrl: "https://api.example.com/openapi.yaml", allowedHosts: ["api.example.com"], fetch: yaml.fetchFn, resolve: publicDns })).rejects.toThrow(OpenApiConnectorError);
  });
});
