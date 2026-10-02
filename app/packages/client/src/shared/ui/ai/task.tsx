"use client";

import { ChevronDownIcon, ListChecksIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";

/** AI Elements `task`: a unit of work with its steps behind a disclosure. */
export function Task({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible data-slot="task" className={cn("group/task w-full", className)} {...props} />;
}

export type TaskTriggerProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "children" | "title"> & { title: ReactNode };

export function TaskTrigger({ title, className, ...props }: TaskTriggerProps) {
  return (
    <CollapsibleTrigger data-slot="task-trigger" className={cn("flex items-center gap-2 rounded-xs text-body text-muted-foreground hover:text-foreground", className)} {...props}>
      <ListChecksIcon aria-hidden="true" className="size-4" />
      <span>{title}</span>
      <ChevronDownIcon aria-hidden="true" className="size-4 transition-transform group-data-[state=open]/task:rotate-180" />
    </CollapsibleTrigger>
  );
}

export function TaskContent({ className, children, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent data-slot="task-content" {...props}>
      <ul className={cn("mt-2 flex list-none flex-col gap-1.5 border-l-2 border-border pl-3", className)}>{children}</ul>
    </CollapsibleContent>
  );
}

export function TaskItem({ className, ...props }: ComponentProps<"li">) {
  return <li data-slot="task-item" className={cn("text-body text-muted-foreground", className)} {...props} />;
}

/** A file or record a step touched, as a mono chip. */
export function TaskItemFile({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="task-item-file" className={cn("inline-flex items-center gap-1 rounded-2xs border border-border bg-muted px-1.5 py-0.5 font-mono text-caption text-foreground", className)} {...props} />;
}
