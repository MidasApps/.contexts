"use client";

import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode, useMe } from "#/entities/session/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { ApprovalDetail } from "./ApprovalDetail.tsx";
import { ApprovalsInbox } from "./ApprovalsInbox.tsx";

function Approvals({ context, approvalRequestId }: { context: AccessContext; approvalRequestId: string | undefined }) {
  const t = useTranslations("settings.approvals");
  const online = useOnlineStatus();
  const me = useMe();
  const viewerUid = me.data?.uid ?? null;
  const { organization } = context;
  const detail = approvalRequestId !== undefined;
  const allowed = context.permissions.includes("core.approval.read");
  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow", { organization: organization.name })}
        title={detail ? t("detail.title") : t("title")}
        description={detail ? t("detail.description") : t("description")}
      />
      {allowed ? (
        <div className="flex flex-col gap-4">
          {online ? null : <OfflineNotice />}
          {detail ? (
            <ApprovalDetail context={context} approvalRequestId={approvalRequestId} viewerUid={viewerUid} />
          ) : (
            <ApprovalsInbox context={context} viewerUid={viewerUid} />
          )}
        </div>
      ) : (
        <NoAccessState description={t("noAccessDescription")} />
      )}
    </>
  );
}

/**
 * `/o/:organizationId/approvals` (SP5 spec §3.4, core.approval.read): the inbox of four-eyes
 * approval requests, and at `/approvals/{approvalRequestId}` one request with its decision controls.
 * Deciding is using the app, not configuring it, so the inbox lives in the application (decision
 * 0077); the chat links pending requests to that address.
 */
export function ApprovalsView() {
  const t = useTranslations("settings.approvals");
  const node = useCurrentNode();
  const approvalRequestId = useRouter().useRouteParams()["approvalRequestId"];
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => (
        <Approvals
          context={data}
          approvalRequestId={
            approvalRequestId === undefined || approvalRequestId === "" ? undefined : approvalRequestId
          }
        />
      )}
    </QueryPage>
  );
}
