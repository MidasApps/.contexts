import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SHELL_ORGANIZATIONS } from "#/app-shell/testing/shell-routes.ts";
import { OrganizationSwitcher } from "./OrganizationSwitcher.tsx";

describe("OrganizationSwitcher", () => {
  it("names the current organization and lists the others as a radio group", async () => {
    const { user } = renderWidget(<OrganizationSwitcher />, { path: `/o/${IDS.organization}` });
    await user.click(await screen.findByRole("button", { name: "Northwind, trocar de organização" }));
    const current = await screen.findByRole("menuitemradio", { name: "Northwind" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "Contoso" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("menuitem", { name: "Ver todas ou criar organização" }).getAttribute("href")).toBe("/organizations");
    await expectNoAxeViolations(document.body);
  });

  it("shows the switch as pending and refuses a second pick until it settles", async () => {
    let finish: () => void = () => undefined;
    const calls: string[] = [];
    const { user } = renderWidget(<OrganizationSwitcher />, {
      path: `/o/${IDS.organization}`,
      routes: {
        "PUT /v1/me/active-organization": (request) => {
          calls.push(String((request.body as { organizationId: string }).organizationId));
          return new Promise((resolve) => (finish = () => resolve({ status: 204 })));
        },
      },
    });
    await user.click(await screen.findByRole("button", { name: "Northwind, trocar de organização" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Contoso" }));
    const trigger = await screen.findByRole("button", { name: /trocar de organização/u });
    await waitFor(() => expect(trigger.getAttribute("aria-busy")).toBe("true"));
    expect(screen.getByRole("status").textContent).toBe("Trocando de organização…");
    await user.click(trigger);
    const items = await screen.findAllByRole("menuitemradio");
    items.forEach((item) => expect(item.getAttribute("aria-disabled")).toBe("true"));
    await user.keyboard("{Escape}");
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: /trocar de organização/u }).getAttribute("aria-busy")).toBeNull());
    expect(calls).toHaveLength(1);
  });

  it("asks to choose outside an organization and offers a retry when the list fails", async () => {
    let fail = true;
    const { user } = renderWidget(<OrganizationSwitcher />, {
      path: "/profile/account",
      routes: { "GET /v1/me/organizations": () => (fail ? apiError(500, "INTERNAL_ERROR") : page(SHELL_ORGANIZATIONS)) },
    });
    await user.click(await screen.findByRole("button", { name: "Escolher organização, trocar de organização" }));
    const retry = await screen.findByRole("menuitem", { name: "Não foi possível carregar. Tentar novamente" }, { timeout: 8000 });
    fail = false;
    await user.click(retry);
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "Contoso" })).toBeDefined());
    await expectNoAxeViolations(document.body);
  }, 15_000);
});
