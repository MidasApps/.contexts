"use client";

import { ChevronDownIcon, WrenchIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { CodeBlock } from "./code-block.tsx";

/** States of an AI SDK tool part (`ToolUIPart["state"]`). */
export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

const TONES: Readonly<Record<ToolState, { tone: StatusTone; icon?: IconName }>> = {
  "input-streaming": { tone: "neutral" },
  "input-available": { tone: "blue" },
  "approval-requested": { tone: "amber", icon: "clock" },
  "approval-responded": { tone: "blue" },
  "output-available": { tone: "emerald", icon: "circle-check" },
  "output-error": { tone: "danger", icon: "circle-x" },
  "output-denied": { tone: "neutral", icon: "circle-x" },
};

export type ToolStatusProps = { state: ToolState; className?: string | undefined };

/** The state of a tool call in words plus tone: colour is never the only signal. */
export function ToolStatus({ state, className }: ToolStatusProps) {
  const t = useTranslations("chat.elements.tool.state");
  const { tone, icon } = TONES[state];
  return (
    <StatusPill tone={tone} {...(icon === undefined ? {} : { icon })} className={className} data-state={state}>
      {t(state)}
    </StatusPill>
  );
}

/** AI Elements `tool`: a tool call behind a disclosure, collapsed by default (SP4 spec §5.1). */
export function Tool({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible data-slot="tool" className={cn("group/tool w-full rounded-md border border-border bg-card", className)} {...props} />;
}

export type ToolHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "children" | "title"> & {
  title: ReactNode;
  state: ToolState;
  icon?: ReactNode;
};

export function ToolHeader({ title, state, icon, className, ...props }: ToolHeaderProps) {
  return (
    <CollapsibleTrigger
      data-slot="tool-header"
      className={cn("flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-body", className)}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="text-muted-foreground">
          {icon ?? <WrenchIcon className="size-4" />}
        </span>
        <span className="truncate font-medium text-foreground">{title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <ToolStatus state={state} />
        <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
      </span>
    </CollapsibleTrigger>
  );
}

export function ToolContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent data-slot="tool-content" className={cn("border-t border-border", className)} {...props} />;
}

const toJson = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    // Circular or otherwise unserializable values never come from JSON streams; show a marker.
    return "…";
  }
};

export type ToolSectionProps = Omit<ComponentProps<"div">, "children"> & { value: unknown };

/** The arguments of the call, as JSON. */
export function ToolInput({ value, className, ...props }: ToolSectionProps) {
  const t = useTranslations("chat.elements.tool");
  return (
    <div data-slot="tool-input" className={cn("space-y-1.5 p-3", className)} {...props}>
      <h4 className="text-label font-medium tracking-wide text-muted-foreground uppercase">{t("input")}</h4>
      <CodeBlock code={toJson(value)} language="json" label={t("input")} />
    </div>
  );
}

export type ToolOutputProps = Omit<ComponentProps<"div">, "children"> & { value?: unknown; errorText?: string | undefined };

/** The result of the call, or its error. Renders nothing while there is neither. */
export function ToolOutput({ value, errorText, className, ...props }: ToolOutputProps) {
  const t = useTranslations("chat.elements.tool");
  if (value === undefined && errorText === undefined) return null;
  const failed = errorText !== undefined;
  return (
    <div data-slot="tool-output" className={cn("space-y-1.5 p-3", className)} {...props}>
      <h4 className={cn("text-label font-medium tracking-wide uppercase", failed ? "text-destructive-text" : "text-muted-foreground")}>
        {failed ? t("error") : t("output")}
      </h4>
      <CodeBlock code={failed ? errorText : toJson(value)} language={failed ? undefined : "json"} label={failed ? t("error") : t("output")} />
    </div>
  );
}
