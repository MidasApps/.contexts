import { describe, expect, expectTypeOf, it } from "vitest";
import type { TenantId } from "../primitives/ids.schema.ts";
import { FileUploadRequestContract, FileUploadRequestSchema } from "./file-upload-request.schema.ts";
import { FileReadUrlContract, FileUploadTicketContract, UploadInstructionsSchema } from "./file-upload-ticket.schema.ts";
import { StoredFileContract, StoredFileSchema, type StoredFile } from "./stored-file.schema.ts";

const contracts = [FileUploadRequestContract, StoredFileContract, FileUploadTicketContract, FileReadUrlContract];

describe("file contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: every example parses", (_id, contract) => {
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
  });

  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: rejects an unknown key", (_id, contract) => {
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
  });

  it("brands tenant ids", () => {
    expectTypeOf<StoredFile["tenantId"]>().toEqualTypeOf<TenantId>();
  });
});

describe("FileUploadRequestSchema", () => {
  const [example] = FileUploadRequestContract.meta.examples as [Record<string, unknown>];

  it.each(["../etc/passwd", "a/b.png", "a\\b.png", "", ".."])("rejects file name %j", (fileName) => {
    expect(FileUploadRequestSchema.safeParse({ ...example, fileName }).success).toBe(false);
  });

  it.each([0, -1, 1.5])("rejects size %s", (sizeBytes) => {
    expect(FileUploadRequestSchema.safeParse({ ...example, sizeBytes }).success).toBe(false);
  });

  it("rejects a malformed content type", () => {
    expect(FileUploadRequestSchema.safeParse({ ...example, contentType: "png" }).success).toBe(false);
  });

  it("accepts only known purposes", () => {
    expect(FileUploadRequestSchema.safeParse({ ...example, purpose: "avatar" }).success).toBe(false);
  });
});

describe("StoredFileSchema", () => {
  const [example] = StoredFileContract.meta.examples as [Record<string, unknown>];

  it("stores objects under tenants/{tenantId}/files/{fileId}", () => {
    expect(StoredFileSchema.safeParse({ ...example, storagePath: "public/x.png" }).success).toBe(false);
  });

  it("requires the storage path to match the tenant and id", () => {
    expect(StoredFileSchema.safeParse({ ...example, storagePath: "tenants/other/files/x" }).success).toBe(false);
  });
});

describe("UploadInstructionsSchema", () => {
  it("accepts only PUT (signed URL) and POST (local emulator)", () => {
    const base = { url: "https://storage.googleapis.com/b/o", headers: {}, expiresAt: "2026-09-29T14:45:00.000Z" };
    expect(UploadInstructionsSchema.safeParse({ ...base, method: "PUT" }).success).toBe(true);
    expect(UploadInstructionsSchema.safeParse({ ...base, method: "GET" }).success).toBe(false);
  });
});
