import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { defineContract } from "../../src/contracts/contract.ts";
import { defineEndpoint } from "../../src/contracts/http/endpoint.ts";
import { dataEnvelope, ErrorEnvelopeContract, listEnvelope, PageQuerySchema } from "../../src/contracts/http/envelopes.schema.ts";
import { createContractRegistry } from "../../src/contracts/registry.ts";
import { findRawMetaKeys } from "./json-schema.ts";
import { buildJsonSchemas } from "./json-schema.ts";
import { buildOpenApiDocument, findDanglingRefs, renderOpenApi } from "./render-openapi.ts";
import type { JsonRecord } from "./stable-json.ts";

const ProjectSchema = z.object({
  id: z.string().min(1).meta({ description: "Automatic id.", pii: "none" }),
  name: z.string().min(1).meta({ description: "Project name.", pii: "none" }),
});
const ProjectContract = defineContract(ProjectSchema, {
  id: "tenancy.Project",
  kind: "entity",
  description: "A project.",
  examples: [{ id: "p1", name: "Launch" }],
  pii: "none",
  tenancyScope: "project",
  relations: [],
});

const listProjects = defineEndpoint({
  id: "tenancy.listProjects",
  method: "GET",
  path: "/v1/organizations/{organizationId}/projects",
  auth: "principal",
  params: z.object({ organizationId: z.string().min(1).meta({ description: "Organization id." }) }),
  query: PageQuerySchema.extend({ status: z.enum(["active", "archived"]).optional() }),
  responses: { 200: listEnvelope(ProjectSchema) },
  summary: "Lists the visible projects of an organization.",
});

const createProject = defineEndpoint({
  id: "tenancy.createProject",
  method: "POST",
  path: "/v1/organizations/{organizationId}/projects",
  auth: "user",
  params: z.object({ organizationId: z.string().min(1) }),
  body: z.object({ name: z.string().min(1).meta({ description: "Project name.", pii: "none" }) }),
  responses: { 201: dataEnvelope(ProjectSchema) },
  errors: { 403: ["FORBIDDEN", "ESCALATION_FORBIDDEN"] },
  idempotency: "required",
  rateLimit: "project-create",
  summary: "Creates a project.",
});

const redeem = defineEndpoint({
  id: "identity.redeemDeviceActivation",
  method: "POST",
  path: "/v1/device-activations/redeem",
  auth: "none",
  body: z.object({ code: z.string() }),
  responses: { 204: null },
  summary: "Redeems a code.",
});

const syncClaims = defineEndpoint({
  id: "identity.syncClaims",
  method: "POST",
  path: "/v1/me/claims/sync",
  auth: "user",
  responses: { 204: null },
  idempotency: "optional",
  summary: "Syncs claims.",
});

const buildFixture = (contracts = [ProjectContract, ErrorEnvelopeContract]) => {
  const registered = createContractRegistry(contracts).listContracts();
  return buildOpenApiDocument({
    schemas: buildJsonSchemas(registered),
    contracts: registered,
    endpoints: [listProjects, createProject, redeem, syncClaims],
  });
};

type Operation = {
  operationId: string;
  security: unknown[];
  parameters?: { name: string; in: string; required: boolean; schema: JsonRecord; description?: string }[];
  requestBody?: { required: boolean; content: Record<string, { schema: JsonRecord }> };
  responses: Record<string, { description: string; headers?: Record<string, JsonRecord>; content?: Record<string, { schema: JsonRecord }> }>;
};

const operation = (document: JsonRecord, path: string, method: string): Operation => {
  const paths = document["paths"] as Record<string, Record<string, Operation>>;
  const found = paths[path]?.[method];
  if (found === undefined) throw new Error(`missing ${method} ${path}`);
  return found;
};

const jsonSchemaOf = (response: { content?: Record<string, { schema: JsonRecord }> } | undefined): JsonRecord =>
  response?.content?.["application/json"]?.schema ?? {};

