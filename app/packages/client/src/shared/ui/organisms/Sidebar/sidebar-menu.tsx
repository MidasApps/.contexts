"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { useSidebar } from "./sidebar-context.tsx";

export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("flex w-full min-w-0 flex-col gap-0.5", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("group/menu-item relative", className)} {...props} />;
}

// navegacao.html items: 8 px radius, 12.5–13 px text, hover/active on `--sidebar-accent`; collapsed
// items are 40 × 40 icon targets. Focus keeps the global outline, drawn inside (-2 px) so the
// scroll container never clips it.
const sidebarMenuButtonVariants = cva(
  [
    "peer/menu-button flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-xs p-2 text-left text-body text-sidebar-foreground",
    "transition-[width,height,padding,background-color] focus-visible:-outline-offset-2",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
    "group-has-data-[slot=sidebar-menu-action]/menu-item:pr-8",
    "group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-3!",
    "[&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground",
  ],
  {
    variants: {
      size: {
        default: "h-8",
        sm: "h-7 text-xs",
        lg: "h-12 group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export type SidebarMenuButtonProps = ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    /** Current page: highlighted and `aria-current="page"`. */
    isActive?: boolean;
    /** Label shown as a tooltip when collapsed to icons (the text is hidden then). */
    tooltip?: string;
  };

/**
 * Navigation entry (pass the router `Link` with `asChild`). When collapsed, the visible text
 * remains in the DOM (truncated to zero width) so the link keeps its accessible name, and the
 * tooltip repeats it for pointer users.
 */
export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  size = "default",
  tooltip,
  className,
  ...props
}: SidebarMenuButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  const { isMobile, state } = useSidebar();
  const button = (
    <Component
      data-slot="sidebar-menu-button"
      data-size={size}
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      className={cn(sidebarMenuButtonVariants({ size }), className)}
      {...props}
    />
  );
  if (tooltip === undefined || state !== "collapsed" || isMobile) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/** Secondary action on an item (e.g. "more"); needs an accessible name; hidden when collapsed. */
export function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: ComponentProps<"button"> & { asChild?: boolean; showOnHover?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      data-slot="sidebar-menu-action"
      className={cn(
        "absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-2xs text-muted-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Counter on an item (navegacao.html: numeric pill in `--sidebar-primary`, white mono digits).
 * Pair the number with visually hidden context inside the link ("3 new") when it matters.
 */
export function SidebarMenuBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="sidebar-menu-badge"
      className={cn(
        "pointer-events-none absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5",
        "font-mono text-tiny text-sidebar-primary-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

const SKELETON_WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-1/2"] as const;

/** Placeholder item while navigation loads (deterministic widths; the container announces loading). */
export function SidebarMenuSkeleton({ className, index = 0, ...props }: ComponentProps<"div"> & { index?: number }) {
  return (
    <div
      data-slot="sidebar-menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-xs px-2", className)}
      {...props}
    >
      <Skeleton className="size-4 rounded-2xs" />
      <Skeleton className={cn("h-3.5", SKELETON_WIDTHS[index % SKELETON_WIDTHS.length])} />
    </div>
  );
}

export function SidebarMenuSub({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-0.5 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSubItem({ className, ...props }: ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-sub-item" className={cn("group/menu-sub-item relative", className)} {...props} />;
}

export function SidebarMenuSubButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: ComponentProps<"a"> & { asChild?: boolean; isActive?: boolean }) {
  const Component = asChild ? Slot.Root : "a";
  return (
    <Component
      data-slot="sidebar-menu-sub-button"
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-xs px-2 text-body-sm text-sidebar-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:-outline-offset-2",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}
