import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, page } from "#/shared/testing/fake-api.ts";
import { buildMe, buildOrganization, IDS } from "#/shared/testing/fixtures.ts";
import { OrganizationsView } from "./OrganizationsView.tsx";

const ORGANIZATIONS = [buildOrganization(), buildOrganization({ id: IDS.otherOrganization, name: "Contoso" })];

describe("OrganizationsView", () => {
  it("lists the organizations with the last used first", async () => {
    const { container } = renderApp(<OrganizationsView />, {
      path: "/organizations",
      routes: {
        "GET /v1/me": ok(buildMe({ lastContext: { organizationId: IDS.otherOrganization } })),
        "GET /v1/me/organizations": page(ORGANIZATIONS),
      },
    });
    const list = await screen.findByRole("list", { name: "Suas organizações" });
    await waitFor(() => expect(within(list).getAllByRole("link")[0]?.textContent).toContain("Contoso"));
    expect(within(list).getAllByRole("link")[0]?.textContent).toContain("Última usada");
    expect(within(list).getAllByRole("link")[1]?.getAttribute("href")).toBe(`/o/${IDS.organization}`);
    expect(screen.getByRole("heading", { level: 1, name: "Organizações" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("shows the empty state and an error state with the request reference and retry", async () => {
    const empty = renderApp(<OrganizationsView />, {
      path: "/organizations",
      routes: { "GET /v1/me/organizations": page([]) },
    });
    expect(
      await screen.findByRole("heading", { name: "Você ainda não participa de nenhuma organização" }),
    ).toBeDefined();
    await expectNoAxeViolations(empty.container);
    empty.unmount();

    let fail = true;
    const { user, container } = renderApp(<OrganizationsView />, {
      path: "/organizations",
      routes: { "GET /v1/me/organizations": () => (fail ? apiError(503, "INTERNAL_ERROR") : page(ORGANIZATIONS)) },
    });
    const alert = await screen.findByRole("alert", {}, { timeout: 8000 });
    expect(alert.textContent).toContain("Referência: 01K6FAKEREQ0000000000000000");
    await expectNoAxeViolations(container);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("list", { name: "Suas organizações" })).toBeDefined();
  }, 15_000);

  it("hides the create form when the caller may not create organizations, and says how to get in", async () => {
    const { container, user, auth } = renderApp(<OrganizationsView />, {
      path: "/organizations",
      routes: {
        "GET /v1/me": ok(buildMe({ capabilities: { createOrganization: false } })),
        "GET /v1/me/organizations": page([]),
      },
    });
    const empty = await screen.findByRole("heading", { name: "Você ainda não participa de nenhuma organização" });
    const panel = empty.closest("[data-state='empty']");
    expect(panel?.textContent).toContain("Peça um convite a quem administra a sua organização");
    expect(screen.queryByRole("form", { name: "Nova organização" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Nova organização" })).toBeNull();
    expect(screen.getByText("Escolha onde trabalhar.")).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Entrar com outra conta" }));
    await waitFor(() => expect(auth.getState().status).toBe("signed-out"));
  });

  it("creates an organization with an Idempotency-Key and prefilled defaults, then opens it", async () => {
    const created = buildOrganization({ id: "NewOrg0000000000000a", name: "Fabrikam" });
    const { user, api, router } = renderApp(<OrganizationsView />, {
      path: "/organizations",
      routes: {
        "GET /v1/me": ok(
          buildMe({
            preferences: {
              locale: "pt-BR",
              timeZone: "America/Manaus",
              currency: "BRL",
              theme: "system",
              notifications: { productUpdates: false, securityAlerts: true },
            },
          }),
        ),
        "GET /v1/me/organizations": page([]),
        "POST /v1/organizations": ok(created, 201),
      },
    });
    const form = await screen.findByRole("form", { name: "Nova organização" });
    await user.type(within(form).getByLabelText(/Nome da organização/u), "Fabrikam");
    await user.click(within(form).getByRole("button", { name: "Criar organização" }));
    await waitFor(() => expect(router.current()).toBe("/o/NewOrg0000000000000a"));
    const call = api.calls.find((candidate) => candidate.method === "POST" && candidate.path === "/v1/organizations");
    expect(call?.body).toEqual({
      name: "Fabrikam",
      defaults: { locale: "pt-BR", timeZone: "America/Manaus", currency: "BRL" },
    });
    expect(call?.headers.get("idempotency-key")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
  });
});
