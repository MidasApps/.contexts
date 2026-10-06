import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { useIsImpersonating } from "#/shared/lib/session/use-impersonation.ts";
import { ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { useSaveThemePreference } from "./use-save-theme-preference.ts";

const IMPERSONATION_CLAIMS = { accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" };

function ThemeProbe() {
  const theme = useSaveThemePreference();
  const impersonating = useIsImpersonating();
  return (
    <div>
      <p>{impersonating ? "impersonating" : "own account"}</p>
      <button type="button" onClick={() => theme.save("dark")}>
        dark
      </button>
    </div>
  );
}

afterEach(() => {
  act(() => {
    notify.dismiss();
  });
});

describe("useSaveThemePreference", () => {
  it("applies the theme and saves it to the profile", async () => {
    const { user, api } = renderApp(<ThemeProbe />, { routes: { "PATCH /v1/me": ok(buildMe()) } });
    await screen.findByText("own account");
    await user.click(screen.getByRole("button", { name: "dark" }));
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("dark"));
    await waitFor(() => expect(api.callLines()).toContain("PATCH /v1/me"));
  });

  it("only applies the theme here while support staff view the app as the user (read-only)", async () => {
    const { user, api, auth } = renderApp(<ThemeProbe />, { routes: { "PATCH /v1/me": ok(buildMe()) } });
    auth.setClaims(IMPERSONATION_CLAIMS);
    await screen.findByText("impersonating");
    await user.click(screen.getByRole("button", { name: "dark" }));
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("dark"));
    expect(api.callLines()).not.toContain("PATCH /v1/me");
    expect(screen.queryByText("O tema foi aplicado aqui, mas não foi salvo no seu perfil.")).toBeNull();
  });
});
