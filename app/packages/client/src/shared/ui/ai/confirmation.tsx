"use client";

import { createContext, use, type ComponentProps, type ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import type { ToolState } from "./tool.tsx";

/** The approval of an AI SDK tool part (`approval` field), once the member decided. */
export type ConfirmationApproval = { readonly id: string; readonly approved?: boolean | undefined; readonly reason?: string | undefined };

type ConfirmationContextValue = { readonly state: ToolState; readonly approval: ConfirmationApproval | undefined };

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

const useConfirmation = (): ConfirmationContextValue => {
  const context = use(ConfirmationContext);
  if (context === null) throw new Error("Confirmation parts must be used inside Confirmation");
  return context;
};

export type ConfirmationProps = Omit<ComponentProps<"section">, "aria-label"> & {
  state: ToolState;
  approval: ConfirmationApproval | undefined;
  /** Names the card for assistive tech ("Aprovação necessária: criar projeto"). */
  label: string;
};

/**
 * AI Elements `confirmation`: the approval card of a tool call (decision 0032). A labelled
 * `section` in the message flow — not a dialog: the member may scroll, read the answer so far
 * and decide later. Its parts render by state, so one tree covers request, decision and result.
 */
export function Confirmation({ state, approval, label, className, ...props }: ConfirmationProps) {
  if (state === "input-streaming" || state === "input-available") return null;
  return (
    <ConfirmationContext value={{ state, approval }}>
      <section
        data-slot="confirmation"
        data-state={state}
        aria-label={label}
        className={cn("flex w-full flex-col gap-3 rounded-md border border-border bg-card p-4 text-sm", "data-[state=approval-requested]:border-amber/40", className)}
        {...props}
      />
    </ConfirmationContext>
  );
}

export function ConfirmationTitle({ className, children, ...props }: ComponentProps<"h3">) {
  return (
    <h3 data-slot="confirmation-title" className={cn("text-sm font-semibold text-foreground", className)} {...props}>
      {children}
    </h3>
  );
}

type StateSlotProps = { children: ReactNode };

/** Shown while the member has not decided. */
export function ConfirmationRequest({ children }: StateSlotProps) {
  return useConfirmation().state === "approval-requested" ? <>{children}</> : null;
}

/** Shown after an approval (answer sent, tool running or finished). */
export function ConfirmationAccepted({ children }: StateSlotProps) {
  const { state, approval } = useConfirmation();
  const decided = state === "approval-responded" || state === "output-available" || state === "output-error";
  return decided && approval?.approved === true ? <>{children}</> : null;
}

/** Shown after a decline. */
export function ConfirmationRejected({ children }: StateSlotProps) {
  const { state, approval } = useConfirmation();
  const decided = state === "approval-responded" || state === "output-denied" || state === "output-error";
  return (decided && approval?.approved === false) || state === "output-denied" ? <>{children}</> : null;
}

export function ConfirmationActions({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="confirmation-actions" className={cn("flex flex-wrap items-center justify-end gap-2", className)} {...props} />;
}

export function ConfirmationAction({ size = "sm", ...props }: ComponentProps<typeof Button>) {
  return <Button data-slot="confirmation-action" size={size} {...props} />;
}
