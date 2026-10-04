import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { buildDataset, buildExperiment, numberedPage } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, type FakeHandler, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminEvalsView } from "./AdminEvalsView.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");

const BASE = buildExperiment();
const CANDIDATE = buildExperiment({
  experimentId: "exp_candidate",
  promptVersionId: "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f",
  verdict: "failed",
  scores: [
    { scorer: "tool-routing", mean: 0.85, baseline: 0.9 },
    { scorer: "tenant-leak", mean: 1, baseline: 1 },
  ],
});
const RUNNING = buildExperiment({
  experimentId: "exp_running",
  status: "running",
  verdict: "pending",
  scores: [],
  finishedAt: null,
});

// An experiment that sits on an older page of the list: only the by-id read finds it.
const OLD_BASELINE = buildExperiment({
  experimentId: "exp_old_baseline",
  scores: [{ scorer: "tool-routing", mean: 0.8, baseline: 0.9 }],
});
const byId: FakeHandler = (request) => {
  const found = [BASE, CANDIDATE, RUNNING, OLD_BASELINE].find(
    (experiment) => experiment["experimentId"] === request.params["experimentId"],
  );
  return found === undefined ? apiError(404, "NOT_FOUND") : ok(found);
};

const routes = (experiments: readonly unknown[] = [BASE, CANDIDATE, RUNNING], hasMore = false) => ({
  "GET /v1/admin/experiments": numberedPage(experiments, hasMore),
  "GET /v1/admin/experiments/:experimentId": byId,
  "GET /v1/admin/datasets": ok([
    buildDataset(),
    buildDataset({ id: "ds_feedback", name: "feedback", tenantId: IDS.organization, targetIds: [] }),
  ]),
  "GET /v1/admin/organizations": page([buildOrganizationSummary()]),
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) =>
  renderAdmin(<AdminEvalsView />, { path: "/admin/evals", routes: routes(), ...options });

describe("AdminEvalsView", () => {
  it("lists experiments with status, verdict and scores against the baseline", async () => {
    const { container, api } = render();
    const table = await screen.findByRole("table", { name: "Experimentos de avaliação" });
    const base = within(table).getByRole("row", { name: /exp_01J8Z3K4M5/u });
    expect(within(base).getByText("Concluído")).toBeDefined();
    expect(within(base).getByText("Aprovado")).toBeDefined();
    // Experiments read as agent · dataset · start; the opaque id stays as secondary text.
    expect(within(base).getByText(/^Assistente · .+ · /u)).toBeDefined();
    const scores = within(base).getByRole("list", { name: "Notas de exp_01J8Z3K4M5" });
    expect(
      within(scores)
        .getAllByRole("listitem")
        .map((item) => plain(item.textContent)),
    ).toEqual(["tool-routing: 94% (mínimo 90%)", "tenant-leak: 100% (mínimo 100%)"]);
    const candidate = within(table).getByRole("row", { name: /exp_candidate/u });
    expect(within(candidate).getByText("Reprovado")).toBeDefined();
    expect(within(candidate).getByText(/Avaliação de prompt/u)).toBeDefined();
    const running = within(table).getByRole("row", { name: /exp_running/u });
    expect(within(running).getByText("Pendente")).toBeDefined();
    expect(within(running).getByText("Sem notas")).toBeDefined();
    expect(within(running).getAllByText("Em andamento")).toHaveLength(2);
    expect(
      screen.getByText("Escolha dois experimentos, de qualquer página, para comparar as notas por avaliador."),
    ).toBeDefined();
    expect(api.calls.find((call) => call.path === "/v1/admin/experiments")?.query).toBe("?page=0&perPage=20");
    // The experiments tab reads the datasets once, to name each experiment's dataset.
    expect(api.callLines().filter((line) => line === "GET /v1/admin/datasets")).toHaveLength(1);
    await expectNoAxeViolations(container);
  });

  it("compares two experiments chosen on the page, in the URL, with a verdict per scorer, above the list", async () => {
    const { user, router, container, api } = render();
    await user.click(await screen.findByRole("button", { name: "Comparar o experimento exp_01J8Z3K4M5" }));
    expect(router.current()).toBe("/admin/evals?a=exp_01J8Z3K4M5");
    expect(await screen.findByText("Escolha mais um experimento para comparar.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Comparar o experimento exp_candidate" }));
    expect(router.current()).toBe("/admin/evals?a=exp_01J8Z3K4M5&b=exp_candidate");
    const chart = await screen.findByRole("table", { name: "Nota média por avaliador" });
    expect(
      within(chart)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Avaliador",
      "A · Assistente · assistant.v1 · 30 de set. de 2026, 09:00",
      "B · Assistente · assistant.v1 · 30 de set. de 2026, 09:00",
      "Mínimo",
    ]);
    expect(
      within(within(chart).getByRole("row", { name: /tool-routing/u }))
        .getAllByRole("cell")
        .map((cell) => plain(cell.textContent)),
    ).toEqual(["94%", "85%", "90%"]);
    const verdicts = screen.getByRole("list", { name: "Resultado por avaliador" });
    expect(
      within(verdicts)
        .getAllByRole("listitem")
        .map((item) => plain(item.textContent)),
    ).toEqual(["tool-routing: B pior que A (-9%)", "tenant-leak: sem diferença"]);
    expect(
      screen.getByRole("button", { name: "Comparar o experimento exp_candidate" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // The comparison sits above the list, next to what was chosen; both were on the page, so no extra read.
    const comparison = screen.getByRole("region", { name: /Comparação de experimentos/u });
    expect(
      comparison.compareDocumentPosition(screen.getByRole("table", { name: "Experimentos de avaliação" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(comparison).getByText("exp_01J8Z3K4M5 × exp_candidate")).toBeDefined();
    expect(api.calls.filter((call) => call.path.startsWith("/v1/admin/experiments/"))).toHaveLength(0);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Limpar comparação" }));
    expect(router.current()).toBe("/admin/evals");
  });

  it("restores a comparison from the URL and says when a chosen experiment no longer exists", async () => {
    const restored = render({ path: "/admin/evals?a=exp_candidate&b=exp_01J8Z3K4M5" });
    const verdicts = await screen.findByRole("list", { name: "Resultado por avaliador" });
    expect(plain(within(verdicts).getAllByRole("listitem")[0]?.textContent ?? null)).toBe(
      "tool-routing: B melhor que A (+9%)",
    );
    restored.unmount();
    render({ path: "/admin/evals?a=exp_gone&b=exp_candidate" });
    expect(await screen.findByText(/não foi encontrado/u)).toBeDefined();
  });

  it("compares with an experiment of another page, read by id", async () => {
    const { api, container } = render({ path: "/admin/evals?a=exp_old_baseline&b=exp_candidate" });
    const verdicts = await screen.findByRole("list", { name: "Resultado por avaliador" });
    expect(plain(within(verdicts).getAllByRole("listitem")[0]?.textContent ?? null)).toBe(
      "tool-routing: B melhor que A (+5%)",
    );
    expect(api.calls.filter((call) => call.path.startsWith("/v1/admin/experiments/")).map((call) => call.path)).toEqual(
      ["/v1/admin/experiments/exp_old_baseline"],
    );
    await expectNoAxeViolations(container);
  });

  it("shows a failed read of a chosen experiment with its reference and a retry", async () => {
    const { user, api } = render({
      path: "/admin/evals?a=exp_old_baseline&b=exp_candidate",
      routes: { ...routes(), "GET /v1/admin/experiments/:experimentId": apiError(409, "CONFLICT") },
    });
    const comparison = await screen.findByRole("region", { name: /Comparação de experimentos/u });
    expect(await within(comparison).findByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    api.route("GET /v1/admin/experiments/:experimentId", byId);
    await user.click(within(comparison).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("list", { name: "Resultado por avaliador" })).toBeDefined();
  });

  it("pages experiments by number and keeps the comparison across pages", async () => {
    const { user, router, api } = render({
      path: "/admin/evals?a=exp_candidate",
      routes: routes([BASE, CANDIDATE], true),
    });
    const pages = await screen.findByRole("navigation", { name: "Páginas de experimentos" });
    await user.click(within(pages).getByRole("button", { name: "Próxima" }));
    expect(router.current()).toBe("/admin/evals?a=exp_candidate&page=2");
    await waitFor(() =>
      expect(api.calls.filter((call) => call.path === "/v1/admin/experiments").at(-1)?.query).toBe(
        "?page=1&perPage=20",
      ),
    );
  });

  it("lists datasets in their tab, kept in the URL", async () => {
    const { user, router, container } = render();
    await screen.findByRole("table", { name: "Experimentos de avaliação" });
    await user.click(screen.getByRole("tab", { name: "Datasets" }));
    expect(router.current()).toBe("/admin/evals?tab=datasets");
    const table = await screen.findByRole("table", { name: "Datasets de avaliação" });
    const platform = within(table).getByRole("row", { name: /assistant\.v1/u });
    expect(within(platform).getByText("Plataforma")).toBeDefined();
    expect(
      within(within(platform).getByRole("list", { name: "Agentes avaliados por assistant.v1" })).getByText("assistant"),
    ).toBeDefined();
    const tenant = within(table).getByRole("row", { name: /feedback/u });
    await waitFor(() => expect(within(tenant).getByText("Organização Northwind")).toBeDefined());
    expect(within(tenant).getByText("Nenhum")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("explains empty lists and leads to the other tab", async () => {
    const { user, router, container } = render({ routes: { ...routes([]), "GET /v1/admin/datasets": ok([]) } });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhum experimento ainda" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Comparação de experimentos" })).toBeNull();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Ver datasets" }));
    expect(router.current()).toBe("/admin/evals?tab=datasets");
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhum dataset ainda" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Ver experimentos" }));
    expect(router.current()).toBe("/admin/evals");
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({
      routes: { ...routes(), "GET /v1/admin/experiments": apiError(409, "CONFLICT") },
    });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/experiments", numberedPage([BASE]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("row", { name: /exp_01J8Z3K4M5/u })).toBeDefined();
  });

  it("is closed to the support role, without calling the API", async () => {
    const { api, container } = render({ role: "platform-support" });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(api.callLines()).not.toContain("GET /v1/admin/experiments");
    await expectNoAxeViolations(container);
  });

  it("shows experiment cards on a phone", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render();
      const list = await screen.findByRole("list", { name: "Experimentos de avaliação" });
      expect(list.children).toHaveLength(3);
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
