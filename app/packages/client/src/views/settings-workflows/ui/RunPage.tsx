"use client";

import type { AccessContext, WorkflowEvent, WorkflowRun } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { isRunCancelable, RunStatusPill, useTenantWorkflowRun, useWorkflowCatalog } from "#/entities/workflow-run/index.ts";
import { CancelWorkflowRunDialog } from "#/features/cancel-workflow-run/index.ts";
import { StartWorkflowRunDialog } from "#/features/start-workflow-run/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { RunTimeline } from "#/widgets/run-timeline/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { useRunEvents } from "../model/use-run-events.ts";
import { useTenantScheduleLabels } from "../model/use-tenant-schedule-labels.ts";
import { useStarterNames } from "../model/use-starter-names.ts";

function RunEvents({ events }: { events: readonly WorkflowEvent[] }) {
  const t = useTranslations("settings.workflows.run");
  const formatDateTime = useFormatDateTime();
  if (events.length === 0) return null;
  return (
    <SectionCard title={t("eventsTitle")} description={t("eventsDescription")}>
      <ol aria-label={t("eventsLabel")} className="flex flex-col divide-y divide-border">
        {[...events]
          .sort((a, b) => a.index - b.index)
          .map((event) => (
            <li key={event.index} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{t(`eventTypes.${event.type}`)}</span>
                <span className="font-mono text-[11.5px] break-all text-muted-foreground">{event.stepId ?? t("runLevel")}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {event.status === null ? null : <RunStatusPill status={event.status} />}
                <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">{formatDateTime(event.occurredAt)}</span>
              </span>
            </li>
          ))}
      </ol>
    </SectionCard>
  );
}

type RunDetailsProps = { run: WorkflowRun; organizationId: string; canSeeApprovals: boolean; starterLabel: string | undefined; scheduleLabel: string | undefined };

function RunDetails({ run, organizationId, canSeeApprovals, starterLabel, scheduleLabel }: RunDetailsProps) {
  const t = useTranslations("settings.workflows.run");
  const workflowLabel = useWorkflowLabel();
  const events = useRunEvents(organizationId, run.runId);
  const live = isRunCancelable(run.status);
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t("timelineTitle")} description={<span role="status">{live ? t("live") : t("settled")}</span>}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{t("workflow")}</dt>
            <dd className="font-medium">{workflowLabel.name(run.workflowId)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{t("id")}</dt>
            <dd className="font-mono text-[13px] break-all">{run.runId}</dd>
          </div>
        </dl>
        <RunTimeline
          run={run}
          label={t("timelineLabel", { id: run.runId })}
          starterLabel={starterLabel}
          scheduleLabel={run.scheduleId === null ? undefined : scheduleLabel}
          renderApproval={(approvalRequestId) => (
            <span className="flex flex-col gap-1">
              <span>{t("approvalHint")}</span>
              {canSeeApprovals ? (
                <RouteLink className="font-medium text-foreground underline underline-offset-4" to={{ id: "settings", organizationId, section: "approvals", rest: approvalRequestId }}>
                  {t("openApproval")}
                </RouteLink>
              ) : null}
            </span>
          )}
        />
      </SectionCard>
      {run.failure === undefined || run.failure === null ? null : (
        <Alert variant="warning">
          <AlertDescription className="text-inherit">{t(`failureHint.${run.failure.code}`)}</AlertDescription>
        </Alert>
      )}
      <RunEvents events={events} />
    </div>
  );
}

function RunNotFound({ organizationId }: { organizationId: string }) {
  const t = useTranslations("settings.workflows");
  return (
    <EmptyState
      headingLevel={2}
      icon="search"
      title={t("run.notFoundTitle")}
      description={t("run.notFoundDescription")}
      action={
        <Button variant="secondary" asChild>
          <RouteLink to={{ id: "settings", organizationId, section: "workflows" }}>{t("backToRuns")}</RouteLink>
        </Button>
      }
    />
  );
}

/**
 * `/o/:organizationId/settings/workflows/runs/:runId` (core.workflow-run.read): one run of the
 * organization: status, how it started, what it waits for, why it failed (with what to do next
 * and "run again" when the workflow is startable), and its step events. Progress is
 * live two ways: the run is re-read every 2 s while it can still change, and the SSE progress
 * stream adds step events when the server offers it. A run of another organization (or a purged one) answers 404 and
 * reads as not found, with a way back to the runs.
 */
export function RunPage({ context, runId }: { context: AccessContext; runId: string }) {
  const t = useTranslations("settings.workflows");
  const online = useOnlineStatus();
  const { organization } = context;
  const run = useTenantWorkflowRun(organization.id, runId);
  const workflowLabel = useWorkflowLabel();
  const scheduleLabel = useTenantScheduleLabels(context);
  const starterName = useStarterNames({ organizationId: organization.id, canReadMembers: context.permissions.includes("core.member.read") });
  const [canceling, setCanceling] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const router = useRouter();
  const current = run.data ?? null;
  const canCancel = context.permissions.includes("core.workflow-run.cancel") && current !== null && isRunCancelable(current.status);
  const canStart = context.permissions.includes("core.workflow-run.start");
  const catalog = useWorkflowCatalog(organization.id, { enabled: canStart });
  const workflows = catalog.data ?? [];
  // "Run again" after a failure or a guardrail stop, when the workflow can still be started by hand.
  const rerunWorkflowId = current !== null && current.failure !== undefined && current.failure !== null ? current.workflowId : null;
  const canRunAgain = canStart && rerunWorkflowId !== null && workflows.some((workflow) => workflow.id === rerunWorkflowId && workflow.startable);
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={context.permissions.includes("core.workflow-run.read")}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={current === null ? t("run.titleUnknown") : t("run.title", { workflow: workflowLabel.name(current.workflowId) })}
          meta={current === null ? undefined : <RunStatusPill status={current.status} />}
          actions={
            <>
              <Button variant="secondary" asChild>
                <RouteLink to={{ id: "settings", organizationId: organization.id, section: "workflows" }}>{t("backToRuns")}</RouteLink>
              </Button>
              {canRunAgain ? (
                <Button variant="outline" disabled={!online} onClick={() => setRerunning(true)}>
                  {t("run.runAgain")}
                </Button>
              ) : null}
              {canCancel ? (
                <Button variant="outline" disabled={!online} onClick={() => setCanceling(true)}>
                  {t("run.cancel")}
                </Button>
              ) : null}
            </>
          }
        />
      }
    >
      {online ? null : <OfflineNotice className="mb-4" />}
      <QuerySection query={run} loadingLabel={t("run.loading")} notFound={<RunNotFound organizationId={organization.id} />}>
        {(data) => (
          <RunDetails
            run={data}
            organizationId={organization.id}
            canSeeApprovals={context.permissions.includes("core.approval.read")}
            starterLabel={starterName(data.startedBy)}
            scheduleLabel={data.scheduleId === null ? undefined : scheduleLabel(data.scheduleId)}
          />
        )}
      </QuerySection>
      <CancelWorkflowRunDialog organizationId={organization.id} run={canceling ? current : null} onOpenChange={(open) => !open && setCanceling(false)} />
      {canRunAgain ? (
        <StartWorkflowRunDialog
          organizationId={organization.id}
          workflows={workflows}
          open={rerunning}
          onOpenChange={setRerunning}
          initialWorkflowId={rerunWorkflowId ?? undefined}
          onStarted={(nextRunId) => router.navigate({ id: "settings", organizationId: organization.id, section: "workflows", rest: `runs/${nextRunId}` })}
        />
      ) : null}
    </SettingsPageFrame>
  );
}
