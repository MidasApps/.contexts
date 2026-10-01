import type { Page } from "@playwright/test";
import type { V1Client } from "@core/e2e/api";
import { expectNoAxeViolations } from "@core/e2e/axe";
import { chatStatus, expect, expectAnswered, messageLog, openChat, send, SIGNED_OUT, test } from "./chat-test.ts";

// SP4 gate, part 2 (umbrella §1 item 3, §8): generative UI form → submit → inline approval with
// before/after → the command runs and is audited; a declined call runs nothing; a four-eyes command
// waits in the approvals inbox, linked from the chat.

test.use({ storageState: SIGNED_OUT });
// The decline journey counts the notes created in the organization: no other journey of this
// file may create one meanwhile.
test.describe.configure({ mode: "serial" });

type AuditEntry = { action: string; target?: { type?: string; id?: string }; metadata?: Record<string, unknown> };

const auditOf = (owner: V1Client, organizationId: string): Promise<AuditEntry[]> =>
  owner.get<AuditEntry[]>(`/v1/organizations/${organizationId}/audit-logs?limit=100`);

/** Asks for a note form and submits it with this title; waits for the approval card. */
const submitNoteForm = async (page: Page, title: string) => {
  await send(page, "Create a note");
  await expectAnswered(page);
  const form = messageLog(page).getByRole("form", { name: "Formulário: example.CreateNoteCommand" });
  await expect(form).toBeVisible();
  await expectNoAxeViolations(page);
  await form.getByRole("textbox", { name: "Título (obrigatório)" }).fill(title);
  await form.getByRole("button", { name: "Enviar" }).click();
  await expect(chatStatus(page)).toHaveAttribute("data-phase", "awaiting-approval", { timeout: 30_000 });
  await expect(messageLog(page).getByRole("article", { name: "Você" }).last()).toContainText("Formulário enviado: example.CreateNoteCommand");
  const card = messageLog(page).getByRole("region", { name: `Aprovação: Create the note "${title}"` });
  await expect(card.getByRole("heading", { name: "Aprovação necessária" })).toBeVisible();
  return card;
};

test("a submitted form asks for approval with before and after, then the command runs and is audited", async ({ page, world, signInFresh, ownerApi }) => {
  const user = await signInFresh();
  await openChat(page, world);
  const card = await submitNoteForm(page, "Supplier follow-up");
  await expect(card.getByText("Permissão: example.note.create")).toBeVisible();
  const diff = card.getByRole("table", { name: "Alterações propostas" });
  await expect(diff.getByRole("row", { name: /title/ })).toContainText("Supplier follow-up");
  await expectNoAxeViolations(page);

  await card.getByRole("button", { name: "Aprovar" }).click();
  await expectAnswered(page);
  await expect(card.getByText("Aprovado e executado.")).toBeVisible();

  const audit = await auditOf(ownerApi, world.alpha.id);
  const approved = audit.find((entry) => entry.action === "AGENT_TOOL_CALL_APPROVED" && entry.metadata?.["toolId"] === "agent-action");
  expect(approved?.target?.type).toBe("conversation");
  expect(audit.some((entry) => entry.action === "AGENT_TOOL_EXECUTED" && entry.target?.id === "command.example.CreateNoteCommand")).toBe(true);
  expect(audit.some((entry) => entry.action === "MODULE_RECORD_CREATED" && entry.target?.type === "example-note")).toBe(true);
  expect(user.uid).not.toBe("");
});

test("a declined call runs nothing and keeps the reason", async ({ page, world, signInFresh, ownerApi }) => {
  await signInFresh();
  await openChat(page, world);
  const before = (await auditOf(ownerApi, world.alpha.id)).filter((entry) => entry.action === "MODULE_RECORD_CREATED").length;
  const card = await submitNoteForm(page, "Not this one");
  await card.getByRole("button", { name: "Recusar" }).click();
  await card.getByRole("textbox", { name: "Motivo da recusa (opcional)" }).fill("Wrong title");
  await card.getByRole("button", { name: "Confirmar recusa" }).click();
  await expect(chatStatus(page)).toHaveAttribute("data-phase", /finished|idle/, { timeout: 30_000 });
  await expect(card.getByText("Recusado: Wrong title")).toBeVisible();

  const audit = await auditOf(ownerApi, world.alpha.id);
  expect(audit.some((entry) => entry.action === "AGENT_TOOL_CALL_DECLINED")).toBe(true);
  expect(audit.filter((entry) => entry.action === "MODULE_RECORD_CREATED").length).toBe(before);
});

test("a command that needs a second member waits in the approvals inbox, linked from the chat", async ({ page, world, signInFresh }) => {
  await signInFresh();
  await openChat(page, world);
  const card = await submitNoteForm(page, "To be archived");
  await card.getByRole("button", { name: "Aprovar" }).click();
  await expectAnswered(page);
  const created = await messageLog(page).getByRole("article", { name: "Assistente" }).last().innerText();
  const noteId = /"noteId\\?":\\?"([A-Za-z0-9]{20})/.exec(created)?.[1] ?? "";
  expect(noteId).toMatch(/^[A-Za-z0-9]{20}$/);

  await send(page, `Go ahead and run example.ArchiveNoteCommand with {"noteId":"${noteId}"}`);
  await expect(chatStatus(page)).toHaveAttribute("data-phase", "awaiting-approval", { timeout: 30_000 });
  await messageLog(page).getByRole("button", { name: "Aprovar" }).last().click();
  await expectAnswered(page);
  const pending = messageLog(page).getByRole("region", { name: "Aguardando aprovação de outra pessoa" });
  await expect(pending).toBeVisible();
  const link = pending.getByRole("link", { name: "Abrir aprovações" });
  await expect(link).toHaveAttribute("href", new RegExp(`^/pt-BR/o/${world.alpha.id}/settings/approvals/[A-Za-z0-9]{20}$`));
  await expectNoAxeViolations(page);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/o/${world.alpha.id}/settings/approvals/[A-Za-z0-9]{20}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
