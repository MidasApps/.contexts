"use client";

import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslations } from "use-intl";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import type { SchemaFormFailure } from "./server-errors.ts";

/** Outcome of the last submit; `focus` asks for the alert to take focus (no field to focus). */
export type SubmitStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saved" }
  | { readonly kind: "failed"; readonly failure: SchemaFormFailure; readonly focus: boolean }
  | { readonly kind: "unavailable"; readonly focus: boolean };

function FailureAlert({ status }: { status: Extract<SubmitStatus, { kind: "failed" | "unavailable" }> }) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status.focus) ref.current?.focus();
  }, [status]);
  const code = status.kind === "failed" ? status.failure.code : undefined;
  const requestId = status.kind === "failed" ? status.failure.requestId : undefined;
  const errorKey = code !== undefined && t.has(`errors.${code}`) ? `errors.${code}` : "errors.INTERNAL_ERROR";
  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{t("common.form.submitFailedTitle")}</AlertTitle>
      <AlertDescription>
        <p>{status.kind === "unavailable" ? t("common.form.unavailableFields") : t(errorKey)}</p>
        {requestId === undefined ? null : <p className="font-mono text-xs">{t("common.errorState.reference", { requestId })}</p>}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Form-level feedback of SchemaForm. Success sits in a polite live region that is always mounted
 * (so it is announced); failures are an `alert` that takes focus when no field can.
 */
export function SchemaFormStatus({ status, successMessage }: { status: SubmitStatus; successMessage: string }) {
  return (
    <>
      <div role="status" aria-live="polite" className="empty:hidden">
        {status.kind === "saved" ? (
          <Alert variant="success" role={undefined}>
            <CircleCheckIcon aria-hidden="true" />
            <AlertTitle>{successMessage}</AlertTitle>
          </Alert>
        ) : null}
      </div>
      {status.kind === "failed" || status.kind === "unavailable" ? <FailureAlert status={status} /> : null}
    </>
  );
}
