import { randomUUID } from "node:crypto";
import { expectNoAxeViolations } from "@core/e2e/axe";
import type { Page } from "@playwright/test";
import { chatPanel, expect, expectAnswered, history, messageLog, openChat, send, test } from "./chat-test.ts";

// Decision 0046 and follow-up 72: an admin creates a skill and an agent of the organization in
// /settings, a member picks that agent in the chat and gets an answer (fake models), and a
// disabled agent is no longer offered. Runs as the seeded owner of Alpha Org.

const picker = (page: Page) => chatPanel(page).getByRole("combobox", { name: "Agente" });

const createSkill = async (page: Page, organizationId: string, name: string): Promise<void> => {
  await page.goto(`o/${organizationId}/settings/skills`);
  await page.getByRole("button", { name: "Nova habilidade" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova habilidade" });
  await dialog.getByRole("textbox", { name: "Nome" }).fill(name);
  await dialog
    .getByRole("textbox", { name: "Descrição" })
    .fill("Use when someone asks how the organization welcomes new people.");
  await dialog.getByRole("textbox", { name: "Instruções" }).fill("Answer with the three steps of the welcome guide.");
  await dialog.getByRole("button", { name: "Criar habilidade" }).click();
  await expect(dialog).toBeHidden();
};

const createAgent = async (
  page: Page,
  organizationId: string,
  args: { name: string; skill: string },
): Promise<void> => {
  await page.goto(`o/${organizationId}/settings/agents`);
  await page.getByRole("button", { name: "Novo agente" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo agente" });
  await dialog.getByRole("textbox", { name: "Nome" }).fill(args.name);
  await dialog.getByRole("textbox", { name: "Descrição" }).fill("Answers questions of new members.");
  await dialog
    .getByRole("textbox", { name: "Instruções" })
    .fill("Welcome new members and point them to the right guide.");
  await dialog.getByRole("checkbox", { name: new RegExp(args.skill) }).check();
  await dialog.getByRole("button", { name: "Criar agente" }).click();
  await expect(dialog).toBeHidden();
};

test("an agent created in settings answers in the chat, and is no longer offered once disabled", async ({
  page,
  world,
  ownerApi,
}) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 6);
  const skill = `boas-vindas-${suffix}`;
  const agent = `Guia ${suffix}`;
  await createSkill(page, world.alpha.id, skill);
  await createAgent(page, world.alpha.id, { name: agent, skill });

  try {
    await openChat(page, world);
    await expect(picker(page)).toBeEnabled();
    await picker(page).click();
    await page.getByRole("option", { name: agent }).click();
    await expect(picker(page)).toContainText(agent);
    await send(page, "Where do I start?");
    await expectAnswered(page);
    await expect(messageLog(page).getByRole("article", { name: agent })).toContainText("Fake answer");
    await expect(chatPanel(page).getByText(`Agente: ${agent}`)).toBeVisible();
    await expect(picker(page)).toHaveCount(0);
    await expect(
      history(page).locator('[aria-current="page"]').locator("xpath=ancestor::li").getByText(agent),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(`o/${world.alpha.id}/settings/agents`);
    await page.getByRole("button", { name: `Desativar ${agent}` }).click();
    await page
      .getByRole("alertdialog", { name: `Desativar ${agent}?` })
      .getByRole("button", { name: "Desativar" })
      .click();
    await expect(page.getByRole("button", { name: `Ativar ${agent}` })).toBeVisible();

    await openChat(page, world);
    await expect(chatPanel(page).locator('[data-slot="agent-picker"] [role="status"]')).not.toHaveText(
      "Carregando agentes…",
    );
    if (await picker(page).isEnabled()) {
      // Other agents of the organization are still offered; this one is not.
      await picker(page).click();
      await expect(page.getByRole("option", { name: "Assistente" })).toBeVisible();
      await expect(page.getByRole("option", { name: agent })).toHaveCount(0);
      await page.keyboard.press("Escape");
    } else {
      await expect(chatPanel(page).getByText("Nenhum agente da organização disponível.")).toBeVisible();
    }
    // The conversation it answered stays in the history under a generic name.
    await expect(history(page).getByText("Agente da organização").first()).toBeVisible();
  } finally {
    // The plan allows five agents per organization: leave room for the next run on the same stack.
    const agents = await ownerApi.get<{ id: string; name: string }[]>(`/v1/agents?organizationId=${world.alpha.id}`);
    const created = agents.find((entry) => entry.name === agent);
    if (created !== undefined)
      await ownerApi.raw("DELETE", `/v1/agents/${created.id}?organizationId=${world.alpha.id}`);
    const skills = await ownerApi.get<{ id: string; name: string }[]>(
      `/v1/skills?organizationId=${world.alpha.id}&limit=100`,
    );
    const ownSkill = skills.find((entry) => entry.name === skill);
    if (ownSkill !== undefined)
      await ownerApi.raw("DELETE", `/v1/skills/${ownSkill.id}?organizationId=${world.alpha.id}`);
  }
});
