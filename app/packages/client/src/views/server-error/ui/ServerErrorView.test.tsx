import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorReporterProvider } from "#/shared/lib/errors/error-reporter.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { ServerErrorView } from "./ServerErrorView.tsx";

describe("ServerErrorView", () => {
  it("shows a translated error page with the server reference, a retry and a way home, and reports once", async () => {
    const reportError = vi.fn();
    const onRetry = vi.fn();
    const error = Object.assign(new Error("db password in message"), { digest: "3141592653" });
    const { user, container } = renderWithClient(
      <ErrorReporterProvider reportError={reportError}>
        <ServerErrorView error={error} reference={error.digest} onRetry={onRetry} />
      </ErrorReporterProvider>,
      { locale: "en-US" },
    );

    expect(screen.getByRole("heading", { level: 1, name: "This page could not be opened" })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Reference: 3141592653");
    expect(container.textContent).not.toContain("db password");
    expect(screen.getByRole("link", { name: "Go to home" }).getAttribute("href")).toBe("/");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(error, { operation: "server_render_failed" });
    await expectNoAxeViolations(container);
  });

  it("omits the reference when the server gave none", () => {
    renderWithClient(<ServerErrorView error={new Error("x")} reference={undefined} onRetry={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Não foi possível abrir esta página" })).toBeDefined();
    expect(screen.queryByText(/Referência/u)).toBeNull();
  });
});
