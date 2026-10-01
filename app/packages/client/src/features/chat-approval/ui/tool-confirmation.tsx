"use client";

import { MAX_APPROVAL_REASON_CHARS } from "@core/contracts";
import { CircleCheckIcon, CircleXIcon, ShieldQuestionIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import type { ApprovalRequestView, ToolPartView, ToolPreviewView } from "#/entities/message/index.ts";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
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
import { useToolApproval, type ApprovalDecision } from "../model/use-tool-approval.ts";

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
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Spinner decorative className="size-3.5" />
            {t("approved")}
          </p>
        ) : tool.state === "output-error" ? (
          <p className="flex items-center gap-2 text-[13px] text-destructive-text">
            <TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />
            {t("failed")}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-emerald-foreground">
            <CircleCheckIcon aria-hidden="true" className="size-4 text-emerald" />
            {t("executed")}
          </p>
        )}
      </ConfirmationAccepted>
      <ConfirmationRejected>
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CircleXIcon aria-hidden="true" className="size-4" />
          {reason === undefined || reason === "" ? t("declined") : t("declinedReason", { reason })}
        </p>
      </ConfirmationRejected>
    </>
  );
}

/**
 * The approval card of a mutation tool (decision 0032): what will run, under which permission,
 * with which data and — when the tool can preview it — the before/after. Approve, or decline
 * with an optional reason; the decision travels as the native AI SDK approval response and
 * `/v1/chat` audits it before the tool runs. After the decision the card keeps the result, and
 * moves the focus to it so keyboard and screen-reader users are not left on a vanished button.
 */
export function ToolConfirmation({ tool, preview, request, onRespond, diff, interactive }: ToolConfirmationProps) {
  const t = useTranslations("chat.approval");
  const approval = useToolApproval({ approvalId: tool.approval?.id ?? "", onRespond });
  const reasonId = useId();
  const hintId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const toolName = request?.toolName ?? preview?.toolName ?? tool.toolName;
  const summary = preview?.summary ?? t("fallbackSummary", { tool: toolName });
  const requested = tool.state === "approval-requested";
  const locked = approval.sent !== null || !interactive;

  useEffect(() => {
    if (approval.stage === "asking-reason") reasonRef.current?.focus();
  }, [approval.stage]);

  useEffect(() => {
    // Only when this card took the decision in this session: history cards must not steal focus.
    if (!requested && approval.sent !== null) resultRef.current?.focus();
  }, [requested, approval.sent]);

  if (tool.approval === undefined) return null;
  return (
    <Confirmation state={tool.state} approval={tool.approval} label={t("label", { summary })} data-tool-call={tool.toolCallId}>
      <div className="flex items-start gap-2.5">
        <ShieldQuestionIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber" />
        <div className="min-w-0 space-y-0.5">
          <ConfirmationTitle>{requested ? t("title") : summary}</ConfirmationTitle>
          {requested ? <p className="text-[13px] text-foreground">{summary}</p> : null}
          {preview?.permission === undefined ? null : (
            <p className="text-[12.5px] text-muted-foreground">
              {t("permission")}: <span className="font-mono">{preview.permission}</span>
            </p>
          )}
        </div>
      </div>
      {diff ?? (requested ? <p className="text-[12.5px] text-muted-foreground">{t("noPreview")}</p> : null)}
      {request?.args === undefined || !requested ? null : <CodeBlock code={toJson(request.args)} language="json" label={t("details")} />}
      <ConfirmationRequest>
        {approval.stage === "asking-reason" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-[13px] font-medium text-foreground">
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
            <p id={hintId} className="text-[12.5px] text-muted-foreground">
              {t("reasonHint")}
            </p>
          </div>
        ) : null}
        <ConfirmationActions>
          {approval.stage === "asking-reason" ? (
            <>
              <ConfirmationAction variant="ghost" onClick={approval.cancelDecline} disabled={locked}>
                {t("cancelDecline")}
              </ConfirmationAction>
              <ConfirmationAction variant="destructive" onClick={approval.confirmDecline} disabled={!interactive} pending={approval.sent === "declined"}>
                {approval.sent === "declined" ? t("declining") : t("confirmDecline")}
              </ConfirmationAction>
            </>
          ) : (
            <>
              <ConfirmationAction variant="outline" onClick={approval.startDecline} disabled={locked}>
                {t("decline")}
              </ConfirmationAction>
              <ConfirmationAction onClick={approval.approve} disabled={!interactive} pending={approval.sent === "approved"}>
                {approval.sent === "approved" ? t("approving") : t("approve")}
              </ConfirmationAction>
            </>
          )}
        </ConfirmationActions>
      </ConfirmationRequest>
      <div ref={resultRef} tabIndex={-1}>
        <Outcome tool={tool} />
      </div>
    </Confirmation>
  );
}
