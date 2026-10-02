import { EvalExperimentSummarySchema } from "@core/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExperimentPair, ExperimentPairState } from "#/entities/eval-experiment/index.ts";
import { ApiError } from "#/shared/api/api-error.ts";
import { buildExperiment } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { FAKE_REQUEST_ID } from "#/shared/testing/fake-api.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { ExperimentCompare } from "./ExperimentCompare.tsx";
import { ExperimentComparisonPanel, type ExperimentComparisonCopy } from "./ExperimentComparisonPanel.tsx";

const A = EvalExperimentSummarySchema.parse(
  buildExperiment({
    experimentId: "exp_A",
    scores: [
      { scorer: "tool-routing", mean: 0.8, baseline: 0.9 },
      { scorer: "tenant-leak", mean: 1, baseline: 1 },
      { scorer: "faithfulness", mean: 0.9, baseline: 0.8 },
      { scorer: "legacy", mean: 0.5, baseline: 0.5 },
    ],
  }),
);
const B = EvalExperimentSummarySchema.parse(
  buildExperiment({
    experimentId: "exp_B",
    scores: [
      { scorer: "tool-routing", mean: 0.95, baseline: 0.9 },
      { scorer: "tenant-leak", mean: 1, baseline: 1 },
      { scorer: "faithfulness", mean: 0.85, baseline: 0.8 },
      { scorer: "citations", mean: 0.7, baseline: 0.6 },
    ],
  }),
);

const outcomes = (): Record<string, string> =>
  Object.fromEntries(within(screen.getByRole("list", { name: "Resultado por avaliador" })).getAllByRole("listitem").map((item) => [item.dataset["outcome"] ?? "", item.textContent ?? ""]));

describe("ExperimentCompare", () => {
  it("says per scorer whether B is better, worse or the same, with the difference in points", async () => {
    const { container } = renderWithProviders(<ExperimentCompare a={A} b={B} />);
    const said = outcomes();
    expect(said["better"]).toMatch(/^tool-routing: B melhor que A \(\+15(,0)?\s?%\)$/u);
    expect(said["worse"]).toMatch(/^faithfulness: B pior que A \(-5(,0)?\s?%\)$/u);
    expect(said["same"]).toBe("tenant-leak: sem diferença");
    expect(said["only-a"]).toBe("legacy: só em A");
    expect(said["only-b"]).toBe("citations: só em B");
    await expectNoAxeViolations(container);
  });

  it("names the experiments in the chart with the caller's names", () => {
    renderWithProviders(<ExperimentCompare a={A} b={B} nameOf={(experiment) => `Experimento ${experiment.experimentId.slice(-1)}`} />);
    expect(screen.getByText("A é Experimento A; B é Experimento B.")).toBeDefined();
  });
});

const COPY: ExperimentComparisonCopy = {
  title: "Comparação de experimentos",
  hint: "Escolha dois experimentos.",
  hintOne: "Escolha mais um.",
  missing: "Um deles sumiu.",
  loading: "Carregando os experimentos escolhidos…",
  clear: "Limpar comparação",
};

const panel = (ids: readonly string[], pair: ExperimentPairState, onClear = vi.fn()) =>
  renderWithProviders(<ExperimentComparisonPanel ids={ids} pair={pair} onClear={onClear} copy={COPY} />);

const state = (pair: ExperimentPair): ExperimentPairState => ({ ...pair, retry: vi.fn(), retrying: false });

describe("ExperimentComparisonPanel", () => {
  it("guides the choice until two experiments are picked, with nothing to clear at first", () => {
    const first = panel([], state({ status: "idle" }));
    expect(screen.getByText("Escolha dois experimentos.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Limpar comparação" })).toBeNull();
    first.unmount();
    panel(["exp_A"], state({ status: "one", a: A }));
    expect(screen.getByText("Escolha mais um.")).toBeDefined();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("exp_A");
  });

  it("announces the loading of a pair and warns when one of them is gone", () => {
    const loading = panel(["exp_A", "exp_B"], state({ status: "pending" }));
    expect(screen.getByRole("status").textContent).toBe("Carregando os experimentos escolhidos…");
    loading.unmount();
    panel(["exp_A", "exp_B"], state({ status: "missing" }));
    expect(screen.getByText("Um deles sumiu.")).toBeDefined();
  });

  it("shows a failed read with its reference and retries it", async () => {
    const retry = vi.fn();
    const error = new ApiError({ status: 503, code: "UPSTREAM_UNAVAILABLE", message: "Fake failure.", requestId: FAKE_REQUEST_ID });
    const { user } = panel(["exp_A", "exp_B"], { status: "error", error, retry, retrying: false });
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("compares a ready pair and clears it on request", async () => {
    const onClear = vi.fn();
    const { user, container } = panel(["exp_A", "exp_B"], state({ status: "ready", a: A, b: B }), onClear);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("exp_A × exp_B");
    expect(screen.getByRole("list", { name: "Resultado por avaliador" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Limpar comparação" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });
});
