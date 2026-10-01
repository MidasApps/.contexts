import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { notify } from "./notify.ts";
import { Toaster } from "./Toaster.tsx";

afterEach(() => {
  act(() => {
    notify.dismiss();
  });
});

describe("Toaster", () => {
  it("renders a labelled polite region and shows a success toast", async () => {
    const { container } = renderWithProviders(<Toaster />);
    const region = container.querySelector("section");
    expect(region?.getAttribute("aria-label")).toContain("Notificações");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    act(() => {
      notify.success("Alterações salvas.", { description: "O perfil foi atualizado." });
    });
    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
    expect(screen.getByText("O perfil foi atualizado.")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("keeps errors until dismissed with a translated close button", async () => {
    const { user } = renderWithProviders(<Toaster />, { locale: "en-US" });
    act(() => {
      notify.error("Couldn't save.");
    });
    expect(await screen.findByText("Couldn't save.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(screen.queryByText("Couldn't save.")).toBeNull();
  });
});
