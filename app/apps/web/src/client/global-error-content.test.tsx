// @vitest-environment jsdom
import "@core/client/testing/setup";
import { expectNoAxeViolations } from "@core/client/testing";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlobalErrorContent, localeOfPath } from "./global-error-content";

describe("GlobalErrorContent", () => {
  it("shows the translated error page with the reference, a retry and a link home", async () => {
    const onRetry = vi.fn();
    const { container } = render(<GlobalErrorContent locale="es-419" reference="2718281828" onRetry={onRetry} />);

    expect(screen.getByRole("heading", { level: 1, name: "No se pudo abrir esta página" })).toBeDefined();
    expect(screen.getByText("Referencia: 2718281828")).toBeDefined();
    expect(screen.getByRole("link", { name: "Ir al inicio" }).getAttribute("href")).toBe("/es-419");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it("takes the locale from the path, else the source locale", () => {
    expect(localeOfPath("/en-US/o/org-1")).toBe("en-US");
    expect(localeOfPath("/xx/o")).toBe("pt-BR");
    expect(localeOfPath(null)).toBe("pt-BR");
  });
});
