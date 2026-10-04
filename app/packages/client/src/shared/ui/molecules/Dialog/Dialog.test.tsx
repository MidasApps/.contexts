import { screen } from "@testing-library/react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./Dialog.tsx";

const RenameDialog = () => (
  <Dialog>
    <DialogTrigger asChild>
      <Button>Renomear</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Renomear projeto</DialogTitle>
        <DialogDescription>O nome aparece nos breadcrumbs.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Nome" />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancelar</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * jsdom runs no CSS animations, so a closed dialog unmounts at once. This makes the content report
 * an exit animation while closed: Radix keeps it mounted (closing) until `animationend`, as a
 * browser does.
 */
const keepClosingContentMounted = (): void => {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const styles = original(element, pseudo);
    return new Proxy(styles, {
      get: (target, property) => {
        const closingContent =
          element instanceof HTMLElement &&
          element.dataset["slot"] === "dialog-content" &&
          element.dataset["state"] === "closed";
        if (property === "animationName") return closingContent ? "exit" : "none";
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function"
          ? (...args: unknown[]): unknown => Reflect.apply(value, target, args)
          : value;
      },
    });
  });
};

/** One dialog for several items (create, then edit), like the admin and settings pages. */
function ItemDialogs() {
  const [open, setOpen] = useState(true);
  const [item, setItem] = useState("A");
  return (
    <>
      <Button
        onClick={() => {
          // A browser commits the click's update before the document's click listeners run (a
          // microtask checkpoint between listeners); a script-dispatched click in jsdom does not.
          flushSync(() => {
            setItem("B");
            setOpen(true);
          });
        }}
      >
        Editar B
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item {item}</DialogTitle>
            <DialogDescription>Detalhes do item.</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setOpen(false)}>Salvar</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dialog", () => {
  it("opens for another item while the previous one is still closing", async () => {
    // Radix defers a press outside to its click. The press on "Editar B" landed outside the closing
    // dialog A: the click opened the dialog for B, then the deferred press dismissed it.
    keepClosingContentMounted();
    const { user } = renderWithProviders(<ItemDialogs />);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("dialog", { name: "Item A", hidden: true }).dataset["state"]).toBe("closed");
    // The closing layer listens for presses again from the next task.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await user.click(screen.getByRole("button", { name: "Editar B", hidden: true }));
    const dialog = screen.getByRole("dialog", { name: "Item B" });
    expect(dialog.dataset["state"]).toBe("open");
    expect(screen.getAllByRole("dialog", { hidden: true })).toEqual([dialog]);
    // The overlay sits under the content, not over it (it had stacked above when it remounted).
    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(overlay?.compareDocumentPosition(dialog)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("traps focus inside and returns it to the trigger on Escape", async () => {
    const { user } = renderWithProviders(<RenameDialog />);
    const trigger = screen.getByRole("button", { name: "Renomear" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Renomear projeto" });
    expect(dialog.getAttribute("aria-describedby")).toBe(screen.getByText("O nome aparece nos breadcrumbs.").id);
    await expectNoAxeViolations(document.body);
    for (let step = 0; step < 5; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("has a translated close button", async () => {
    const { user } = renderWithProviders(<RenameDialog />, { locale: "en-US" });
    await user.click(screen.getByRole("button", { name: "Renomear" }));
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
