import { describe, expect, it } from "vitest";
import { collectionOfNamespace, isOwnCollection, namespaceOfTarget } from "./collection.ts";

describe("knowledge collections", () => {
  it("reads a namespace as the organization, a project, the catalog or a module", () => {
    expect(collectionOfNamespace("tenant")).toEqual({ kind: "organization" });
    expect(collectionOfNamespace("project:p1")).toEqual({ kind: "project", projectId: "p1" });
    expect(collectionOfNamespace("catalog")).toEqual({ kind: "catalog" });
    expect(collectionOfNamespace("module:example")).toEqual({ kind: "module", moduleId: "example" });
  });

  it("names the namespace of an upload target and tells own content from platform content", () => {
    expect(namespaceOfTarget(undefined)).toBe("tenant");
    expect(namespaceOfTarget("p1")).toBe("project:p1");
    expect(isOwnCollection({ kind: "project", projectId: "p1" })).toBe(true);
    expect(isOwnCollection({ kind: "catalog" })).toBe(false);
    expect(isOwnCollection({ kind: "module", moduleId: "example" })).toBe(false);
  });
});
