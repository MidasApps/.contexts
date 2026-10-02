import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { IMPERSONATION_STORAGE_KEY, useImpersonationStore } from "#/features/admin-impersonation/index.ts";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { IMPERSONATION_IDS, storedImpersonation } from "#/shared/testing/admin-accounts-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { TEST_USER } from "#/shared/testing/render-client.tsx";
import { ImpersonationBanner } from "./ImpersonationBanner.tsx";

const IMPERSONATED = { accessVersion: 3, imp: IMPERSONATION_IDS.session, impBy: "staff-1" };

const render = (options: Parameters<typeof renderApp>[1] = {}) => {
  const auth = createFakeAuth(TEST_USER);
  const view = renderApp(
    <main>
      <ImpersonationBanner />
    </main>,
    { auth, ...options },
  );
  return { ...view, impersonate: () => auth.setClaims(IMPERSONATED) };
};

const region = (container: HTMLElement): HTMLElement | null => container.querySelector('[data-slot="impersonation-banner"]');

afterEach(() => {
  act(() => useImpersonationStore.getState().reset());
  globalThis.sessionStorage.clear();
});

describe("ImpersonationBanner", () => {
  it("keeps an empty polite region while the tab is not impersonating", async () => {
    const { container } = render();
    await waitFor(() => expect(region(container)?.getAttribute("aria-live")).toBe("polite"));
    expect(region(container)?.getAttribute("aria-atomic")).toBe("true");
    expect(region(container)?.textContent).toBe("");
  });

  it("names the impersonated user, read-only and audited, inside that region", async () => {
    const { container, impersonate } = render();
    impersonate();
    expect(await screen.findByText(/Você está vendo o app como Ana Souza, em modo somente leitura. Tudo o que abrir fica registrado./u)).toBeDefined();
    expect(region(container)?.textContent).toContain("Sair do modo suporte");
    await expectNoAxeViolations(container);
  });

  it("names the organization and the end of a session this tab started", async () => {
    globalThis.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, storedImpersonation({ sessionId: IMPERSONATION_IDS.session, organizationName: "Northwind", targetLabel: "Ana Souza" }));
    const { impersonate } = render();
    impersonate();
    expect(await screen.findByText(/Você está vendo o app como Ana Souza em Northwind, em modo somente leitura, até /u)).toBeDefined();
  });

  it("returns to the staff account on /admin/users when leaving, with the button pending meanwhile", async () => {
    let finish: () => void = () => undefined;
    const { user, router, bridge, impersonate } = render({
      leaveImpersonation: () =>
        new Promise((resolve) => {
          finish = () => resolve({ customToken: "staff-token" });
        }),
    });
    impersonate();
    const leave = await screen.findByRole("button", { name: "Sair do modo suporte" });
    await user.click(leave);
    await waitFor(() => expect(leave.getAttribute("aria-busy")).toBe("true"));
    finish();
    await waitFor(() => expect(router.current()).toBe("/admin/users"));
    expect(bridge.ended).toBe(0);
  });

  it("signs out completely when the staff session cannot be restored, never staying as the user", async () => {
    const { user, router, bridge, impersonate } = render({ leaveImpersonation: () => Promise.reject(new Error("staff session gone")) });
    impersonate();
    await user.click(await screen.findByRole("button", { name: "Sair do modo suporte" }));
    await waitFor(() => expect(router.current()).toBe("/sign-in"));
    expect(bridge.ended).toBe(1);
  });
});
