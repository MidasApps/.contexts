"use client";

import { BookOpenIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { resolveSafeLink } from "#/shared/lib/markdown/link-policy.ts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";

export type SourcesProps = Omit<ComponentProps<typeof Collapsible>, "children"> & { count: number; children: ReactNode };

/** AI Elements `sources`: what the answer cites, as a numbered list behind a disclosure. */
export function Sources({ count, className, children, ...props }: SourcesProps) {
  const t = useTranslations("chat.elements");
  return (
    <Collapsible data-slot="sources" className={cn("group/sources w-full", className)} {...props}>
      <CollapsibleTrigger className="flex items-center gap-2 rounded-xs text-[13px] text-muted-foreground hover:text-foreground">
        <BookOpenIcon aria-hidden="true" className="size-4" />
        {t("sources.count", { count })}
        <ChevronDownIcon aria-hidden="true" className="size-4 transition-transform group-data-[state=open]/sources:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 flex list-none flex-col gap-2">{children}</ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

export type SourceProps = Omit<ComponentProps<"li">, "title"> & {
  /** 1-based number, matching the inline citation. */
  index: number;
  title: string;
  /** Link of the source; kept only when it passes the link policy (http(s), host shown). */
  href?: string | null | undefined;
  /** The cited passage. Tenant content: rendered as plain text. */
  snippet?: string | undefined;
};

export function Source({ index, title, href, snippet, className, id, ...props }: SourceProps) {
  const t = useTranslations("chat.markdown");
  const link = resolveSafeLink(href);
  return (
    <li data-slot="source" id={id} className={cn("flex gap-2 text-[13px]", className)} {...props}>
      <span aria-hidden="true" className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
        {index}.
      </span>
      <div className="min-w-0 space-y-0.5">
        {link === null ? (
          <p className="font-medium text-foreground">{title}</p>
        ) : (
          <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-foreground underline underline-offset-4">
            {title}
            <span className="font-normal text-muted-foreground"> ({link.host})</span>
            <span className="sr-only"> {t("newTab")}</span>
          </a>
        )}
        {snippet === undefined ? null : <p className="line-clamp-3 text-muted-foreground">{snippet}</p>}
      </div>
    </li>
  );
}
