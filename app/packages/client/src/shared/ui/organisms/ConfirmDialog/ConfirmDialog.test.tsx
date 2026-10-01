import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

const RemoveMember = ({ onConfirm, error }: { onConfirm: () => Promise<boolean | void>; error?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Remover
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive
        title="Remover Ana?"
        description="Ela perde o acesso à organização."
        confirmLabel="Remover membro"
        onConfirm={onConfirm}
        error={error}
      />
    </>
  );
};

describe("ConfirmDialog", () => {
  it("starts on Cancel, runs the async action with a pending state and closes on success", async () => {
    let resolve: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((done) => (resolve = done)));
    const { user } = renderWithProviders(<RemoveMember onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Remover" });
    await user.click(trigger);
    await screen.findByRole("alertdialog", { name: "Remover Ana?" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole("button", { name: "Remover membro" }));
    expect(screen.getByRole("button", { name: "Remover membro" }).getAttribute("aria-busy")).toBe("true");
    resolve();
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("stays open and shows the error when the action fails", async () => {
    const { user } = renderWithProviders(
      <RemoveMember onConfirm={() => Promise.resolve(false)} error="A organização precisa de outro proprietário." />,
    );
    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(await screen.findByRole("button", { name: "Remover membro" }));
    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toBe("A organização precisa de outro proprietário.");
  });
});
