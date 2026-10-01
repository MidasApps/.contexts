"use client";

import type { AccessContext, Schedule, WorkflowCatalogEntry } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useTenantSchedules } from "#/entities/schedule/index.ts";
import { ScheduleActionDialog, ScheduleEditorDialog, useResumeSchedule, type ScheduleActionTarget } from "#/features/schedule-editor/index.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { ScheduleTable } from "#/widgets/schedule-table/index.ts";

export type SchedulesSectionProps = {
  context: AccessContext;
  /** The organization's workflow catalog (the editor offers the schedulable ones). */
  workflows: readonly WorkflowCatalogEntry[];
  online: boolean;
};

type Editing = { schedule: Schedule | null } | null;

/**
 * Schedules of the organization (core.schedule.read): cron, zone, state and the next and last
 * fire in the schedule's zone and the viewer's. Holders of core.schedule.write create, edit,
 * pause (after a confirmation), resume, run now and delete.
 */
export function SchedulesSection({ context, workflows, online }: SchedulesSectionProps) {
  const t = useTranslations("settings.workflows.schedules");
  const { organization } = context;
  const schedules = useTenantSchedules(organization.id);
  const resume = useResumeSchedule(organization.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [target, setTarget] = useState<ScheduleActionTarget | null>(null);
  const canWrite = context.permissions.includes("core.schedule.write");
  const schedulable = workflows.some((workflow) => workflow.schedulable);
  const canCreate = canWrite && online && schedulable;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">{canWrite && !schedulable && workflows.length > 0 ? t("noneSchedulable") : t("nextFireNote")}</p>
        {canWrite ? (
          <Button className="shrink-0" disabled={!canCreate} onClick={() => setEditing({ schedule: null })}>
            <Icon name="plus" />
            {t("create")}
          </Button>
        ) : null}
      </div>
      <QuerySection query={schedules} loadingLabel={t("loading")}>
        {(rows) => (
          <ScheduleTable
            caption={t("caption", { organization: organization.name })}
            schedules={rows}
            canManage={canWrite}
            disabled={!online}
            pendingId={resume.pendingId}
            onPause={(schedule) => setTarget({ action: "pause", schedule })}
            onResume={resume.resume}
            onRunNow={(schedule) => setTarget({ action: "run", schedule })}
            renderRowActions={(schedule) => (
              <>
                <Button variant="outline" size="sm" disabled={!online} onClick={() => setEditing({ schedule })} aria-label={t("editNamed", { name: schedule.workflowId, id: schedule.id })}>
                  {t("edit")}
                </Button>
                <Button variant="outline" size="sm" disabled={!online} onClick={() => setTarget({ action: "delete", schedule })} aria-label={t("deleteNamed", { name: schedule.workflowId, id: schedule.id })}>
                  {t("delete")}
                </Button>
              </>
            )}
            empty={
              <EmptyState
                frame="plain"
                headingLevel={2}
                icon="calendar"
                title={t("emptyTitle")}
                description={canWrite ? t("emptyDescription") : t("emptyDescriptionNoPermission")}
                action={canCreate ? <Button onClick={() => setEditing({ schedule: null })}>{t("create")}</Button> : undefined}
              />
            }
          />
        )}
      </QuerySection>
      {canWrite ? (
        <>
          <ScheduleEditorDialog
            organizationId={organization.id}
            schedule={editing?.schedule ?? null}
            workflows={workflows}
            defaultTimeZone={context.regional.nodeTimeZone}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
          />
          <ScheduleActionDialog organizationId={organization.id} target={target} onOpenChange={(open) => !open && setTarget(null)} />
        </>
      ) : null}
    </div>
  );
}
