import { loadMessages } from "@core/i18n";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { describe, expect, it } from "vitest";
import { useExperimentLabel } from "./use-experiment-label.ts";

const wrapper = ({ children }: { children: ReactNode }) => (
  <IntlProvider locale="pt-BR" messages={loadMessages("pt-BR")} timeZone="America/Sao_Paulo">
    {children}
  </IntlProvider>
);

const EXPERIMENT = { agentId: "knowledge", datasetId: "ds-1", startedAt: "2026-09-30T15:00:00.000Z" };

describe("useExperimentLabel", () => {
  it("names an experiment by agent, dataset and start instead of its id", () => {
    const { result } = renderHook(() => useExperimentLabel([{ id: "ds-1", name: "assistant.v1" }]), { wrapper });
    expect(result.current.name(EXPERIMENT)).toBe("Conhecimento · assistant.v1 · 30 de set. de 2026, 12:00");
    expect(result.current.dataset("ds-1")).toBe("assistant.v1");
  });

  it("falls back to the dataset id while the datasets are unknown", () => {
    const { result } = renderHook(() => useExperimentLabel(undefined), { wrapper });
    expect(result.current.name(EXPERIMENT)).toMatch(/^Conhecimento · ds-1 · /u);
  });
});
