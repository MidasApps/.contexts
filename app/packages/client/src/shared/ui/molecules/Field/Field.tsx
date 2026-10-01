"use client";

import { Slot } from "radix-ui";
import { useCallback, useId, useLayoutEffect, useMemo, useState, type ComponentProps, type ReactElement } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { FieldContext, useFieldContext, type FieldContextValue } from "./field-context.ts";

/**
 * shadcn **Field** family (Field, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldSet,
 * FieldLegend, FieldContent) plus `FieldControl`, which wires the control to its parts: `id` for
 * the label, `aria-describedby` → description and error, `aria-invalid` while an error shows
 * (rules/accessibility.md "Formulários"). formularios.html: label above, hint below, error in the
 * destructive text token; instructions come before the error.
 */
export type FieldProps = ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal";
  /** Marks the field invalid even before a `FieldError` renders (server errors, custom checks). */
  invalid?: boolean;
  /** Control id; generated when omitted. */
  controlId?: string;
};

export function Field({ className, orientation = "vertical", invalid = false, controlId, children, ...props }: FieldProps) {
  const generated = useId();
  const [hasDescription, setHasDescription] = useState(false);
  const [hasError, setHasError] = useState(false);
  const registerDescription = useCallback((present: boolean) => setHasDescription(present), []);
  const registerError = useCallback((present: boolean) => setHasError(present), []);
  const value = useMemo<FieldContextValue>(
    () => ({
      controlId: controlId ?? `${generated}-control`,
      descriptionId: `${generated}-description`,
      errorId: `${generated}-error`,
      invalid: invalid || hasError,
      hasDescription,
      hasError,
      registerDescription,
      registerError,
    }),
    [controlId, generated, invalid, hasError, hasDescription, registerDescription, registerError],
  );
  return (
    <FieldContext value={value}>
      <div
        role="group"
        data-slot="field"
        data-orientation={orientation}
        data-invalid={value.invalid || undefined}
        className={cn(
          "group/field flex w-full gap-2",
          orientation === "vertical" ? "flex-col" : "flex-row items-center justify-between gap-3",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </FieldContext>
  );
}

/** Label bound to the field's control (`htmlFor` defaults to the generated control id). */
export function FieldLabel({ className, htmlFor, ...props }: ComponentProps<typeof Label>) {
  const field = useFieldContext();
  return (
    <Label
      data-slot="field-label"
      htmlFor={htmlFor ?? field?.controlId}
      className={cn("text-[13px] leading-snug group-data-[disabled=true]/field:opacity-50", className)}
      {...props}
    />
  );
}

/** Wraps the single control: injects `id`, `aria-describedby` and `aria-invalid` (Radix `Slot`). */
export function FieldControl({ children }: { children: ReactElement }) {
  const field = useFieldContext();
  if (field === null) return <>{children}</>;
  const describedBy = [field.hasDescription && field.descriptionId, field.hasError && field.errorId].filter(Boolean).join(" ");
  return (
    <Slot.Root
      id={field.controlId}
      aria-describedby={describedBy === "" ? undefined : describedBy}
      aria-invalid={field.invalid || undefined}
    >
      {children}
    </Slot.Root>
  );
}

const usePresence = (register: ((present: boolean) => void) | undefined, present: boolean): void => {
  useLayoutEffect(() => {
    if (register === undefined) return undefined;
    register(present);
    return () => register(false);
  }, [register, present]);
};

/** Hint shown before any error (formularios.html `.hint`): muted, 12 px. */
export function FieldDescription({ className, id, ...props }: ComponentProps<"p">) {
  const field = useFieldContext();
  usePresence(field?.registerDescription, true);
  return (
    <p
      data-slot="field-description"
      id={id ?? field?.descriptionId}
      className={cn("text-xs leading-normal text-muted-foreground", className)}
      {...props}
    />
  );
}

export type FieldErrorProps = ComponentProps<"p"> & {
  /** Messages (already translated); duplicates collapse. Nothing renders when empty. */
  errors?: ReadonlyArray<string | undefined> | undefined;
};

/**
 * Error text in `--destructive-text` (the words carry the meaning, not the colour), linked through
 * `aria-describedby`, so it is read when the control is focused (forms move focus to the first
 * error on submit). Not a live region: several fields failing at once must not flood the reader.
 */
export function FieldError({ className, id, errors, children, ...props }: FieldErrorProps) {
  const field = useFieldContext();
  const messages = [...new Set((errors ?? []).filter((message): message is string => message !== undefined && message !== ""))];
  const content = children ?? (messages.length > 1 ? <MessageList messages={messages} /> : messages[0]);
  const present = content !== undefined && content !== null && content !== "";
  usePresence(field?.registerError, present);
  if (!present) return null;
  return (
    <p
      data-slot="field-error"
      id={id ?? field?.errorId}
      className={cn("text-xs leading-normal font-medium text-destructive-text", className)}
      {...props}
    >
      {content}
    </p>
  );
}

const MessageList = ({ messages }: { messages: string[] }) => (
  <span className="flex flex-col gap-0.5">
    {messages.map((message) => (
      <span key={message}>{message}</span>
    ))}
  </span>
);

/** Stacks fields (formularios.html `.form-row` rhythm). */
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex w-full flex-col gap-5", className)} {...props} />;
}

/** Groups related controls (radio groups, checkbox lists) with a legend. */
export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return <fieldset data-slot="field-set" className={cn("flex min-w-0 flex-col gap-3", className)} {...props} />;
}

export function FieldLegend({ className, ...props }: ComponentProps<"legend">) {
  return <legend data-slot="field-legend" className={cn("mb-1 text-sm font-medium", className)} {...props} />;
}

/** Text column next to a horizontal control (switch rows: title + hint on the left). */
export function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field-content" className={cn("flex flex-1 flex-col gap-1", className)} {...props} />;
}
