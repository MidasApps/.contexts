import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createRecordingSession, renderWithClient } from "#/shared/testing/render-client.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { Toaster } from "#/shared/ui/molecules/Toaster/Toaster.tsx";
import { SignOutButton } from "./SignOutButton.tsx";

afterEach(() => {
  act(() => {
    notify.dismiss();
  });
});

describe("SignOutButton", () => {
  it("signs out and lands on sign-in (replacing the entry)", async () => {
    const session = createRecordingSession();
    const { user, router, container } = renderWithClient(<SignOutButton />, { session, path: "/o/org-1" });
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(router.current()).toBe("/sign-in"));
    expect(session.actions).toEqual(["signOut"]);
    expect(router.history()).toEqual(["/sign-in"]);
  });

  it("stays on the page when asked and warns when the server session could not be ended", async () => {
    const session = { ...createRecordingSession(), signOut: () => Promise.reject(new Error("bridge down")) };
    const { user, router } = renderWithClient(
      <>
        <SignOutButton landing={null}>Entrar com outra conta</SignOutButton>
        <Toaster />
      </>,
      { session, path: "/invite" },
    );
    await user.click(screen.getByRole("button", { name: "Entrar com outra conta" }));
    expect(await screen.findByText(/não conseguimos encerrar a sessão no servidor/u)).toBeDefined();
    expect(router.current()).toBe("/invite");
  });
});
