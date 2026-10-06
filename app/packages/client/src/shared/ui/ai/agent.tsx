"use client";

import { BotIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";

/**
 * AI Elements `agent`: a card for an agent at work. Upstream documents an agent's
 * configuration (model, instructions, tools); here the same card shows a delegation — which
 * agent the assistant handed the request to, the request and what came back (SP4 spec §5.1).
 */
export function Agent({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="agent"
      className={cn("group/agent w-full rounded-md border border-border bg-card", className)}
      {...props}
    />
  );
}

export type AgentHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "children" | "name"> & {
  /** Translated agent name ("Agente de conhecimento"). */
  name: ReactNode;
  /** State of the delegation (a `ToolStatus`). */
  status?: ReactNode;
};

export function AgentHeader({ name, status, className, ...props }: AgentHeaderProps) {
  return (
    <CollapsibleTrigger
      data-slot="agent-header"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-body",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <BotIcon aria-hidden="true" className="size-4 text-violet" />
        <span className="truncate font-medium text-foreground">{name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {status}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-data-[state=open]/agent:rotate-180"
        />
      </span>
    </CollapsibleTrigger>
  );
}

export function AgentContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent data-slot="agent-content" className={cn("border-t border-border", className)} {...props} />
  );
}

export type AgentSectionProps = Omit<ComponentProps<"div">, "title"> & { title: ReactNode };

/** A titled block inside the card (the request, the steps, the result). */
export function AgentSection({ title, className, children, ...props }: AgentSectionProps) {
  return (
    <div data-slot="agent-section" className={cn("space-y-1.5 p-3", className)} {...props}>
      <h4 className="text-label font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </div>
  );
}
