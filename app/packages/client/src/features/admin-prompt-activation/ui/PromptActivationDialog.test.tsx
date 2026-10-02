import { PromptVersionSchema } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildPromptActivation, buildPromptVersion, PROMPT_IDS } from "#/shared/testing/admin-agents-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { PromptActivationDialog, type PromptActivationRequest } from "./PromptActivationDialog.tsx";

const ACTIVATE = "POST /v1/admin/agents/:agentId/activations";
const V1 = PromptVersionSchema.parse(buildPromptVersion({ evalVerdict: "passed" }));
const V2 = PromptVersionSchema.parse(buildPromptVersion({ id: PROMPT_IDS.v2, version: 2, evalVerdict: "passed" }));
const V3 = PromptVersionSchema.parse(buildPromptVersion({ id: PROMPT_IDS.v3, version: 3, evalVerdict: "failed" }));

function Harness({ request }: { request: PromptActivationRequest }) {
  const [open, setOpen] = useState<PromptActivationRequest | null>(request);
  return <PromptActivationDialog agentId="assistant" agentName="Assistente" request={open} activeVersion={V2} onOpenChange={(next) => !next && setOpen(null)} />;
}

afterEach(() => setOnline(true));

describe("PromptActivationDialog", () => {
  it("rolls back to an older version through a destructive confirmation, pending until the API answers", async () => {
    const held = holdResponse();
    const { user, api, container } = renderAdmin(<Harness request={{ version: V1, force: false }} />, { routes: { [ACTIVATE]: held.handler } });
    const dialog = await screen.findByRole("alertdialog", { name: "Reverter para a versão 1?" });
    expect(dialog.textContent).toContain("A versão 2 de Assistente sai de produção");
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Reverter" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Reverter" }).getAttribute("aria-busy")).toBe("true"));
    held.release(ok(buildPromptActivation(), 201));
    expect(await screen.findByText("Assistente revertido para a versão 1.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ versionId: PROMPT_IDS.v1 });
  });

  it("keeps a failed activation in the dialog with its reference, and holds it offline", async () => {
    const { user } = renderAdmin(<Harness request={{ version: V1, force: false }} />, { routes: { [ACTIVATE]: apiError(409, "EVAL_REQUIRED") } });
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Reverter" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Reverter" }).disabled).toBe(true));
  });

  it("forces a version without a passing eval only with a reason, which is sent and audited", async () => {
    const { user, api } = renderAdmin(<Harness request={{ version: V3, force: true }} />, { routes: { [ACTIVATE]: ok(buildPromptActivation({ versionId: PROMPT_IDS.v3, forced: true }), 201) } });
    const dialog = await screen.findByRole("dialog", { name: "Forçar a ativação da versão 3?" });
    await user.click(within(dialog).getByRole("button", { name: "Forçar ativação" }));
    expect(await within(dialog).findByText("Informe o motivo da ativação forçada.")).toBeDefined();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
    await user.type(within(dialog).getByRole("textbox", { name: /Motivo/u }), "  incidente 42 ");
    await user.click(within(dialog).getByRole("button", { name: "Forçar ativação" }));
    expect(await screen.findByText("Versão 3 de Assistente ativada sem avaliação aprovada.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ versionId: PROMPT_IDS.v3, force: true, reason: "incidente 42" });
  });

  it("shows a failed forced activation with its reference", async () => {
    const { user } = renderAdmin(<Harness request={{ version: V3, force: true }} />, { routes: { [ACTIVATE]: apiError(409, "CONFLICT") } });
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Motivo/u }), "incidente");
    await user.click(within(dialog).getByRole("button", { name: "Forçar ativação" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
  });

  it("holds a forced activation while offline and says why", async () => {
    const { user, api } = renderAdmin(<Harness request={{ version: V3, force: true }} />, { routes: { [ACTIVATE]: ok(buildPromptActivation(), 201) } });
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Motivo/u }), "incidente");
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Forçar ativação" }).disabled).toBe(true));
    expect(within(dialog).getByText(/Você está sem conexão/u)).toBeDefined();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });
});
