"use client";

import type { ApprovalRequest, TenantNodeRef } from "@core/contracts";
import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import { grantCoversNode, useMyGrants, usePermissions } from "#/entities/permission/index.ts";
import type { NodeParams } from "#/shared/api/core-queries.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { decisionErrorCodeOf, useApprovalDecision } from "../model/use-approval-decision.ts";

export type ApprovalDecisionProps = {
  readonly request: ApprovalRequest;
  /** Uid of the signed-in user; `null` while it loads (no control is offered then). */
  readonly viewerUid: string | null;
};

const REASON_MAX = 500;

const nodeParamsOf = (node: TenantNodeRef): NodeParams => ({
  organizationId: node.tenantId,
  ...(node.level === "organization" ? {} : { projectId: node.projectId }),
  ...(node.level === "unit" ? { unitId: node.unitId } : {}),
});

/** Why the viewer gets no decision controls, or `null` when they may decide. */
type Blocker = "loading" | "own-request" | "not-covered" | "no-permission";

const useBlocker = (request: ApprovalRequest, viewerUid: string | null): Blocker | null => {
  // Permissions at the request's own node: an approver of one project decides only there.
  const permissions = usePermissions(nodeParamsOf(request.node));
  const grants = useMyGrants(request.tenantId);
  if (viewerUid === null) return "loading";
  if (request.requestedBy.id === viewerUid) return "own-request";
  if (grants.isPending || permissions.status === "pending") return "loading";
  // Without a grant at or above the node the API refuses whatever the viewer holds elsewhere. A
  // failed grants read does not block: the access context below still decides.
  if (grants.data !== undefined && !grantCoversNode(grants.data, request.node)) return "not-covered";
  return permissions.can("core.approval.decide") && permissions.can(request.permission) ? null : "no-permission";
};

function DecisionError({ error }: { error: unknown }) {
  const t = useTranslations("settings.approvals.decision");
  const tError = useTranslations("common.errorState");
  const describe = useDescribeError();
  if (error === null || error === undefined) return null;
  const described = describe(error);
  const code = decisionErrorCodeOf(error);
  const message = code === null ? described.message : t(`errors.${code}`);
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>
        {described.requestId === undefined
          ? message
          : tError("messageWithReference", { message, requestId: described.requestId })}
      </AlertDescription>
    </Alert>
  );
}

function DecisionForm({ request }: { request: ApprovalRequest }) {
  const t = useTranslations("settings.approvals.decision");
  const online = useOnlineStatus();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const decision = useApprovalDecision(request);
  const run = async (verb: "approve" | "reject"): Promise<void> => {
    const result = await decision.decide(verb, reason);
    if (result === null) return;
    // Approving runs the action at once: the answer says whether it worked.
    if (result.status === "failed") notify.error(t("done.failed"));
    else
      notify.success(
        t(
          result.status === "rejected"
            ? "done.rejected"
            : result.status === "executed"
              ? "done.executed"
              : "done.approved",
        ),
      );
  };
  if (decision.decided !== null) return null;
  const busy = decision.pending !== null;
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonId}>{t("reasonLabel")}</Label>
        <Textarea
          id={reasonId}
          value={reason}
          maxLength={REASON_MAX}
          rows={2}
          aria-describedby={`${reasonId}-hint`}
          onChange={(event) => setReason(event.target.value)}
        />
        <p id={`${reasonId}-hint`} className="text-xs text-muted-foreground">
          {t("reasonHint")}
        </p>
      </div>
      <DecisionError error={rejecting ? null : decision.error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run("approve")} pending={decision.pending === "approve"} disabled={!online || busy}>
          {t("approve")}
        </Button>
        <Button variant="outline" onClick={() => setRejecting(true)} disabled={!online || busy}>
          {t("reject")}
        </Button>
      </div>
      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={t("rejectTitle")}
        description={t("rejectDescription", { summary: request.action.summary })}
        confirmLabel={t("rejectConfirm")}
        destructive
        // A refusal closes the dialog too: its message shows in the form, next to the controls.
        onConfirm={() => run("reject")}
      />
    </div>
  );
}

/**
 * Decision controls of a pending request (SP5 spec §3.4): approve, or reject after a confirmation,
 * with an optional reason. Four eyes: the requester never gets the controls, and neither does a
 * viewer whose grants do not cover the request's node or who lacks `core.approval.decide` or the
 * action's permission there; each case says why in words. The API authorizes every decision anyway.
 */
export function ApprovalDecision({ request, viewerUid }: ApprovalDecisionProps) {
  const t = useTranslations("settings.approvals.decision");
  const blocker = useBlocker(request, viewerUid);
  if (request.status !== "pending") return null;
  if (blocker === "loading")
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("checking")}
      </p>
    );
  if (blocker !== null)
    return <p className="border-t border-border pt-3 text-sm text-muted-foreground">{t(`blocked.${blocker}`)}</p>;
  return <DecisionForm request={request} />;
}
