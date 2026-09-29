import { RequestIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id.ts";

const VALID_ULID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";

describe("resolveRequestId", () => {
  it("names the propagated header", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });

  it("keeps a valid incoming ULID", () => {
    expect(resolveRequestId(VALID_ULID)).toBe(VALID_ULID);
  });

  it.each([null, "", "not-a-ulid", "1 OR 1=1", `${VALID_ULID}X`])(
    "generates a new ULID when the incoming value is %j",
    (incoming) => {
      const requestId = resolveRequestId(incoming);

      expect(requestId).not.toBe(incoming);
      expect(RequestIdSchema.safeParse(requestId).success).toBe(true);
    },
  );
});
