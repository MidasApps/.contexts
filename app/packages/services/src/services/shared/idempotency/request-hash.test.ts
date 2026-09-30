import { describe, expect, it } from "vitest";
import { canonicalJson, hashRequest } from "./request-hash.ts";

describe("canonicalJson", () => {
  it("sorts object keys at every depth and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  it("drops undefined properties like JSON does", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson(undefined)).toBe("null");
  });
});

describe("hashRequest", () => {
  it("is stable across key order and changes with the body", () => {
    const first = hashRequest({ params: { id: "x" }, query: undefined, body: { name: "A", tags: ["t"] } });
    const reordered = hashRequest({ body: { tags: ["t"], name: "A" }, params: { id: "x" }, query: undefined });
    const changed = hashRequest({ params: { id: "x" }, query: undefined, body: { name: "B", tags: ["t"] } });
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });
});
