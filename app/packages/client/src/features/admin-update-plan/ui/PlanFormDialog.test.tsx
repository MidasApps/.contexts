import { PlanSchema, type Plan } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { ADMIN_IDS, buildPlan } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { PlanFormDialog } from "./PlanFormDialog.tsx";

const STANDARD = PlanSchema.parse(buildPlan());

function Harness({ plan }: { plan: Plan | null }) {
  const [open, setOpen] = useState(true);
  return <PlanFormDialog plan={plan} open={open} onOpenChange={setOpen} />;
}

afterEach(() => setOnline(true));

describe("PlanFormDialog", () => {
  it("creates a plan, pending until the API answers, then closes and says so", async () => {
    const held = holdResponse();
    const { user, api, container } = renderAdmin(<Harness plan={null} />, { routes: { "POST /v1/admin/plans": held.handler } });
    const dialog = await screen.findByRole("dialog", { name: "Novo plano" });
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.type(within(dialog).getByRole("textbox", { name: /^Nome/u }), "Pro");
    const fill = async (field: HTMLElement, text: string): Promise<void> => {
      await user.clear(field);
      await user.type(field, text);
    };
    await fill(within(dialog).getByRole("textbox", { name: /Gasto mensal com modelos/u }), "120,50");
    await fill(within(dialog).getByRole("spinbutton", { name: /Tokens por mês/u }), "5000");
    await fill(within(dialog).getByRole("spinbutton", { name: /Máximo de conectores/u }), "3");
    const submit = within(dialog).getByRole("button", { name: "Criar plano" });
    await user.click(submit);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    held.release(ok(buildPlan({ id: ADMIN_IDS.otherPlan, name: "Pro" }), 201));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Plano Pro criado.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ name: "Pro", limits: { monthlyMicroUsd: 120_500_000, monthlyTokens: 5000, maxConnectors: 3 } });
  });

  it("replaces a plan with a PUT and warns that the budgets of its organizations follow", async () => {
    const { user, api } = renderAdmin(<Harness plan={STANDARD} />, { routes: { "PUT /v1/admin/plans/:planId": ok(buildPlan({ name: "Standard+" })) } });
    const dialog = await screen.findByRole("dialog", { name: "Editar o plano Standard" });
    expect(dialog.textContent).toContain("atualiza o orçamento de todas as organizações que o usam");
    await user.type(within(dialog).getByRole("textbox", { name: /^Nome/u }), "+");
    await user.click(within(dialog).getByRole("button", { name: "Salvar plano" }));
    expect(await screen.findByText("Plano Standard+ atualizado.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PUT")?.path).toBe(`/v1/admin/plans/${ADMIN_IDS.plan}`);
  });

  it("keeps the dialog open with the error and its reference when saving fails", async () => {
    const { user } = renderAdmin(<Harness plan={STANDARD} />, { routes: { "PUT /v1/admin/plans/:planId": apiError(409, "CONFLICT") } });
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^Nome/u }), "+");
    await user.click(within(dialog).getByRole("button", { name: "Salvar plano" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("holds the save while offline and says why", async () => {
    const { user, api } = renderAdmin(<Harness plan={STANDARD} />);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^Nome/u }), "+");
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Salvar plano" }).disabled).toBe(true));
    expect(within(dialog).getByText(/Você está sem conexão/u)).toBeDefined();
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
