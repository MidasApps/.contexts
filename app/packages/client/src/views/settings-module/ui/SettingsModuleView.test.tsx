import { defineContract, defineModule } from "@core/contracts";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineClientModule } from "#/app-shell/modules/define-client-module.ts";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, type FakeRoutes, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsModuleView } from "./SettingsModuleView.tsx";

const SettingsContract = defineContract(
  z.object({
    greeting: z
      .string()
      .min(1)
      .max(40)
      .meta({ description: "Greeting.", pii: "none", ui: { labelKey: "sample.settings.greeting", order: 1 } }),
  }),
  {
    id: "sample.SampleSettings",
    kind: "settings",
    description: "Sample settings.",
    examples: [{ greeting: "Oi" }],
    pii: "none",
    tenancyScope: "organization",
    relations: [],
  },
);

const sampleModule = defineClientModule({
  manifest: defineModule({
    id: "sample",
    labelKey: "sample.module.name",
    permissions: [
      {
        id: "sample.settings.read",
        descriptionKey: "sample.permissions.read",
        kind: "read",
        scope: "tenant",
        defaultRoles: ["member"],
      },
      {
        id: "sample.settings.update",
        descriptionKey: "sample.permissions.update",
        kind: "write",
        scope: "tenant",
        defaultRoles: ["admin"],
      },
    ],
    settings: {
      contract: SettingsContract,
      readPermission: "sample.settings.read",
      updatePermission: "sample.settings.update",
    },
    messages: {
      "pt-BR": {
        module: { name: "Amostras" },
        settings: { greeting: "Saudação" },
        permissions: { read: "Ler", update: "Alterar" },
      },
    },
  }),
  pages: { "": () => Promise.resolve({ default: () => <p>page</p> }) },
});

const stored = (values: Record<string, unknown> | null) =>
  ok({
    tenantId: IDS.organization,
    moduleId: "sample",
    values,
    updatedAt: values === null ? null : "2026-09-29T15:00:00.000Z",
    updatedBy: values === null ? null : IDS.user,
  });

const renderView = (permissions: string[], routes: FakeRoutes = {}, moduleId = "sample") =>
  renderApp(
    <main>
      <SettingsModuleView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/m/${moduleId}`,
      modules: [sampleModule],
      routes: shellRoutes(["core.organization.read", ...permissions] as never, {
        "GET /v1/organizations/:organizationId/module-settings/:moduleId": stored({ greeting: "Oi" }),
        ...routes,
      }),
    },
  );

describe("SettingsModuleView", () => {
  it("renders the module's settings from its contract and saves them with PUT", async () => {
    const bodies: unknown[] = [];
    const { user, container } = renderView(["sample.settings.read", "sample.settings.update"], {
      "PUT /v1/organizations/:organizationId/module-settings/:moduleId": (request: FakeRequest) => {
        bodies.push(request.body);
        return stored(request.body as Record<string, unknown>);
      },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Amostras" })).toBeDefined();
    const greeting = await screen.findByRole("textbox", { name: /Saudação/u });
    expect((greeting as HTMLInputElement).value).toBe("Oi");
    await expectNoAxeViolations(container);
    await user.clear(greeting);
    await user.type(greeting, "Olá");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
    expect(bodies).toEqual([{ greeting: "Olá" }]);
  });

  it("shows the form disabled with a note without the update permission", async () => {
    renderView(["sample.settings.read"]);
    const greeting = await screen.findByRole("textbox", { name: /Saudação/u });
    expect(screen.getByText("Você pode ver estas configurações, mas não alterá-las.")).toBeDefined();
    expect(greeting.matches(":disabled")).toBe(true);
  });

  it("shows no-access without the read permission and not-found for an unknown module", async () => {
    const denied = renderView([]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    denied.unmount();

    renderView(["sample.settings.read"], {}, "missing");
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });

  it("shows the error with a retry when the settings fail to load", async () => {
    renderView(["sample.settings.read"], {
      "GET /v1/organizations/:organizationId/module-settings/:moduleId": apiError(400, "VALIDATION_FAILED"),
    });
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
  });
});
