import { AdminImpersonationSessionSchema, type AdminImpersonationSession } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminImpersonationSession, buildImpersonationStart, IMPERSONATION_IDS } from "#/shared/testing/admin-accounts-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, noContent, ok, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { useImpersonationStore } from "../model/use-impersonation-store.ts";
import { EndImpersonationSessionDialog } from "./EndImpersonationSessionDialog.tsx";
import { StartImpersonationForm, type ImpersonationTarget } from "./StartImpersonationForm.tsx";

const START = "POST /v1/platform/impersonation-sessions";
const ANA: ImpersonationTarget = { id: IMPERSONATION_IDS.target, label: "Ana Souza", detail: "ana@example.com" };
const REASON = "Chamado 4821: não vê o projeto";

function StartHarness({ initialTarget, onTargetClear }: { initialTarget: ImpersonationTarget | undefined; onTargetClear: () => void }) {
  const [target, setTarget] = useState(initialTarget);
  return (
    <StartImpersonationForm
      target={target}
      onTargetClear={() => {
        onTargetClear();
        setTarget(undefined);
      }}
      organizationId={IDS.organization}
      organizationName="Northwind"
      organizationField={() => <p>Organização: Northwind</p>}
    />
  );
}

const renderStart = (routes: FakeRoutes = {}, options: { withoutTarget?: boolean } = {}) => {
  const onTargetClear = vi.fn();
  const target = options.withoutTarget === true ? undefined : ANA;
  return { ...renderAdmin(<StartHarness initialTarget={target} onTargetClear={onTargetClear} />, { routes }), onTargetClear };
};

afterEach(() => {
  setOnline(true);
  useImpersonationStore.getState().reset();
});

describe("StartImpersonationForm", () => {
  it("starts a session for the chosen user, keeps it for this tab and forgets the choice", async () => {
    const held = holdResponse();
    const { user, api, container, onTargetClear } = renderStart({ [START]: held.handler });
    await expectNoAxeViolations(container);
    await user.type(await screen.findByRole("textbox", { name: "Motivo" }), REASON);
    const submit = screen.getByRole("button", { name: "Iniciar sessão" });
    await user.click(submit);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    held.release(ok(buildImpersonationStart(), 201));
    expect(await screen.findByText("Sessão de suporte iniciada.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ targetUid: IMPERSONATION_IDS.target, organizationId: IDS.organization, reason: REASON, durationMinutes: 60 });
    expect(useImpersonationStore.getState().session).toMatchObject({ sessionId: IMPERSONATION_IDS.session, targetLabel: "Ana Souza", organizationName: "Northwind" });
    expect(onTargetClear).toHaveBeenCalledTimes(1);
  });

  it("names every missing field before calling the API", async () => {
    const { user, api } = renderStart({}, { withoutTarget: true });
    await user.click(await screen.findByRole("button", { name: "Iniciar sessão" }));
    expect(await screen.findByText("Selecione o usuário na busca.")).toBeDefined();
    const reason = screen.getByRole("textbox", { name: "Motivo" });
    expect(reason.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Explique o motivo com 10 a 500 caracteres.")).toBeDefined();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("explains a 404 and shows other failures with their reference", async () => {
    const { user, api } = renderStart({ [START]: apiError(404, "NOT_FOUND") });
    await user.type(await screen.findByRole("textbox", { name: "Motivo" }), REASON);
    await user.click(screen.getByRole("button", { name: "Iniciar sessão" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Este usuário não existe ou não tem acesso a essa organização.");
    api.route(START, apiError(503, "UPSTREAM_UNAVAILABLE"));
    await user.click(screen.getByRole("button", { name: "Iniciar sessão" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(FAKE_REQUEST_ID));
    expect(useImpersonationStore.getState().session).toBeNull();
  });

  it("holds the start while offline", async () => {
    renderStart();
    const submit = await screen.findByRole<HTMLButtonElement>("button", { name: "Iniciar sessão" });
    setOnline(false);
    await waitFor(() => expect(submit.disabled).toBe(true));
  });
});

function EndHarness({ session }: { session: AdminImpersonationSession }) {
  const [open, setOpen] = useState<AdminImpersonationSession | null>(session);
  return <EndImpersonationSessionDialog session={open} staffLabel="Bruno Lima" userLabel="Ana Souza" onOpenChange={(next) => !next && setOpen(null)} />;
}

const SESSION = AdminImpersonationSessionSchema.parse(buildAdminImpersonationSession());
const END = "POST /v1/admin/impersonation-sessions/:sessionId/end";

describe("EndImpersonationSessionDialog", () => {
  it("ends the session at once and forgets it when this tab had started it", async () => {
    useImpersonationStore.getState().start({ sessionId: IMPERSONATION_IDS.session, expiresAt: SESSION.expiresAt, targetUid: IMPERSONATION_IDS.target, organizationId: IDS.organization });
    const { user, api, container } = renderAdmin(<EndHarness session={SESSION} />, { routes: { [END]: noContent() } });
    const dialog = await screen.findByRole("alertdialog", { name: "Encerrar esta sessão de suporte?" });
    expect(dialog.textContent).toContain("O acesso de Bruno Lima como Ana Souza deixa de funcionar imediatamente.");
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Encerrar sessão" }));
    expect(await screen.findByText("Sessão de Bruno Lima encerrada.")).toBeDefined();
    expect(api.callLines()).toContain(`POST /v1/admin/impersonation-sessions/${IMPERSONATION_IDS.session}/end`);
    expect(useImpersonationStore.getState().session).toBeNull();
  });

  it("keeps the dialog open with the reference when ending fails, and holds it offline", async () => {
    const { user } = renderAdmin(<EndHarness session={SESSION} />, { routes: { [END]: apiError(409, "CONFLICT") } });
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Encerrar sessão" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Encerrar sessão" }).disabled).toBe(true));
  });
});
