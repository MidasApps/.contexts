"use client";

import type { AccessContext, ApprovalRequest } from "@core/contracts";
import { useTranslations } from "use-intl";
import { ApprovalRequestItem, useApprovalRequest } from "#/entities/approval-request/index.ts";
import { ApprovalDecision } from "#/features/approval-decision/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { usePermissionLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { NodeName } from "#/widgets/access-node/index.ts";
import { SettingsSectionLink } from "#/widgets/settings-nav/index.ts";
import { useRequesterNames } from "./use-requester-names.ts";

function BackToInbox({ organizationId, variant = "ghost" }: { organizationId: string; variant?: "ghost" | "secondary" }) {
  const t = useTranslations("settings.approvals.detail");
  return (
    <Button variant={variant} size="sm" asChild className="self-start">
      <SettingsSectionLink organizationId={organizationId} section="approvals">
        <Icon name="arrow-left" />
        {t("back")}
      </SettingsSectionLink>
    </Button>
  );
}

function Facts({ request, decidedByName }: { request: ApprovalRequest; decidedByName: string | undefined }) {
  const t = useTranslations("settings.approvals.detail");
  const formatDateTime = useFormatDateTime();
  const permissionLabel = usePermissionLabel();
  // The permission reads as its catalog label; its id stays in the tooltip for support.
  const rows: { label: string; value: string; title?: string }[] = [
    { label: t("created"), value: formatDateTime(request.createdAt) },
    { label: t("expires"), value: formatDateTime(request.expiresAt) },
    { label: t("permission"), value: permissionLabel(request.permission), title: request.permission },
    ...(request.decidedBy === null ? [] : [{ label: t("decidedBy"), value: decidedByName ?? request.decidedBy }]),
    { label: t("reference"), value: request.id },
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]" aria-label={t("factsLabel")}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="break-all" title={row.title}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One request at its stable address (`/o/{organizationId}/settings/approvals/{id}`): what was
 * asked, by whom, where, until when, the preview of the action and the decision controls. An id
 * that does not exist, belongs to another organization or is hidden from the viewer reads as not
 * found, inside the settings frame.
 */
export function ApprovalDetail({ context, approvalRequestId, viewerUid }: { context: AccessContext; approvalRequestId: string; viewerUid: string | null }) {
  const t = useTranslations("settings.approvals");
  const { organization } = context;
  const request = useApprovalRequest(organization.id, approvalRequestId);
  const requesterName = useRequesterNames({ organizationId: organization.id, viewerUid, canReadMembers: context.permissions.includes("core.member.read") });
  if (request.isPending) return <LoadingState label={t("detail.loading")} rows={4} />;
  if (request.isError) return <ApiErrorState error={request.error} onRetry={() => void request.refetch()} retrying={request.isFetching} />;
  if (request.data === null) {
    return <EmptyState icon="search" title={t("detail.notFoundTitle")} description={t("detail.notFoundDescription")} action={<BackToInbox organizationId={organization.id} variant="secondary" />} />;
  }
  const data = request.data;
  const decidedByName = data.decidedBy === null ? undefined : requesterName({ requestedBy: { type: "user", id: data.decidedBy } });
  return (
    <div className="flex flex-col gap-4">
      <BackToInbox organizationId={organization.id} />
      <ApprovalRequestItem
        request={data}
        headingLevel={2}
        requesterName={requesterName(data)}
        node={<NodeName node={data.node} />}
        actions={
          <>
            <Facts request={data} decidedByName={decidedByName} />
            <ApprovalDecision request={data} viewerUid={viewerUid} />
          </>
        }
      />
    </div>
  );
}
