import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { ThemeProvider } from "./theme-provider.tsx";
import { useThemePreference } from "./use-theme-preference.ts";

function ThemeSwitch() {
  const { preference, setPreference } = useThemePreference();
  return (
    <>
      <p data-testid="preference">{preference}</p>
      <button type="button" onClick={() => setPreference("light")}>
        Claro
      </button>
    </>
  );
}

describe("ThemeProvider", () => {
  it("defaults to system and writes the chosen theme to data-theme on <html>", async () => {
    const { user } = renderWithProviders(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("preference").textContent).toBe("system");
    await user.click(screen.getByRole("button", { name: "Claro" }));
    expect(screen.getByTestId("preference").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("renders the pre-paint script as a data block when the host renders on the client only (desktop)", () => {
    const { container } = renderWithProviders(
      <ThemeProvider prePaintScript={false}>
        <ThemeSwitch />
      </ThemeProvider>,
    );
    expect(container.ownerDocument.querySelector("script")?.getAttribute("type")).toBe("application/json");
  });
});
