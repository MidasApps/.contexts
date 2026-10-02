import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { buildConnector } from "#/shared/testing/admin-operations-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, page, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminConnectorsView } from "./AdminConnectorsView.tsx";

const WAREHOUSE = buildConnector({
  id: "Pg4sK2lPq0WnR5tYu3bV",
  name: "warehouse",
  type: "postgres",
  status: "error",
  secretRef: null,
  toolPolicy: { allow: ["query"], readOnly: ["query"] },
  config: { allowedRelations: ["public.orders_summary", "public.customers"] },
});

const routes = (overrides: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/admin/organizations": page([buildOrganizationSummary(), buildOrganizationSummary({ id: IDS.otherOrganization, name: "Contoso" })]),
  "GET /v1/admin/connectors": page([buildConnector(), WAREHOUSE]),
  ...overrides,
});

const WITH_ORGANIZATION = `/admin/connectors?organizationId=${IDS.organization}`;
const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminConnectorsView />, { path: WITH_ORGANIZATION, routes: routes(), ...options });

describe("AdminConnectorsView", () => {
  it("asks for an organization first and never calls the API without one", async () => {
    const { user, router, api, container } = render({ path: "/admin/connectors" });
    expect(await screen.findByRole("heading", { level: 2, name: "Escolha uma organização" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver organizações" }).getAttribute("href")).toBe("/admin/organizations");
    await expectNoAxeViolations(container);
    expect(api.callLines()).not.toContain("GET /v1/admin/connectors");
    await user.click(screen.getByRole("combobox", { name: "Organização" }));
    await user.click(await screen.findByRole("option", { name: "Contoso" }));
    expect(router.current()).toBe(`/admin/connectors?organizationId=${IDS.otherOrganization}`);
    await waitFor(() => expect(api.calls.find((call) => call.path === "/v1/admin/connectors")?.query).toBe(`?limit=20&organizationId=${IDS.otherOrganization}`));
  });

  it("lists the connectors of the organization without any secret material", async () => {
    const { container } = render();
    const table = await screen.findByRole("table", { name: "Conectores da organização" });
    const api = within(table).getByRole("row", { name: /issues-api/u });
    expect(within(api).getByText("API (OpenAPI)")).toBeDefined();
    expect(within(api).getByText("Ativo")).toBeDefined();
    expect(within(api).getByText("api.example.com")).toBeDefined();
    expect(within(api).getByText("2 ferramentas, 1 sem aprovação")).toBeDefined();
    expect(within(api).getByText("Segredo configurado")).toBeDefined();
    const warehouse = within(table).getByRole("row", { name: /warehouse/u });
    expect(within(warehouse).getByText("Com erro")).toBeDefined();
    expect(within(warehouse).getByText("public.orders_summary")).toBeDefined();
    expect(within(warehouse).getByText("e mais 1")).toBeDefined();
    expect(within(warehouse).getByText("Sem segredo")).toBeDefined();
    expect(container.textContent).not.toContain("connector-secret-name");
    expect(screen.getByText(/Somente leitura: a equipe da plataforma não altera nem desativa conectores/u)).toBeDefined();
    expect(within(table).queryByRole("button")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("pages by cursor", async () => {
    const first = Array.from({ length: 20 }, (_, index) => buildConnector({ id: `Cn${String(index).padStart(18, "0")}`, name: `api-${String(index)}` }));
    const { user } = render({ routes: routes({ "GET /v1/admin/connectors": (request) => (request.query.get("cursor") === "c2" ? page([WAREHOUSE]) : page(first, { cursor: "c2", limit: 20 })) }) });
    await screen.findByRole("table", { name: "Conectores da organização" });
    await user.click(within(screen.getByRole("navigation", { name: "Páginas de conectores" })).getByRole("button", { name: "Próxima" }));
    expect(await screen.findByRole("row", { name: /warehouse/u })).toBeDefined();
  });

  it("explains where an organization's connectors are created, without sending staff in a circle", async () => {
    const { container } = render({ routes: routes({ "GET /v1/admin/connectors": page([]) }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Esta organização não tem conectores" })).toBeDefined();
    expect(screen.getByText(/Conectores são criados nas configurações da organização/u)).toBeDefined();
    expect(screen.queryByRole("link", { name: "Abrir a organização" })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("shows an error with the request reference and retries", async () => {
    const { user, api, container } = render({ routes: routes({ "GET /v1/admin/connectors": apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/connectors", page([WAREHOUSE]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("row", { name: /warehouse/u })).toBeDefined();
  });

  it("is open to the support role and shows no-access when the API refuses", async () => {
    render({ role: "platform-support", routes: routes({ "GET /v1/admin/connectors": apiError(403, "FORBIDDEN") }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Conectores" })).toBeDefined();
  });

  it("shows cards on a phone and reads in English and Spanish", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const phone = render();
      const list = await screen.findByRole("list", { name: "Conectores da organização" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      await expectNoAxeViolations(phone.container);
      phone.unmount();
    } finally {
      globalThis.matchMedia = matchMedia;
    }
    const english = render({ locale: "en-US" });
    expect(await screen.findByText("2 tools, 1 without approval")).toBeDefined();
    english.unmount();
    render({ locale: "es-419" });
    expect(await screen.findByText("2 herramientas, 1 sin aprobación")).toBeDefined();
  });
});
