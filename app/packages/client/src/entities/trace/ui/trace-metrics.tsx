"use client";

import type { TraceSummary } from "@core/contracts";
import { useFormatter, useTranslations } from "use-intl";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

const MS_PER_SECOND = 1000;

/**
 * Formats a duration in the UI locale: milliseconds below one second, else seconds with up to two
 * decimals (`Intl.NumberFormat` units).
 */
export const useFormatDuration = (): ((durationMs: number) => string) => {
  const format = useFormatter();
  return (durationMs) =>
    durationMs < MS_PER_SECOND
      ? format.number(durationMs, { style: "unit", unit: "millisecond", unitDisplay: "short" })
      : format.number(durationMs / MS_PER_SECOND, { style: "unit", unit: "second", unitDisplay: "short", maximumFractionDigits: 2 });
};

/** `ok` / `error` in words with an icon (color is never the only signal). */
export function TraceStatusPill({ status }: { status: TraceSummary["status"] }) {
  const t = useTranslations("common.traceViewer.status");
  return (
    <StatusPill tone={status === "ok" ? "emerald" : "danger"} icon={status === "ok" ? "circle-check" : "circle-x"}>
      {t(status)}
    </StatusPill>
  );
}

/** Duration of a trace or span; `null` means it is still running. */
export function TraceDuration({ durationMs }: { durationMs: number | null }) {
  const t = useTranslations("common.traceViewer");
  const formatDuration = useFormatDuration();
  return <>{durationMs === null ? t("running") : formatDuration(durationMs)}</>;
}

/**
 * Cost of a trace or span with sub-cent precision; `null` (a model without a registered price)
 * shows a dash that reads "unknown price" to assistive technology.
 */
export function TraceCost({ costMicroUsd }: { costMicroUsd: number | null }) {
  const t = useTranslations("common.traceViewer");
  const formatCost = useFormatMicroUsd();
  if (costMicroUsd !== null) return <>{formatCost(costMicroUsd, "exact")}</>;
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t("unknownCost")}</span>
    </>
  );
}
