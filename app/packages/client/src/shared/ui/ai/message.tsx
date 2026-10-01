"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { SafeMarkdown, type SafeMarkdownProps } from "#/shared/lib/markdown/safe-markdown.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";

export type MessageRole = "user" | "assistant" | "system";

export type MessageProps = Omit<ComponentProps<"article">, "role"> & {
  from: MessageRole;
  /** Who wrote it, for assistive tech ("Você", "Assistente"): bubbles alone are a visual cue. */
  author: string;
};

/**
 * AI Elements `message`: one turn. The member's turns sit right in a muted bubble, the
 * assistant's flow on the page (neutral canvas, DESIGN.md). Each turn is an `article` named by
 * its author, so screen-reader users can move turn by turn.
 */
export function Message({ from, author, className, children, ...props }: MessageProps) {
  return (
    <article
      data-slot="message"
      data-from={from}
      aria-label={author}
      className={cn("group/message flex w-full flex-col gap-2", from === "user" ? "items-end" : "items-start", className)}
      {...props}
    >
      {children}
    </article>
  );
}

export function MessageContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex max-w-full min-w-0 flex-col gap-3 text-sm text-foreground",
        "group-data-[from=user]/message:max-w-[85%] group-data-[from=user]/message:rounded-lg group-data-[from=user]/message:bg-muted group-data-[from=user]/message:px-3.5 group-data-[from=user]/message:py-2.5",
        "group-data-[from=assistant]/message:w-full",
        className,
      )}
      {...props}
    />
  );
}

/** The answer text as hardened markdown (`shared/lib/markdown`, decision 0035). */
export function MessageResponse(props: SafeMarkdownProps) {
  return <SafeMarkdown {...props} />;
}

export function MessageActions({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="message-actions" className={cn("flex items-center gap-1", className)} {...props} />;
}

export type MessageActionProps = Omit<ComponentProps<typeof Button>, "aria-label"> & {
  /** Names the icon button and is shown as its tooltip. */
  label: string;
  children: ReactNode;
};

/** An icon action under a message (copy, regenerate); the label is the name and the tooltip. */
export function MessageAction({ label, children, variant = "ghost", size = "icon-sm", ...props }: MessageActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button data-slot="message-action" variant={variant} size={size} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
