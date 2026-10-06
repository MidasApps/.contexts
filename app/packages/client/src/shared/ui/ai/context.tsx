"use client";

import type { ComponentProps } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Popover, PopoverContent, PopoverTrigger } from "#/shared/ui/molecules/Popover/Popover.tsx";

export type ContextUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens?: number | undefined;
};

export type ContextProps = Omit<ComponentProps<"button">, "children"> & {
  usage: ContextUsage;
  /** Context window of the model, in tokens. */
  maxTokens: number;
};

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * AI Elements `context`: how much of the model's context window the conversation uses, as a
 * ring plus the percentage, with the token breakdown in a popover. Upstream also prices the
 * usage with `tokenlens`; cost belongs to the server's usage ledger (decision 0026), so it is
 * not estimated on the client.
 */
export function Context({ usage, maxTokens, className, ...props }: ContextProps) {
  const t = useTranslations("chat.elements.context");
  const format = useFormatter();
  const used = usage.inputTokens + usage.outputTokens + (usage.reasoningTokens ?? 0);
  const ratio = maxTokens <= 0 ? 0 : Math.min(1, used / maxTokens);
  const percent = format.number(ratio, { style: "percent", maximumFractionDigits: 0 });
  const rows: readonly (readonly [string, number])[] = [
    [t("input"), usage.inputTokens],
    [t("output"), usage.outputTokens],
    ...(usage.reasoningTokens === undefined ? [] : [[t("reasoning"), usage.reasoningTokens] as const]),
  ];
  return (
    <Popover>
      <PopoverTrigger
        data-slot="context"
        aria-label={t("label", { percent })}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-sm px-2 font-mono text-caption text-muted-foreground tabular-nums hover:bg-muted",
          className,
        )}
        {...props}
      >
        <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4 -rotate-90">
          <circle cx="9" cy="9" r={RADIUS} fill="none" strokeWidth="2" className="stroke-border" />
          <circle
            cx="9"
            cy="9"
            r={RADIUS}
            fill="none"
            strokeWidth="2"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
            className="stroke-blue"
          />
        </svg>
        {percent}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 text-body">
        <p className="font-medium text-foreground">{t("title")}</p>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-mono tabular-nums">{format.number(value)}</dd>
            </div>
          ))}
          <div className="contents">
            <dt className="text-muted-foreground">{t("window")}</dt>
            <dd className="text-right font-mono tabular-nums">{format.number(maxTokens)}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
