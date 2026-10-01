import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { OneTimeSecret } from "./OneTimeSecret.tsx";

describe("OneTimeSecret", () => {
  it("masks the secret, warns, and enables Done only after the user confirms storing it", async () => {
    const onDone = vi.fn();
    const { user, container } = renderWithProviders(
      <div role="dialog" aria-label="Segredo">
        <OneTimeSecret title="Só agora" warning="Não será mostrado de novo." label="Chave" secret="s3cr3t" hint="Use no cabeçalho." acknowledge="Guardei" doneLabel="Concluir" onDone={onDone} />
      </div>,
    );
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Chave" }).value).not.toBe("s3cr3t");
    const done = screen.getByRole("button", { name: "Concluir" });
    expect(done.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "Guardei" }));
    await user.click(done);
    expect(onDone).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });
});
