import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEndpoint } from "./endpoint.ts";
import { EndpointDefinitionError } from "./endpoint-definition-error.ts";
import { createEndpointRegistry } from "./endpoint-registry.ts";

const makeEndpoint = (args: { id: string; method: "GET" | "POST"; path: string }) =>
  defineEndpoint({
    ...args,
    auth: "user",
    responses: { 200: z.object({ data: z.string() }) },
    summary: `Endpoint ${args.id}.`,
  });

const listOrganizations = makeEndpoint({ id: "tenancy.listOrganizations", method: "GET", path: "/v1/organizations" });
const createOrganization = makeEndpoint({ id: "tenancy.createOrganization", method: "POST", path: "/v1/organizations" });
const getMe = makeEndpoint({ id: "identity.getMe", method: "GET", path: "/v1/me" });

describe("createEndpointRegistry", () => {
  it("lists endpoints sorted by path, then method", () => {
    const registry = createEndpointRegistry([listOrganizations, getMe, createOrganization]);
    expect(registry.list().map((endpoint) => endpoint.id)).toEqual([
      "identity.getMe",
      "tenancy.listOrganizations",
      "tenancy.createOrganization",
    ]);
  });

  it("finds an endpoint by id", () => {
    const registry = createEndpointRegistry([getMe]);
    expect(registry.get("identity.getMe")).toBe(getMe);
    expect(registry.get("identity.unknown")).toBeUndefined();
  });

  it("rejects a duplicate id", () => {
    const clash = makeEndpoint({ id: "identity.getMe", method: "GET", path: "/v1/me/profile" });
    expect(() => createEndpointRegistry([getMe, clash])).toThrow(EndpointDefinitionError);
    expect(() => createEndpointRegistry([getMe, clash])).toThrow(/duplicate endpoint id identity\.getMe/);
  });

  it("rejects a duplicate method and path", () => {
    const clash = makeEndpoint({ id: "identity.readMe", method: "GET", path: "/v1/me" });
    expect(() => createEndpointRegistry([getMe, clash])).toThrow(/GET \/v1\/me is already identity\.getMe/);
  });

  it("treats paths that differ only in parameter names as the same route", () => {
    const first = defineEndpoint({
      id: "tenancy.getProject",
      method: "GET",
      path: "/v1/projects/{projectId}",
      auth: "user",
      params: z.object({ projectId: z.string() }),
      responses: { 200: z.object({ data: z.string() }) },
      summary: "Reads a project.",
    });
    const second = defineEndpoint({ ...first, id: "tenancy.readProject", path: "/v1/projects/{id}", params: z.object({ id: z.string() }) });
    expect(() => createEndpointRegistry([first, second])).toThrow(/GET \/v1\/projects\/\{id\} is already tenancy\.getProject/);
  });
});
