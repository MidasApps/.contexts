"use client";

import { ArrowDownIcon } from "lucide-react";
import { createContext, use, useMemo, type ComponentProps, type ReactNode } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";

type ConversationContextValue = { readonly isAtBottom: boolean; readonly scrollToBottom: () => void };

const ConversationContext = createContext<ConversationContextValue | null>(null);

export type ConversationProps = Omit<ComponentProps<"div">, "aria-label"> & {
  /** Accessible name of the message log (e.g. "Conversa com o assistente"). */
  label: string;
  /** Rendered over the log, outside the scrolling content (the scroll-to-bottom chip). */
  overlay?: ReactNode;
};

/**
 * AI Elements `conversation`: the message log, pinned to the bottom while the answer streams
 * (`use-stick-to-bottom`) until the reader scrolls up. The scroll area is a labelled, keyboard
 * focusable `role="log"`; `aria-live` is off because the status line announces transitions —
 * reading every streamed token aloud would be unusable.
 */
export function Conversation({ label, overlay, className, children, ...props }: ConversationProps) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom({ initial: "instant", resize: "smooth" });
  const context = useMemo(() => ({ isAtBottom, scrollToBottom: () => void scrollToBottom() }), [isAtBottom, scrollToBottom]);
  return (
    <ConversationContext value={context}>
      <div data-slot="conversation" className={cn("relative flex min-h-0 flex-1 flex-col", className)} {...props}>
        <div
          ref={scrollRef}
          role="log"
          aria-live="off"
          aria-label={label}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard (WCAG 2.1.1)
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div ref={contentRef} data-slot="conversation-content" className="flex flex-col gap-6 px-4 py-5">
            {children}
          </div>
        </div>
        {overlay}
      </div>
    </ConversationContext>
  );
}

const useConversation = (): ConversationContextValue => {
  const context = use(ConversationContext);
  if (context === null) throw new Error("Conversation parts must be used inside Conversation");
  return context;
};

export type ConversationEmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
};

/** chat.html "launcher state": mark, greeting and (as children) the suggestion cards. */
export function ConversationEmptyState({ title, description, icon, className, children, ...props }: ConversationEmptyStateProps) {
  return (
    <div data-slot="conversation-empty" className={cn("flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center", className)} {...props}>
      {icon === undefined ? null : (
        <div aria-hidden="true" className="grid size-12 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** chat.html §23.4: a floating chip shown only after the reader scrolled away from the end. */
export function ConversationScrollButton({ className, ...props }: Omit<ComponentProps<typeof Button>, "children">) {
  const t = useTranslations("chat.elements");
  const { isAtBottom, scrollToBottom } = useConversation();
  if (isAtBottom) return null;
  return (
    <Button
      data-slot="conversation-scroll-button"
      variant="outline"
      size="sm"
      onClick={scrollToBottom}
      className={cn("absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-modal animate-in fade-in-0", className)}
      {...props}
    >
      <ArrowDownIcon aria-hidden="true" />
      {t("scrollToBottom")}
    </Button>
  );
}
