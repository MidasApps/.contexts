import { ApiError } from "@core/client/shared/api";
import { describe, expect, it } from "vitest";
import { createWebErrorReporter, type WebClientLogEntry } from "./web-report-error";

describe("createWebErrorReporter", () => {
  it("writes one structured entry with the error name and code, never its message", () => {
    const entries: WebClientLogEntry[] = [];
    const report = createWebErrorReporter({
      appEnv: "local",
      sink: (entry) => entries.push(entry),
      now: () => new Date("2026-09-30T12:00:00.000Z"),
    });

    report(new ApiError({ status: 401, code: "UNAUTHORIZED", message: "user@example.com is not signed in" }), {
      operation: "session_resume",
    });
    report("boom", { operation: "shell_ui_rehydrate" });

    expect(entries).toEqual([
      {
        timestamp: "2026-09-30T12:00:00.000Z",
        level: "error",
        message: "web_client_error",
        service: "web",
        env: "local",
        operation: "session_resume",
        err: { name: "ApiError", code: "UNAUTHORIZED" },
      },
      {
        timestamp: "2026-09-30T12:00:00.000Z",
        level: "error",
        message: "web_client_error",
        service: "web",
        env: "local",
        operation: "shell_ui_rehydrate",
        err: { name: "unknown" },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain("example.com");
  });
});
