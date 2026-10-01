import { defineClientModule, type ModulePageProps } from "@core/client/app-shell";
import { apiError, expectNoAxeViolations, IDS, MEMBER_PERMISSIONS, ok, renderApp, shellRoutes, type FakeRoutes } from "@core/client/testing";
import { ModulePageView } from "@core/client/views/module-page";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { exampleManifest } from "../manifest.ts";
import { ExampleHomePage } from "./ExampleHomePage.tsx";

// 2026-09-30 15:00 UTC = 12:00 in São Paulo (the fixture's display time zone).
const NOW = new Date("2026-09-30T15:00:00.000Z");

function FixedClockPage(props: ModulePageProps) {
  return <ExampleHomePage {...props} now={() => NOW} />;
}

const testModule = defineClientModule({ manifest: exampleManifest, pages: { "": () => Promise.resolve({ default: FixedClockPage }) } });

const VIEWER = [...MEMBER_PERMISSIONS, "example.item.read"];
const EDITOR = [...VIEWER, "example.item.write"];
const SETTINGS_ROUTE = "GET /v1/organizations/:organizationId/module-settings/:moduleId";

const storedSettings = (values: Record<string, unknown> | null) =>
  ok({ tenantId: IDS.organization, moduleId: "example", values, updatedAt: values === null ? null : "2026-09-29T15:00:00.000Z", updatedBy: values === null ? null : IDS.user });

const CONFIGURED = storedSettings({ greeting: "Bem-vindos", defaultBudget: { amountMinor: 123_456, currency: "BRL" } });

const renderPage = (args: { permissions?: readonly string[]; routes?: FakeRoutes; locale?: "pt-BR" | "en-US" | "es-419" } = {}) =>
  renderApp(
    <main>
      <ModulePageView />
    </main>,
    {
      path: `/o/${IDS.organization}/p/${IDS.project}/m/example`,
      modules: [testModule],
      locale: args.locale ?? "pt-BR",
      routes: shellRoutes((args.permissions ?? EDITOR), { [SETTINGS_ROUTE]: CONFIGURED, ...args.routes }),
    },
  );

const term = (name: string): HTMLElement => {
  const dt = screen.getByText(name, { selector: "dt" });
  const dd = dt.nextElementSibling;
  if (!(dd instanceof HTMLElement)) throw new Error(`no value for ${name}`);
  return dd;
};

describe("ExampleHomePage", () => {
  it("shows the resolved context, the budget in pt-BR money and now in the display time zone", async () => {
    const { container } = renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Módulo de exemplo" })).toBeDefined();
    expect(await screen.findByText("R$ 1.234,56")).toBeDefined();
    expect(screen.getByText("Bem-vindos")).toBeDefined();
    expect(term("Fuso horário de exibição").textContent).toBe("America/Sao_Paulo");
    expect(term("Moeda padrão").textContent).toBe("BRL");
    expect(term("Agora").textContent).toContain("12:00");
    expect(term("Unidade").textContent).toBe("Nenhuma unidade selecionada");
    await expectNoAxeViolations(container);
  });

  it("formats the same budget in en-US", async () => {
    renderPage({ locale: "en-US" });

    expect(await screen.findByRole("heading", { level: 1, name: "Example module" })).toBeDefined();
    expect(await screen.findByText("R$1,234.56")).toBeDefined();
  });

  it("offers the write action to editors and confirms it with a toast", async () => {
    const { user } = renderPage();

    await user.click(await screen.findByRole("button", { name: "Registrar item" }));

    expect(await screen.findByText("Item registrado.")).toBeDefined();
  });

  it("hides the write action from viewers", async () => {
    renderPage({ permissions: VIEWER });

    expect(await screen.findByText("R$ 1.234,56")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Registrar item" })).toBeNull();
  });

  it("shows an empty state with a link to the module settings until the module is set up", async () => {
    const { container } = renderPage({ routes: { [SETTINGS_ROUTE]: storedSettings(null) } });

    const empty = (await screen.findByRole("heading", { name: "Módulo ainda não configurado" })).closest("[data-slot=state-panel]");
    if (!(empty instanceof HTMLElement)) throw new Error("empty state not found");
    const link = within(empty).getByRole("link", { name: "Configurar" });
    expect(link.getAttribute("href")).toBe(`/o/${IDS.organization}/settings/m/example`);
    await expectNoAxeViolations(container);
  });

  it("tells viewers who to ask instead of linking to settings they cannot change", async () => {
    renderPage({ permissions: VIEWER, routes: { [SETTINGS_ROUTE]: storedSettings(null) } });

    expect(await screen.findByText("Peça a um administrador da organização para configurar este módulo.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Configurar" })).toBeNull();
  });

  it("shows an error with retry when the server does not serve the module settings", async () => {
    renderPage({ routes: { [SETTINGS_ROUTE]: apiError(404, "NOT_FOUND") } });

    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Módulo de exemplo" })).toBeDefined();
  });

  it("shows no-access in the settings card when the organization-level read is refused", async () => {
    renderPage({ routes: { [SETTINGS_ROUTE]: apiError(403, "FORBIDDEN") } });

    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Módulo de exemplo" })).toBeDefined();
  });

  it("is forbidden without the read permission (navigation gate)", async () => {
    renderPage({ permissions: MEMBER_PERMISSIONS });

    expect(await screen.findByRole("heading", { level: 1, name: "Você não tem acesso a esta página" })).toBeDefined();
  });
});
