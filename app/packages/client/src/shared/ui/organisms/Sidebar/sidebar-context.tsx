"use client";

import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "#/shared/lib/cn.ts";
import { useIsMobile } from "#/shared/lib/media/use-media-query.ts";
import { useShortcut } from "#/shared/lib/shortcuts/use-shortcut.ts";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";

/** navegacao.html: 260 px expanded, 60 px collapsed (icons with 40 × 40 targets); sheet on mobile. */
export const SIDEBAR_WIDTH = "260px";
export const SIDEBAR_WIDTH_ICON = "60px";
export const SIDEBAR_WIDTH_MOBILE = "18rem";
/** ⌘B / Ctrl+B toggles the sidebar (shadcn default; navegacao.html). */
export const SIDEBAR_SHORTCUT_KEY = "b";

export type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

/** Sidebar state; throws outside `SidebarProvider` (a wiring bug, not a runtime condition). */
export const useSidebar = (): SidebarContextValue => {
  const context = useContext(SidebarContext);
  if (context === null) throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
};

/**
 * Closes the mobile sheet whenever `key` changes (the widgets pass the location path): switching
 * organization or project and following a navigation item land on a new path, and the modal sheet
 * would otherwise keep covering the page just opened. It closes after the navigation, not in the
 * click handler, so a switcher's menu inside the sheet finishes unmounting first.
 */
export const useCloseMobileSidebarOnChange = (key: string): void => {
  const { setOpenMobile } = useSidebar();
  useEffect(() => {
    setOpenMobile(false);
  }, [key, setOpenMobile]);
};

export type SidebarProviderProps = ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Persists the desktop open state. Injected by the app (SP2 spec §9): the web writes shadcn's
   * `sidebar_state` cookie so the server renders the right width, the desktop uses local storage.
   */
  persistState?: (open: boolean) => void;
};

/**
 * shadcn `SidebarProvider` with the persistence injected instead of a hard-coded cookie write, the
 * design-system widths and the shared shortcut hook.
 */
export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  persistState,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = openProp ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange === undefined) setInternalOpen(next);
      else onOpenChange(next);
      persistState?.(next);
    },
    [onOpenChange, persistState],
  );
  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile((current) => !current);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);
  useShortcut({ key: SIDEBAR_SHORTCUT_KEY, onTrigger: toggleSidebar });

  const value = useMemo<SidebarContextValue>(
    () => ({
      state: open ? "expanded" : "collapsed",
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [open, setOpen, isMobile, openMobile, toggleSidebar],
  );
  const widths = {
    "--sidebar-width": SIDEBAR_WIDTH,
    "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
    ...style,
  } as CSSProperties;
  return (
    <SidebarContext value={value}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={widths}
          className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext>
  );
}
