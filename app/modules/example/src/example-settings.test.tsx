import { buildAccessContext, expectNoAxeViolations, IDS, MEMBER_PERMISSIONS, ok, renderApp, shellRoutes, type FakeRequest } from "@core/client/testing";
import { SettingsModuleView } from "@core/client/views/settings-module";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { exampleClientModule } from "./client.ts";

const SETTINGS_ROUTE = "/v1/organizations/:organizationId/module-settings/:moduleId";
const EDITOR = [...MEMBER_PERMISSIONS, "example.item.read", "example.item.write"];

// The organization's regional currency is USD here, so the default currency visibly comes from it.
const contextInUsd = () => {
  const context = buildAccessContext({ permissions: EDITOR });
  return ok({ ...context, regional: { ...(context["regional"] as Record<string, unknown>), currency: "USD" } });
};

const neverSaved = ok({ tenantId: IDS.organization, moduleId: "example", values: null, updatedAt: null, updatedBy: null });

describe("example module settings", () => {
  it("renders ExampleSettings with SchemaForm, money defaulting to the regional currency, and saves it", async () => {
    const bodies: unknown[] = [];
    const { user, container } = renderApp(
      <main>
        <SettingsModuleView />
      </main>,
      {
        path: `/o/${IDS.organization}/settings/m/example`,
        modules: [exampleClientModule],
        routes: shellRoutes(EDITOR, {
          "GET /v1/me/context": contextInUsd(),
          [`GET ${SETTINGS_ROUTE}`]: neverSaved,
          [`PUT ${SETTINGS_ROUTE}`]: (request: FakeRequest) => {
            bodies.push(request.body);
            return ok({ tenantId: IDS.organization, moduleId: "example", values: request.body, updatedAt: "2026-09-30T15:00:00.000Z", updatedBy: IDS.user });
          },
        }),
      },
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Exemplo" })).toBeDefined();
    const greeting = await screen.findByRole("textbox", { name: /Saudação/u });
    const budget = screen.getByRole("textbox", { name: /Orçamento padrão/u });
    expect(screen.getByText("USD")).toBeDefined();
    await expectNoAxeViolations(container);

    await user.type(greeting, "Bem-vindos");
    await user.type(budget, "1500,50");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
    expect(bodies).toEqual([{ greeting: "Bem-vindos", defaultBudget: { amountMinor: 150_050, currency: "USD" } }]);
  });
});