describe("buildOpenApiDocument", () => {
  it("renders one operation per endpoint under its path", () => {
    const document = buildFixture();
    expect(Object.keys(document["paths"] as JsonRecord)).toEqual([
      "/v1/device-activations/redeem",
      "/v1/me/claims/sync",
      "/v1/organizations/{organizationId}/projects",
    ]);
    expect(operation(document, "/v1/organizations/{organizationId}/projects", "get").operationId).toBe("tenancy.listProjects");
    expect(operation(document, "/v1/organizations/{organizationId}/projects", "post").operationId).toBe("tenancy.createProject");
  });

  it("renders path and query parameters from the Zod schemas", () => {
    const list = operation(buildFixture(), "/v1/organizations/{organizationId}/projects", "get");
    const parameters = list.parameters ?? [];
    expect(parameters.map(({ name, in: location, required }) => ({ name, in: location, required }))).toEqual([
      { name: "organizationId", in: "path", required: true },
      { name: "cursor", in: "query", required: false },
      { name: "limit", in: "query", required: false },
      { name: "status", in: "query", required: false },
    ]);
    expect(parameters[0]?.description).toBe("Organization id.");
    expect(parameters[2]?.schema).toMatchObject({ type: "integer", default: 20, minimum: 1, maximum: 100 });
  });

  it("references registered contracts with $ref and inlines the envelope", () => {
    const document = buildFixture();
    const list = operation(document, "/v1/organizations/{organizationId}/projects", "get");
    expect(jsonSchemaOf(list.responses["200"])).toMatchObject({
      type: "object",
      properties: { data: { type: "array", items: { $ref: "#/components/schemas/tenancy.Project" } } },
    });
    const create = operation(document, "/v1/organizations/{organizationId}/projects", "post");
    expect(jsonSchemaOf(create.responses["201"])).toMatchObject({ properties: { data: { $ref: "#/components/schemas/tenancy.Project" } } });
    expect(findDanglingRefs(document)).toEqual([]);
  });

  it("adds the request body, Idempotency-Key header and every error response", () => {
    const create = operation(buildFixture(), "/v1/organizations/{organizationId}/projects", "post");
    expect(create.requestBody?.required).toBe(true);
    expect(create.parameters?.find((parameter) => parameter.in === "header")).toMatchObject({ name: "Idempotency-Key", required: true });
    expect(Object.keys(create.responses)).toEqual(["201", "400", "401", "403", "409", "429", "500"]);
    expect(create.responses["403"]?.description).toBe("ESCALATION_FORBIDDEN, FORBIDDEN");
    expect(jsonSchemaOf(create.responses["403"])).toEqual({ $ref: "#/components/schemas/http.ErrorEnvelope" });
  });

  it("answers 400 VALIDATION_FAILED for an Idempotency-Key even without params or body", () => {
    const sync = operation(buildFixture(), "/v1/me/claims/sync", "post");
    expect(sync.responses["400"]?.description).toBe("VALIDATION_FAILED");
  });

  it("documents Location on 201 and the rate limit headers on 429 (api.md §11.2)", () => {
    const create = operation(buildFixture(), "/v1/organizations/{organizationId}/projects", "post");
    expect(Object.keys(create.responses["201"]?.headers ?? {})).toEqual(["Location"]);
    expect(Object.keys(create.responses["429"]?.headers ?? {})).toEqual([
      "Retry-After",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ]);
    expect(create.responses["400"]?.headers).toBeUndefined();
  });

  it("marks public endpoints without security and 204 without content", () => {
    const document = buildFixture();
    const redeemOperation = operation(document, "/v1/device-activations/redeem", "post");
    expect(redeemOperation.security).toEqual([]);
    expect(redeemOperation.responses["204"]).toEqual({ description: "No Content" });
    expect(Object.keys(redeemOperation.responses)).toEqual(["204", "400", "500"]);
    expect(operation(document, "/v1/organizations/{organizationId}/projects", "post").security).toEqual([{ bearerAuth: [] }]);
  });

  it("writes custom meta only as x-* keys in paths", () => {
    expect(findRawMetaKeys(buildFixture()["paths"])).toEqual([]);
  });

  it("reports $ref targets that are not components", () => {
    expect(findDanglingRefs(buildFixture([ProjectContract]))).toContain(
      "dangling $ref: #/components/schemas/http.ErrorEnvelope",
    );
  });
});

describe("renderOpenApi", () => {
  it("keeps paths empty when there are no endpoints", () => {
    const registered = createContractRegistry([ErrorEnvelopeContract]).listContracts();
    const text = renderOpenApi({ schemas: buildJsonSchemas(registered), contracts: registered, endpoints: [] });
    expect(parseYaml(text)).toMatchObject({ openapi: "3.1.0", paths: {} });
  });
});
