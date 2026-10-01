import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./Collapsible.tsx";

describe("Collapsible", () => {
  it("toggles its region and reports aria-expanded", async () => {
    const { user, container } = renderWithProviders(
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost">Avançado</Button>
        </CollapsibleTrigger>
        <CollapsibleContent>Opções avançadas</CollapsibleContent>
      </Collapsible>,
    );
    const trigger = screen.getByRole("button", { name: "Avançado" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Opções avançadas")).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
