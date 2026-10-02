import type { Permission } from "@core/contracts";
import { act, configure, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildConnector } from "#/shared/testing/admin-operations-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsConnectorsView } from "./SettingsConnectorsView.tsx";

const READER: Permission[] = ["core.organization.read", "core.connector.read"];
const WRITER: Permission[] = [...READER, "core.connector.write"];
const SECRET = "sk-live-9f8e7d6c5b4a";
const SECRET_REF = "connector-secret-name";
const LIST = "GET /v1/organizations/:organizationId/connectors";
const ONE = "/v1/organizations/:organizationId/connectors/:connectorId";
const MCP = buildConnector({
  id: "Cn4sK2lPq0WnR5tYu3bX",
  name: "docs-mcp",
  type: "mcp",
  status: "disabled",
  secretRef: null,
  toolPolicy: { allow: ["search"], readOnly: ["search"] },
  config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
});

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = WRITER) =>
  renderApp(
    <main>
      <SettingsConnectorsView />
    </main>,
    { path: `/o/${IDS.organization}/settings/connectors`, routes: shellRoutes(permissions, { [LIST]: page([buildConnector(), MCP]), ...routes }) },
  );

// The whole app shell boots per test and sibling suites load the machine: the default 1 s of
// `findBy*` and 5 s per test are too tight here, so both are widened for this file only.
beforeAll(() => {
  configure({ asyncUtilTimeout: 10_000 });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
});

/** Fills a field by paste: long values typed key by key are slow under load and prove nothing more. */
const paste = async (user: { click: (element: Element) => Promise<void>; paste: (text: string) => Promise<void> }, element: Element, text: string): Promise<void> => {
  await user.click(element);
  await user.paste(text);
};

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

