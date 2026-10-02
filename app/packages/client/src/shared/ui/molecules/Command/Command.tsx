"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `command` pieces over cmdk: a search input (`role="combobox"`) driving a filtered
 * `listbox` through `aria-activedescendant` (arrows move, Enter selects). Shared by the searchable
 * selects (molecules) and the command palette (`organisms/Command`). componentes.html `.cmd`:
 * `--card` surface, hairline border, mono shortcut hints.
 */
export type CommandProps = Omit<ComponentProps<typeof CommandPrimitive>, "label"> & {
  /** Accessible name of the search box (cmdk labels its input with a hidden label from the root). */
  label: string;
};

export function Command({ className, label, ...props }: CommandProps) {
  return (
    <CommandPrimitive
      data-slot="command"
      label={label}
      className={cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground", className)}
      {...props}
    />
  );
}

/** Search box; its name comes from `Command`'s `label` (placeholders are not labels). */
export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-10 items-center gap-2 border-b border-border px-3 focus-within:border-ring"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export type CommandListProps = Omit<ComponentProps<typeof CommandPrimitive.List>, "label"> & {
  /** Accessible name of the listbox (cmdk defaults to the English "Suggestions"). */
  label: string;
};

export function CommandList({ className, label, ...props }: CommandListProps) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      label={label}
      className={cn("max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto", className)}
      {...props}
    />
  );
}

/** Shown when the filter matches nothing; cmdk renders it inside the listbox. */
export function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" className={cn("py-6 text-center text-sm text-muted-foreground", className)} {...props} />;
}

/** Group with a heading in mono uppercase (navegacao.html section labels). */
export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground",
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono",
        "[&_[cmdk-group-heading]]:text-tiny [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator data-slot="command-separator" className={cn("-mx-1 h-px bg-border", className)} {...props} />;
}

/**
 * Option. The active option (pointer or arrows) gets `--accent` plus an inset `--ring` outline:
 * with `aria-activedescendant` DOM focus stays in the input, so the outline is the focus indicator.
 */
export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-sm select-none",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "data-[selected=true]:outline-2 data-[selected=true]:-outline-offset-2 data-[selected=true]:outline-ring",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto font-mono text-xs tracking-widest text-muted-foreground", className)}
      {...props}
    />
  );
}
