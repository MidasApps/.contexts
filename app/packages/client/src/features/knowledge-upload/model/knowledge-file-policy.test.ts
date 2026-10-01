import { describe, expect, it } from "vitest";
import { checkKnowledgeFile, contentTypeOfFile, isHttpsUrl, KNOWLEDGE_MAX_BYTES } from "./knowledge-file-policy.ts";

describe("knowledge file policy", () => {
  it("declares the browser type, or the extension's when the browser reports none", () => {
    expect(contentTypeOfFile({ name: "guide.pdf", type: "application/pdf" })).toBe("application/pdf");
    expect(contentTypeOfFile({ name: "Guide.MD", type: "" })).toBe("text/markdown");
    expect(contentTypeOfFile({ name: "notes", type: "" })).toBe("");
  });

  it("refuses empty files, other types and files over the size cap", () => {
    expect(checkKnowledgeFile({ name: "a.md", type: "", size: 10 })).toBeNull();
    expect(checkKnowledgeFile({ name: "a.md", type: "", size: 0 })).toBe("EMPTY");
    expect(checkKnowledgeFile({ name: "a.png", type: "image/png", size: 10 })).toBe("TYPE_NOT_ALLOWED");
    expect(checkKnowledgeFile({ name: "a.pdf", type: "application/pdf", size: KNOWLEDGE_MAX_BYTES + 1 })).toBe("TOO_LARGE");
  });

  it("accepts only https URLs", () => {
    expect(isHttpsUrl("https://docs.example.com/guide")).toBe(true);
    expect(isHttpsUrl("http://docs.example.com/guide")).toBe(false);
    expect(isHttpsUrl("docs.example.com")).toBe(false);
  });
});
