import { describe, expect, it } from "vitest";
import { ApiError } from "./api-error.ts";
import { createQueryClient, shouldRetryQuery } from "./query-client.ts";
import { queryKeys } from "./query-keys.ts";

const apiError = (status: number) => new ApiError({ status, code: "X", message: "x" });

describe("createQueryClient", () => {
  it("keeps data fresh for 30 s and never retries mutations", () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it("retries transient failures up to three times but never a 4xx", () => {
    expect(shouldRetryQuery(0, apiError(404))).toBe(false);
    expect(shouldRetryQuery(0, apiError(401))).toBe(false);
    expect(shouldRetryQuery(0, apiError(503))).toBe(true);
    expect(shouldRetryQuery(0, apiError(0))).toBe(true);
    expect(shouldRetryQuery(3, apiError(503))).toBe(false);
  });
});

describe("queryKeys", () => {
  it("scopes tenant data under the organization so one invalidation covers it", () => {
    const organization = queryKeys.organization("org-1");
    const context = queryKeys.accessContext({ organizationId: "org-1", projectId: "p-1" });
    const members = queryKeys.organizationScoped("org-1", "members", { cursor: "c" });
    expect(context.slice(0, organization.length)).toEqual(organization);
    expect(members.slice(0, organization.length)).toEqual(organization);
    expect(queryKeys.accessContext({ organizationId: "org-1" })).not.toEqual(context);
    expect(queryKeys.me()).toEqual(["me"]);
  });
});