describe("SettingsConnectorsView", { timeout: 30_000 }, () => {
  it("lists connectors with type, status, tools and whether a secret is set, never the secret reference", async () => {
    const { container, api } = renderView();
    const table = await screen.findByRole("table", { name: "Conectores de Northwind" });
    const issues = await within(table).findByRole("row", { name: /issues-api/u });
    expect(within(issues).getByText("API OpenAPI")).toBeDefined();
    expect(within(issues).getByText("Ativo")).toBeDefined();
    expect(within(issues).getByText("Definido")).toBeDefined();
    expect(within(issues).getByText("2 ferramentas · 1 sem aprovação")).toBeDefined();
    const mcp = within(table).getByRole("row", { name: /docs-mcp/u });
    expect(within(mcp).getByText("Desativado")).toBeDefined();
    expect(within(mcp).getByText("Não definido")).toBeDefined();
    expect(container.textContent).not.toContain(SECRET_REF);
    expect(screen.getByText(/Não há teste de conexão/u)).toBeDefined();
    expect(api.callLines().filter((line) => line.includes("/connectors"))).toEqual([`GET /v1/organizations/${IDS.organization}/connectors`]);
    await expectNoAxeViolations(container);
  });

  it("says why a connector did not load, under its status, and when", async () => {
    const { container } = renderView({
      [LIST]: page([buildConnector({ lastError: { code: "SPEC_UNAVAILABLE", at: "2026-10-01T13:00:00.000Z" } }), buildConnector({ id: "Cn4sK2lPq0WnR5tYu3bZ", name: "warehouse", type: "postgres", secretRef: null, toolPolicy: { allow: ["query"], readOnly: ["query"] }, config: { allowedRelations: ["public.orders"] }, lastError: { code: "SECRET_MISSING", at: "2026-10-01T13:00:00.000Z" } })]),
    });
    const table = await screen.findByRole("table", { name: "Conectores de Northwind" });
    const issues = await within(table).findByRole("row", { name: /issues-api/u });
    expect(within(issues).getByText("Com erro")).toBeDefined();
    expect(within(issues).getByText(/O documento OpenAPI não pôde ser baixado/u)).toBeDefined();
    const warehouse = within(table).getByRole("row", { name: /warehouse/u });
    expect(within(warehouse).getByText(/Falta o segredo/u)).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("goes straight to the secret after creating a connector that needs one", async () => {
    const created = buildConnector({ ...MCP, status: "active", config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "bearer" } });
    const { user } = renderView({ "POST /v1/organizations/:organizationId/connectors": ok(created, 201) });
    await user.click(await screen.findByRole("button", { name: "Novo conector" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo conector" });
    await paste(user, within(dialog).getByRole("textbox", { name: "Nome" }), "docs-mcp");
    await user.click(within(dialog).getByRole("combobox", { name: "Tipo" }));
    await user.click(await screen.findByRole("option", { name: "Servidor MCP" }));
    await paste(user, within(dialog).getByRole("textbox", { name: "URL do servidor" }), "https://mcp.example.com/mcp");
    await paste(user, within(dialog).getByRole("textbox", { name: "Hosts permitidos" }), "mcp.example.com");
    await user.type(within(dialog).getByRole("textbox", { name: "Ferramentas permitidas" }), "search");
    await user.click(within(dialog).getByRole("button", { name: "Criar conector" }));
    const secret = await screen.findByRole("dialog", { name: "Definir o segredo de docs-mcp" });
    expect(within(secret).getByLabelText("Token de acesso")).toHaveProperty("value", "");
  });

  it("shows no write action to a viewer who can only read", async () => {
    renderView({}, READER);
    await screen.findByRole("table", { name: "Conectores de Northwind" });
    expect(screen.queryByRole("button", { name: "Novo conector" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar issues-api" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Substituir o segredo de issues-api" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir issues-api" })).toBeNull();
  });

  it("refuses the page without the read permission", async () => {
    const { api } = renderView({}, ["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines().some((line) => line.includes("/connectors"))).toBe(false);
  });

  it("creates an MCP connector in the organization of the page", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/connectors": (request: FakeRequest) => {
        requests.push(request);
        return ok(MCP, 201);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Novo conector" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo conector" });
    await paste(user, within(dialog).getByRole("textbox", { name: "Nome" }), "docs-mcp");
    await user.click(within(dialog).getByRole("combobox", { name: "Tipo" }));
    await user.click(await screen.findByRole("option", { name: "Servidor MCP" }));
    await paste(user, within(dialog).getByRole("textbox", { name: "URL do servidor" }), "https://mcp.example.com/mcp");
    await paste(user, within(dialog).getByRole("textbox", { name: "Hosts permitidos" }), "mcp.example.com");
    await user.type(within(dialog).getByRole("textbox", { name: "Ferramentas permitidas" }), "search{Enter}write");
    await user.click(within(dialog).getByRole("checkbox", { name: "search" }));
    await user.click(within(dialog).getByRole("button", { name: "Criar conector" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.params["organizationId"]).toBe(IDS.organization);
    expect(requests[0]?.body).toEqual({
      name: "docs-mcp",
      type: "mcp",
      config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
      toolPolicy: { allow: ["search", "write"], readOnly: ["search"] },
    });
  });

  it("flags invalid fields before sending and shows the API's field errors", async () => {
    const { user, api } = renderView({
      [`PATCH ${ONE}`]: apiError(400, "VALIDATION_FAILED", [{ field: "config.allowedHosts.0", issue: "HOST_NOT_ALLOWED" }]),
    });
    await user.click(await screen.findByRole("button", { name: "Editar issues-api" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar issues-api" });
    expect(within(dialog).getByRole("combobox", { name: "Tipo" }).hasAttribute("disabled")).toBe(true);
    const specUrl = within(dialog).getByRole("textbox", { name: "URL do documento OpenAPI" });
    await user.clear(specUrl);
    await paste(user, specUrl, "http://api.example.com/openapi.json");
    await user.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));
    expect(await within(dialog).findByText("Informe uma URL https válida.")).toBeDefined();
    expect(api.callLines().some((line) => line.startsWith("PATCH"))).toBe(false);

    await user.clear(specUrl);
    await paste(user, specUrl, "https://api.example.com/openapi.json");
    await user.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));
    expect(await within(dialog).findByText(/Informe de 1 a 20 hosts válidos/u)).toBeDefined();
    expect(within(dialog).getByRole("alert")).toBeDefined();
    await expectNoAxeViolations(dialog);
  });

  it("stores the secret write-only: never prefilled, never rendered after saving", async () => {
    const requests: FakeRequest[] = [];
    const { user, container } = renderView({
      [`PUT ${ONE}/secret`]: (request: FakeRequest) => {
        requests.push(request);
        return noContent();
      },
    });
    await user.click(await screen.findByRole("button", { name: "Substituir o segredo de issues-api" }));
    const dialog = await screen.findByRole("dialog", { name: "Substituir o segredo de issues-api" });
    const input = within(dialog).getByLabelText("Token ou chave de API");
    expect(input.getAttribute("type")).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input).toHaveProperty("value", "");
    await paste(user, input, SECRET);
    expect(dialog.textContent).not.toContain(SECRET);
    await user.click(within(dialog).getByRole("button", { name: "Substituir segredo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requests[0]?.params).toEqual({ organizationId: IDS.organization, connectorId: String(buildConnector()["id"]) });
    expect(requests[0]?.body).toEqual({ value: SECRET });
    expect(document.body.textContent).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(container.textContent).not.toContain(SECRET_REF);

    // Reopening starts empty again: the value did not survive the dialog.
    await user.click(screen.getByRole("button", { name: "Substituir o segredo de issues-api" }));
    const reopened = await screen.findByRole("dialog", { name: "Substituir o segredo de issues-api" });
    expect(within(reopened).getByLabelText("Token ou chave de API")).toHaveProperty("value", "");
  });

  it("disables an active connector and deletes one after confirmation", async () => {
    const calls: FakeRequest[] = [];
    const record = (response: ReturnType<typeof noContent>) => (request: FakeRequest) => {
      calls.push(request);
      return response;
    };
    const { user } = renderView({ [`PATCH ${ONE}`]: record(ok(buildConnector({ status: "disabled" }))), [`DELETE ${ONE}`]: record(noContent()) });
    await user.click(await screen.findByRole("button", { name: "Desativar issues-api" }));
    await user.click(within(await screen.findByRole("alertdialog", { name: "Desativar issues-api?" })).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ status: "disabled" });
    expect(calls[0]?.params["organizationId"]).toBe(IDS.organization);

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Excluir docs-mcp" }));
    await user.click(within(await screen.findByRole("alertdialog", { name: "Excluir docs-mcp?" })).getByRole("button", { name: "Excluir conector" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.method).toBe("DELETE");
    expect(calls[1]?.params).toEqual({ organizationId: IDS.organization, connectorId: "Cn4sK2lPq0WnR5tYu3bX" });
  });

  it("keeps a failed delete in the dialog with the error message", async () => {
    const { user } = renderView({ [`DELETE ${ONE}`]: apiError(403, "FORBIDDEN") });
    await user.click(await screen.findByRole("button", { name: "Excluir issues-api" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir issues-api?" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir conector" }));
    expect(await within(dialog).findByText(/Referência/u)).toBeDefined();
  });

  it("shows an empty state with the first action, and an error with retry", async () => {
    const first = renderView({ [LIST]: page([]) });
    expect(await screen.findByRole("heading", { name: "Nenhum conector" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Novo conector" }).length).toBe(2);
    first.unmount();
    renderView({ [LIST]: apiError(409, "CONFLICT") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
  });

  it("keeps the empty state's copy and holds its action while offline, instead of claiming no permission", async () => {
    renderView({ [LIST]: page([]) });
    expect(await screen.findByRole("heading", { name: "Nenhum conector" })).toBeDefined();
    setOnline(false);
    try {
      await waitFor(() => expect(screen.getAllByRole("button", { name: "Novo conector" }).every((button) => button.hasAttribute("disabled"))).toBe(true));
      expect(screen.getAllByRole("button", { name: "Novo conector" })).toHaveLength(2);
      expect(screen.getByText(/Crie um conector para que os agentes/u)).toBeDefined();
      expect(screen.queryByText(/Você não tem permissão para criar conectores/u)).toBeNull();
    } finally {
      setOnline(true);
    }
  });

  it("disables writes while offline", async () => {
    renderView();
    await screen.findByRole("table", { name: "Conectores de Northwind" });
    setOnline(false);
    try {
      expect(await screen.findByText(/Você está sem conexão/u)).toBeDefined();
      expect(screen.getByRole("button", { name: "Novo conector" }).hasAttribute("disabled")).toBe(true);
      expect(screen.queryByRole("button", { name: "Editar issues-api" })).toBeNull();
    } finally {
      setOnline(true);
    }
  });
});
