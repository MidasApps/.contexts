import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "./sp5-test.ts";

// SP5 Task 16: `/admin/evals` shows the experiments the CI publishes and the eval sets it loads.
// The journey loads the eval sets into the e2e runtime's storage (`pnpm -F @core/mastra
// evals:seed`), publishes the reports of `AI_MODE=fake pnpm evals` (app/.evals) with
// `pnpm evals:publish` (decision 0040), then reads both in the console.

const APP_ROOT = path.resolve(import.meta.dirname, "../../..");
const REPORT_DIR = path.join(APP_ROOT, ".evals");
const run = promisify(execFile);

test.describe("evals", () => {
  test("shows the published experiments with their verdict and scores, and their datasets", async ({
    staffPage,
    env,
  }) => {
    test.setTimeout(180_000);
    const reports = existsSync(REPORT_DIR) ? readdirSync(REPORT_DIR).filter((file) => file.endsWith(".json")) : [];
    expect(reports, "no eval reports in app/.evals: run `AI_MODE=fake pnpm evals` before the e2e").not.toEqual([]);
    const seeded = await run(
      process.execPath,
      [path.join(APP_ROOT, "apps", "mastra", "scripts", "seed-eval-datasets.ts")],
      { cwd: path.join(APP_ROOT, "apps", "mastra"), env: process.env },
    );
    expect(seeded.stdout).toMatch(/cases\)/);
    const { stdout } = await run(process.execPath, [path.join(APP_ROOT, "scripts", "evals-publish.ts")], {
      cwd: APP_ROOT,
      env: { ...process.env, EVALS_TARGET_URL: env.E2E_MASTRA_ORIGIN },
    });
    expect(stdout).toMatch(/published [1-9]\d*/);

    await staffPage.goto("admin/evals");
    const experiments = staffPage.getByRole("table", { name: "Experimentos de avaliação" });
    const latest = experiments.getByRole("row").nth(1);
    await expect(latest).toContainText(/Aprovado|Reprovado/);
    await expect(latest).toContainText("Concluído");
    await expect(
      experiments
        .getByRole("row")
        .filter({ hasText: /assistant|knowledge|data|action/ })
        .first(),
    ).toBeVisible();

    // Two experiments side by side.
    await experiments
      .getByRole("button", { name: /^Comparar o experimento / })
      .nth(0)
      .click();
    await experiments
      .getByRole("button", { name: /^Comparar o experimento / })
      .nth(1)
      .click();
    await expect(staffPage.getByRole("heading", { name: "Comparação de experimentos" })).toBeVisible();
    await expect(staffPage.getByRole("table", { name: "Nota média por avaliador" })).toBeVisible();

    await staffPage.getByRole("tab", { name: "Datasets" }).click();
    const datasets = staffPage.getByRole("table", { name: "Datasets de avaliação" });
    await expect(datasets.getByRole("row").nth(1)).toBeVisible();
    await expect(datasets.getByRole("row").filter({ hasText: "Plataforma" }).first()).toBeVisible();

    // The overview's last verdict now has a value.
    await staffPage.goto("admin");
    const kpis = staffPage.getByRole("region", { name: "Números da plataforma" });
    await expect(kpis.getByRole("definition").filter({ hasText: /^(Aprovad[ao]|Reprovad[ao])$/ })).toBeVisible();
  });
});
