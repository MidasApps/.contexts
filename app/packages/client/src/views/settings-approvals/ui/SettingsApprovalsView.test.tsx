import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildApprovalRequest } from "#/entities/approval-request/approval-request.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { ORGANIZATION_NODE, PROJECT_NODE } from "#/shared/testing/settings-fixtures.ts";
import { SettingsApprovalsView } from "./SettingsApprovalsView.tsx";

// The page waits on several reads (context, requests, grants, members); on a loaded machine the
// default 1 s of `findBy*` is too short.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30_000 });

const APPROVER: Permission[] = ["core.organization.read", "core.project.read", "core.approval.read", "core.approval.decide", "core.workflow-run.approve-demo"];
const READER: Permission[] = ["core.organization.read", "core.approval.read"];
const OTHER_UID = "uZ9y8X7w6V5u4T3s2R1q";
const HERE = { tenantId: IDS.organization, node: ORGANIZATION_NODE };

const waiting = buildApprovalRequest({ ...HERE, id: "ApWaiting00000000000", requestedBy: { type: "user", id: OTHER_UID }, action: { kind: "sample-delete-invoice", input: {}, summary: "Delete invoice 42" } });
const mine = buildApprovalRequest({ ...HERE, id: "ApMine00000000000000", requestedBy: { type: "user", id: IDS.user } });
const settled = buildApprovalRequest({
  ...HERE,
  id: "ApSettled00000000000",
  status: "rejected",
  requestedBy: { type: "user", id: OTHER_UID },
  decidedBy: IDS.user,
  reason: "Not this month",
  action: { kind: "sample-delete-invoice", input: {}, summary: "Archive the report" },
});

const ORG_GRANT = page([{ node: ORGANIZATION_NODE, roles: [{ kind: "system", key: "admin" }] }]);
const LIST = "GET /v1/organizations/:organizationId/approval-requests";
const ONE = "GET /v1/approval-requests/:approvalRequestId";
const APPROVE = "POST /v1/approval-requests/:approvalRequestId/approve";
const REJECT = "POST /v1/approval-requests/:approvalRequestId/reject";

