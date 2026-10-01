import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useIdempotencyKey } from "./use-idempotency-key.ts";

describe("useIdempotencyKey", () => {
  it("reuses the key for the same body, renews it for a new body or after reset", () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const first = result.current.keyFor({ name: "a" });
    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
    expect(result.current.keyFor({ name: "a" })).toBe(first);
    const second = result.current.keyFor({ name: "b" });
    expect(second).not.toBe(first);
    result.current.reset();
    expect(result.current.keyFor({ name: "b" })).not.toBe(second);
  });
});
