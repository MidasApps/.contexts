"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";
import { Shimmer } from "./shimmer.tsx";

/** AI Elements `plan`: the steps the assistant intends to run (workflows started from chat, SP5). */
export function Plan({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible data-slot="plan" className={cn("group/plan w-full rounded-md border border-border bg-card", className)} {...props} />;
}

export type PlanHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "children" | "title"> & {
  title: ReactNode;
  description?: ReactNode;
  /** The plan is still being written: the title pulses. */
  streaming?: boolean | undefined;
};

export function PlanHeader({ title, description, streaming = false, className, ...props }: PlanHeaderProps) {
  return (
    <CollapsibleTrigger data-slot="plan-header" className={cn("flex w-full items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left", className)} {...props}>
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-semibold text-foreground">{streaming ? <Shimmer>{title}</Shimmer> : title}</span>
        {description === undefined ? null : <span className="block text-body text-muted-foreground">{description}</span>}
      </span>
      <ChevronDownIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/plan:rotate-180" />
    </CollapsibleTrigger>
  );
}

export function PlanContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent data-slot="plan-content" className={cn("border-t border-border p-3 text-body", className)} {...props} />;
}

export function PlanFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="plan-footer" className={cn("flex items-center justify-end gap-2 border-t border-border p-3", className)} {...props} />;
}
