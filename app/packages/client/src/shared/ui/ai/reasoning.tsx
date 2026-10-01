"use client";

import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { SafeMarkdown } from "#/shared/lib/markdown/safe-markdown.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";
import { Shimmer } from "./shimmer.tsx";

export type ReasoningProps = Omit<ComponentProps<typeof Collapsible>, "children"> & {
  /** The model's reasoning text (untrusted markdown). */
  text: string;
  /** Still being written: the trigger says so and pulses. */
  streaming?: boolean | undefined;
};

/**
 * AI Elements `reasoning`: the model's thinking behind a disclosure, collapsed by default (SP4
 * spec §5.1) — it is context, not the answer. Upstream opens it while streaming and closes it
 * afterwards; moving content under the reader is avoided here (WCAG 3.2.2), the label changes.
 */
export function Reasoning({ text, streaming = false, className, ...props }: ReasoningProps) {
  const t = useTranslations("chat.elements");
  return (
    <Collapsible data-slot="reasoning" className={cn("group/reasoning w-full", className)} {...props}>
      <CollapsibleTrigger className="flex items-center gap-2 rounded-xs text-[13px] text-muted-foreground hover:text-foreground">
        <BrainIcon aria-hidden="true" className="size-4" />
        {streaming ? <Shimmer>{t("reasoning.thinking")}</Shimmer> : <span>{t("reasoning.done")}</span>}
        <ChevronDownIcon aria-hidden="true" className="size-4 transition-transform group-data-[state=open]/reasoning:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border-l-2 border-border pl-3">
          <SafeMarkdown streaming={streaming} className="text-[13px] text-muted-foreground">
            {text}
          </SafeMarkdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
