"use client";

import type { TraceDetail as TraceDetailData } from "@core/contracts";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { TraceCost, TraceDuration } from "#/entities/trace/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { TraceViewer } from "#/widgets/trace-viewer/index.ts";
import { useTargetLabel } from "./trace-target.ts";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold break-words tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * One trace of the organization: its numbers and the span tree with tokens and cost per span
 * and redacted input and output collapsed (the same viewer as the staff console). No logs
 * link: the tenant area has no logs page.
 */
export function TraceDetail({ detail }: { detail: TraceDetailData }) {
  const t = useTranslations("settings.traces");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  const target = useTargetLabel();
  const { summary } = detail;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="trace-summary-title" className="flex flex-col gap-3">
        <h2 id="trace-summary-title" className="text-sm font-medium text-muted-foreground">
          {t("detail.summary")}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label={t("detail.target")}>{target(summary)}</Stat>
          <Stat label={t("detail.startedAt")}>{formatDateTime(summary.startedAt)}</Stat>
          <Stat label={t("detail.duration")}>
            <TraceDuration durationMs={summary.durationMs} />
          </Stat>
          <Stat label={t("detail.tokens")}>
            {t("tokensValue", {
              input: format.number(summary.inputTokens),
              output: format.number(summary.outputTokens),
            })}
          </Stat>
          <Stat label={t("detail.cost")}>
            <TraceCost costMicroUsd={summary.costMicroUsd} />
          </Stat>
          <Stat label={t("detail.traceId")}>
            <span className="font-mono text-xs font-normal break-all">{summary.traceId}</span>
          </Stat>
        </dl>
      </section>
      <TraceViewer detail={detail} />
    </div>
  );
}
