import { describe, expect, it } from "vitest";
import type { ErrorEnvelope } from "../../../shared/http/error-envelope.ts";
import { makeFilesWorld, ORG_A, ORG_B } from "./files-route.fixture.ts";

const UPLOAD = "files.requestUpload";
const GET = "files.getFile";
const READ_URL = "files.getReadUrl";

const upload = (overrides: Record<string, unknown> = {}) => ({
  purpose: "knowledge",
  fileName: "guide.md",
  contentType: "text/markdown",
  sizeBytes: 2048,
  ...overrides,
});

const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;

type Ticket = { data: { fileId: string; upload: { method: string; url: string; headers: Record<string, string>; expiresAt: string } } };

describe("POST /v1/organizations/{organizationId}/files", () => {
  it("answers 401 without a Bearer token", async () => {
    const world = makeFilesWorld();
    const response = await world.call(UPLOAD, `/v1/organizations/${ORG_A}/files`, { method: "POST", body: upload() });
    expect(response.status).toBe(401);
    expect(world.repository.files.size).toBe(0);
  });

  it("creates a pending file and answers 201 with Location and a 15-minute signed PUT bound to type and size", async () => {
    const world = makeFilesWorld();
    const response = await world.call(UPLOAD, `/v1/organizations/${ORG_A}/files`, { method: "POST", token: "alice-token", body: upload() });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as Ticket;
    expect(response.headers.get("location")).toBe(`/v1/files/${data.fileId}`);
    expect(data.upload).toEqual({
      method: "PUT",
      url: `https://signed.test/upload/tenants/${ORG_A}/files/${data.fileId}`,
      headers: { "content-type": "text/markdown", "x-goog-content-length-range": "0,2048" },
      expiresAt: "2026-09-29T12:15:00.000Z",
    });
    expect(world.repository.files.get(data.fileId)).toMatchObject({
      tenantId: ORG_A,
      status: "pending",
      createdBy: "alice",
      storagePath: `tenants/${ORG_A}/files/${data.fileId}`,
    });
  });

  it("rejects a malformed body, a type the purpose does not take, and an oversize file with 400 before any write", async () => {
    const world = makeFilesWorld();
    const cases: [Record<string, unknown>, string, string][] = [
      [upload({ fileName: "../x.md" }), "fileName", "INVALID_FORMAT"],
      [upload({ contentType: "image/png" }), "contentType", "TYPE_NOT_ALLOWED"],
      [upload({ purpose: "chat-attachment", contentType: "application/x-msdownload" }), "contentType", "TYPE_NOT_ALLOWED"],
      [upload({ sizeBytes: 25 * 1024 * 1024 + 1 }), "sizeBytes", "TOO_LARGE"],
      [upload({ purpose: "chat-attachment", contentType: "image/png", sizeBytes: 10 * 1024 * 1024 + 1 }), "sizeBytes", "TOO_LARGE"],
    ];
    for (const [body, field, issue] of cases) {
      const response = await world.call(UPLOAD, `/v1/organizations/${ORG_A}/files`, { method: "POST", token: "alice-token", body });
      expect(response.status).toBe(400);
      const error = await errorOf(response);
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.details).toContainEqual(expect.objectContaining({ field, ...(issue === "INVALID_FORMAT" ? {} : { issue }) }));
    }
    expect(world.repository.files.size).toBe(0);
  });

  it("accepts a 200 MB video chat attachment and refuses one byte more", async () => {
    const world = makeFilesWorld();
    const video = upload({ purpose: "chat-attachment", fileName: "demo.mp4", contentType: "video/mp4", sizeBytes: 200 * 1024 * 1024 });
    expect((await world.call(UPLOAD, `/v1/organizations/${ORG_A}/files`, { method: "POST", token: "alice-token", body: video })).status).toBe(201);
    const tooBig = { ...video, sizeBytes: 200 * 1024 * 1024 + 1 };
    expect((await world.call(UPLOAD, `/v1/organizations/${ORG_A}/files`, { method: "POST", token: "alice-token", body: tooBig })).status).toBe(400);
  });

  it("answers 403 for an organization the caller is not a member of", async () => {
    const world = makeFilesWorld();
    const response = await world.call(UPLOAD, `/v1/organizations/${ORG_B}/files`, { method: "POST", token: "alice-token", body: upload() });
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
    expect(world.repository.files.size).toBe(0);
  });
});

describe("GET /v1/files/{fileId} and /read-url", () => {
  const uploaded = async (world: ReturnType<typeof makeFilesWorld>, body = upload()) => {
    const response = await world.call(UPLOAD, `/v1/organizations/${ORG_A}/files`, { method: "POST", token: "alice-token", body });
    return ((await response.json()) as Ticket).data.fileId;
  };

  it("serves the record to its uploader and answers 404 to another tenant's member", async () => {
    const world = makeFilesWorld();
    const fileId = await uploaded(world);
    const own = await world.call(GET, `/v1/files/${fileId}`, { token: "alice-token" });
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ data: { id: fileId, status: "pending" } });
    expect((await world.call(GET, `/v1/files/${fileId}`, { token: "bob-token" })).status).toBe(404);
    expect((await world.call(GET, "/v1/files/missing", { token: "alice-token" })).status).toBe(404);
  });

  it("keeps chat attachments private to their uploader but shares knowledge files with knowledge readers", async () => {
    const world = makeFilesWorld();
    const attachment = await uploaded(world, upload({ purpose: "chat-attachment", contentType: "image/png", fileName: "a.png" }));
    const knowledge = await uploaded(world);
    expect((await world.call(GET, `/v1/files/${attachment}`, { token: "carol-token" })).status).toBe(404);
    expect((await world.call(GET, `/v1/files/${knowledge}`, { token: "carol-token" })).status).toBe(200);
  });

  it("answers 409 for a read URL of a pending file and a 5-minute URL once it is ready", async () => {
    const world = makeFilesWorld();
    const fileId = await uploaded(world);
    const pending = await world.call(READ_URL, `/v1/files/${fileId}/read-url`, { token: "alice-token" });
    expect(pending.status).toBe(409);
    await world.repository.settle({ fileId, settlement: { status: "ready", contentType: "text/markdown", sizeBytes: 10 }, updatedAt: "2026-09-29T12:01:00.000Z" });
    const ready = await world.call(READ_URL, `/v1/files/${fileId}/read-url`, { token: "alice-token" });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ data: { url: `https://signed.test/read/tenants/${ORG_A}/files/${fileId}`, expiresAt: "2026-09-29T12:05:00.000Z" } });
  });
});
