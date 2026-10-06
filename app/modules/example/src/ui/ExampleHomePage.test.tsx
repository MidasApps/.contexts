import { defineClientModule, type ModulePageProps } from "@core/client/app-shell";
import {
  apiError,
  expectNoAxeViolations,
  type FakeRequest,
  type FakeRoutes,
  IDS,
  MEMBER_PERMISSIONS,
  ok,
  page,
  renderApp,
  shellRoutes,
} from "@core/client/testing";
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

const testModule = defineClientModule({
  manifest: exampleManifest,
  pages: { "": () => Promise.resolve({ default: FixedClockPage }) },
});

const VIEWER = [...MEMBER_PERMISSIONS, "example.item.read"];
const EDITOR = [...VIEWER, "example.item.write"];
const SETTINGS_ROUTE = "GET /v1/organizations/:organizationId/module-settings/:moduleId";
const NOTES_ROUTE = "GET /v1/organizations/:organizationId/notes";

const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  tenantId: IDS.organization,
  authorId: IDS.user,
  title,
  body: "",
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:00:00.000Z",
  ...extra,
});

const storedSettings = (values: Record<string, unknown> | null) =>
  ok({
    tenantId: IDS.organization,
    moduleId: "example",
    values,
    updatedAt: values === null ? null : "2026-09-29T15:00:00.000Z",
    updatedBy: values === null ? null : IDS.user,
  });

const CONFIGURED = storedSettings({ greeting: "Bem-vindos", defaultBudget: { amountMinor: 123_456, currency: "BRL" } });

const renderPage = (
  args: { permissions?: readonly string[]; routes?: FakeRoutes; locale?: "pt-BR" | "en-US" | "es-419" } = {},
) =>
  renderApp(
    <main>
      <ModulePageView />
    </main>,
    {
      path: `/o/${IDS.organization}/p/${IDS.project}/m/example`,
      modules: [testModule],
      locale: args.locale ?? "pt-BR",
      routes: shellRoutes(args.permissions ?? EDITOR, {
        [SETTINGS_ROUTE]: CONFIGURED,
        [NOTES_ROUTE]: page([]),
        ...args.routes,
      }),
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

  it("lists the organization's notes newest first, with the archived ones marked, and loads the next page", async () => {
    const requests: FakeRequest[] = [];
    const notesRoute = (request: FakeRequest) => {
      requests.push(request);
      return request.query.get("cursor") === "next"
        ? page([note("NoteOld0000000000001", "Older note")], { limit: 20 })
        : page(
            [
              note("NoteNew0000000000001", "Supplier follow-up", { body: "Call Ana on Monday." }),
              note("NoteArc0000000000001", "Archived note", { archivedAt: "2026-09-30T13:00:00.000Z" }),
            ],
            { cursor: "next", limit: 20 },
          );
    };
    const { user, container } = renderPage({ permissions: VIEWER, routes: { [NOTES_ROUTE]: notesRoute } });

    expect(await screen.findByText("Supplier follow-up")).toBeDefined();
    expect(screen.getByText("Call Ana on Monday.")).toBeDefined();
    expect(screen.getByText("Arquivada")).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(await screen.findByText("Older note")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    expect(requests.map((request) => [request.params["organizationId"], request.query.get("limit")])).toEqual([
      [IDS.organization, "20"],
      [IDS.organization, "20"],
    ]);
  });

  it("says where notes come from while the organization has none, and offers no write action", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Nenhuma nota ainda" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Registrar item" })).toBeNull();
  });

  it("shows an error with retry in the notes card when the server does not serve the notes", async () => {
    renderPage({ routes: { [NOTES_ROUTE]: apiError(404, "NOT_FOUND") } });

    const notes = (await screen.findByRole("heading", { name: "Notas" })).closest("[data-slot=section-card]");
    if (!(notes instanceof HTMLElement)) throw new Error("notes card not found");
    expect(await within(notes).findByRole("button", { name: "Tentar novamente" })).toBeDefined();
  });

  it("shows no-access in the notes card when example.note.read is refused", async () => {
    renderPage({ routes: { [NOTES_ROUTE]: apiError(403, "FORBIDDEN") } });

    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.getByText("R$ 1.234,56")).toBeDefined();
  });

  it("shows an empty state with a link to the module settings until the module is set up", async () => {
    const { container } = renderPage({ routes: { [SETTINGS_ROUTE]: storedSettings(null) } });

    const empty = (await screen.findByRole("heading", { name: "Módulo ainda não configurado" })).closest(
      "[data-slot=state-panel]",
    );
    if (!(empty instanceof HTMLElement)) throw new Error("empty state not found");
    const link = within(empty).getByRole("link", { name: "Configurar" });
    expect(link.getAttribute("href")).toBe(`/o/${IDS.organization}/settings/m/example`);
    await expectNoAxeViolations(container);
  });

  it("tells viewers who to ask instead of linking to settings they cannot change", async () => {
    renderPage({ permissions: VIEWER, routes: { [SETTINGS_ROUTE]: storedSettings(null) } });

    expect(
      await screen.findByText("Peça a um administrador da organização para configurar este módulo."),
    ).toBeDefined();
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
