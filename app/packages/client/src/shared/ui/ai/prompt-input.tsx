"use client";

import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import { useState, type ComponentProps, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/shared/ui/molecules/DropdownMenu/DropdownMenu.tsx";

export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  /** Called on Enter or the send button; the composer never submits while `disabled`. */
  onSubmit: () => void;
};

/**
 * AI Elements `prompt-input`, reduced to what the chat uses (chat.html §23.2): a composer card
 * with a growing textarea, a tools row and one send/stop button. Attachment state is not kept
 * here: uploads go through the files API first (decision 0035), so the feature owns that queue.
 */
export function PromptInput({ onSubmit, className, children, ...props }: PromptInputProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form
      data-slot="prompt-input"
      onSubmit={submit}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-input bg-card px-3 py-2.5 transition-[border-color,box-shadow] duration-(--duration-fast)",
        "focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_22%,transparent)]",
        className,
      )}
      {...props}
    >
      {children}
    </form>
  );
}

export type PromptInputTextareaProps = Omit<ComponentProps<"textarea">, "aria-label"> & {
  /** Accessible name; the placeholder is a hint, not a label. */
  label: string;
  /** Esc while focused (the chat stops the answer). */
  onEscape?: (() => void) | undefined;
};

/**
 * Enter submits, Shift+Enter breaks the line; Enter during IME composition only confirms the
 * composition. Grows with its content up to 140 px, then scrolls (chat.html §23.2).
 */
export function PromptInputTextarea({ label, onEscape, onKeyDown, className, ...props }: PromptInputTextareaProps) {
  const [composing, setComposing] = useState(false);
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && onEscape !== undefined) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || composing || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };
  return (
    <textarea
      data-slot="prompt-input-textarea"
      name="message"
      rows={1}
      aria-label={label}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setComposing(false)}
      className={cn(
        "field-sizing-content max-h-[140px] min-h-6 w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function PromptInputFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="prompt-input-footer" className={cn("flex items-center justify-between gap-2", className)} {...props} />;
}

export function PromptInputTools({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="prompt-input-tools" className={cn("flex min-w-0 items-center gap-1", className)} {...props} />;
}

export type PromptInputButtonProps = Omit<ComponentProps<typeof Button>, "aria-label"> & { label: string };

/** An icon tool of the composer (attach, voice); always named. */
export function PromptInputButton({ label, variant = "ghost", size = "icon-sm", ...props }: PromptInputButtonProps) {
  return <Button data-slot="prompt-input-button" variant={variant} size={size} aria-label={label} title={label} {...props} />;
}

export type PromptInputActionMenuProps = { label: string; children: ReactNode; disabled?: boolean | undefined };

/** The "+" menu of the composer (attachments); items are `PromptInputActionMenuItem`. */
export function PromptInputActionMenu({ label, children, disabled }: PromptInputActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton label={label} disabled={disabled}>
          <PlusIcon aria-hidden="true" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PromptInputActionMenuItem(props: ComponentProps<typeof DropdownMenuItem>) {
  return <DropdownMenuItem data-slot="prompt-input-action" {...props} />;
}

export type PromptInputSubmitProps = Omit<ComponentProps<typeof Button>, "children" | "aria-label" | "type"> & {
  status: PromptInputStatus;
  /** Called by the stop button, which replaces send while the answer is on its way. */
  onStop: () => void;
};

/**
 * Send, or stop while `submitted`/`streaming`. One button whose name changes: focus stays put
 * when the answer starts, so Enter-then-Space stops it without hunting for another control.
 */
export function PromptInputSubmit({ status, onStop, disabled, className, ...props }: PromptInputSubmitProps) {
  const t = useTranslations("chat.elements");
  const busy = status === "submitted" || status === "streaming";
  if (busy) {
    return (
      <Button data-slot="prompt-input-stop" type="button" size="icon-sm" aria-label={t("stop")} title={t("stop")} onClick={onStop} className={cn("rounded-full", className)} {...props}>
        <SquareIcon aria-hidden="true" className="size-3 fill-current" />
      </Button>
    );
  }
  return (
    <Button data-slot="prompt-input-submit" type="submit" size="icon-sm" aria-label={t("send")} title={t("send")} disabled={disabled} className={cn("rounded-full", className)} {...props}>
      <ArrowUpIcon aria-hidden="true" />
    </Button>
  );
}
