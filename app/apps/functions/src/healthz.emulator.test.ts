import { describe, expect, it } from "vitest";
import { FUNCTIONS_REGION } from "./functions-options.ts";

// Host and port of the Functions emulator in app/firebase.json; exec exports GCLOUD_PROJECT.
const EMULATOR_HOST = "127.0.0.1:5001";
const PROJECT_ID = process.env["GCLOUD_PROJECT"] ?? "demo-core";
const HEALTHZ_URL = `http://${EMULATOR_HOST}/${PROJECT_ID}/${FUNCTIONS_REGION}/healthz`;

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const CLIENT_REQUEST_ID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";

describe("healthz on the Functions emulator", () => {
  it("answers GET with 200, status ok and a fresh request id", async () => {
    const response = await fetch(HEALTHZ_URL);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "ok" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(ULID_PATTERN);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // x-powered-by is not asserted here: the emulator's own proxy (port 5001) adds it back;
    // the bridge unit test covers its removal from the function's response.
    expect(response.headers.has("etag")).toBe(false);
  });

  it("answers HEAD with 200 and no body", async () => {
    const response = await fetch(HEALTHZ_URL, { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("keeps a well-formed client request id", async () => {
    const response = await fetch(HEALTHZ_URL, { headers: { "x-request-id": CLIENT_REQUEST_ID } });

    expect(response.headers.get("x-request-id")).toBe(CLIENT_REQUEST_ID);
  });

  it("rejects POST with 405 and the error envelope", async () => {
    const response = await fetch(HEALTHZ_URL, {
      method: "POST",
      headers: { "x-request-id": CLIENT_REQUEST_ID, "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(await response.json()).toEqual({
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed.", requestId: CLIENT_REQUEST_ID },
    });
  });
});
