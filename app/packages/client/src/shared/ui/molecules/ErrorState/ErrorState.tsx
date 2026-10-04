"use client";

import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";

export type ErrorStateProps = Omit<ComponentProps<typeof StatePanel>, "icon" | "tone" | "title" | "action"> & {
  /** Defaults to `common.errorState.title`. */
  title?: ReactNode;
  /** Defaults to `common.errorState.description`; pass `errors.<CODE>` copy when the code is known. */
  description?: ReactNode;
  /** Shown as a reference the user can quote to support (`error.requestId` of the envelope). */
  requestId?: string | undefined;
  /** Renders "Try again"; omit when retrying cannot help. */
  onRetry?: (() => void) | undefined;
  /** Retry in flight: the button shows a spinner and is disabled. */
  retrying?: boolean;
  /** Replaces the retry when another action fits (sign in again after a lost session). */
  action?: ReactNode;
};

/**
 * Failed to load or act (SP2 spec §9 "error states with requestId"). Announced once as an alert,
 * with the request reference in mono and an optional retry. Never shows raw API messages.
 */
export function ErrorState({
  title,
  description,
  requestId,
  onRetry,
  retrying = false,
  action,
  children,
  ...props
}: ErrorStateProps) {
  const t = useTranslations("common");
  return (
    <StatePanel
      role="alert"
      data-state="error"
      icon="alert-triangle"
      tone="destructive"
      title={title ?? t("errorState.title")}
      description={description ?? t("errorState.description")}
      action={
        action ??
        (onRetry === undefined ? undefined : (
          <Button variant="secondary" onClick={onRetry} pending={retrying}>
            {t("actions.retry")}
          </Button>
        ))
      }
      {...props}
    >
      {requestId === undefined ? null : (
        <p className="mt-2 font-mono text-caption text-muted-foreground">{t("errorState.reference", { requestId })}</p>
      )}
      {children}
    </StatePanel>
  );
}
