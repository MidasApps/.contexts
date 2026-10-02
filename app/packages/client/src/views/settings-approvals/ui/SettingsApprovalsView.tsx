"use client";

import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode, useMe } from "#/entities/session/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { ApprovalDetail } from "./ApprovalDetail.tsx";
import { ApprovalsInbox } from "./ApprovalsInbox.tsx";

function SettingsApprovals({ context, approvalRequestId }: { context: AccessContext; approvalRequestId: string | undefined }) {
  const t = useTranslations("settings.approvals");
  const online = useOnlineStatus();
  const me = useMe();
  const viewerUid = me.data?.uid ?? null;
  const { organization } = context;
  const detail = approvalRequestId !== undefined;
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={context.permissions.includes("core.approval.read")}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={detail ? t("detail.title") : t("title")}
          description={detail ? t("detail.description") : t("description")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {online ? null : <OfflineNotice />}
        {detail ? <ApprovalDetail context={context} approvalRequestId={approvalRequestId} viewerUid={viewerUid} /> : <ApprovalsInbox context={context} viewerUid={viewerUid} />}
      </div>
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/approvals` (SP5 spec §3.4, core.approval.read): the inbox of
 * four-eyes approval requests, and at `/approvals/{approvalRequestId}` one request with its
 * decision controls. The chat links pending requests to that address.
 */
export function SettingsApprovalsView() {
  const t = useTranslations("settings.approvals");
  const node = useCurrentNode();
  const rest = useRouter().useRouteParams()["rest"];
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsApprovals context={data} approvalRequestId={rest === undefined || rest === "" ? undefined : rest} />}
    </QueryPage>
  );
}
