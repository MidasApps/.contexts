"use client";

import type { NavSlot } from "@core/contracts";
import { useTranslations } from "use-intl";
import { usePermissions } from "#/entities/permission/index.ts";
import { useProjects } from "#/entities/project/index.ts";
import { useCurrentNode, useMyOrganizations } from "#/entities/session/index.ts";
import { useSignOut } from "#/features/sign-out/index.ts";
import { useIsSwitchingOrganization, useSwitchOrganization } from "#/features/switch-organization/index.ts";
import { useSaveThemePreference } from "#/features/update-preferences/index.ts";
import type { NodeParams } from "#/shared/api/core-queries.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { useThemePreference } from "#/shared/lib/theme/use-theme-preference.ts";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";

export type PaletteGroup = "navigation" | "organizations" | "projects" | "actions";

/** One palette entry; `id` is stable across renders (recents store it). */
export type PaletteCommand = {
  readonly id: string;
  readonly group: PaletteGroup;
  readonly label: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
  readonly run: () => void;
};

/** Loading/failed state of a group whose entries come from the API. */
export type PaletteGroupStatus = "pending" | "error" | "success";

const NAV_SLOTS: readonly NavSlot[] = ["project", "organization", "settings", "user-menu"];

const useNavigationCommands = (node: NodeParams | null): PaletteCommand[] => {
  const t = useTranslations();
  const router = useRouter();
  const { can } = usePermissions();
  const registry = useNavigationRegistry();
  return NAV_SLOTS.flatMap((slot) =>
    registry.visibleItems(slot, can).flatMap((item): PaletteCommand[] => {
      const route = navItemRoute(item.target, node ?? {});
      if (route === null) return [];
      const label = t(item.labelKey);
      return [
        {
          id: `nav:${item.id}`,
          group: "navigation",
          label,
          icon: item.icon,
          keywords: [label, t(`shell.commandPalette.slots.${slot}`)],
          run: () => router.navigate(route),
        },
      ];
    }),
  );
};

const useTenantCommands = (node: NodeParams | null) => {
  const t = useTranslations("shell.commandPalette");
  const router = useRouter();
  const organizations = useMyOrganizations();
  const projects = useProjects(node?.organizationId);
  const switchOrganization = useSwitchOrganization();
  const switching = useIsSwitchingOrganization();
  const organizationCommands = (organizations.data ?? [])
    .filter((organization) => organization.id !== node?.organizationId)
    .map((organization): PaletteCommand => {
      const label = t("switchOrganization", { name: organization.name });
      return {
        id: `organization:${organization.id}`,
        group: "organizations",
        label,
        icon: "building",
        keywords: [organization.name],
        run: () => {
          // A second switch while one runs would refetch every query twice.
          if (!switching) switchOrganization.mutate(organization.id);
        },
      };
    });
  const projectCommands =
    node === null
      ? []
      : (projects.data ?? [])
          .filter((project) => project.id !== node.projectId)
          .map(
            (project): PaletteCommand => ({
              id: `project:${project.id}`,
              group: "projects",
              label: t("openProject", { name: project.name }),
              icon: "folder",
              keywords: [project.name],
              run: () => router.navigate({ id: "project", organizationId: node.organizationId, projectId: project.id }),
            }),
          );
  return {
    commands: [...organizationCommands, ...projectCommands],
    status: { organizations: organizations.status, projects: node === null ? ("success" as const) : projects.status },
  };
};

const useActionCommands = (node: NodeParams | null, onCreateProject: () => void): PaletteCommand[] => {
  const t = useTranslations("shell.commandPalette.actions");
  const router = useRouter();
  const theme = useThemePreference();
  const saveTheme = useSaveThemePreference().save;
  const { signOut } = useSignOut();
  const canCreateProject = usePermissions(node === null ? null : { organizationId: node.organizationId }).can(
    "core.project.create",
  );
  const action = (name: string, icon: IconName, run: () => void): PaletteCommand => ({
    id: `action:${name}`,
    group: "actions",
    label: t(name),
    icon,
    keywords: [t(name)],
    run,
  });
  return [
    action("createOrganization", "plus", () => router.navigate({ id: "organizations" })),
    ...(node !== null && canCreateProject ? [action("createProject", "plus", onCreateProject)] : []),
    action("toggleTheme", theme.resolved === "dark" ? "sun" : "moon", () =>
      saveTheme(theme.resolved === "dark" ? "light" : "dark"),
    ),
    action("changeLanguage", "languages", () => router.navigate({ id: "profile", section: "preferences" })),
    action("openProfile", "user", () => router.navigate({ id: "profile", section: "account" })),
    action("signOut", "log-out", () => void signOut()),
  ];
};

/**
 * Everything the palette offers at the current node (SP2 spec §9): navigation allowed by `can()`,
 * switching organization or project, creating an organization or (with permission) a project,
 * theme, language, profile and sign-out.
 */
export const usePaletteCommands = (args: {
  onCreateProject: () => void;
}): { commands: PaletteCommand[]; status: Record<"organizations" | "projects", PaletteGroupStatus> } => {
  const node = useCurrentNode();
  const navigation = useNavigationCommands(node);
  const tenant = useTenantCommands(node);
  const actions = useActionCommands(node, args.onCreateProject);
  return { commands: [...navigation, ...tenant.commands, ...actions], status: tenant.status };
};
