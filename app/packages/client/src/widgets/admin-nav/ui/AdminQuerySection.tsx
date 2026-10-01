"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { ApiError } from "#/shared/api/api-error.ts";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";

/** The parts of a TanStack query a section decides on. */
export type AdminQuery<T> = {
  readonly status: "pending" | "error" | "success";
  readonly data: T | undefined;
  readonly error: unknown;
  readonly isFetching: boolean;
  readonly refetch: () => unknown;
};

export type AdminQuerySectionProps<T> = {
  query: AdminQuery<T>;
  /** Accessible loading label (what is loading). */
  loadingLabel: string;
  /** Skeleton rows of the default loading state. */
  rows?: number;
  /** Copy of the 403 state when the default ("ask the platform administrators") does not fit. */
  noAccessDescription?: string | undefined;
  children: (data: NonNullable<T>) => ReactNode;
};

const isMfaRequired = (error: unknown): boolean => error instanceof ApiError && error.code === "MFA_REQUIRED";

/** Staff signed in without the second factor: every `/v1/admin` call answers 403 `MFA_REQUIRED`. */
export function AdminMfaRequired() {
  const t = useTranslations("admin.states");
  return (
    <StatePanel
      icon="shield-check"
      tone="amber"
      title={t("mfaTitle")}
      description={t("mfaDescription")}
      action={
        <Button variant="secondary" asChild>
          <RouteLink to={{ id: "profile", section: "security" }}>{t("mfaAction")}</RouteLink>
        </Button>
      }
    />
  );
}

/**
 * One decision for the data of an `/admin` section (decision 0041: the API authorizes on its own):
 * skeleton, the second-factor notice for 403 `MFA_REQUIRED`, no-access for any other 403, an error
 * with the request reference and a retry, else the content.
 */
export function AdminQuerySection<T>({ query, loadingLabel, rows = 5, noAccessDescription, children }: AdminQuerySectionProps<T>) {
  const t = useTranslations("admin.states");
  if (query.status === "pending") return <LoadingState label={loadingLabel} rows={rows} />;
  if (query.status === "error" || query.data === undefined || query.data === null) {
    if (isMfaRequired(query.error)) return <AdminMfaRequired />;
    if (isApiErrorStatus(query.error, 403)) return <NoAccessState description={noAccessDescription ?? t("noAccessDescription")} />;
    return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return children(query.data);
}
