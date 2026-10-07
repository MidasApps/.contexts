import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok } from "#/shared/testing/fake-api.ts";
import { buildMe, IDS } from "#/shared/testing/fixtures.ts";
import { CommandPalette } from "./CommandPalette.tsx";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        abrir
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

describe("CommandPalette", () => {
  it("lists only permitted navigation at the node and filters by label", async () => {
    const { user } = renderWidget(<Harness />, {
      path: `/o/${IDS.organization}`,
      permissions: ["core.organization.read"],
    });
    await user.click(screen.getByRole("button", { name: "abrir" }));
    const dialog = await screen.findByRole("dialog", { name: "Paleta de comandos" });
    await waitFor(() => expect(within(dialog).getByRole("option", { name: "Geral" })).toBeDefined());
    expect(within(dialog).queryByRole("option", { name: "Membros" })).toBeNull();
    expect(within(dialog).queryByRole("option", { name: "Criar projeto" })).toBeNull();
    await expectNoAxeViolations(document.body);
    await user.type(within(dialog).getByRole("combobox"), "zzzz-nada");
    expect(await within(dialog).findByText("Nenhum comando encontrado.")).toBeDefined();
  });

  it("opens the create-project dialog from its action and returns focus afterwards", async () => {
    const { user } = renderWidget(<Harness />, { path: `/o/${IDS.organization}` });
    const opener = screen.getByRole("button", { name: "abrir" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Paleta de comandos" });
    await user.click(await within(dialog).findByRole("option", { name: "Criar projeto" }));
    const create = await screen.findByRole("dialog", { name: "Novo projeto" });
    await user.click(within(create).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("does not offer project creation when the default project is on", async () => {
    const { user } = renderWidget(<Harness />, {
      path: `/o/${IDS.organization}`,
      routes: {
        "GET /v1/me": ok(
          buildMe({ lastContext: { organizationId: IDS.organization }, organizationDefaultProject: true }),
        ),
      },
    });
    await user.click(screen.getByRole("button", { name: "abrir" }));
    const dialog = await screen.findByRole("dialog", { name: "Paleta de comandos" });
    // The action is listed until `GET /v1/me` answers; wait for the settled list.
    await waitFor(() => {
      expect(within(dialog).getByRole("option", { name: "Geral" })).toBeDefined();
      expect(within(dialog).queryByRole("option", { name: "Criar projeto" })).toBeNull();
    });
  });
});
