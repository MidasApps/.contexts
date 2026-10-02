import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import type { UploadItem } from "../model/upload-queue.ts";
import { AttachmentChips } from "./attachment-chips.tsx";

const item = (overrides: Partial<UploadItem> = {}): UploadItem => ({
  id: "u-1",
  name: "notes.txt",
  mediaType: "text/plain",
  sizeBytes: 12,
  purpose: "chat-attachment",
  status: "validating",
  progress: 1,
  ...overrides,
});

describe("AttachmentChips", () => {
  // Follow-up 79: a slow first validation reads as processing, never as a failure.
  it("says a slow validation is still processing", () => {
    renderWithProviders(<AttachmentChips items={[item({ slow: true })]} onRemove={() => undefined} onRetry={() => undefined} />);
    expect(screen.getByText("Processando… a verificação pode levar alguns minutos")).toBeDefined();
    expect(screen.queryByText("A verificação demorou demais")).toBeNull();
  });

  it("says a validation in time is being checked", () => {
    renderWithProviders(<AttachmentChips items={[item()]} onRemove={() => undefined} onRetry={() => undefined} />);
    expect(screen.getByText("Verificando…")).toBeDefined();
  });
});
