import {
  APPROVAL_TTL_DAYS,
  type ApprovalRequest,
  type CreateApprovalRequestInput,
  type Principal,
  type TenantId,
} from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { sha256Hex } from "../../../shared/crypto/sha256.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import {
  ApprovalInputInvalidError,
  ApprovalNotRequiredError,
  UnknownApprovalActionError,
} from "../../domain/errors/approval-errors.ts";
import { type ApprovalDeps, requesterRefOf } from "../approval-deps.ts";

export type RequestApprovalCommand = {
  readonly principal: Principal;
  /** The route's request scope; in-process callers (SP3) omit it and get a fresh one. */
  readonly access?: RequestAccess | undefined;
  /** The organization of the route path, which must be the node's. */
  readonly tenantId?: TenantId | undefined;
  readonly input: CreateApprovalRequestInput;
  readonly requestId: string;
};

export type RequestApprovalError =
  | AccessDeniedError
  | ApprovalNotRequiredError
  | UnknownApprovalActionError
  | ApprovalInputInvalidError;

/**
 * Creates a pending approval request (SP3 tool approvals, SP5 workflow HITL).
 * @returns the stored request, or a denial (403/404), `APPROVAL_NOT_REQUIRED`,
 *   `UNKNOWN_APPROVAL_ACTION` (422) or the handler's input issues (400).
 * @throws on infrastructure failures (fail-closed: nothing is created).
 */
export type RequestApproval = (
  command: RequestApprovalCommand,
) => Promise<Result<ApprovalRequest, RequestApprovalError>>;

const DAY_MS = 86_400_000;

const inputIssues = (
  deps: ApprovalDeps,
  action: CreateApprovalRequestInput["action"],
): ApprovalInputInvalidError | UnknownApprovalActionError | null => {
  const handler = deps.handlers.get(action.kind);
  if (handler === undefined) return new UnknownApprovalActionError();
  const issues = handler.check(action.input);
  if (issues.length === 0) return null;
  return new ApprovalInputInvalidError(
    issues.map((issue) => ({
      field: ["action", "input", ...issue.path.map(String)].join("."),
      issue: issue.code.toUpperCase(),
    })),
  );
};

// Steps before any write: tenant of the path, read-only impersonation, the caller's own
// right to the action, the permission's `requiresApproval`, a handler and a valid input.
const checkRequest = async (
  deps: ApprovalDeps,
  command: RequestApprovalCommand,
): Promise<RequestApprovalError | null> => {
  const { principal, input } = command;
  if (command.tenantId !== undefined && input.node.tenantId !== command.tenantId)
    return new AccessDeniedError("NODE_NOT_FOUND");
  if (principal.type === "user" && principal.impersonation !== undefined)
    return new AccessDeniedError("IMPERSONATION_READ_ONLY");
  const access = command.access ?? deps.accessCore.forRequest();
  const decision = await access.authorize({ principal, permission: input.permission, node: input.node });
  if (!decision.allowed) return new AccessDeniedError(decision.reason);
  if (!decision.requiresApproval) return new ApprovalNotRequiredError();
  return inputIssues(deps, input.action);
};

/**
 * `POST /v1/organizations/{organizationId}/approval-requests` and the in-process
 * `requestApproval` (SP1 spec §6.5): the requester must hold the action's permission at the
 * node and the permission must require approval. The request is pending for 7 days; it is
 * audited as `APPROVAL_REQUESTED` with a digest of the input, never the input.
 */
export const makeRequestApproval =
  (deps: ApprovalDeps): RequestApproval =>
  async (command) => {
    const refused = await checkRequest(deps, command);
    if (refused !== null) return err(refused);
    const { principal, input, requestId } = command;
    const now = deps.clock.now();
    const request: ApprovalRequest = {
      id: deps.approvals.newId(),
      tenantId: input.node.tenantId,
      node: input.node,
      permission: input.permission,
      requestedBy: requesterRefOf(principal),
      action: input.action,
      status: "pending",
      decidedBy: null,
      reason: null,
      expiresAt: new Date(now.getTime() + APPROVAL_TTL_DAYS * DAY_MS).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const actor = auditActorOf(principal);
    await deps.unitOfWork.run(async (tx) => {
      deps.approvals.create(tx, { request, actorId: actor.id });
      await deps.audit.record(
        {
          log: "tenant",
          tenantId: request.tenantId,
          action: "APPROVAL_REQUESTED",
          actor,
          target: { type: "approval-request", id: request.id },
          node: request.node,
          outcome: "success",
          requestId,
          metadata: { inputHash: sha256Hex(JSON.stringify(input.action.input)) },
        },
        tx,
      );
    });
    return ok(request);
  };
