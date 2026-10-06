import { describe, expect, it } from "vitest";
import { errorResponse } from "./error-envelope.ts";

const REQUEST_ID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";

describe("errorResponse", () => {
  it("builds the api.md §6 envelope with the status and request id header", async () => {
    const response = errorResponse({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "One or more fields are invalid.",
      details: [{ field: "email", issue: "INVALID_FORMAT" }],
      requestId: REQUEST_ID,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more fields are invalid.",
        details: [{ field: "email", issue: "INVALID_FORMAT" }],
        requestId: REQUEST_ID,
      },
    });
  });

  it("omits details when there are none", async () => {
    const response = errorResponse({ status: 404, code: "NOT_FOUND", message: "Not found.", requestId: REQUEST_ID });

    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Not found.", requestId: REQUEST_ID },
    });
  });
});
