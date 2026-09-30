import type { ApprovalRequest, Principal, UserPrincipal } from "@core/contracts";
import type { z } from "zod";

/** What a handler knows when an approved action runs. */
export type ApprovalActionContext = {
  /** The request, already `approved`; its id is the idempotency key of the execution. */
  readonly request: ApprovalRequest;
  /**
   * The requester as a principal (user, device, or API key with its owner), for handlers
   * that re-authorize it; null when it no longer resolves (an API key that is gone).
   */
  readonly requester: Principal | null;
  /** The user whose approval released the action. */
  readonly approver: UserPrincipal;
  readonly requestId: string;
};

/**
 * Executes one kind of approved action (SP1 spec §6.5). SP3 registers `agent-command`
 * (decision 0025) and SP5 its workflow HITL handler; SP1 ships the flow only. `inputSchema`
 * validates `action.input` when the request is created and again before `execute`.
 * `execute` runs at most once per request; a throw marks the request `failed` (its `code`,
 * when SCREAMING_SNAKE, is audited as `errorCode`).
 */
export type ApprovalActionHandler<Input = unknown> = {
  /** kebab-case (`agent-command`), unique in the registry. */
  readonly kind: string;
  readonly inputSchema: z.ZodType<Input>;
  readonly execute: (input: Input, context: ApprovalActionContext) => Promise<void>;
};
