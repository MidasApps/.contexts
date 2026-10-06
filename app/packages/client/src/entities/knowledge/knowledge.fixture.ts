// Test data of the knowledge entity (used by the knowledge features and the settings view tests).
import { IDS } from "#/shared/testing/fixtures.ts";

type Json = Record<string, unknown>;

export const KNOWLEDGE_IDS = {
  document: "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
  otherDocument: "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e10",
  file: "Fz9sK2lPq0WnR5tYu3bV",
} as const;

export const UPLOAD_URL = "https://storage.example.com/upload/Fz9sK2lPq0WnR5tYu3bV?sig=abc";

export const buildKnowledgeDocument = (overrides: Json = {}): Json => ({
  id: KNOWLEDGE_IDS.document,
  tenantId: IDS.organization,
  namespace: "tenant",
  source: "upload",
  sourceRef: KNOWLEDGE_IDS.file,
  title: "Onboarding guide",
  sourceUrl: null,
  mimeType: "text/markdown",
  contentHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  status: "ready",
  createdBy: "uA1b2C3d4E5f6G7h8I9j",
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T14:31:00.000Z",
  ...overrides,
});

export const buildStoredFile = (overrides: Json = {}): Json => ({
  id: KNOWLEDGE_IDS.file,
  tenantId: IDS.organization,
  purpose: "knowledge",
  fileName: "guide.md",
  contentType: "text/markdown",
  sizeBytes: 12,
  status: "ready",
  rejectionReason: null,
  storagePath: `tenants/${IDS.organization}/files/${KNOWLEDGE_IDS.file}`,
  createdBy: "uA1b2C3d4E5f6G7h8I9j",
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T14:30:05.000Z",
  ...overrides,
});

export const buildUploadTicket = (overrides: Json = {}): Json => ({
  fileId: KNOWLEDGE_IDS.file,
  upload: {
    method: "PUT",
    url: UPLOAD_URL,
    headers: { "content-type": "text/markdown", "x-goog-content-length-range": "0,12" },
    expiresAt: "2026-09-29T14:45:00.000Z",
  },
  ...overrides,
});
