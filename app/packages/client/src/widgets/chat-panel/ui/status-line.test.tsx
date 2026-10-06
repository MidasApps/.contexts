import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import type { ChatPhase } from "../model/use-chat-session.ts";
import { StatusLine } from "./status-line.tsx";

const live = (): HTMLElement => {
  const region = screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite");
  if (region === undefined) throw new Error("live region missing");
  return region;
};

describe("StatusLine", () => {
  it.each<[ChatPhase, string]>([
    ["idle", ""],
    ["connecting", "Conectando…"],
    ["resuming", "Retomando resposta…"],
    ["responding", "Respondendo…"],
    ["finished", "Resposta concluída."],
    ["awaiting-approval", "Aguardando sua aprovação."],
    ["stopped", "Resposta interrompida."],
    ["lost", "Conexão perdida. A resposta parou antes do fim."],
    ["offline", ""],
  ])("says the %s phase in one polite live region", async (phase, text) => {
    const { container } = renderWithProviders(<StatusLine phase={phase} failure={undefined} onRetry={vi.fn()} />);
    expect(live().textContent).toBe(text);
    await expectNoAxeViolations(container);
  });

  it("keeps the same live region across phases, so each change is announced", () => {
    const { rerender } = renderWithProviders(<StatusLine phase="connecting" failure={undefined} onRetry={vi.fn()} />);
    const region = live();
    rerender(<StatusLine phase="responding" failure={undefined} onRetry={vi.fn()} />);
    rerender(<StatusLine phase="finished" failure={undefined} onRetry={vi.fn()} />);
    expect(live()).toBe(region);
    expect(region.textContent).toBe("Resposta concluída.");
  });

  it("leaves plain offline to the shell banner and the composer, and says it only when a failed send can be retried", () => {
    const { rerender } = renderWithProviders(<StatusLine phase="offline" failure={undefined} onRetry={vi.fn()} />);
    expect(live().textContent).toBe("");
    rerender(
      <StatusLine
        phase="offline"
        failure={{ code: "NETWORK_ERROR", requestId: "r", network: true }}
        onRetry={vi.fn()}
      />,
    );
    expect(live().textContent).toBe("Sem conexão.");
  });

  it("offers a retry for a lost stream and for a failed send while offline, not for plain offline", async () => {
    const onRetry = vi.fn();
    const { user, rerender } = renderWithProviders(<StatusLine phase="lost" failure={undefined} onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<StatusLine phase="offline" failure={undefined} onRetry={onRetry} />);
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    rerender(
      <StatusLine
        phase="offline"
        failure={{ code: "NETWORK_ERROR", requestId: "r", network: true }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("shows an error as an alert with the translated code, the reference and a retry", async () => {
    const onRetry = vi.fn();
    const { user, container } = renderWithProviders(
      <StatusLine
        phase="error"
        failure={{ code: "FORBIDDEN", requestId: "01K6REQ", network: false }}
        onRetry={onRetry}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("01K6REQ");
    expect(alert.textContent).not.toContain("FORBIDDEN");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });

  it("falls back to generic copy for a code without a translation", () => {
    renderWithProviders(
      <StatusLine
        phase="error"
        failure={{ code: "SOME_NEW_CODE", requestId: undefined, network: false }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("A resposta falhou antes de terminar. Tente de novo.");
  });
});
