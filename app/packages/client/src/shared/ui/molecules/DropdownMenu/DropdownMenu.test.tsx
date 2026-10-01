import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./DropdownMenu.tsx";

describe("DropdownMenu", () => {
  it("opens from the keyboard, moves with arrows and activates with Enter", async () => {
    const onSignOut = vi.fn();
    const { user } = renderWithProviders(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Conta</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Perfil</DropdownMenuLabel>
            <DropdownMenuItem>Preferências</DropdownMenuItem>
            <DropdownMenuItem>Segurança</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    screen.getByRole("button", { name: "Conta" }).focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Preferências" }));
    await expectNoAxeViolations(document.body);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Segurança" }));
    await user.keyboard("{ArrowDown}");
    const signOut = screen.getByRole("menuitem", { name: "Sair" });
    expect(document.activeElement).toBe(signOut);
    expect(signOut.className).toContain("text-destructive-text");
    await user.keyboard("{Enter}");
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(menu.isConnected).toBe(false);
  });
});
