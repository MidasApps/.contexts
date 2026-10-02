import type { Page } from "@playwright/test";
import { expect, settingsPath, test, toast, unique } from "./sp5-test.ts";

// SP5 Task 16, `/settings/agents` and `/settings/skills` as the organization's owner: switch a
// platform agent off and on, write organization instructions for the assistant and take them
// through evaluation to activation, and create, edit and delete a skill and an agent using it.

/** A table row by its text (the toast is a list item with the same name). */
const rowOf = (page: Page, name: string) => page.getByRole("row").filter({ hasText: name });

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const confirmDialog = (page: Page, name: string) => page.getByRole("alertdialog", { name });

test.describe("platform agents", () => {
  test("switches a platform agent off and on for the organization", async ({ page, sp5Org }) => {
    await page.goto(settingsPath(sp5Org.id, "agents"));
    await expect(page.getByRole("heading", { level: 1, name: "Agentes" })).toBeVisible();
    const knowledge = page.getByRole("article", { name: "Knowledge" });
    const toggle = knowledge.getByRole("switch", { name: "Ativar Knowledge" });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toast(page, "Knowledge desativado.")).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole("article", { name: "Knowledge" }).getByRole("switch", { name: "Ativar Knowledge" })).not.toBeChecked();
    await page.getByRole("article", { name: "Knowledge" }).getByRole("switch", { name: "Ativar Knowledge" }).click();
    await expect(toast(page, "Knowledge ativado.")).toBeVisible();
    await expect(page.getByRole("article", { name: "Knowledge" }).getByRole("switch", { name: "Ativar Knowledge" })).toBeChecked();
  });

  test("writes organization instructions for the assistant, evaluates and activates them", async ({ page, sp5Org }) => {
    test.setTimeout(300_000);
    await page.goto(settingsPath(sp5Org.id, "agents"));
    const assistant = page.getByRole("article", { name: "Assistente" });
    await assistant.getByRole("button", { name: "Escrever instruções para Assistente" }).click();
    const editor = dialog(page, "Instruções para Assistente");
    await editor.getByRole("textbox", { name: /^Instruções/ }).fill("Responda sempre em frases curtas e cite a política interna quando houver.");
    await editor.getByRole("textbox", { name: /^Nota/ }).fill("e2e");
    await editor.getByRole("button", { name: "Salvar versão" }).click();
    await expect(toast(page, "Versão 1 salva. Avalie para poder ativar.")).toBeVisible();
    const versions = assistant.getByRole("table", { name: "Versões das instruções de Assistente" });
    await expect(versions.getByRole("row", { name: /Versão 1/ })).toContainText("Não avaliada");
    // Activation is refused until the version passed its evaluation.
    await expect(versions.getByRole("button", { name: "Ativar a versão 1 de Assistente" })).toBeDisabled();

    await versions.getByRole("button", { name: "Avaliar a versão 1 de Assistente" }).click();
    await expect(toast(page, /A versão 1 foi (aprovada|reprovada) na avaliação/)).toBeVisible({ timeout: 240_000 });
    await expect(versions.getByRole("row", { name: /Versão 1/ })).toContainText("Aprovada");
    await versions.getByRole("button", { name: "Ativar a versão 1 de Assistente" }).click();
    await expect(toast(page, "A versão 1 está ativa.")).toBeVisible();
    await expect(assistant.getByText("Versão 1 ativa")).toBeVisible();
  });
});

