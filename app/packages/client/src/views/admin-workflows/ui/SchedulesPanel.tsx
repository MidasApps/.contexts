"use client";

import type { AdminSchedule } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useAdminSchedules } from "#/entities/schedule/index.ts";
import { RunScheduleNowDialog, ScheduleStateDialog, type ScheduleStateRequest } from "#/features/admin-schedule-actions/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { AdminOrganizationFilter, AdminQuerySection } from "#/widgets/admin-nav/index.ts";
import { ScheduleTable } from "#/widgets/schedule-table/index.ts";

export type SchedulesPanelProps = {
  organizationId: string | undefined;
  onOrganizationChange: (organizationId: string | undefined) => void;
  organizationLabel: (tenantId: string | null) => string;
};

/**
 * Schedules tab of `/admin/workflows`: the platform crons and every organization's schedules (one
 * organization when filtered), with pause, resume and run-now, each behind a confirmation. Pausing
 * a platform schedule stops a core job (expiry sweep, purge, usage report) for every organization:
 * the table says which rows are the platform's and the confirmation warns before it happens.
 */
export function SchedulesPanel({ organizationId, onOrganizationChange, organizationLabel }: SchedulesPanelProps) {
  const t = useTranslations("admin.workflows.schedules");
  const online = useOnlineStatus();
  const schedules = useAdminSchedules(organizationId);
  const [stateRequest, setStateRequest] = useState<ScheduleStateRequest | null>(null);
  const [running, setRunning] = useState<AdminSchedule | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div role="search" aria-label={t("filtersLabel")} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <AdminOrganizationFilter value={organizationId} onValueChange={onOrganizationChange} />
      </div>
      <AdminQuerySection query={schedules} loadingLabel={t("loading")}>
        {(rows) => (
          <ScheduleTable
            caption={t("caption")}
            schedules={rows}
            ownerLabel={(schedule) => organizationLabel(schedule.tenantId)}
            canManage
            disabled={!online}
            pendingId={null}
            onPause={(schedule) => setStateRequest({ schedule, action: "pause" })}
            onResume={(schedule) => setStateRequest({ schedule, action: "resume" })}
            onRunNow={setRunning}
            empty={
              organizationId === undefined ? (
                <EmptyState frame="plain" headingLevel={2} icon="calendar" title={t("emptyTitle")} description={t("emptyDescription")} action={<Button variant="secondary" onClick={() => void schedules.refetch()}>{t("reload")}</Button>} />
              ) : (
                <EmptyState frame="plain" headingLevel={2} icon="calendar" title={t("noMatchTitle")} description={t("noMatchDescription")} action={<Button variant="secondary" onClick={() => onOrganizationChange(undefined)}>{t("seeAll")}</Button>} />
              )
            }
          />
        )}
      </AdminQuerySection>
      <ScheduleStateDialog request={stateRequest} onOpenChange={(open) => !open && setStateRequest(null)} />
      <RunScheduleNowDialog schedule={running} onOpenChange={(open) => !open && setRunning(null)} />
    </div>
  );
}
