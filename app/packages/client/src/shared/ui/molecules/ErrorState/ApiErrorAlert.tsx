"use client";

import { CircleAlertIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslations } from "use-intl";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";

/**
 * Inline failure of a dialog or form action (`errors.<CODE>` copy plus the request reference),
 * focused when it appears so keyboard and screen reader users land on it (formularios.html).
 */
export function ApiErrorAlert({ error }: { error: unknown }) {
  const t = useTranslations("common.errorState");
  const described = useDescribeError()(error);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [error]);
  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1} data-slot="api-error-alert">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-inherit">
        {described.message}
        {described.requestId === undefined ? null : <span className="mt-1 block font-mono text-caption">{t("reference", { requestId: described.requestId })}</span>}
      </AlertDescription>
    </Alert>
  );
}
