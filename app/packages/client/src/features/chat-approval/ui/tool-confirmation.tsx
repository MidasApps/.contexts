"use client";

import { MAX_APPROVAL_REASON_CHARS } from "@core/contracts";
import { CircleCheckIcon, CircleXIcon, ShieldQuestionIcon, TriangleAlertIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useTranslations } from "use-intl";
import type { ApprovalRequestView, ToolPartView, ToolPreviewView } from "#/entities/message/index.ts";
import { usePermissionLabel, useToolLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { CodeBlock } from "#/shared/ui/ai/code-block.tsx";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "#/shared/ui/ai/confirmation.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { type ApprovalDecision, type ToolApproval, useToolApproval } from "../model/use-tool-approval.ts";

export type ToolConfirmationProps = {
  /** The tool part in an approval state (for a delegated command, the `tool-agent-action` part). */
  tool: ToolPartView;
  /** `data-tool-preview` of the call: summary, permission, before/after. */
  preview: ToolPreviewView | undefined;
  /** `data-tool-call-approval` of the call: the command's own name and arguments. */
  request: ApprovalRequestView | undefined;
  onRespond: (decision: ApprovalDecision) => void;
  /** The before/after of the change (the widget passes the generative `approval-diff`). */
  diff?: ReactNode;
  /** The decision can be taken now: latest turn, nothing streaming. */
  interactive: boolean;
  /** The conversation moved past this turn: an unanswered request can no longer be decided. */
  stale?: boolean | undefined;
};

const toJson = (value: unknown): string => JSON.stringify(value, null, 2) ?? "";

/** What the card says once the member decided, by state of the tool part. */
function Outcome({ tool }: { tool: ToolPartView }) {
  const t = useTranslations("chat.approval");
  const reason = tool.approval?.reason;
  return (
    <>
      <ConfirmationAccepted>
        {tool.state === "approval-responded" ? (
          <p className="flex items-center gap-2 text-body text-muted-foreground">
            <Spinner decorative className="size-3.5" />
            {t("approved")}
          </p>
        ) : tool.state === "output-error" ? (
          <p className="flex items-center gap-2 text-body text-destructive-text">
            <TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />
            {t("failed")}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-body text-emerald-foreground">
            <CircleCheckIcon aria-hidden="true" className="size-4 text-emerald" />
            {t("executed")}
          </p>
        )}
      </ConfirmationAccepted>
      <ConfirmationRejected>
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <CircleXIcon aria-hidden="true" className="size-4" />
          {reason === undefined || reason === "" ? t("declined") : t("declinedReason", { reason })}
        </p>
      </ConfirmationRejected>
    </>
  );
}

/** What will run and under which permission: the question while it waits, the summary afterwards. */
function ToolHeading({
  requested,
  summary,
  permission,
}: {
  requested: boolean;
  summary: string;
  permission: string | undefined;
}) {
  const t = useTranslations("chat.approval");
  const permissionLabel = usePermissionLabel();
  return (
    <div className="flex items-start gap-2.5">
      <ShieldQuestionIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber" />
      <div className="min-w-0 space-y-0.5">
        <ConfirmationTitle>{requested ? t("title") : summary}</ConfirmationTitle>
        {requested ? <p className="text-body text-foreground">{summary}</p> : null}
        {permission === undefined ? null : (
          <p className="text-body-sm text-muted-foreground">
            {t("permission")}: <span title={permission}>{permissionLabel(permission)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** The before/after (or that there is none) and, while the call waits, its arguments. */
function ToolDetails({ requested, diff, args }: { requested: boolean; diff: ReactNode; args: unknown }) {
  const t = useTranslations("chat.approval");
  return (
    <>
      {diff ?? (requested ? <p className="text-body-sm text-muted-foreground">{t("noPreview")}</p> : null)}
      {args === undefined || !requested ? null : <CodeBlock code={toJson(args)} language="json" label={t("details")} />}
    </>
  );
}

/** The optional decline reason; it only mounts when the member starts declining, and takes the focus. */
function DeclineReasonField({ approval, locked }: { approval: ToolApproval; locked: boolean }) {
  const t = useTranslations("chat.approval");
  const reasonId = useId();
  const hintId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    reasonRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={reasonId} className="text-body font-medium text-foreground">
        {t("reasonLabel")}
      </label>
      <Textarea
        id={reasonId}
        ref={reasonRef}
        value={approval.reason}
        onChange={(event) => approval.setReason(event.target.value)}
        maxLength={MAX_APPROVAL_REASON_CHARS}
        aria-describedby={hintId}
        disabled={locked}
        className="min-h-16"
      />
      <p id={hintId} className="text-body-sm text-muted-foreground">
        {t("reasonHint")}
      </p>
    </div>
  );
}

/** Decline / approve, or — while asking for a reason — cancel / confirm the decline. */
function ApprovalActions({
  approval,
  locked,
  interactive,
}: {
  approval: ToolApproval;
  locked: boolean;
  interactive: boolean;
}) {
  const t = useTranslations("chat.approval");
  if (approval.stage === "asking-reason") {
    return (
      <ConfirmationActions>
        <ConfirmationAction variant="ghost" onClick={approval.cancelDecline} disabled={locked}>
          {t("cancelDecline")}
        </ConfirmationAction>
        <ConfirmationAction
          variant="destructive"
          onClick={approval.confirmDecline}
          disabled={!interactive}
          pending={approval.sent === "declined"}
        >
          {approval.sent === "declined" ? t("declining") : t("confirmDecline")}
        </ConfirmationAction>
      </ConfirmationActions>
    );
  }
  return (
    <ConfirmationActions>
      <ConfirmationAction variant="outline" onClick={approval.startDecline} disabled={locked}>
        {t("decline")}
      </ConfirmationAction>
      <ConfirmationAction onClick={approval.approve} disabled={!interactive} pending={approval.sent === "approved"}>
        {approval.sent === "approved" ? t("approving") : t("approve")}
      </ConfirmationAction>
    </ConfirmationActions>
  );
}

/** The decision while the call waits, or — once the conversation moved past it — that it expired. */
function ApprovalRequest(props: { expired: boolean; approval: ToolApproval; locked: boolean; interactive: boolean }) {
  const t = useTranslations("chat.approval");
  if (props.expired)
    return (
      <p data-slot="approval-expired" className="text-body-sm text-muted-foreground">
        {t("expired")}
      </p>
    );
  return (
    <ConfirmationRequest>
      {props.approval.stage === "asking-reason" ? (
        <DeclineReasonField approval={props.approval} locked={props.locked} />
      ) : null}
      <ApprovalActions approval={props.approval} locked={props.locked} interactive={props.interactive} />
    </ConfirmationRequest>
  );
}

/**
 * The approval card of a mutation tool (decision 0032): what will run, under which permission,
 * with which data and — when the tool can preview it — the before/after. Approve, or decline
 * with an optional reason; the decision travels as the native AI SDK approval response and
 * `/v1/chat` audits it before the tool runs. After the decision the card keeps the result, and
 * moves the focus to it so keyboard and screen-reader users are not left on a vanished button.
 */
export function ToolConfirmation({
  tool,
  preview,
  request,
  onRespond,
  diff,
  interactive,
  stale = false,
}: ToolConfirmationProps) {
  const t = useTranslations("chat.approval");
  const approval = useToolApproval({ approvalId: tool.approval?.id ?? "", onRespond });
  const resultRef = useRef<HTMLDivElement>(null);
  const toolLabel = useToolLabel();
  const toolName = request?.toolName ?? preview?.toolName ?? tool.toolName;
  const summary = preview?.summary ?? t("fallbackSummary", { tool: toolLabel(toolName) });
  const requested = tool.state === "approval-requested";
  // Nothing ran: the tool part still waits, but no answer can reach it any more.
  const expired = requested && stale;
  const locked = approval.sent !== null || !interactive;

  useEffect(() => {
    // Only when this card took the decision in this session: history cards must not steal focus.
    if (!requested && approval.sent !== null) resultRef.current?.focus();
  }, [requested, approval.sent]);

  if (tool.approval === undefined) return null;
  return (
    <Confirmation
      state={tool.state}
      approval={tool.approval}
      label={t("label", { summary })}
      data-tool-call={tool.toolCallId}
    >
      <ToolHeading requested={requested} summary={summary} permission={preview?.permission} />
      <ToolDetails requested={requested} diff={diff} args={request?.args} />
      <ApprovalRequest expired={expired} approval={approval} locked={locked} interactive={interactive} />
      <div ref={resultRef} tabIndex={-1}>
        <Outcome tool={tool} />
      </div>
    </Confirmation>
  );
}
