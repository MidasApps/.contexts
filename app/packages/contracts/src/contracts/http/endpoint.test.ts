import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineEndpoint, type InferEndpointInput, type InferEndpointResponse } from "./endpoint.ts";
import { EndpointDefinitionError } from "./endpoint-definition-error.ts";
import { dataEnvelope } from "./envelopes.schema.ts";

const ProjectSchema = z.object({ id: z.string(), name: z.string() });

const getProject = defineEndpoint({
  id: "tenancy.getProject",
  method: "GET",
  path: "/v1/projects/{projectId}",
  auth: "principal",
  params: z.object({ projectId: z.string().min(1) }),
  query: z.object({ expand: z.string().optional() }),
  responses: { 200: dataEnvelope(ProjectSchema) },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Reads a project.",
});

const captureProblems = (define: () => unknown): readonly string[] => {
  try {
    define();
  } catch (error: unknown) {
    if (error instanceof EndpointDefinitionError) return error.problems;
    throw error;
  }
  throw new Error("expected EndpointDefinitionError");
};

const base = {
  id: "tenancy.updateProject",
  method: "PATCH",
  path: "/v1/projects/{projectId}",
  auth: "user",
  params: z.object({ projectId: z.string() }),
  body: z.object({ name: z.string() }),
  responses: { 200: dataEnvelope(ProjectSchema) },
  summary: "Updates a project.",
} as const;

describe("defineEndpoint", () => {
  it("returns the descriptor unchanged when it is valid", () => {
    expect(getProject.id).toBe("tenancy.getProject");
    expect(getProject.path).toBe("/v1/projects/{projectId}");
  });

  it("accepts a 204 endpoint without a schema and with idempotency", () => {
    const endpoint = defineEndpoint({
      id: "tenancy.deleteProject",
      method: "DELETE",
      path: "/v1/projects/{projectId}",
      auth: "user",
      params: z.object({ projectId: z.string() }),
      responses: { 204: null },
      idempotency: "optional",
      rateLimit: "project-delete",
      summary: "Deletes a project.",
    });
    expect(endpoint.responses).toEqual({ 204: null });
  });

  it("rejects a path outside /v1/", () => {
    expect(captureProblems(() => defineEndpoint({ ...base, path: "/v2/projects/{projectId}" }))).toContain(
      "path must start with /v1/",
    );
  });

  it("rejects path segments that are not kebab-case or {param}", () => {
    expect(captureProblems(() => defineEndpoint({ ...base, path: "/v1/Projects/{projectId}/" }))).toEqual([
      "invalid path segment: Projects",
      "invalid path segment: (empty)",
    ]);
  });

  it("rejects path params missing from params and params missing from the path", () => {
    const problems = captureProblems(() =>
      defineEndpoint({ ...base, path: "/v1/projects/{id}", params: z.object({ projectId: z.string() }) }),
    );
    expect(problems).toEqual(["path param {id} is not in params", "params key projectId is not in the path"]);
  });

  it("rejects path params without a params schema", () => {
    const withoutParams = { id: base.id, method: base.method, path: base.path, auth: base.auth, body: base.body, responses: base.responses, summary: base.summary };
    expect(captureProblems(() => defineEndpoint(withoutParams))).toEqual(["path param {projectId} is not in params"]);
  });

  it("rejects a GET with a body or an idempotency key", () => {
    const problems = captureProblems(() =>
      defineEndpoint({ ...base, method: "GET", body: z.object({ name: z.string() }), idempotency: "optional" }),
    );
    expect(problems).toEqual(["GET cannot have a body", "GET cannot take an Idempotency-Key"]);
  });

  it("rejects a 204 response with a schema and an endpoint without success responses", () => {
    const with204Schema = { ...base, responses: { 204: z.object({}) } };
    // Runtime guard for JavaScript callers and casts: the type already forbids it.
    expect(captureProblems(() => defineEndpoint(with204Schema as unknown as typeof base))).toEqual([
      "204 response cannot have a schema",
    ]);
    expect(captureProblems(() => defineEndpoint({ ...base, responses: {} }))).toEqual([
      "at least one success response is required",
    ]);
  });

  it("rejects a malformed id, error code and rate limit policy", () => {
    const problems = captureProblems(() =>
      defineEndpoint({ ...base, id: "Tenancy.Update", errors: { 422: ["lastOwner"] }, rateLimit: "Too Fast" }),
    );
    expect(problems).toEqual([
      "id must be <context>.<operation>, e.g. identity.getMe",
      "error code lastOwner (422) must be SCREAMING_SNAKE",
      "rateLimit must be a kebab-case policy id",
    ]);
  });

  it("names the endpoint in the error", () => {
    expect(() => defineEndpoint({ ...base, path: "/projects" })).toThrow(/tenancy\.updateProject/);
  });
});

describe("endpoint type inference", () => {
  it("infers the parsed input and the success body", () => {
    expectTypeOf<InferEndpointInput<typeof getProject>>().toEqualTypeOf<{
      params: { projectId: string };
      query: { expand?: string | undefined };
      body: undefined;
    }>();
    expectTypeOf<InferEndpointResponse<typeof getProject>>().toEqualTypeOf<{ data: { id: string; name: string } }>();
  });

  it("infers undefined for a 204 response", () => {
    const endpoint = defineEndpoint({
      id: "identity.syncClaims",
      method: "POST",
      path: "/v1/me/claims/sync",
      auth: "user",
      responses: { 204: null },
      summary: "Re-syncs claims.",
    });
    expect(endpoint.responses).toEqual({ 204: null });
    expectTypeOf<InferEndpointResponse<typeof endpoint>>().toEqualTypeOf<undefined>();
    expectTypeOf<InferEndpointInput<typeof endpoint>>().toEqualTypeOf<{ params: undefined; query: undefined; body: undefined }>();
  });
});
