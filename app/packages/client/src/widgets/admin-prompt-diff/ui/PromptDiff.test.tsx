import { PromptVersionSchema } from "@core/contracts";
import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { buildPromptVersion, PROMPT_IDS } from "#/shared/testing/admin-agents-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { PromptDiff } from "./PromptDiff.tsx";

const V1 = PromptVersionSchema.parse(buildPromptVersion({ body: "You are the assistant.\nBe brief.\nCite sources." }));
const V2 = PromptVersionSchema.parse(buildPromptVersion({ id: PROMPT_IDS.v2, version: 2, body: "You are the assistant.\nBe thorough.\nCite sources." }));
const V3 = PromptVersionSchema.parse(buildPromptVersion({ id: PROMPT_IDS.v3, version: 3, body: V1.body }));

function Harness({ base, compare }: { base: string | undefined; compare: string | undefined }) {
  const [baseId, setBase] = useState(base);
  const [compareId, setCompare] = useState(compare);
  return <PromptDiff versions={[V3, V2, V1]} baseId={baseId} compareId={compareId} onBaseChange={setBase} onCompareChange={setCompare} activeId={V1.id} />;
}

describe("PromptDiff", () => {
  it("marks added and removed lines with a sign and a spoken label, not color alone", async () => {
    const { container } = renderWithProviders(<Harness base={V1.id} compare={V2.id} />);
    expect(screen.getByRole("status").textContent).toBe("1 linha adicionada, 1 removida");
    const region = screen.getByRole("region", { name: "Diferenças da versão 1 para a versão 2" });
    expect(region.getAttribute("tabindex")).toBe("0");
    const removed = region.querySelector('[data-kind="removed"]');
    const added = region.querySelector('[data-kind="added"]');
    expect(removed?.textContent).toBe("−Removida:Be brief.");
    expect(added?.textContent).toBe("+Adicionada:Be thorough.");
    await expectNoAxeViolations(container);
  });

  it("asks for both versions, and says when two versions have the same text", async () => {
    const { user } = renderWithProviders(<Harness base={V1.id} compare={undefined} />);
    expect(screen.getByText("Escolha as duas versões para comparar.")).toBeDefined();
    await user.click(screen.getByRole("combobox", { name: "Para" }));
    await user.click(await screen.findByRole("option", { name: "Versão 3" }));
    expect(screen.getByRole("status").textContent).toBe("As duas versões têm o mesmo texto.");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("marks the active version in the pickers", async () => {
    const { user } = renderWithProviders(<Harness base={undefined} compare={undefined} />);
    await user.click(screen.getByRole("combobox", { name: "De" }));
    const options = within(await screen.findByRole("listbox")).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Versão 3", "Versão 2", "Versão 1 (ativa)"]);
  });
});
