"use client";

import { ChevronDownIcon, DotIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";

/** AI Elements `chain-of-thought`: the steps behind an answer (search, read, decide), collapsed. */
export function ChainOfThought({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible data-slot="chain-of-thought" className={cn("group/cot w-full", className)} {...props} />;
}

export type ChainOfThoughtHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "children"> & { children: ReactNode };

export function ChainOfThoughtHeader({ className, children, ...props }: ChainOfThoughtHeaderProps) {
  return (
    <CollapsibleTrigger data-slot="chain-of-thought-header" className={cn("flex items-center gap-2 rounded-xs text-[13px] text-muted-foreground hover:text-foreground", className)} {...props}>
      <span>{children}</span>
      <ChevronDownIcon aria-hidden="true" className="size-4 transition-transform group-data-[state=open]/cot:rotate-180" />
    </CollapsibleTrigger>
  );
}

export function ChainOfThoughtContent({ className, children, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent data-slot="chain-of-thought-content" {...props}>
      <ol className={cn("mt-2 flex list-none flex-col gap-2", className)}>{children}</ol>
    </CollapsibleContent>
  );
}

export type ChainOfThoughtStepProps = Omit<ComponentProps<"li">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** `active` is the step in progress; `pending` steps are dimmed. */
  status?: "complete" | "active" | "pending";
};

export function ChainOfThoughtStep({ title, description, icon, status = "complete", className, children, ...props }: ChainOfThoughtStepProps) {
  return (
    <li
      data-slot="chain-of-thought-step"
      data-status={status}
      aria-current={status === "active" ? "step" : undefined}
      className={cn("flex gap-2 text-[13px]", status === "pending" ? "text-muted-foreground" : "text-foreground", className)}
      {...props}
    >
      <span aria-hidden="true" className="mt-0.5 text-muted-foreground">
        {icon ?? <DotIcon className="size-4" />}
      </span>
      <div className="min-w-0 space-y-1">
        <p className={status === "active" ? "font-medium" : undefined}>{title}</p>
        {description === undefined ? null : <p className="text-muted-foreground">{description}</p>}
        {children}
      </div>
    </li>
  );
}
