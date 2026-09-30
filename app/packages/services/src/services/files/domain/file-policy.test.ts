import { describe, expect, it } from "vitest";
import { checkUpload, contentMatchesDeclared, dispositionOf, parseStoragePath, resolveUploadRule } from "./file-policy.ts";

const MIB = 1024 * 1024;

describe("upload policy", () => {
  it.each([
    ["chat-attachment", "image/png", 10 * MIB],
    ["chat-attachment", "image/webp", 10 * MIB],
    ["chat-attachment", "application/pdf", 25 * MIB],
    ["chat-attachment", "video/quicktime", 200 * MIB],
    ["chat-attachment", "audio/wav", 10 * MIB],
    ["knowledge", "text/markdown", 25 * MIB],
    ["knowledge", "text/csv", 25 * MIB],
  ] as const)("%s accepts %s up to %d bytes", (purpose, contentType, maxBytes) => {
    expect(checkUpload({ purpose, contentType, sizeBytes: maxBytes })).toMatchObject({ ok: true, rule: { maxBytes } });
    expect(checkUpload({ purpose, contentType, sizeBytes: maxBytes + 1 })).toEqual({ ok: false, reason: "TOO_LARGE", field: "sizeBytes" });
  });

  it.each([
    ["knowledge", "image/png"],
    ["knowledge", "video/mp4"],
    ["chat-attachment", "text/html"],
    ["chat-attachment", "image/svg+xml"],
    ["chat-attachment", "application/zip"],
  ] as const)("%s refuses %s", (purpose, contentType) => {
    expect(checkUpload({ purpose, contentType, sizeBytes: 1 })).toEqual({ ok: false, reason: "TYPE_NOT_ALLOWED", field: "contentType" });
  });

  it("normalizes parameters and case of the declared type", () => {
    expect(resolveUploadRule("knowledge", "Text/Markdown; charset=utf-8")).toMatchObject({ contentType: "text/markdown", category: "document" });
  });
});

describe("contentMatchesDeclared", () => {
  it("accepts the detected type or its container alias", () => {
    const sample = new Uint8Array([1]);
    expect(contentMatchesDeclared({ declared: "image/png", detected: "image/png", sample })).toBe(true);
    expect(contentMatchesDeclared({ declared: "audio/webm", detected: "video/webm", sample })).toBe(true);
    expect(contentMatchesDeclared({ declared: "audio/mp4", detected: "audio/x-m4a", sample })).toBe(true);
    expect(contentMatchesDeclared({ declared: "image/png", detected: "application/zip", sample })).toBe(false);
    expect(contentMatchesDeclared({ declared: "image/png", detected: undefined, sample })).toBe(false);
  });

  it("requires UTF-8 without NUL bytes for text types, tolerating a character cut at the end", () => {
    const text = new TextEncoder().encode("olá mundo");
    expect(contentMatchesDeclared({ declared: "text/plain", detected: undefined, sample: text })).toBe(true);
    expect(contentMatchesDeclared({ declared: "text/plain", detected: undefined, sample: text.slice(0, 3) })).toBe(true);
    expect(contentMatchesDeclared({ declared: "text/csv", detected: undefined, sample: Uint8Array.from([0x61, 0x00, 0x62]) })).toBe(false);
    expect(contentMatchesDeclared({ declared: "application/json", detected: undefined, sample: Uint8Array.from([0xff, 0xfe, 0x41]) })).toBe(false);
    expect(contentMatchesDeclared({ declared: "text/plain", detected: "application/pdf", sample: text })).toBe(false);
  });
});

describe("storage paths and disposition", () => {
  it("parses only tenants/{tenantId}/files/{fileId}", () => {
    expect(parseStoragePath("tenants/t1/files/f1")).toEqual({ tenantId: "t1", fileId: "f1" });
    expect(parseStoragePath("tenants/t1/files/f1/extra")).toBeNull();
    expect(parseStoragePath("public/f1")).toBeNull();
  });

  it("serves media inline and documents as attachments", () => {
    expect(dispositionOf("image/png")).toBe("inline");
    expect(dispositionOf("audio/ogg")).toBe("inline");
    expect(dispositionOf("application/pdf")).toBe("attachment");
    expect(dispositionOf("text/markdown")).toBe("attachment");
  });
});
