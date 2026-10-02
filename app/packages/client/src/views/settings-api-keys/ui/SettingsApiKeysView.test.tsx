import type { Permission } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildApiKey, PERMISSION_REGISTRY } from "#/shared/testing/settings-fixtures.ts";
import { SettingsApiKeysView } from "./SettingsApiKeysView.tsx";

const KEY_ADMIN: Permission[] = ["core.organization.read", "core.project.read", "core.unit.read", "core.api-key.read", "core.api-key.create", "core.api-key.revoke"];
const SECRET = "core_K7QX2M4PZ6AB_q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C";

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = KEY_ADMIN) =>
  renderApp(
    <main>
      <SettingsApiKeysView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/api-keys`,
      routes: shellRoutes(permissions, { "GET /v1/organizations/:organizationId/api-keys": page([buildApiKey()]), "GET /v1/permissions": page(PERMISSION_REGISTRY), ...routes }),
    },
  );

describe("SettingsApiKeysView", () => {
  it("lists keys by name and public id, never their secrets", async () => {
    const { container } = renderView();
    await screen.findByText("Reporting export");
    const table = screen.getByRole("table", { name: "Chaves de API de Northwind" });
    expect(within(table).getByText("K7QX2M4PZ6AB")).toBeDefined();
    expect(within(table).getByText("Nunca usada")).toBeDefined();
    expect(within(table).getByText("Ativa")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("creates a key with scopes limited to the actor, shows the secret once, and never again after closing", async () => {
    const bodies: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/api-keys": (request: FakeRequest) => {
        bodies.push(request);
        return ok({ apiKey: buildApiKey({ id: "AkNew000000000000000", name: "Sync" }), secret: SECRET }, 201);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Nova chave" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova chave de API" });
    await user.type(within(dialog).getByRole("textbox", { name: /Nome/u }), "Sync");
    const memberRead = await within(dialog).findByRole("checkbox", { name: /Ver membros/u });
    expect(memberRead.hasAttribute("disabled")).toBe(true);
    await user.click(within(dialog).getByRole("checkbox", { name: /Ver projetos/u }));
    await user.click(within(dialog).getByRole("button", { name: "Criar chave" }));

    const secret = await within(dialog).findByRole("textbox", { name: "Chave de API" });
    expect((secret as HTMLInputElement).value).not.toBe(SECRET);
    await user.click(within(dialog).getByRole("button", { name: "Mostrar valor" }));
    expect((secret as HTMLInputElement).value).toBe(SECRET);
    const done = within(dialog).getByRole("button", { name: "Concluir" });
    expect(done.hasAttribute("disabled")).toBe(true);
    await expectNoAxeViolations(dialog);

    const body = bodies[0]?.body as { name: string; scopes: string[]; expiresAt: string; node: unknown };
    expect(body.name).toBe("Sync");
    expect(body.scopes).toEqual(["core.project.read"]);
    expect(body.node).toEqual({ level: "organization", tenantId: IDS.organization });
    const days = (Date.parse(body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThanOrEqual(90);

    await user.click(within(dialog).getByRole("checkbox", { name: "Copiei e guardei a chave em lugar seguro" }));
    await user.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Nova chave" }));
    expect(await screen.findByRole("dialog", { name: "Nova chave de API" })).toBeDefined();
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
  });

  it("keeps the dialog while the key is created, and asks before Escape drops the unseen secret", async () => {
    let answer: (value: ReturnType<typeof ok>) => void = () => undefined;
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/api-keys": () => new Promise((resolve) => (answer = resolve)),
    });
    await user.click(await screen.findByRole("button", { name: "Nova chave" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova chave de API" });
    await user.type(within(dialog).getByRole("textbox", { name: /Nome/u }), "Sync");
    await user.click(await within(dialog).findByRole("checkbox", { name: /Ver projetos/u }));
    await user.click(within(dialog).getByRole("button", { name: "Criar chave" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(within(dialog).queryByRole("button", { name: "Fechar" })).toBeNull();
    answer(ok({ apiKey: buildApiKey({ id: "AkNew000000000000000", name: "Sync" }), secret: SECRET }, 201));
    await within(dialog).findByRole("textbox", { name: "Chave de API" });

    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Fechar sem guardar?" });
    await user.click(within(question).getByRole("button", { name: "Voltar" }));
    expect(within(dialog).getByRole("textbox", { name: "Chave de API" })).toBeDefined();

    await user.click(within(dialog).getByRole("checkbox", { name: "Copiei e guardei a chave em lugar seguro" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before Escape drops the secret while the key list is still refreshing", async () => {
    let listCalls = 0;
    const { user } = renderView({
      // The refresh after the creation never answers: the secret is on screen meanwhile.
      "GET /v1/organizations/:organizationId/api-keys": () => (++listCalls === 1 ? page([buildApiKey()]) : new Promise(() => undefined)),
      "POST /v1/organizations/:organizationId/api-keys": ok({ apiKey: buildApiKey({ id: "AkNew000000000000000", name: "Sync" }), secret: SECRET }, 201),
    });
    await user.click(await screen.findByRole("button", { name: "Nova chave" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova chave de API" });
    await user.type(within(dialog).getByRole("textbox", { name: /Nome/u }), "Sync");
    await user.click(await within(dialog).findByRole("checkbox", { name: /Ver projetos/u }));
    await user.click(within(dialog).getByRole("button", { name: "Criar chave" }));
    await within(dialog).findByRole("textbox", { name: "Chave de API" });
    await waitFor(() => expect(listCalls).toBe(2));

    expect(within(dialog).getByRole("button", { name: "Fechar" })).toBeDefined();
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog", { name: "Fechar sem guardar?" })).toBeDefined();
  });

  it("requires a name and a scope before calling the API", async () => {
    const { user, api } = renderView();
    await user.click(await screen.findByRole("button", { name: "Nova chave" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("checkbox", { name: /Ver projetos/u });
    await user.click(within(dialog).getByRole("button", { name: "Criar chave" }));
    expect(within(dialog).getByText("Dê um nome à chave.")).toBeDefined();
    await user.type(within(dialog).getByRole("textbox", { name: /Nome/u }), "Sync");
    await user.click(within(dialog).getByRole("button", { name: "Criar chave" }));
    expect(await within(dialog).findByText("Escolha pelo menos uma permissão.")).toBeDefined();
    expect(api.callLines().some((line) => line.startsWith("POST"))).toBe(false);
  });

  it("explains a failed permission catalog instead of an empty scope list, and retries", async () => {
    let catalogUp = false;
    const { user, api } = renderView({
      "GET /v1/permissions": () => (catalogUp ? page(PERMISSION_REGISTRY) : apiError(429, "RATE_LIMITED")),
    });
    await user.click(await screen.findByRole("button", { name: "Nova chave" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova chave de API" });
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Não foi possível carregar as permissões");
    expect(within(dialog).getByRole("button", { name: "Criar chave" }).hasAttribute("disabled")).toBe(true);
    catalogUp = true;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await within(dialog).findByRole("checkbox", { name: /Ver projetos/u })).toBeDefined();
    expect(api.callLines().some((line) => line.startsWith("POST"))).toBe(false);
  });

  it("revokes a key: the status changes at once and rolls back on failure", async () => {
    const { user, api } = renderView({ "DELETE /v1/api-keys/:apiKeyId": apiError(503, "INTERNAL_ERROR") });
    await user.click(await screen.findByRole("button", { name: "Revogar chave Reporting export" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Revogar a chave Reporting export?" });
    await user.click(within(confirm).getByRole("button", { name: "Revogar chave" }));
    expect(await within(confirm).findByRole("alert")).toBeDefined();
    expect(screen.getByRole("table", { hidden: true }).textContent).toContain("Ativa");

    api.route("DELETE /v1/api-keys/:apiKeyId", noContent());
    api.route("GET /v1/organizations/:organizationId/api-keys", page([buildApiKey({ status: "revoked", revokedReason: "revoked" })]));
    await user.click(within(confirm).getByRole("button", { name: "Revogar chave" }));
    expect(await screen.findByText("Chave Reporting export revogada.")).toBeDefined();
    await waitFor(() => expect(screen.getByRole("table").textContent).toContain("Revogada"));
  });

  it("shows no-access without core.api-key.read", async () => {
    renderView({}, ["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
  });
});
