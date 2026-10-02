import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { ProfilePageFrame } from "#/widgets/profile-nav/index.ts";
import { SettingsPageFrame } from "./SettingsNav.tsx";

describe("settings and profile navigation", () => {
  it("shows only the settings sections the viewer may read, current one marked", async () => {
    const { container } = renderApp(
      <main>
        <SettingsPageFrame organizationId={IDS.organization} header={<h1>Membros</h1>} allowed>
          <p>Conteúdo</p>
        </SettingsPageFrame>
      </main>,
      { path: `/o/${IDS.organization}/settings/members`, routes: shellRoutes(["core.organization.read", "core.member.read"]) },
    );
    const nav = await screen.findByRole("navigation", { name: "Seções das configurações" });
    await within(nav).findByRole("link", { name: "Membros" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Geral", "Membros"]);
    expect(within(nav).getByRole("link", { name: "Membros" }).getAttribute("aria-current")).toBe("page");
    await expectNoAxeViolations(container);
  });

  it("lets list sections use the full width, and keeps no-access at reading width", async () => {
    const wide = renderApp(
      <main>
        <SettingsPageFrame organizationId={IDS.organization} header={<h1>Chaves</h1>} allowed width="wide">
          <p>Tabela</p>
        </SettingsPageFrame>
      </main>,
      { path: `/o/${IDS.organization}/settings/api-keys`, routes: shellRoutes(["core.organization.read"]) },
    );
    expect((await screen.findByText("Tabela")).parentElement?.getAttribute("data-width")).toBe("wide");
    wide.unmount();
    renderApp(
      <main>
        <SettingsPageFrame organizationId={IDS.organization} header={<h1>Chaves</h1>} allowed={false} width="wide">
          <p>Tabela</p>
        </SettingsPageFrame>
      </main>,
      { path: `/o/${IDS.organization}/settings/api-keys`, routes: shellRoutes(["core.organization.read"]) },
    );
    const heading = await screen.findByRole("heading", { name: "Você não tem acesso a esta página" });
    expect(heading.closest("section")?.getAttribute("data-width")).toBe("reading");
  });

  it("replaces the content with no-access when not allowed", async () => {
    renderApp(
      <main>
        <SettingsPageFrame organizationId={IDS.organization} header={<h1>Chaves</h1>} allowed={false}>
          <p>Segredo</p>
        </SettingsPageFrame>
      </main>,
      { path: `/o/${IDS.organization}/settings/api-keys`, routes: shellRoutes(["core.organization.read"]) },
    );
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.queryByText("Segredo")).toBeNull();
  });

  it("lists every profile section", async () => {
    const { container } = renderApp(
      <main>
        <ProfilePageFrame header={<h1>Sessões</h1>}>
          <p>Conteúdo</p>
        </ProfilePageFrame>
      </main>,
      { path: "/profile/sessions" },
    );
    const nav = screen.getByRole("navigation", { name: "Seções do perfil" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: "Sessões" }).getAttribute("aria-current")).toBe("page");
    await expectNoAxeViolations(container);
  });

  it("builds the profile sections from the user-menu navigation, like the user menu", async () => {
    renderApp(
      <main>
        <ProfilePageFrame header={<h1>Conta</h1>}>
          <p>Conteúdo</p>
        </ProfilePageFrame>
      </main>,
      {
        path: "/profile/account",
        navigation: [
          { id: "sample.security-shortcut", slot: "user-menu", labelKey: "shell.nav.profile.security", icon: "shield-check", order: 5, target: { kind: "profile", section: "security" } },
          { id: "sample.admin-shortcut", slot: "user-menu", labelKey: "shell.nav.admin.organizations", icon: "building", order: 6, target: { kind: "admin", rest: "organizations" } },
        ],
      },
    );
    const nav = screen.getByRole("navigation", { name: "Seções do perfil" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/profile/account",
      "/profile/security",
      "/profile/preferences",
      "/profile/security",
      "/profile/sessions",
      "/profile/notifications",
    ]);
  });
});
