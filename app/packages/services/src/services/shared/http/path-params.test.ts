import { describe, expect, it } from "vitest";
import { matchPathParams } from "./path-params.ts";

describe("matchPathParams", () => {
  it("extracts named segments of an OpenAPI-style template", () => {
    expect(matchPathParams("/v1/organizations/{organizationId}/members/{userId}", "/v1/organizations/org-1/members/u-9")).toEqual({
      organizationId: "org-1",
      userId: "u-9",
    });
  });

  it("returns an empty object for a template without params", () => {
    expect(matchPathParams("/v1/me", "/v1/me")).toEqual({});
  });

  it("decodes percent-encoded segments", () => {
    expect(matchPathParams("/v1/units/{unitId}", "/v1/units/a%20b")).toEqual({ unitId: "a b" });
  });

  it("tolerates one trailing slash", () => {
    expect(matchPathParams("/v1/units/{unitId}", "/v1/units/u1/")).toEqual({ unitId: "u1" });
  });

  it("returns null when the path does not match the template", () => {
    expect(matchPathParams("/v1/units/{unitId}", "/v1/projects/p1")).toBeNull();
    expect(matchPathParams("/v1/units/{unitId}", "/v1/units/u1/extra")).toBeNull();
    expect(matchPathParams("/v1/units/{unitId}", "/v1/units/")).toBeNull();
  });

  it("returns null for a malformed escape instead of throwing", () => {
    expect(matchPathParams("/v1/units/{unitId}", "/v1/units/%E0%A4%A")).toBeNull();
  });
});
