import { describe, expect, it } from "vitest";
import type { ErrorEnvelope } from "./error-envelope.ts";
import { deniedResponse, invalidCursorResponse, pageRequestOf } from "./api-list.ts";

const codeOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error.code;

describe("deniedResponse", () => {
  it("hides nodes the caller has no grant on (404), else 403", async () => {
    expect([deniedResponse("NODE_NOT_FOUND", "r").status, deniedResponse("NOT_A_MEMBER", "r").status]).toEqual([404, 404]);
    const forbidden = deniedResponse("PERMISSION_NOT_GRANTED", "r");
    expect([forbidden.status, await codeOf(forbidden)]).toEqual([403, "FORBIDDEN"]);
    const mfa = deniedResponse("MFA_REQUIRED", "r");
    expect([mfa.status, await codeOf(mfa)]).toEqual([403, "MFA_REQUIRED"]);
  });
});

describe("pageRequestOf", () => {
  it("decodes the cursor or refuses a foreign one", async () => {
    expect(pageRequestOf({ limit: 20 })).toEqual({ after: undefined, limit: 20 });
    expect(pageRequestOf({ cursor: "garbage", limit: 20 })).toBeNull();
    const invalid = invalidCursorResponse("r");
    expect([invalid.status, await codeOf(invalid)]).toEqual([400, "VALIDATION_FAILED"]);
  });
});
