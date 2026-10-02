"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState, type ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { centeredModalClasses, overlayClasses } from "#/shared/ui/styles/modal-classes.ts";
import { DiscardQuestion, DismissGuardProvider, useCurrentDismissGuard, useDismissGuardState } from "./dialog-dismiss-guard.tsx";

/**
 * shadcn `dialog` (Radix modal: focus trapped inside, Esc closes, focus returns to the trigger,
 * background inert). Every dialog needs a `DialogTitle` (use `className="sr-only"` to hide it) and
 * a `DialogDescription` or `aria-describedby={undefined}` on the content. Content inside can guard
 * dismissal with `useDialogDismissGuard` (block while in flight, ask before losing work or a
 * one-time value); the root owns the open state when uncontrolled so the guard always applies.
 */
export function Dialog({ open, defaultOpen = false, children, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = open ?? innerOpen;
  const setOpen = (next: boolean): void => {
    if (open === undefined) setInnerOpen(next);
    props.onOpenChange?.(next);
  };
  const dismissal = useDismissGuardState(() => setOpen(false));
  return (
    <DialogPrimitive.Root data-slot="dialog" {...props} open={isOpen} onOpenChange={(next) => (next ? setOpen(true) : dismissal.requestDismiss())}>
      <DismissGuardProvider value={dismissal.context}>{children}</DismissGuardProvider>
      <DiscardQuestion
        asking={dismissal.asking}
        onKeep={() => dismissal.setAsking(null)}
        onDiscard={() => {
          dismissal.setAsking(null);
          setOpen(false);
        }}
      />
    </DialogPrimitive.Root>
  );
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  const t = useTranslations("common.actions");
  // A blocked dialog cannot be closed, so it shows no close button that would do nothing.
  const closable = useCurrentDismissGuard() !== "block";
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className={overlayClasses} />
      <DialogPrimitive.Content data-slot="dialog-content" className={cn(centeredModalClasses, className)} {...props}>
        {children}
        {showCloseButton && closable ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 inline-flex size-7 cursor-pointer items-center justify-center rounded-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("close")}</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 pr-8 text-left", className)} {...props} />;
}

/** Actions row: primary last (right on wide screens, top on narrow ones). */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-tight font-semibold tracking-[-0.01em]", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