test.describe("organization skills and agents", () => {
  test("creates a skill, an agent that uses it, edits both and deletes them", async ({ page, sp5Org }) => {
    test.setTimeout(240_000);
    const skill = `e2e-skill-${unique("x").slice(2)}`;
    const agent = unique("Suporte");

    await page.goto(settingsPath(sp5Org.id, "skills"));
    await expect(page.getByRole("heading", { name: "Nenhuma habilidade da organização" })).toBeVisible();
    await page.getByRole("button", { name: "Nova habilidade" }).first().click();
    const skillEditor = dialog(page, "Nova habilidade");
    await skillEditor.getByRole("textbox", { name: /^Nome/ }).fill("Not Valid");
    await skillEditor.getByRole("button", { name: "Criar habilidade" }).click();
    await expect(skillEditor.getByText(/Use letras minúsculas, números e hífens/)).toBeVisible();
    await skillEditor.getByRole("textbox", { name: /^Nome/ }).fill(skill);
    await skillEditor.getByRole("textbox", { name: /^Descrição/ }).fill("How the organization answers support tickets.");
    await skillEditor.getByRole("textbox", { name: /^Instruções/ }).fill("1. Greet the person.\n2. Restate the problem.\n3. Offer one next step.");
    await skillEditor.getByRole("button", { name: "Criar habilidade" }).click();
    await expect(toast(page, `Habilidade ${skill} criada.`)).toBeVisible();
    await expect(rowOf(page, skill)).toContainText("Ativada");
    await expect(page.getByText("1 de 10 habilidades do plano em uso.")).toBeVisible();

    await rowOf(page, skill).getByRole("button", { name: `Editar ${skill}` }).click();
    const skillEdit = dialog(page, `Editar ${skill}`);
    await skillEdit.getByRole("textbox", { name: /^Descrição/ }).fill("How the organization answers support tickets, briefly.");
    await skillEdit.getByRole("button", { name: "Salvar" }).click();
    await expect(toast(page, `Habilidade ${skill} salva.`)).toBeVisible();

    await page.goto(settingsPath(sp5Org.id, "agents"));
    await page.getByRole("button", { name: "Novo agente" }).first().click();
    const agentEditor = dialog(page, "Novo agente");
    await agentEditor.getByRole("textbox", { name: /^Nome/ }).fill(agent);
    await agentEditor.getByRole("textbox", { name: /^Descrição/ }).fill("Answers support questions.");
    await agentEditor.getByRole("textbox", { name: /^Instruções/ }).fill("You help the support team. Be brief.");
    await agentEditor.getByRole("group", { name: "Habilidades da organização" }).getByRole("checkbox", { name: new RegExp(skill) }).check();
    await agentEditor.getByRole("button", { name: "Criar agente" }).click();
    await expect(toast(page, `Agente ${agent} criado.`)).toBeVisible();
    const custom = page.getByRole("region", { name: "Agentes da organização" });
    await expect(custom.getByText(agent, { exact: true }).first()).toBeVisible();
    await expect(custom.getByText("1 de 5 agentes do plano em uso.")).toBeVisible();

    await custom.getByRole("button", { name: `Editar ${agent}` }).click();
    const agentEdit = dialog(page, `Editar ${agent}`);
    await expect(agentEdit.getByRole("group", { name: "Habilidades da organização" }).getByRole("checkbox", { name: new RegExp(skill) })).toBeChecked();
    await agentEdit.getByRole("textbox", { name: /^Descrição/ }).fill("Answers support questions, briefly.");
    await agentEdit.getByRole("button", { name: "Salvar" }).click();
    await expect(toast(page, `Agente ${agent} salvo.`)).toBeVisible();

    await custom.getByRole("button", { name: `Desativar ${agent}` }).click();
    await confirmDialog(page, `Desativar ${agent}?`).getByRole("button", { name: "Desativar" }).click();
    await expect(toast(page, `Agente ${agent} desativado.`)).toBeVisible();

    await custom.getByRole("button", { name: `Excluir ${agent}` }).click();
    await confirmDialog(page, `Excluir ${agent}?`).getByRole("button", { name: "Excluir agente" }).click();
    await expect(toast(page, `Agente ${agent} excluído.`)).toBeVisible();
    await expect(custom.getByRole("heading", { name: "Nenhum agente da organização" })).toBeVisible();

    await page.goto(settingsPath(sp5Org.id, "skills"));
    await rowOf(page, skill).getByRole("button", { name: `Excluir ${skill}` }).click();
    await confirmDialog(page, `Excluir ${skill}?`).getByRole("button", { name: "Excluir habilidade" }).click();
    await expect(toast(page, `Habilidade ${skill} excluída.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhuma habilidade da organização" })).toBeVisible();
  });
});

test.describe("custom agent validation", () => {
  test("the API refuses unknown tool and skill ids with every field at once", async ({ ownerApi, sp5Org }) => {
    // Known item 6: unknown ids were stored and ignored at run time.
    const body = {
      name: unique("Bad tools"),
      description: "Uses tools that do not exist.",
      instructions: "Answer briefly.",
      tools: ["tool.that-does-not-exist"],
      coreSkills: ["skill-that-does-not-exist"],
    };
    const response = await ownerApi.raw("POST", `/v1/agents?organizationId=${sp5Org.id}`, body);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string; details: { field: string; issue: string }[] } };
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(payload.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "tools.0" }), expect.objectContaining({ field: "coreSkills.0" })]),
    );
    const list = await ownerApi.get<{ name: string }[]>(`/v1/agents?organizationId=${sp5Org.id}`);
    expect(list.map((agent) => agent.name)).not.toContain(body.name);
  });
});