const renderView = (options: { routes?: FakeRoutes; permissions?: readonly Permission[]; rest?: string } = {}) =>
  renderApp(
    <main>
      <SettingsApprovalsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/approvals${options.rest === undefined ? "" : `/${options.rest}`}`,
      routes: shellRoutes(options.permissions ?? APPROVER, { [LIST]: page([waiting, mine, settled]), "GET /v1/me/grants": ORG_GRANT, ...options.routes }),
    },
  );

describe("SettingsApprovalsView inbox", () => {
  it("lists what waits for my decision, with the requester, the place and a link to the request", async () => {
    const { container, api } = renderView();
    const list = await screen.findByRole("list", { name: "Aguardando minha decisão" });
    const link = within(list).getByRole("link", { name: "Delete invoice 42" });
    expect(link.getAttribute("href")).toBe(`/o/${IDS.organization}/settings/approvals/ApWaiting00000000000`);
    expect(within(list).getByText("Pendente")).toBeDefined();
    expect(within(list).getByText("Toda a organização")).toBeDefined();
    expect(within(list).queryByText(/Create the note/u)).toBeNull();
    expect(screen.getByRole("tab", { name: "Aguardando minha decisão (1)" }).getAttribute("aria-selected")).toBe("true");
    expect(await within(list).findByRole("button", { name: "Aprovar" })).toBeDefined();
    // The waiting and mine tabs read the pending requests only, filtered on the server.
    const listed = api.calls.find((call) => call.path.endsWith("/approval-requests"));
    expect(listed?.path).toBe(`/v1/organizations/${IDS.organization}/approval-requests`);
    expect(new URLSearchParams(listed?.query).get("status")).toBe("pending");
    // The history is read only when its tab opens.
    expect(api.calls.filter((call) => call.path.endsWith("/approval-requests") && !new URLSearchParams(call.query).has("status"))).toHaveLength(0);
    await expectNoAxeViolations(container);
  });

  it("shows my own pending requests without decision controls and the settled ones in the history", async () => {
    const { user } = renderView();
    await user.click(await screen.findByRole("tab", { name: "Pedidas por mim (1)" }));
    const own = await screen.findByRole("list", { name: "Pedidas por mim" });
    expect(within(own).getByText(/Pedida por você/u)).toBeDefined();
    expect(within(own).queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(within(own).getByRole("link", { name: "Ver o progresso do fluxo" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/workflows/runs/run-1`);
    await user.click(screen.getByRole("tab", { name: "Histórico" }));
    const history = await screen.findByRole("list", { name: "Histórico" });
    expect(within(history).getAllByRole("listitem")).toHaveLength(1);
    expect(within(history).getByText("Recusada")).toBeDefined();
    expect(within(history).getByText("Motivo informado: Not this month")).toBeDefined();
  });

  it("pages the history by cursor instead of reading it whole", async () => {
    const older = Array.from({ length: 25 }, (_, index) => ({ ...settled, id: `ApOld${String(index).padStart(15, "0")}`, reason: `Old ${index}` }));
    const history = (request: FakeRequest) => {
      if (request.query.get("status") === "pending") return page([waiting]);
      return request.query.get("cursor") === "next" ? page(older.slice(19)) : page([settled, ...older.slice(0, 19)], { cursor: "next" });
    };
    const { user, api } = renderView({ routes: { [LIST]: history } });
    await user.click(await screen.findByRole("tab", { name: "Histórico" }));
    const list = await screen.findByRole("list", { name: "Histórico" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    const pages = screen.getByRole("navigation", { name: "Páginas do histórico" });
    await user.click(within(pages).getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Histórico" })).getAllByRole("listitem")).toHaveLength(6));
    const reads = api.calls.filter((call) => call.path.endsWith("/approval-requests") && !new URLSearchParams(call.query).has("status"));
    expect(reads.map((call) => [new URLSearchParams(call.query).get("cursor"), new URLSearchParams(call.query).get("limit")])).toEqual([[null, "20"], ["next", "20"]]);
  });

  it("says when the pending requests were cut at the read limit", async () => {
    let index = 0;
    const endless = (request: FakeRequest) => {
      index += 1;
      const one = { ...waiting, id: `ApMany${String(index).padStart(14, "0")}` };
      return request.query.get("status") === "pending" ? page([one], { cursor: `c${index}` }) : page([]);
    };
    const { container } = renderView({ routes: { [LIST]: endless } });
    expect(await screen.findByText("Nem todas as solicitações pendentes foram carregadas")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("approves with a reason and shows the result", async () => {
    const bodies: FakeRequest[] = [];
    const { user, api } = renderView({
      routes: {
        [APPROVE]: (request: FakeRequest) => {
          bodies.push(request);
          api.route(LIST, page([{ ...waiting, status: "executed", decidedBy: IDS.user, reason: "Checked" }]));
          return ok({ ...waiting, status: "executed", decidedBy: IDS.user, reason: "Checked" });
        },
      },
    });
    const list = await screen.findByRole("list", { name: "Aguardando minha decisão" });
    await user.type(await within(list).findByRole("textbox", { name: "Motivo (opcional)" }), "Checked");
    await user.click(within(list).getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.params["approvalRequestId"]).toBe("ApWaiting00000000000");
    expect(bodies[0]?.body).toEqual({ reason: "Checked" });
    expect(await screen.findByRole("heading", { name: "Nada aguardando sua decisão" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Aguardando minha decisão (0)" })).toBeDefined();
  });

  it("rejects only after a confirmation", async () => {
    const bodies: FakeRequest[] = [];
    const { user } = renderView({
      routes: {
        [REJECT]: (request: FakeRequest) => {
          bodies.push(request);
          return ok({ ...waiting, status: "rejected", decidedBy: IDS.user });
        },
      },
    });
    const list = await screen.findByRole("list", { name: "Aguardando minha decisão" });
    await user.click(await within(list).findByRole("button", { name: "Recusar" }));
    expect(bodies).toHaveLength(0);
    const dialog = await screen.findByRole("alertdialog", { name: "Recusar esta solicitação?" });
    await user.click(within(dialog).getByRole("button", { name: "Recusar solicitação" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.body).toEqual({});
  });

  it.each([
    ["SELF_APPROVAL_FORBIDDEN", 403, "Você não pode decidir uma solicitação que você mesmo pediu. Outra pessoa precisa decidir."],
    ["FORBIDDEN", 403, "Você não tem permissão para decidir esta solicitação neste local."],
    ["CONFLICT", 409, "Esta solicitação já foi decidida ou expirou. A lista foi atualizada."],
    ["NOT_FOUND", 404, "Esta solicitação não existe mais ou você perdeu o acesso a ela."],
  ])("explains a refused decision: %s", async (code, status, message) => {
    const { user } = renderView({ routes: { [APPROVE]: apiError(status, code) } });
    const list = await screen.findByRole("list", { name: "Aguardando minha decisão" });
    await user.click(await within(list).findByRole("button", { name: "Aprovar" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });

  it("offers no decision to a viewer without the decide permission, and says why", async () => {
    renderView({ permissions: READER });
    const list = await screen.findByRole("list", { name: "Aguardando minha decisão" });
    expect(await within(list).findByText(/Você não tem permissão para decidir esta solicitação/u)).toBeDefined();
    expect(within(list).queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(within(list).queryByRole("button", { name: "Recusar" })).toBeNull();
  });

  it("offers no decision when the viewer's grants do not cover the request's node", async () => {
    renderView({ routes: { "GET /v1/me/grants": page([{ node: { ...PROJECT_NODE, projectId: IDS.otherProject }, roles: [{ kind: "system", key: "admin" }] }]) } });
    const list = await screen.findByRole("list", { name: "Aguardando minha decisão" });
    expect(await within(list).findByText("Seu acesso não cobre o local desta solicitação, então você não pode decidi-la.")).toBeDefined();
    expect(within(list).queryByRole("button", { name: "Aprovar" })).toBeNull();
  });

  it("shows the no-access state without core.approval.read and never asks for the requests", async () => {
    const { api } = renderView({ permissions: ["core.organization.read"] });
    expect(await screen.findByText("Você não tem acesso a esta página")).toBeDefined();
    expect(api.callLines().some((line) => line.includes("approval-requests"))).toBe(false);
  });

  it("shows the API error with its reference and an empty inbox", async () => {
    const failing = renderView({ routes: { [LIST]: apiError(503, "UPSTREAM_UNAVAILABLE") } });
    expect((await screen.findByRole("alert")).textContent).toContain("Referência");
    failing.unmount();
    renderView({ routes: { [LIST]: page([]) } });
    expect(await screen.findByRole("heading", { name: "Nada aguardando sua decisão" })).toBeDefined();
  });
});

describe("SettingsApprovalsView detail", () => {
  it("opens one request at its stable address with the decision controls and a way back", async () => {
    const { container } = renderView({ rest: "ApWaiting00000000000", routes: { [ONE]: ok(waiting) } });
    expect(await screen.findByRole("heading", { level: 1, name: "Solicitação de aprovação" })).toBeDefined();
    expect(await screen.findByRole("heading", { level: 2, name: "Delete invoice 42" })).toBeDefined();
    expect(screen.getByText("Permissão da ação")).toBeDefined();
    expect(screen.getByText("Aprovar a ação da demonstração de aprovação").getAttribute("title")).toBe("core.workflow-run.approve-demo");
    expect(await screen.findByRole("button", { name: "Aprovar" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Voltar para aprovações" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/approvals`);
    await expectNoAxeViolations(container);
  });

  it("tells the requester why they cannot decide their own request", async () => {
    renderView({ rest: "ApMine00000000000000", routes: { [ONE]: ok(mine) } });
    expect(await screen.findByText("Você pediu esta aprovação. Outra pessoa com permissão precisa decidir.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
  });

  it("renders not found inside the settings frame for a hidden id or a request of another organization", async () => {
    const hidden = renderView({ rest: "ApHidden000000000000" });
    expect(await screen.findByRole("heading", { name: "Solicitação não encontrada" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Solicitação de aprovação" })).toBeDefined();
    hidden.unmount();
    renderView({ rest: "ApWaiting00000000000", routes: { [ONE]: ok(buildApprovalRequest({ id: "ApWaiting00000000000" })) } });
    expect(await screen.findByRole("heading", { name: "Solicitação não encontrada" })).toBeDefined();
  });
});
