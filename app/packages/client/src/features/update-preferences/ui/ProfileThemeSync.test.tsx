import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";

describe("ProfileThemeSync (mounted by the app shell)", () => {
  it("applies the theme saved in the profile once the user loads", async () => {
    renderApp(<p>app</p>, { routes: { "GET /v1/me": ok(buildMe({ preferences: { theme: "light", notifications: { productUpdates: false, securityAlerts: true } } })) } });
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("light"));
  });
});
