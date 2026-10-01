import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { UserMenu } from "./UserMenu.tsx";

describe("UserMenu", () => {
  it("shows who is signed in, the profile sections, theme and language", async () => {
    const { user } = renderWidget(<UserMenu />, { path: `/o/${IDS.organization}` });
    await user.click(await screen.findByRole("button", { name: "Ana Souza, menu da conta" }));
    expect(await screen.findByRole("menuitem", { name: "Conta" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Sessões" }).getAttribute("href")).toBe("/profile/sessions");
    expect(screen.getByRole("menuitem", { name: "Idioma e região" }).getAttribute("href")).toBe("/profile/preferences");
    expect(screen.getByRole("menuitem", { name: "Tema" })).toBeDefined();
    await expectNoAxeViolations(document.body);
  });

  it("signs out through the session bridge and lands on sign-in", async () => {
    const { user, router, bridge } = renderWidget(<UserMenu />, { path: `/o/${IDS.organization}` });
    await user.click(await screen.findByRole("button", { name: "Ana Souza, menu da conta" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sair" }));
    await waitFor(() => expect(router.current()).toBe("/sign-in"));
    expect(bridge.ended).toBe(1);
  });
});
