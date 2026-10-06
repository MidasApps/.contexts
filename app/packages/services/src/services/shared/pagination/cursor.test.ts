import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor.ts";

describe("cursor", () => {
  it("round-trips a position", () => {
    expect(decodeCursor(encodeCursor(["Launch", "p1"]))).toEqual(["Launch", "p1"]);
  });

  it("rejects cursors it did not issue", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ a: 1 })).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(["x", ""])).toString("base64url"))).toBeNull();
  });
});
