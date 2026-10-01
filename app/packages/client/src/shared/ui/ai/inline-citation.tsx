"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Popover, PopoverContent, PopoverTrigger } from "#/shared/ui/molecules/Popover/Popover.tsx";

export type InlineCitationProps = {
  /** 1-based number of the cited source. */
  index: number;
  /** Title of the source, read with the marker ("Fonte 2: Guia de integração"). */
  title: string;
  /** The passage, shown in the popover. */
  children?: ReactNode;
  className?: string | undefined;
};

/**
 * AI Elements `inline-citation`: the numbered marker after a claim. Upstream shows the source
 * in a hover card with a carousel; hover-only content fails keyboard and touch users (WCAG
 * 1.4.13), so the marker is a button that opens a popover.
 */
export function InlineCitation({ index, title, children, className }: InlineCitationProps) {
  const t = useTranslations("chat.elements");
  return (
    <Popover>
      <PopoverTrigger
        data-slot="inline-citation"
        aria-label={t("citation.label", { index, title })}
        className={cn(
          "mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-border bg-muted px-1 align-text-top font-mono text-[10.5px] text-muted-foreground-strong tabular-nums hover:bg-accent",
          // 24 px target (WCAG 2.5.8) around an 18 px mark that must not push the line height.
          "relative after:absolute after:-inset-[3px] after:content-['']",
          className,
        )}
      >
        {index}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-1.5 text-[13px]">
        <p className="font-medium text-foreground">{title}</p>
        {children === undefined ? null : <div className="text-muted-foreground">{children}</div>}
      </PopoverContent>
    </Popover>
  );
}
