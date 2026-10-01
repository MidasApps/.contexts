"use client";

import { PanelLeftIcon } from "lucide-react";
import type { ComponentProps, CSSProperties } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#/shared/ui/molecules/Sheet/Sheet.tsx";
import { SIDEBAR_WIDTH_MOBILE, useSidebar } from "./sidebar-context.tsx";

export type SidebarProps = ComponentProps<"div"> & {
  side?: "left" | "right";
  /** `icon` collapses to a 60 px rail of icons (the app shell default); `none` is always expanded. */
  collapsible?: "offcanvas" | "icon" | "none";
};

/**
 * shadcn `sidebar` (block `sidebar-07`) in the design tokens: `--sidebar` surface with a hairline
 * edge, 200 ms ease-out width transition (navegacao.html), a labelled sheet below `md`. Put the
 * navigation inside a `nav` with its own label (the widget does).
 */
export function Sidebar({ side = "left", collapsible = "icon", className, children, ...props }: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  const t = useTranslations("shell.sidebar");

  if (collapsible === "none") {
    return (
      <div data-slot="sidebar" className={cn("flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground", className)} {...props}>
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          data-slot="sidebar"
          data-mobile="true"
          side={side}
          showCloseButton={false}
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as CSSProperties}
          className="w-(--sidebar-width) gap-0 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-out",
          "group-data-[collapsible=offcanvas]:w-0 group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-out md:flex",
          side === "left"
            ? "left-0 border-r border-sidebar-border group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 border-l border-sidebar-border group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          className,
        )}
        {...props}
      >
        <div data-slot="sidebar-inner" className="flex h-full w-full flex-col bg-sidebar">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Toggle button (⌘B / Ctrl+B is the same action); reports the state with `aria-expanded`. */
export function SidebarTrigger({ className, onClick, ...props }: ComponentProps<typeof Button>) {
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
  const t = useTranslations("shell.sidebar");
  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      aria-expanded={isMobile ? openMobile : open}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon aria-hidden="true" />
      <span className="sr-only">{t("toggle")}</span>
    </Button>
  );
}

/**
 * Thin pointer rail on the sidebar edge (click to toggle). Keyboard users have the trigger and the
 * shortcut, so the rail stays out of the tab order and out of the accessibility tree.
 */
export function SidebarRail({ className, ...props }: ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();
  const t = useTranslations("shell.sidebar");
  return (
    <button
      type="button"
      data-slot="sidebar-rail"
      aria-hidden="true"
      tabIndex={-1}
      onClick={toggleSidebar}
      title={t("toggle")}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-out group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        className,
      )}
      {...props}
    />
  );
}

/** Column next to the sidebar holding topbar and page (the template renders `main` inside it). */
export function SidebarInset({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-inset" className={cn("relative flex min-w-0 w-full flex-1 flex-col bg-background", className)} {...props} />;
}
