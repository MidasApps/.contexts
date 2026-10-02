"use client";

import type { AccessContext, ApprovalRequest } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import {
  APPROVAL_HISTORY_PAGE_SIZE,
  ApprovalRequestItem,
  approvalRequestRoute,
  useApprovalHistory,
  useApprovalRequests,
  waitingForDecision,
} from "#/entities/approval-request/index.ts";
import { ApprovalDecision } from "#/features/approval-decision/index.ts";
import { useCursorPages } from "#/shared/lib/pagination/index.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { DataTablePagination } from "#/shared/ui/organisms/DataTable/DataTablePagination.tsx";
import { NodeName } from "#/widgets/access-node/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { useRequesterNames } from "./use-requester-names.ts";

const TABS = ["waiting", "mine", "history"] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string): value is Tab => (TABS as readonly string[]).includes(value);

/** The two pending lists of the inbox (SP5 spec §3.4): waiting for the viewer, and asked by the viewer. */
export const splitPending = (requests: readonly ApprovalRequest[], viewerUid: string | null): Record<"waiting" | "mine", ApprovalRequest[]> => {
  const pending = requests.filter((request) => request.status === "pending");
  return { waiting: waitingForDecision(pending, viewerUid), mine: pending.filter((request) => request.requestedBy.id === viewerUid) };
};

type ListProps = {
  tab: Tab;
  requests: readonly ApprovalRequest[];
  viewerUid: string | null;
  requesterName: (request: ApprovalRequest) => string | undefined;
};

function RequestList({ tab, requests, viewerUid, requesterName }: ListProps) {
  const t = useTranslations("settings.approvals");
  if (requests.length === 0) return <EmptyState icon="inbox" title={t(`empty.${tab}Title`)} description={t(`empty.${tab}Description`)} />;
  return (
    <ul className="flex flex-col gap-3" aria-label={t(`tabs.${tab}`)}>
      {requests.map((request) => (
        <li key={request.id}>
          <ApprovalRequestItem
            request={request}
            headingLevel={2}
            requesterName={requesterName(request)}
            node={<NodeName node={request.node} />}
            titleRoute={approvalRequestRoute(request.tenantId, request.id)}
            actions={tab === "waiting" ? <ApprovalDecision request={request} viewerUid={viewerUid} /> : undefined}
          />
        </li>
      ))}
    </ul>
  );
}

/** The settled requests, paged by cursor; read only once the tab is open. */
function HistoryList({ organizationId, viewerUid, requesterName }: Omit<ListProps, "tab" | "requests"> & { organizationId: string }) {
  const t = useTranslations("settings.approvals");
  const history = useApprovalHistory(organizationId);
  const paged = useCursorPages(history, APPROVAL_HISTORY_PAGE_SIZE, t("historyPagination"));
  return (
    <QuerySection query={history} loadingLabel={t("loading")}>
      {() => (
        <div className="flex flex-col gap-3">
          <RequestList tab="history" requests={paged.rows} viewerUid={viewerUid} requesterName={requesterName} />
          {paged.pagination === undefined ? null : <DataTablePagination {...paged.pagination} />}
        </div>
      )}
    </QuerySection>
  );
}

function TruncatedNotice({ count }: { count: number }) {
  const t = useTranslations("settings.approvals");
  return (
    <Alert variant="warning">
      <Icon name="alert-triangle" />
      <AlertTitle>{t("truncatedTitle")}</AlertTitle>
      <AlertDescription>{t("truncatedDescription", { count })}</AlertDescription>
    </Alert>
  );
}

/**
 * The inbox: requests waiting for the viewer's decision and the viewer's own pending requests (one
 * read of the pending requests, refetched every 15 s and on focus), and the settled ones in a
 * history paged by cursor.
 */
export function ApprovalsInbox({ context, viewerUid }: { context: AccessContext; viewerUid: string | null }) {
  const t = useTranslations("settings.approvals");
  const [tab, setTab] = useState<Tab>("waiting");
  const { organization } = context;
  const inbox = useApprovalRequests({ organizationId: organization.id, status: "pending" });
  const requesterName = useRequesterNames({ organizationId: organization.id, viewerUid, canReadMembers: context.permissions.includes("core.member.read") });
  return (
    <QuerySection query={inbox.query} loadingLabel={t("loading")}>
      {(collected) => {
        const lists = splitPending(collected.items, viewerUid);
        return (
          <div className="flex flex-col gap-3">
            {collected.truncated ? <TruncatedNotice count={collected.items.length} /> : null}
            <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)}>
              <TabsList variant="line" aria-label={t("tabs.label")}>
                <TabsTrigger value="waiting">{t("tabs.waitingCount", { count: lists.waiting.length })}</TabsTrigger>
                <TabsTrigger value="mine">{t("tabs.mineCount", { count: lists.mine.length })}</TabsTrigger>
                <TabsTrigger value="history">{t("tabs.history")}</TabsTrigger>
              </TabsList>
              {TABS.map((name) => (
                <TabsContent key={name} value={name} className="pt-3">
                  {tab !== name ? null : name === "history" ? (
                    <HistoryList organizationId={organization.id} viewerUid={viewerUid} requesterName={requesterName} />
                  ) : (
                    <RequestList tab={name} requests={lists[name]} viewerUid={viewerUid} requesterName={requesterName} />
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        );
      }}
    </QuerySection>
  );
}
