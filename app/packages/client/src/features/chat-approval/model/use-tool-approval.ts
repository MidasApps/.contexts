"use client";

import { MAX_APPROVAL_REASON_CHARS } from "@core/contracts";
import { useState } from "react";

/** The member's decision on a tool call, as `useChat.addToolApprovalResponse` takes it (decision 0032 path A). */
export type ApprovalDecision = { readonly id: string; readonly approved: boolean; readonly reason?: string | undefined };

export type ToolApproval = {
  /** `asking` shows the reason field before a decline is confirmed. */
  readonly stage: "idle" | "asking-reason";
  readonly reason: string;
  /** The decision just sent, until the part changes state. */
  readonly sent: "approved" | "declined" | null;
  readonly setReason: (reason: string) => void;
  readonly approve: () => void;
  /** Opens the reason field. */
  readonly startDecline: () => void;
  readonly cancelDecline: () => void;
  /** Sends the decline with the trimmed reason, when there is one. */
  readonly confirmDecline: () => void;
};

/**
 * State of one approval card: approve directly, or decline in two steps with an optional reason
 * (it goes to the audit log, decision 0032). A decision is sent once — the card locks as soon
 * as one is on its way, so a double click cannot answer twice.
 */
export const useToolApproval = (args: { approvalId: string; onRespond: (decision: ApprovalDecision) => void }): ToolApproval => {
  const [stage, setStage] = useState<ToolApproval["stage"]>("idle");
  const [reason, setReasonText] = useState("");
  const [sent, setSent] = useState<ToolApproval["sent"]>(null);

  const respond = (decision: ApprovalDecision, kind: "approved" | "declined") => {
    if (sent !== null) return;
    setSent(kind);
    args.onRespond(decision);
  };

  return {
    stage,
    reason,
    sent,
    setReason: (text) => setReasonText(text.slice(0, MAX_APPROVAL_REASON_CHARS)),
    approve: () => respond({ id: args.approvalId, approved: true }, "approved"),
    startDecline: () => setStage("asking-reason"),
    cancelDecline: () => setStage("idle"),
    confirmDecline: () => {
      const trimmed = reason.trim();
      respond({ id: args.approvalId, approved: false, ...(trimmed === "" ? {} : { reason: trimmed }) }, "declined");
    },
  };
};
