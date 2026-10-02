import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./Dialog.tsx";
import { useDialogDismissGuard, type DialogDismissGuard } from "./dialog-dismiss-guard.tsx";

function Body({ guard }: { guard: DialogDismissGuard }) {
  useDialogDismissGuard(guard);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar texto</DialogTitle>
        <DialogDescription>Texto longo.</DialogDescription>
      </DialogHeader>
      <input aria-label="Texto" />
      <DialogClose asChild>
        <Button variant="secondary">Cancelar</Button>
      </DialogClose>
    </>
  );
}

function GuardedDialog({ guard }: { guard: DialogDismissGuard }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Abrir</Button>
      </DialogTrigger>
      <DialogContent>
        <Body guard={guard} />
      </DialogContent>
    </Dialog>
  );
}

const openDialog = async (guard: DialogDismissGuard) => {
  const rendered = renderWithProviders(<GuardedDialog guard={guard} />);
  await rendered.user.click(screen.getByRole("button", { name: "Abrir" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar texto" });
  return { ...rendered, dialog };
};

const clickOverlay = (): void => {
  const overlay = document.querySelector('[data-slot="dialog-overlay"]');
  if (overlay === null) throw new Error("overlay not rendered");
  fireEvent.pointerDown(overlay);
};

describe("useDialogDismissGuard", () => {
  it("keeps a blocked dialog open on Escape and outside click, and hides the close button", async () => {
    const { user } = await openDialog("block");
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
    await user.keyboard("{Escape}");
    clickOverlay();
    expect(screen.getByRole("dialog", { name: "Editar texto" })).toBeTruthy();
  });

  it("asks before discarding unsaved work, and Escape on the question only closes the question", async () => {
    const { user } = await openDialog("confirmUnsaved");
    await user.click(screen.getByRole("textbox", { name: "Texto" }));
    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Descartar alterações?" });
    await expectNoAxeViolations(question);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Editar texto" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Texto" }));
  });

  it("closes after the user confirms the discard, from the X or a Cancel button", async () => {
    const { user } = await openDialog("confirmUnsaved");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir" }));
  });

  it("keeps the dialog when the user goes back from a one-time value question", async () => {
    const { user } = await openDialog("confirmOneTime");
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    await screen.findByRole("alertdialog", { name: "Fechar sem guardar?" });
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("dialog", { name: "Editar texto" })).toBeTruthy();
  });

  it("closes freely when nothing is at stake", async () => {
    const { user } = await openDialog("allow");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
