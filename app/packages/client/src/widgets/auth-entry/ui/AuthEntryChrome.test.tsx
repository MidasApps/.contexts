import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createRecordingSession, renderWithClient } from "#/shared/testing/render-client.tsx";
import { AuthBrand, EntryLocaleSwitcher } from "./AuthEntryChrome.tsx";

const signedOut = () => createRecordingSession({ status: "signed-out", reason: "none" });

describe("EntryLocaleSwitcher", () => {
  it("offers every language by its own name and switches the page to the one picked", async () => {
    const { user, router, container } = renderWithClient(<EntryLocaleSwitcher />, { session: signedOut() });
    const picker = screen.getByRole("combobox", { name: "Idioma" });
    expect(picker.textContent).toContain("Português (Brasil)");
    await expectNoAxeViolations(container);
    picker.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Español (Latinoamérica)" }));
    expect(router.localeSwitches()).toEqual(["es-419"]);
    expect(router.localeSwitchHashes()).toEqual([undefined]);
  });

  it("hands a fragment the page keeps in memory to the switch", async () => {
    const { user, router } = renderWithClient(<EntryLocaleSwitcher keepHash="token=abc" />, { session: signedOut() });
    const picker = screen.getByRole("combobox", { name: "Idioma" });
    picker.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "English (United States)" }));
    expect(router.localeSwitchHashes()).toEqual(["token=abc"]);
  });
});

describe("AuthBrand", () => {
  it("shows the product name with a decorative mark", () => {
    renderWithClient(<AuthBrand />, { session: signedOut() });
    expect(screen.getByText("Core")).toBeDefined();
  });
});
