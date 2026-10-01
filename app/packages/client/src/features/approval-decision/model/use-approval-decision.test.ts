import { describe, expect, it } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { decisionErrorCodeOf } from "./use-approval-decision.ts";

describe("decisionErrorCodeOf", () => {
  it("names the refusals that have their own copy in the decision form", () => {
    expect(decisionErrorCodeOf(new ApiError({ status: 403, code: "SELF_APPROVAL_FORBIDDEN", message: "x" }))).toBe("SELF_APPROVAL_FORBIDDEN");
    expect(decisionErrorCodeOf(new ApiError({ status: 409, code: "CONFLICT", message: "x" }))).toBe("CONFLICT");
  });

  it("leaves every other failure to the generic error copy", () => {
    expect(decisionErrorCodeOf(new ApiError({ status: 503, code: "UPSTREAM_UNAVAILABLE", message: "x" }))).toBeNull();
    expect(decisionErrorCodeOf(new TypeError("fetch failed"))).toBeNull();
  });
});
