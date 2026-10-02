import type { Page } from "@playwright/test";
import { chooseOrganization } from "./admin-helpers.ts";
import { expect, FAILED_REQUEST, test, toast, unique } from "./sp5-test.ts";

// SP5 Task 16: `/admin/agents`: the runtime's agent catalog, one organization's agent settings,
// and a platform prompt version taken through evaluation to activation (decision 0038: activation
// needs a passed verdict; staff may force it with an audited reason).

test.describe("agent catalog", () => {
  test("lists the registered agents with role, tools, skills and permission ceiling", async ({ staffPage }) => {
    await staffPage.goto("admin/agents");
    const catalog = staffPage.getByRole("list", { name: "Agentes registrados" });
    const assistant = catalog.getByRole("listitem").filter({ hasText: "Assistente" }).first();
    await expect(assistant).toContainText("Supervisor");
    for (const subagent of ["knowledge", "data", "action", "web"]) await expect(assistant.getByRole("definition").getByText(subagent, { exact: true })).toBeVisible();
    const knowledge = catalog.getByRole("listitem").filter({ hasText: "Conhecimento" }).first();
    await expect(knowledge.getByText("knowledge.searchKnowledge")).toBeVisible();
    await expect(knowledge.getByText("knowledge-citations")).toBeVisible();
    await expect(knowledge.getByText("core.knowledge.read")).toBeVisible();
    // The generic runtime agent of tenant-defined agents is not a catalog entry (decision 0046).
    await expect(catalog.getByText("custom-agent", { exact: true })).toHaveCount(0);
  });

  test("shows an organization's agents after choosing it", async ({ staffPage, sp5Org }) => {
    await staffPage.goto("admin/agents");
    const perOrganization = staffPage.getByRole("region", { name: "Agentes por organização" });
    await expect(perOrganization.getByRole("heading", { name: "Escolha uma organização" })).toBeVisible();
    await chooseOrganization(staffPage, perOrganization.getByRole("combobox", { name: "Organização", exact: true }), sp5Org.name);
    await expect(staffPage).toHaveURL(new RegExp(`organizationId=${sp5Org.id}`));
    await expect(perOrganization.getByRole("heading", { name: "Agentes habilitados" })).toBeVisible();
    await expect(perOrganization.getByRole("heading", { name: "Ferramentas web" })).toBeVisible();
    await expect(perOrganization.getByRole("heading", { name: "Dados pessoais nas mensagens" })).toBeVisible();
  });
});

/** Creates a platform prompt version of `agent` from the prompts page; returns its number. */
const createVersion = async (page: Page, agent: { id: string; name: string }, note: string): Promise<string> => {
  await page.goto(`admin/agents/${agent.id}/prompts`);
  await expect(page.getByRole("heading", { level: 1, name: `Prompts de ${agent.name}` })).toBeVisible();
  await page.getByRole("button", { name: "Nova versão" }).first().click();
  const editor = page.getByRole("dialog", { name: `Nova versão do prompt de ${agent.name}` });
  const body = editor.getByRole("textbox", { name: /^Texto do prompt/ });
  // The form starts from the active version; without one (the e2e stack does not run the seed
  // import of `pnpm seed:local`) it starts empty and the first version is written in full.
  await expect(body).toBeEditable();
  const active = await body.inputValue();
  const base = active === "" ? `You are the ${agent.id} agent of the assistant. Answer briefly and cite your sources.` : active;
  await body.fill(`${base}

${note}.`);
  await editor.getByRole("textbox", { name: /^Nota/ }).fill(note);
  await editor.getByRole("button", { name: "Criar versão" }).click();
  await expect(toast(page, /^Versão \d+ criada\.$/)).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: note });
  await expect(row).toContainText("Não avaliada");
  const version = (await row.getByRole("cell").first().textContent())?.match(/\d+/)?.[0] ?? "";
  expect(version).not.toBe("");
  return version;
};

test.describe("platform prompts", () => {
  test("evaluates a version, then activates it (forced with a reason when the eval does not pass)", async ({ staffPage }) => {
    test.setTimeout(300_000);
    const note = unique("E2E prompt change");
    const version = await createVersion(staffPage, { id: "data", name: "Dados" }, note);
    const row = staffPage.getByRole("row").filter({ hasText: note });
    await expect(row.getByRole("button", { name: `Ativar a versão ${version}` })).toBeDisabled();

    await row.getByRole("button", { name: `Avaliar a versão ${version}` }).click();
    await expect(row).toContainText(/Aprovada|Reprovada/, { timeout: 240_000 });
    const evaluation = staffPage.getByRole("region", { name: "Avaliação" });
    await expect(evaluation.getByRole("table", { name: `Resultado por avaliador da versão ${version}` })).toBeVisible();

    if ((await row.textContent())?.includes("Aprovada")) {
      await row.getByRole("button", { name: `Ativar a versão ${version}` }).click();
      const confirm = staffPage.getByRole("alertdialog", { name: `Ativar a versão ${version}?` });
      await confirm.getByRole("button", { name: "Ativar versão" }).click();
      await expect(toast(staffPage, `Versão ${version} de Dados ativada.`)).toBeVisible();
    } else {
      await expect(row.getByRole("button", { name: `Ativar a versão ${version}` })).toBeDisabled();
      await row.getByRole("button", { name: `Forçar a ativação da versão ${version}` }).click();
      const confirm = staffPage.getByRole("alertdialog", { name: `Forçar a ativação da versão ${version}?` });
      await confirm.getByRole("button", { name: "Forçar ativação" }).click();
      await expect(confirm.getByText("Informe o motivo da ativação forçada.")).toBeVisible();
      await confirm.getByRole("textbox", { name: /^Motivo/ }).fill("E2E: fake models do not pass the eval set.");
      await confirm.getByRole("button", { name: "Forçar ativação" }).click();
      await expect(toast(staffPage, `Versão ${version} de Dados ativada sem avaliação aprovada.`)).toBeVisible();
    }
    await expect(staffPage.getByRole("region", { name: "Versões", exact: true })).toContainText(`A versão ${version} está em produção.`);
    const history = staffPage.getByRole("table", { name: "Ativações do prompt de Dados" });
    await expect(history.getByRole("row").nth(1)).toContainText(`v${version}`);
  });

  test("says why an agent without an eval set cannot be evaluated", async ({ staffPage, staffConsole }) => {
    // The 422 EVAL_DATASET_MISSING of the eval call is logged by the browser as a failed load.
    staffConsole.allow(FAILED_REQUEST);
    const note = unique("E2E web prompt");
    const version = await createVersion(staffPage, { id: "web", name: "Web" }, note);
    const row = staffPage.getByRole("row").filter({ hasText: note });
    await row.getByRole("button", { name: `Avaliar a versão ${version}` }).click();
    const evaluation = staffPage.getByRole("region", { name: "Avaliação" });
    await expect(evaluation.getByText(`A avaliação da versão ${version} não rodou`)).toBeVisible();
    await expect(evaluation.getByText(/Este agente ainda não tem um conjunto de avaliação\./)).toBeVisible();
    await expect(row).toContainText("Não avaliada");
    await expect(row.getByRole("button", { name: `Ativar a versão ${version}` })).toBeDisabled();
  });
});
