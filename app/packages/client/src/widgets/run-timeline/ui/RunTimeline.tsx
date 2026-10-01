"use client";

import type { WorkflowRunStatus } from "@core/contracts";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { RunStatusPill } from "#/entities/workflow-run/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";

/** The fields of a run the timeline reads (tenant and staff runs both carry them). */
export type RunTimelineRun = {
  readonly status: WorkflowRunStatus;
  readonly startedBy: string | null;
  readonly scheduleId: string | null;
  readonly approvalRequestId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RunTimelineProps = {
  run: RunTimelineRun;
  /** Accessible name of the list ("Linha do tempo da execução …"). */
  label: string;
  /** Link (or text) for the approval request a suspended run waits for; defaults to its id. */
  renderApproval?: ((approvalRequestId: string) => ReactNode) | undefined;
};

function Step({ title, when, children }: { title: string; when?: string | undefined; children?: ReactNode }) {
  return (
    <li className="relative flex flex-col gap-0.5 border-l border-border pb-4 pl-4 last:pb-0">
      <span aria-hidden="true" className="absolute top-1.5 -left-[4.5px] size-2 rounded-full bg-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
      {when === undefined ? null : <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">{when}</span>}
      {children === undefined ? null : <span className="text-[13px] text-muted-foreground">{children}</span>}
    </li>
  );
}

/**
 * Lifecycle of a workflow run from the fields the run itself carries: how it started (a person, a
 * schedule or the platform), what it waits for while suspended, and its current status with the
 * time of the last change. Step-by-step events come from the progress stream, which callers add
 * around this widget where an endpoint exists.
 */
export function RunTimeline({ run, label, renderApproval }: RunTimelineProps) {
  const t = useTranslations("admin.runTimeline");
  const formatDateTime = useFormatDateTime();
  const origin = run.scheduleId !== null ? t("startedBySchedule", { schedule: run.scheduleId }) : run.startedBy !== null ? t("startedByUser", { user: run.startedBy }) : t("startedByPlatform");
  const waiting = run.status === "suspended" && run.approvalRequestId !== null;
  return (
    <ol aria-label={label} data-slot="run-timeline" className="flex flex-col">
      <Step title={t("started")} when={formatDateTime(run.createdAt)}>
        {origin}
      </Step>
      {waiting && run.approvalRequestId !== null ? (
        <Step title={t("waitingApproval")}>{renderApproval?.(run.approvalRequestId) ?? <span className="font-mono text-[11.5px]">{run.approvalRequestId}</span>}</Step>
      ) : null}
      <Step title={t("current")} when={t("updatedAt", { when: formatDateTime(run.updatedAt) })}>
        <RunStatusPill status={run.status} />
      </Step>
    </ol>
  );
}
