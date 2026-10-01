import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type SuggestionsProps = Omit<ComponentProps<"ul">, "aria-label"> & { label: string };

/** AI Elements `suggestion` as the chat.html §23.1 quick-start grid: a labelled list of cards. */
export function Suggestions({ label, className, ...props }: SuggestionsProps) {
  return <ul data-slot="suggestions" aria-label={label} className={cn("grid w-full list-none gap-2 @sm/chat:grid-cols-2", className)} {...props} />;
}

export type SuggestionProps = Omit<ComponentProps<"button">, "children" | "title" | "onSelect"> & {
  title: string;
  description?: ReactNode;
  /** Receives the prompt the card stands for. */
  onSelect: (prompt: string) => void;
  /** The text sent when the card is chosen (defaults to the title). */
  prompt?: string | undefined;
};

/** One quick-start card: title, description; a hairline card that tints on hover. */
export function Suggestion({ title, description, prompt, onSelect, className, ...props }: SuggestionProps) {
  return (
    <li>
      <button
        type="button"
        data-slot="suggestion"
        onClick={() => onSelect(prompt ?? title)}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col gap-1 rounded-md border border-border bg-card p-3 text-left transition-colors duration-(--duration-fast) hover:border-blue/50 hover:bg-muted",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <span className="text-[13px] font-medium text-foreground">{title}</span>
        {description === undefined ? null : <span className="text-[12.5px] text-muted-foreground">{description}</span>}
      </button>
    </li>
  );
}
