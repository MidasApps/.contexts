import type { Page } from "@playwright/test";
import { signInThroughUi } from "@core/e2e/sign-in";
import { addMember, expect, openAs, settingsPath, test, toast, unique, type FreshUser, type Sp5Org } from "./sp5-test.ts";

// SP5 Task 16, `/settings/approvals` with four eyes: the owner starts `approval-demo`, which
// suspends on an approval request; the owner (the requester) sees no decision buttons and why;
// a second administrator approves one run and rejects another from the inbox.

/** Starts approval-demo from the workflows page and returns the approval request's path. */
const startRunAwaitingApproval = async (page: Page, org: Sp5Org, title: string): Promise<string> => {
  await page.goto(settingsPath(org.id, "workflows"));
  await page.getByRole("button", { name: "Iniciar fluxo" }).first().click();
  const start = page.getByRole("dialog", { name: "Iniciar fluxo" });
  await start.getByRole("combobox", { name: /^Fluxo/ }).click();
  // Workflows are named by their labels; the input is filled field by field from its schema.
  await page.getByRole("option", { name: "Demonstração de aprovação" }).click();
  await start.getByRole("textbox", { name: /^Título/ }).fill(title);
  await start.getByRole("button", { name: "Iniciar", exact: true }).click();
  const approvals = page.getByRole("link", { name: "Abrir aprovações" });
  await expect(approvals).toBeVisible({ timeout: 90_000 });
  const href = (await approvals.getAttribute("href")) ?? "";
  return href.replace(/^\/pt-BR\//, "");
};

const signInAdmin = async (args: { browser: Parameters<typeof openAs>[0]; ownerApi: Parameters<typeof addMember>[0]["owner"]; createUser: (a: { label: string }) => Promise<FreshUser>; org: Sp5Org }) => {
  const admin = await args.createUser({ label: "Approver" });
  await addMember({ owner: args.ownerApi, user: admin, organizationId: args.org.id, roles: [{ kind: "system", key: "admin" }] });
  const session = await openAs(args.browser, { cookies: [], origins: [] });
  await signInThroughUi(session.page, admin);
  return session;
};

test.describe("four-eyes approvals", () => {
  test("the requester cannot decide; a second admin approves one run and rejects another", async ({ page, browser, sp5Org, ownerApi, createUser }) => {
    test.setTimeout(360_000);
    const approveTitle = unique("Note to approve");
    const rejectTitle = unique("Note to reject");
    const toApprove = await startRunAwaitingApproval(page, sp5Org, approveTitle);
    const toReject = await startRunAwaitingApproval(page, sp5Org, rejectTitle);

    // The requester: the request is under "requested by me", the detail explains why there are no buttons.
    await page.goto(settingsPath(sp5Org.id, "approvals"));
    await expect(page.getByRole("heading", { level: 1, name: "Aprovações" })).toBeVisible();
    await page.getByRole("tab", { name: /^Pedidas por mim \(\d+\)$/ }).click();
    await expect(page.getByRole("tabpanel").getByText(approveTitle).first()).toBeVisible();
    await page.goto(toApprove);
    await expect(page.getByRole("heading", { level: 1, name: "Solicitação de aprovação" })).toBeVisible();
    await expect(page.getByText("Você pediu esta aprovação. Outra pessoa com permissão precisa decidir.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprovar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Recusar" })).toHaveCount(0);

    const approver = await signInAdmin({ browser, ownerApi, createUser, org: sp5Org });
    const admin = approver.page;
    await admin.goto(settingsPath(sp5Org.id, "approvals"));
    // Exactly the two requests of this test wait for this admin (one organization per test; a
    // cancelled run cancels its request, follow-up 82).
    await expect(admin.getByRole("tab", { name: "Aguardando minha decisão (2)", exact: true })).toBeVisible();
    await expect(admin.getByRole("tabpanel").getByText(approveTitle).first()).toBeVisible();
    await expect(admin.getByRole("tabpanel").getByText(rejectTitle).first()).toBeVisible();

    await admin.goto(toApprove);
    await admin.getByRole("textbox", { name: /^Motivo/ }).fill("Looks right.");
    await admin.getByRole("button", { name: "Aprovar" }).click();
    await expect(toast(admin, /^Solicitação aprovada/)).toBeVisible();

    await admin.goto(toReject);
    await admin.getByRole("button", { name: "Recusar" }).click();
    await admin.getByRole("alertdialog", { name: "Recusar esta solicitação?" }).getByRole("button", { name: "Recusar solicitação" }).click();
    await expect(toast(admin, "Solicitação recusada.")).toBeVisible();

    await admin.goto(settingsPath(sp5Org.id, "approvals"));
    await expect(admin.getByRole("tab", { name: /^Aguardando minha decisão/ })).toHaveAttribute("aria-selected", "true");
    await expect(admin.getByRole("tabpanel").getByText(approveTitle)).toHaveCount(0);
    await expect(admin.getByRole("tabpanel").getByText(rejectTitle)).toHaveCount(0);
    await admin.getByRole("tab", { name: /^Histórico/ }).click();
    await expect(admin.getByRole("tabpanel").getByText(approveTitle).first()).toBeVisible();
    await expect(admin.getByRole("tabpanel").getByText(rejectTitle).first()).toBeVisible();
    await approver.close();

    // The runs settle: the approved one applies, the rejected one ends without applying.
    await page.goto(settingsPath(sp5Org.id, "workflows"));
    const runs = page.getByRole("table", { name: `Execuções de fluxos de ${sp5Org.name}` });
    await expect(async () => {
      await page.reload();
      await expect(runs.getByRole("row").filter({ hasText: "Demonstração de aprovação" }).filter({ hasText: "Concluída" })).toHaveCount(2, { timeout: 5_000 });
    }).toPass({ timeout: 120_000 });
  });
});
