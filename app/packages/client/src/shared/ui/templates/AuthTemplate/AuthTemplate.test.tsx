import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { AuthTemplate } from "./AuthTemplate.tsx";

describe("AuthTemplate", () => {
  it("frames the form in one main with a skip link and an optional footer", async () => {
    const { user, container } = renderWithProviders(
      <AuthTemplate brand={<span>Marca</span>} footer={<a href="/terms">Termos</a>}>
        <h1>Entrar</h1>
        <label>
          E-mail
          <input type="email" />
        </label>
      </AuthTemplate>,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("contentinfo").textContent).toBe("Termos");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("main"));
    await expectNoAxeViolations(container);
  });
});
