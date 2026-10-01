"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { BREAKPOINTS, useMediaQuery } from "#/shared/lib/media/use-media-query.ts";
import { useShellSlots } from "#/shared/lib/shell/shell-registry-context.tsx";
import { AppShellTemplate } from "#/shared/ui/templates/AppShellTemplate/AppShellTemplate.tsx";
import { AppSidebar } from "#/widgets/app-sidebar/index.ts";
import { AppTopbar } from "#/widgets/app-topbar/index.ts";
import { CommandPalette } from "#/widgets/command-palette/index.ts";
import { OrganizationSwitcher } from "#/widgets/organization-switcher/index.ts";
import { ProjectSwitcher } from "#/widgets/project-switcher/index.ts";
import { UnitPicker } from "#/widgets/unit-picker/index.ts";
import { UserMenu } from "#/widgets/user-menu/index.ts";
import { OfflineBanner } from "./offline-banner.tsx";

export type AppLayoutProps = {
  children: ReactNode;
  /** Desktop sidebar state from the host (web: shadcn's `sidebar_state` cookie read on the server). */
  sidebarDefaultOpen?: boolean;
  /** Persists the sidebar state (web: cookie; desktop: local storage). */
  persistSidebarState?: (open: boolean) => void;
};

/**
 * Layout of every signed-in page of the user area (SP2 spec §9): the app composes the shell widgets
 * here (FSD app layer), so widgets never import each other. Sidebar with switchers, unit picker,
 * navigation and user menu; topbar with breadcrumbs and the palette trigger; the offline banner;
 * the command palette (⌘K / Ctrl+K); the right-panel slot SP4 fills with chat.
 */
export function AppLayout({ children, sidebarDefaultOpen, persistSidebarState }: AppLayoutProps) {
  const t = useTranslations("shell");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const compactPanel = useMediaQuery(`(max-width: ${BREAKPOINTS.lg - 1}px)`);
  const { rightPanel: RightPanel } = useShellSlots();
  return (
    <>
      <AppShellTemplate
        sidebar={
          <AppSidebar
            header={<OrganizationSwitcher />}
            context={
              <>
                <ProjectSwitcher />
                <UnitPicker />
              </>
            }
            footer={<UserMenu />}
          />
        }
        topbar={<AppTopbar onOpenCommandPalette={() => setPaletteOpen(true)} />}
        rightPanel={RightPanel === undefined ? undefined : { label: t("rightPanel.label"), content: <RightPanel />, open: panelOpen, onOpenChange: setPanelOpen }}
        compactRightPanel={compactPanel}
        {...(sidebarDefaultOpen === undefined ? {} : { sidebarDefaultOpen })}
        {...(persistSidebarState === undefined ? {} : { persistSidebarState })}
      >
        <OfflineBanner className="mb-4 empty:mb-0" />
        {children}
      </AppShellTemplate>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
