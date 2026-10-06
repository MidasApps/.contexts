import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { ADMIN_IDS, buildPlan } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, noContent, ok } from "#/shared/testing/fake-api.ts";
import { AdminPlansView } from "./AdminPlansView.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");

const render = (options: Parameters<typeof renderAdmin>[1] = {}) =>
  renderAdmin(<AdminPlansView />, {
    path: "/admin/plans",
    routes: { "GET /v1/admin/plans": ok([buildPlan()]) },
    ...options,
  });

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

// Forms typed key by key: the default 5 s is too tight when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

describe("AdminPlansView", () => {
  it("lists the plans with their limits", async () => {
    const { container } = render();
    const table = await screen.findByRole("table", { name: "Catálogo de planos" });
    const row = within(table).getByRole("row", { name: /Standard/u });
    expect(plain(row.textContent)).toContain("US$ 50,00");
    expect(plain(row.textContent)).toContain("20.000.000");
    expect(
      within(within(row).getByRole("list", { name: "Funcionalidades do plano Standard" })).getByText("web-tools"),
    ).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("creates a plan from the dialog, converting dollars to micro-USD and splitting features", async () => {
    const created = buildPlan({
      id: ADMIN_IDS.otherPlan,
      name: "Pro",
      limits: {
        monthlyMicroUsd: 120_500_000,
        monthlyTokens: 5000,
        maxConnectors: 3,
        features: ["web-tools", "chat.voice"],
      },
    });
    const { user, api, container } = render({
      routes: { "GET /v1/admin/plans": ok([buildPlan()]), "POST /v1/admin/plans": ok(created, 201) },
    });
    await user.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo plano" });
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.type(within(dialog).getByRole("textbox", { name: /^Nome/u }), "Pro");
    const budget = within(dialog).getByRole("textbox", { name: /Gasto mensal com modelos/u });
    await user.clear(budget);
    await user.type(budget, "120,50");
    const tokens = within(dialog).getByRole("spinbutton", { name: /Tokens por mês/u });
    await user.clear(tokens);
    await user.type(tokens, "5000");
    const connectors = within(dialog).getByRole("spinbutton", { name: /Máximo de conectores/u });
    await user.clear(connectors);
    await user.type(connectors, "3");
    await user.type(
      within(dialog).getByRole("textbox", { name: /Funcionalidades/u }),
      "web-tools, chat.voice web-tools",
    );
    api.route("GET /v1/admin/plans", ok([buildPlan(), created]));
    await user.click(within(dialog).getByRole("button", { name: "Criar plano" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({
      name: "Pro",
      limits: {
        monthlyMicroUsd: 120_500_000,
        monthlyTokens: 5000,
        maxConnectors: 3,
        features: ["web-tools", "chat.voice"],
      },
    });
    expect(await screen.findByText("Plano Pro criado.")).toBeDefined();
    expect(await screen.findByRole("row", { name: /Pro/u })).toBeDefined();
  });

  it("edits a plan with its current values and warns that budgets follow", async () => {
    const { user, api } = render({
      routes: {
        "GET /v1/admin/plans": ok([buildPlan()]),
        "PUT /v1/admin/plans/:planId": ok(buildPlan({ name: "Standard+" })),
      },
    });
    await user.click(await screen.findByRole("button", { name: "Editar o plano Standard" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar o plano Standard" });
    expect(within(dialog).getByText(/atualiza o orçamento de todas as organizações/u)).toBeDefined();
    const name = within(dialog).getByRole("textbox", { name: /^Nome/u });
    expect((name as HTMLInputElement).value).toBe("Standard");
    await user.type(name, "+");
    await user.click(within(dialog).getByRole("button", { name: "Salvar plano" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const put = api.calls.find((call) => call.method === "PUT");
    expect(put?.path).toBe(`/v1/admin/plans/${ADMIN_IDS.plan}`);
    expect(put?.body).toEqual({
      name: "Standard+",
      limits: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000, maxConnectors: 5, features: ["web-tools"] },
    });
    expect(await screen.findByText("Plano Standard+ atualizado.")).toBeDefined();
  });

  it("closes an untouched plan on Escape and asks before discarding an edited one", async () => {
    const { user } = render();
    await user.click(await screen.findByRole("button", { name: "Editar o plano Standard" }));
    await screen.findByRole("dialog", { name: "Editar o plano Standard" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Editar o plano Standard" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar o plano Standard" });
    await user.type(within(dialog).getByRole("textbox", { name: /^Nome/u }), " Plus");
    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Descartar alterações?" });
    await user.click(within(question).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open with the error and its reference when saving fails", async () => {
    const { user } = render({
      routes: { "GET /v1/admin/plans": ok([buildPlan()]), "PUT /v1/admin/plans/:planId": apiError(403, "FORBIDDEN") },
    });
    await user.click(await screen.findByRole("button", { name: "Editar o plano Standard" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar o plano Standard" });
    await user.click(within(dialog).getByRole("button", { name: "Salvar plano" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Você não tem permissão para fazer isso.");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("refuses feature keys that are not dotted kebab-case before calling the API", async () => {
    const { user, api } = render();
    await user.click(await screen.findByRole("button", { name: "Editar o plano Standard" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar o plano Standard" });
    await user.type(within(dialog).getByRole("textbox", { name: /Funcionalidades/u }), ", Web Tools!");
    await user.click(within(dialog).getByRole("button", { name: "Salvar plano" }));
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole("textbox", { name: /Funcionalidades/u })
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("offers to create the first plan when the catalog is empty", async () => {
    const { user, container } = render({ routes: { "GET /v1/admin/plans": ok([]) } });
    const empty = await screen.findByRole("heading", { level: 2, name: "Nenhum plano cadastrado" });
    await expectNoAxeViolations(container);
    const cta = within(empty.closest("[data-slot='state-panel']") as HTMLElement).getByRole("button", {
      name: "Novo plano",
    });
    await user.click(cta);
    expect(await screen.findByRole("dialog", { name: "Novo plano" })).toBeDefined();
  });

  it("holds writes while offline", async () => {
    render();
    await screen.findByRole("table", { name: "Catálogo de planos" });
    try {
      setOnline(false);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Novo plano" }).hasAttribute("disabled")).toBe(true),
      );
      expect(screen.getByRole("button", { name: "Editar o plano Standard" }).hasAttribute("disabled")).toBe(true);
    } finally {
      setOnline(true);
    }
  });

  it("deletes a plan after confirming, and explains PLAN_IN_USE", async () => {
    const { user, api } = render({
      routes: {
        "GET /v1/admin/plans": ok([buildPlan()]),
        "DELETE /v1/admin/plans/:planId": apiError(409, "PLAN_IN_USE"),
      },
    });
    await user.click(await screen.findByRole("button", { name: "Excluir o plano Standard" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir o plano Standard?" });
    await user.click(within(confirm).getByRole("button", { name: "Excluir plano" }));
    expect((await within(confirm).findByRole("alert")).textContent).toContain("ainda está em uso");

    api.route("DELETE /v1/admin/plans/:planId", noContent());
    api.route("GET /v1/admin/plans", ok([]));
    await user.click(within(confirm).getByRole("button", { name: "Excluir plano" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await screen.findByText("Nenhum plano cadastrado")).toBeDefined();
  });

  it("is closed to the support role", async () => {
    const { api } = render({ role: "platform-support" });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Novo plano" })).toBeNull();
    expect(api.callLines()).not.toContain("GET /v1/admin/plans");
  });
});
