"use client";

import type { WorkflowRunFailure, WorkflowRunStatus } from "@core/contracts";
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
  /** Why a failed or stopped run ended (code and step only). */
  readonly failure?: WorkflowRunFailure | null | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RunTimelineProps = {
  run: RunTimelineRun;
  /** Accessible name of the list ("Linha do tempo da execução …"). */
  label: string;
  /** Name of the person who started the run when the caller knows it; defaults to the user id. */
  starterLabel?: string | undefined;
  /** When the schedule that started the run fires, in words; without it the step says "a schedule" (never its id). */
  scheduleLabel?: string | undefined;
  /** Link (or text) for the approval request a suspended run waits for; defaults to its id. */
  renderApproval?: ((approvalRequestId: string) => ReactNode) | undefined;
};

function Step({ title, when, children }: { title: string; when?: string | undefined; children?: ReactNode }) {
  return (
    <li className="relative flex flex-col gap-0.5 border-s border-border pb-4 ps-4 last:pb-0">
      <span aria-hidden="true" className="absolute top-1.5 -start-[4.5px] size-2 rounded-full bg-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
      {when === undefined ? null : (
        <span className="font-mono text-caption text-muted-foreground tabular-nums">{when}</span>
      )}
      {children === undefined ? null : <span className="text-body text-muted-foreground">{children}</span>}
    </li>
  );
}

/**
 * Lifecycle of a workflow run from the fields the run itself carries: how it started (a person, a
 * schedule or the platform), what it waits for while suspended, why it failed (a code and the
 * step, never the error), and its current status with the
 * time of the last change. Step-by-step events come from the progress stream, which callers add
 * around this widget where an endpoint exists.
 */
export function RunTimeline({ run, label, starterLabel, scheduleLabel, renderApproval }: RunTimelineProps) {
  const t = useTranslations("common.runTimeline");
  const formatDateTime = useFormatDateTime();
  const bySchedule =
    scheduleLabel === undefined ? t("startedByAnySchedule") : t("startedBySchedule", { schedule: scheduleLabel });
  const origin =
    run.scheduleId !== null
      ? bySchedule
      : run.startedBy !== null
        ? t("startedByUser", { user: starterLabel ?? run.startedBy })
        : t("startedByPlatform");
  const waiting = run.status === "suspended" && run.approvalRequestId !== null;
  const failure = run.failure ?? null;
  return (
    <ol aria-label={label} data-slot="run-timeline" className="flex flex-col">
      <Step title={t("started")} when={formatDateTime(run.createdAt)}>
        {origin}
      </Step>
      {waiting && run.approvalRequestId !== null ? (
        <Step title={t("waitingApproval")}>
          {renderApproval?.(run.approvalRequestId) ?? (
            <span className="font-mono text-caption">{run.approvalRequestId}</span>
          )}
        </Step>
      ) : null}
      {failure === null ? null : (
        <Step title={t(`failure.${failure.code}`)}>
          {failure.stepId === null ? undefined : (
            <>
              {t("failedStep")} <span className="font-mono text-caption break-all">{failure.stepId}</span>
            </>
          )}
        </Step>
      )}
      <Step title={t("current")} when={t("updatedAt", { when: formatDateTime(run.updatedAt) })}>
        <RunStatusPill status={run.status} />
      </Step>
    </ol>
  );
}
