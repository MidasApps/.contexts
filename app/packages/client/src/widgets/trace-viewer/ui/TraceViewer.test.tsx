import type { TraceDetail } from "@core/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildSpan, buildTraceDetail, OBS_IDS } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { TraceViewer } from "./TraceViewer.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");
const detail = (overrides = {}): TraceDetail => buildTraceDetail(overrides) as unknown as TraceDetail;
const spanCard = (name: string): HTMLElement => {
  const item = screen.getByText(name).closest("[data-slot='trace-span']");
  if (!(item instanceof HTMLElement)) throw new Error(`no span ${name}`);
  return item;
};

describe("TraceViewer", () => {
  it("renders the span tree with type, status, model, tokens and cost per span", async () => {
    const { container } = renderAdmin(
      <TraceViewer detail={detail()} logsRoute={{ id: "admin", rest: "logs", search: { traceId: OBS_IDS.trace } }} />,
    );
    expect(await screen.findByRole("heading", { level: 2, name: "3 spans" })).toBeDefined();
    const children = screen.getByRole("list", { name: "Spans de agent run: assistant" });
    expect(
      within(children)
        .getAllByRole("listitem")
        .map((item) => item.querySelector(".font-medium")?.textContent),
    ).toEqual(["llm: gemini", "tool: searchKnowledge"]);
    const model = spanCard("llm: gemini");
    expect(within(model).getByText("model_generation")).toBeDefined();
    expect(within(model).getByText("OK")).toBeDefined();
    expect(within(model).getByText("gemini-3.5-flash")).toBeDefined();
    expect(plain(model.textContent)).toContain("1.500 de entrada · 300 de saída");
    expect(plain(model.textContent)).toContain("US$ 0,00085");
    expect(plain(model.textContent)).toContain("1,2 s");
    const tool = spanCard("tool: searchKnowledge");
    expect(within(tool).getByText("Erro")).toBeDefined();
    expect(within(tool).getByText("Preço desconhecido")).toBeDefined();
    expect(plain(tool.textContent)).toContain("320 ms");
    expect(screen.getByRole("link", { name: "Ver logs deste trace" }).getAttribute("href")).toBe(
      `/admin/logs?traceId=${OBS_IDS.trace}`,
    );
    await expectNoAxeViolations(container);
  });

  it("keeps tool input and output collapsed until asked", async () => {
    const { user, container } = renderAdmin(<TraceViewer detail={detail()} />);
    const toggle = await screen.findByRole("button", { name: "Entrada e saída de tool: searchKnowledge" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/refund policy/u)).toBeNull();
    // Spans without input or output offer no disclosure.
    expect(screen.queryByRole("button", { name: "Entrada e saída de llm: gemini" })).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const input = screen.getByRole("region", { name: "Entrada de tool: searchKnowledge" });
    expect(input.textContent).toBe('{\n  "query": "refund policy"\n}');
    expect(input.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("region", { name: "Saída de tool: searchKnowledge" }).textContent).toContain("TIMEOUT");
    await expectNoAxeViolations(container);
  });

  it("collapses and expands the children of a span", async () => {
    const { user } = renderAdmin(<TraceViewer detail={detail()} />);
    const collapse = await screen.findByRole("button", { name: "Recolher os spans de agent run: assistant" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    await user.click(collapse);
    expect(screen.queryByText("llm: gemini")).toBeNull();
    const expand = screen.getByRole("button", { name: "Expandir os spans de agent run: assistant" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    await user.click(expand);
    expect(screen.getByText("llm: gemini")).toBeDefined();
  });

  it("says so when the trace has no spans and shows a running span", async () => {
    const empty = renderAdmin(<TraceViewer detail={detail({ spans: [] })} />);
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhum span registrado" })).toBeDefined();
    await expectNoAxeViolations(empty.container);
    empty.unmount();
    renderAdmin(<TraceViewer detail={detail({ spans: [buildSpan({ durationMs: null })] })} />);
    expect(await screen.findByText("Em execução")).toBeDefined();
  });

  it("speaks the viewer's language", async () => {
    renderAdmin(<TraceViewer detail={detail()} />, { locale: "en-US" });
    expect(await screen.findByRole("heading", { level: 2, name: "3 spans" })).toBeDefined();
    expect(plain(spanCard("llm: gemini").textContent)).toContain("1,500 in · 300 out");
    expect(screen.getByRole("button", { name: "Input and output of tool: searchKnowledge" })).toBeDefined();
  });
});
