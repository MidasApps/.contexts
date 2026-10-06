"use client";

import { type ApprovalRequest, approveApprovalRequestEndpoint, rejectApprovalRequestEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { approvalRequestKeys } from "#/entities/approval-request/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";

export type DecisionVerb = "approve" | "reject";

/** Refusals with their own copy in the decision form; anything else uses `errors.<CODE>`. */
export const DECISION_ERROR_CODES = ["SELF_APPROVAL_FORBIDDEN", "FORBIDDEN", "CONFLICT", "NOT_FOUND"] as const;
export type DecisionErrorCode = (typeof DECISION_ERROR_CODES)[number];

export const decisionErrorCodeOf = (error: unknown): DecisionErrorCode | null => {
  if (!(error instanceof ApiError)) return null;
  return DECISION_ERROR_CODES.find((code) => code === error.code) ?? null;
};

export type ApprovalDecisionState = {
  readonly pending: DecisionVerb | null;
  /** The failure of the last attempt, as thrown (the form translates it). */
  readonly error: unknown;
  /** The request after the last successful decision (`executed`, `failed` or `rejected`). */
  readonly decided: ApprovalRequest | null;
  /** Resolves the request as it is after the decision, or `null` when it was refused. */
  readonly decide: (verb: DecisionVerb, reason: string) => Promise<ApprovalRequest | null>;
  readonly clearError: () => void;
};

/**
 * Approves or rejects a request through SP1's endpoints (`core.approval.decide` plus the action's
 * permission; the requester is always refused). Approving runs the action at most once, so the
 * answer already carries `executed` or `failed`. Every outcome, refusals included, refreshes the
 * organization's requests: a 409 or 404 means the list on screen is stale.
 */
export const useApprovalDecision = (request: ApprovalRequest): ApprovalDecisionState => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<DecisionVerb | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [decided, setDecided] = useState<ApprovalRequest | null>(null);
  const decide = async (verb: DecisionVerb, reason: string): Promise<ApprovalRequest | null> => {
    const trimmed = reason.trim();
    setPending(verb);
    setError(null);
    try {
      const endpoint = verb === "approve" ? approveApprovalRequestEndpoint : rejectApprovalRequestEndpoint;
      const { data } = await callEndpoint(endpoint, {
        params: { approvalRequestId: request.id },
        body: trimmed === "" ? {} : { reason: trimmed },
      });
      queryClient.setQueryData(approvalRequestKeys.one(request.tenantId, request.id), data);
      setDecided(data);
      return data;
    } catch (failure: unknown) {
      setError(failure);
      return null;
    } finally {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: approvalRequestKeys.all(request.tenantId) });
    }
  };
  return { pending, error, decided, decide, clearError: () => setError(null) };
};
