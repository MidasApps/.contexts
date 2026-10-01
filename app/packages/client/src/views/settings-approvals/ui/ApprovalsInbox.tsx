"use client";

import type { AccessContext, ApprovalRequest } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { ApprovalRequestItem, approvalRequestRoute, useApprovalRequests, waitingForDecision } from "#/entities/approval-request/index.ts";
import { ApprovalDecision } from "#/features/approval-decision/index.ts";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { NodeName } from "#/widgets/access-node/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { useRequesterNames } from "./use-requester-names.ts";

const TABS = ["waiting", "mine", "history"] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string): value is Tab => (TABS as readonly string[]).includes(value);

/** The three lists of the inbox (SP5 spec §3.4), from one read of the organization's requests. */
export const splitRequests = (requests: readonly ApprovalRequest[], viewerUid: string | null): Record<Tab, ApprovalRequest[]> => ({
  waiting: waitingForDecision(requests, viewerUid),
  mine: requests.filter((request) => request.requestedBy.id === viewerUid),
  history: requests.filter((request) => request.status !== "pending"),
});

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

/**
 * The inbox: requests waiting for the viewer's decision, the viewer's own requests and the settled
 * ones. It refetches every 15 s and when the window regains focus (no live listener yet).
 */
export function ApprovalsInbox({ context, viewerUid }: { context: AccessContext; viewerUid: string | null }) {
  const t = useTranslations("settings.approvals");
  const [tab, setTab] = useState<Tab>("waiting");
  const { organization } = context;
  const inbox = useApprovalRequests({ organizationId: organization.id });
  const requesterName = useRequesterNames({ organizationId: organization.id, viewerUid, canReadMembers: context.permissions.includes("core.member.read") });
  return (
    <QuerySection query={inbox.query} loadingLabel={t("loading")}>
      {(requests) => {
        const lists = splitRequests(requests, viewerUid);
        return (
          <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)}>
            <TabsList variant="line" aria-label={t("tabs.label")}>
              {TABS.map((name) => (
                <TabsTrigger key={name} value={name}>
                  {t(`tabs.${name}Count`, { count: lists[name].length })}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map((name) => (
              <TabsContent key={name} value={name} className="pt-3">
                {tab === name ? <RequestList tab={name} requests={lists[name]} viewerUid={viewerUid} requesterName={requesterName} /> : null}
              </TabsContent>
            ))}
          </Tabs>
        );
      }}
    </QuerySection>
  );
}
