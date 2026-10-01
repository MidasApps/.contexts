"use client";

import type { ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#/shared/ui/molecules/Sheet/Sheet.tsx";
import { SidebarInset } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { SidebarProvider } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { SkipLink } from "#/shared/ui/atoms/SkipLink/SkipLink.tsx";

export type RightPanelSlot = {
  /** Landmark name (`aside` label) and sheet title below `lg`. */
  label: string;
  content: ReactNode;
  /** Below `lg` the panel is a sheet (breakpoints.html); these control it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type AppShellTemplateProps = {
  /** The app sidebar widget (`Sidebar` organism inside). */
  sidebar: ReactNode;
  /** Topbar content: sidebar trigger, breadcrumbs, palette trigger (56 px, layout.html). */
  topbar: ReactNode;
  children: ReactNode;
  /** 360 px right panel (SP4 mounts chat here). */
  rightPanel?: RightPanelSlot | undefined;
  /** Desktop sidebar state and its persistence (cookie on web, local storage on desktop). */
  sidebarDefaultOpen?: boolean;
  persistSidebarState?: (open: boolean) => void;
  /** `true` below `lg`: the right panel renders as a sheet (from `useMediaQuery` in the app shell). */
  compactRightPanel?: boolean;
  className?: string;
};

/**
 * Page frame of the user area (layout.html): skip link first, sidebar 260/60 px, sticky 56 px
 * topbar, `main#main` (focusable target of the skip link) with content capped at 1280 px and
 * 24–40 px gutters, optional 360 px right panel. Exactly one `main` per page.
 */
export function AppShellTemplate({
  sidebar,
  topbar,
  children,
  rightPanel,
  sidebarDefaultOpen = true,
  persistSidebarState,
  compactRightPanel = false,
  className,
}: AppShellTemplateProps) {
  return (
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen}
      {...(persistSidebarState === undefined ? {} : { persistState: persistSidebarState })}
      className={className}
    >
      <SkipLink />
      {sidebar}
      <SidebarInset>
        <header data-slot="app-topbar" className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm">
          {topbar}
        </header>
        <div className="flex min-h-0 flex-1">
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
            <div className="mx-auto w-full max-w-[1280px] px-6 py-6 lg:px-10 lg:py-8">{children}</div>
          </main>
          {rightPanel === undefined ? null : <RightPanel slot={rightPanel} compact={compactRightPanel} />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function RightPanel({ slot, compact }: { slot: RightPanelSlot; compact: boolean }) {
  if (compact) {
    return (
      <Sheet open={slot.open} onOpenChange={slot.onOpenChange}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-[360px]">
          <SheetHeader className="sr-only">
            <SheetTitle>{slot.label}</SheetTitle>
            <SheetDescription>{slot.label}</SheetDescription>
          </SheetHeader>
          {slot.content}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <aside
      aria-label={slot.label}
      data-slot="right-panel"
      className={cn("sticky top-14 hidden h-[calc(100svh-3.5rem)] w-[360px] shrink-0 border-l border-border bg-card lg:flex", !slot.open && "lg:hidden")}
    >
      {slot.content}
    </aside>
  );
}
