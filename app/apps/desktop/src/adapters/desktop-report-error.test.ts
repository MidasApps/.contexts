import { describe, expect, it } from "vitest";
import { createDesktopErrorReporter, type DesktopLogEntry } from "./desktop-report-error.ts";

class CodedError extends Error {
  readonly code = "NETWORK_ERROR";
}

describe("createDesktopErrorReporter", () => {
  it("writes one structured entry with the operation and the error name and code, never its message", () => {
    const entries: DesktopLogEntry[] = [];
    const report = createDesktopErrorReporter({
      appEnv: "local",
      sink: (entry) => entries.push(entry),
      now: () => new Date("2026-09-30T12:00:00Z"),
    });

    report(new CodedError("user ana@example.com not found"), { operation: "session_boot" });
    report("thrown string", { operation: "shell_ui_rehydrate" });

    expect(entries).toEqual([
      {
        timestamp: "2026-09-30T12:00:00.000Z",
        level: "error",
        message: "desktop_client_error",
        service: "desktop",
        env: "local",
        operation: "session_boot",
        err: { name: "Error", code: "NETWORK_ERROR" },
      },
      {
        timestamp: "2026-09-30T12:00:00.000Z",
        level: "error",
        message: "desktop_client_error",
        service: "desktop",
        env: "local",
        operation: "shell_ui_rehydrate",
        err: { name: "unknown" },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain("ana@example.com");
  });
});
