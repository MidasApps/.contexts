"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useElementHeight } from "#/shared/lib/media/use-element-height.ts";
import { BREAKPOINTS, useMediaQuery } from "#/shared/lib/media/use-media-query.ts";
import { useShellSlots } from "#/shared/lib/shell/shell-registry-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { AppShellTemplate } from "#/shared/ui/templates/AppShellTemplate/AppShellTemplate.tsx";
import { AppSidebar } from "#/widgets/app-sidebar/index.ts";
import { AppTopbar } from "#/widgets/app-topbar/index.ts";
import { CommandPalette } from "#/widgets/command-palette/index.ts";
import { ImpersonationBanner } from "#/widgets/impersonation-banner/index.ts";
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

const alwaysAvailable = (): boolean => true;

/**
 * Layout of every signed-in page of the user area (SP2 spec §9): the app composes the shell widgets
 * here (FSD app layer), so widgets never import each other. Sidebar with switchers, unit picker,
 * navigation and user menu; topbar with breadcrumbs and the palette trigger; the offline banner; the
 * impersonation banner (support access as a user, SP1 spec §6.6);
 * the command palette (⌘K / Ctrl+K); the right-panel slot SP4 fills with chat. The panel starts
 * closed and is opened from the topbar; the slot's own hook says where it applies, and its content
 * mounts only while it is open (what it must keep lives in the shell UI store, decision 0048) and
 * closes itself through `onClose`.
 */
export function AppLayout({ children, sidebarDefaultOpen, persistSidebarState }: AppLayoutProps) {
  const t = useTranslations("shell");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const compactPanel = useMediaQuery(`(max-width: ${BREAKPOINTS.lg - 1}px)`);
  // Full-height pages (the chat) subtract the banners from the viewport: `--shell-banners-height`.
  const [bannersRef, bannersHeight] = useElementHeight<HTMLDivElement>();
  // The registries are built once per app, so this is the same hook on every render.
  const { rightPanel: RightPanel, useRightPanelAvailable = alwaysAvailable } = useShellSlots();
  const panelAvailable = useRightPanelAvailable() && RightPanel !== undefined;
  const panelToggle = panelAvailable ? (
    <Button
      variant={panelOpen ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={panelOpen}
      onClick={() => setPanelOpen((open) => !open)}
    >
      <Icon name="message" />
      <span className="max-sm:sr-only">{t("rightPanel.toggle")}</span>
    </Button>
  ) : null;
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
        topbar={<AppTopbar onOpenCommandPalette={() => setPaletteOpen(true)} actions={panelToggle} />}
        rightPanel={
          panelAvailable
            ? {
                label: t("rightPanel.label"),
                content: panelOpen ? <RightPanel onClose={() => setPanelOpen(false)} /> : null,
                open: panelOpen,
                onOpenChange: setPanelOpen,
              }
            : undefined
        }
        compactRightPanel={compactPanel}
        {...(sidebarDefaultOpen === undefined ? {} : { sidebarDefaultOpen })}
        {...(persistSidebarState === undefined ? {} : { persistSidebarState })}
      >
        <div data-slot="shell-content" style={{ "--shell-banners-height": `${bannersHeight}px` } as CSSProperties}>
          {/* flow-root keeps the banners' margins inside the measured box; support mode stays pinned. */}
          <div ref={bannersRef} data-slot="shell-banners" className="sticky top-14 z-10 flow-root">
            <OfflineBanner className="mb-4 empty:mb-0" />
            <ImpersonationBanner className="mb-4 empty:mb-0" />
          </div>
          {children}
        </div>
      </AppShellTemplate>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
