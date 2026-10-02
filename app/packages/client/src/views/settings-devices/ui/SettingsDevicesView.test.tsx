import type { Permission } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { noContent, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildDevice } from "#/shared/testing/settings-fixtures.ts";
import { SettingsDevicesView } from "./SettingsDevicesView.tsx";

const DEVICE_ADMIN: Permission[] = ["core.organization.read", "core.project.read", "core.device.read", "core.device.create", "core.device.revoke", "core.role.read"];
const inTenMinutes = (): string => new Date(Date.now() + 10 * 60_000).toISOString();

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = DEVICE_ADMIN) =>
  renderApp(
    <main>
      <SettingsDevicesView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/devices`,
      routes: shellRoutes(permissions, { "GET /v1/organizations/:organizationId/devices": page([buildDevice()]), "GET /v1/organizations/:organizationId/roles": page([]), ...routes }),
    },
  );

describe("SettingsDevicesView", () => {
  it("lists devices with status and last activity", async () => {
    const { container } = renderView();
    await screen.findByText("Front desk tablet");
    const table = screen.getByRole("table", { name: "Dispositivos de Northwind" });
    expect(within(table).getByText("Sem atividade")).toBeDefined();
    expect(within(table).getByText("Ativo")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("creates an activation code: shown once, grouped, with a polite minute countdown", async () => {
    const bodies: unknown[] = [];
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/device-activations": (request: FakeRequest) => {
        bodies.push(request.body);
        return ok({ id: "Da4tG6bY8hN0uJ2mI4kO", code: "7KQ2M9XA", expiresAt: inTenMinutes() }, 201);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Ativar dispositivo" }));
    const dialog = await screen.findByRole("dialog", { name: "Ativar dispositivo" });
    expect(within(dialog).getByRole("checkbox", { name: "Dispositivo" }).getAttribute("aria-checked")).toBe("true");
    await user.type(within(dialog).getByRole("textbox", { name: /Nome do dispositivo/u }), "Kiosk 2");
    await user.click(within(dialog).getByRole("button", { name: "Gerar código" }));
    const code = await within(dialog).findByRole("textbox", { name: "Código de ativação" });
    expect((code as HTMLInputElement).value).toBe("7KQ2-M9XA");
    expect(within(dialog).getByText("O código expira em 10 minutos.")).toBeDefined();
    expect(bodies).toEqual([{ label: "Kiosk 2", node: { level: "organization", tenantId: IDS.organization }, roles: [{ kind: "system", key: "device" }] }]);
    await expectNoAxeViolations(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Ativar dispositivo" }));
    await screen.findByRole("dialog", { name: "Ativar dispositivo" });
    expect(screen.queryByDisplayValue("7KQ2-M9XA")).toBeNull();
  });

  it("asks before Escape drops a live activation code", async () => {
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/device-activations": () => ok({ id: "Da4tG6bY8hN0uJ2mI4kO", code: "7KQ2M9XA", expiresAt: inTenMinutes() }, 201),
    });
    await user.click(await screen.findByRole("button", { name: "Ativar dispositivo" }));
    const dialog = await screen.findByRole("dialog", { name: "Ativar dispositivo" });
    await user.type(within(dialog).getByRole("textbox", { name: /Nome do dispositivo/u }), "Kiosk 2");
    await user.click(within(dialog).getByRole("button", { name: "Gerar código" }));
    await within(dialog).findByRole("textbox", { name: "Código de ativação" });
    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Fechar sem guardar?" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(question.isConnected).toBe(false);
    expect(within(dialog).getByRole("textbox", { name: "Código de ativação" })).toBeDefined();
  });

  it("hides an expired code and offers a new one", async () => {
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/device-activations": ok({ id: "Da4tG6bY8hN0uJ2mI4kO", code: "7KQ2M9XA", expiresAt: new Date(Date.now() - 1000).toISOString() }, 201),
    });
    await user.click(await screen.findByRole("button", { name: "Ativar dispositivo" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Nome do dispositivo/u }), "Kiosk 2");
    await user.click(within(dialog).getByRole("button", { name: "Gerar código" }));
    expect(await within(dialog).findByText("O código expirou")).toBeDefined();
    expect(within(dialog).queryByDisplayValue("7KQ2-M9XA")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Gerar novo código" }));
    expect(within(dialog).getByRole("button", { name: "Gerar código" })).toBeDefined();
  });

  it("revokes a device after confirming", async () => {
    const { user, api } = renderView({ "DELETE /v1/devices/:deviceId": noContent() });
    await user.click(await screen.findByRole("button", { name: "Revogar dispositivo Front desk tablet" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Revogar o dispositivo Front desk tablet?" });
    api.route("GET /v1/organizations/:organizationId/devices", page([buildDevice({ status: "revoked" })]));
    await user.click(within(confirm).getByRole("button", { name: "Revogar dispositivo" }));
    expect(await screen.findByText("Dispositivo Front desk tablet revogado.")).toBeDefined();
    await waitFor(() => expect(screen.getByRole("table").textContent).toContain("Revogado"));
  });

  it("shows the empty state with the activation action", async () => {
    const { container } = renderView({ "GET /v1/organizations/:organizationId/devices": page([]) });
    expect(await screen.findByRole("heading", { name: "Nenhum dispositivo ativado" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Ativar dispositivo" }).length).toBe(2);
    await expectNoAxeViolations(container);
  });
});
