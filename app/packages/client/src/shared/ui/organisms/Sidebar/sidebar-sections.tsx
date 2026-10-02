"use client";

import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Separator } from "#/shared/ui/atoms/Separator/Separator.tsx";

/** Brand and switchers at the top of the sidebar. */
export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

/** User menu at the bottom (avatar + name + role, avatar.html "user chip"). */
export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarSeparator({ className, ...props }: ComponentProps<typeof Separator>) {
  return <Separator data-slot="sidebar-separator" className={cn("mx-2 w-auto bg-sidebar-border", className)} {...props} />;
}

/** Scrollable middle area with the navigation groups. */
export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-auto group-data-[collapsible=icon]:overflow-hidden", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-group" className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />;
}

/**
 * Section header in mono uppercase (navegacao.html: TERMINAIS / EQUIPE / CONFIGURAÇÕES). Hidden when
 * collapsed to icons; give the group's list `aria-labelledby` this label's id.
 */
export function SidebarGroupLabel({ className, asChild = false, ...props }: ComponentProps<"div"> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "div";
  return (
    <Component
      data-slot="sidebar-group-label"
      className={cn(
        "flex h-7 shrink-0 items-center px-2 font-mono text-tiny tracking-[0.1em] text-muted-foreground uppercase",
        "transition-[margin,opacity] duration-200 ease-out group-data-[collapsible=icon]:-mt-7 group-data-[collapsible=icon]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/** Action next to a group label (e.g. "create project"); needs an accessible name. */
export function SidebarGroupAction({ className, asChild = false, ...props }: ComponentProps<"button"> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      data-slot="sidebar-group-action"
      className={cn(
        "absolute top-3 right-3 flex size-6 cursor-pointer items-center justify-center rounded-2xs text-muted-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-group-content" className={cn("w-full text-sm", className)} {...props} />;
}

export function SidebarInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input data-slot="sidebar-input" className={cn("h-8 w-full", className)} {...props} />;
}
