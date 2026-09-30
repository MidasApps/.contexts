// Composition root of four-eyes approval requests (SP1 Task 17, SP1 spec §6.5).
import type { Firestore } from "firebase-admin/firestore";
import { createFirestoreUnitOfWork } from "../shared/firestore/unit-of-work.ts";
import { createFirestoreApprovalRequestRepository } from "./adapters/driven/firestore-approval-request-repository.ts";
import type { ApprovalDeps } from "./application/approval-deps.ts";
import { createApprovalHandlerRegistry, type ApprovalHandlerRegistry } from "./application/approval-handler-registry.ts";
import type { ApprovalActionHandler } from "./application/ports/driven/approval-action-handler.ts";
import { makeApproveRequest, type ApproveRequest } from "./application/use-cases/approve-request.ts";
import { makeListApprovalRequests, type ListApprovalRequests } from "./application/use-cases/list-approval-requests.ts";
import { makeRejectRequest, type RejectRequest } from "./application/use-cases/reject-request.ts";
import { makeRequestApproval, type RequestApproval } from "./application/use-cases/request-approval.ts";

export type ApprovalServices = {
  /** Route and in-process entry (SP3 tool approvals, SP5 workflow HITL). */
  readonly requestApproval: RequestApproval;
  readonly listApprovalRequests: ListApprovalRequests;
  readonly approveRequest: ApproveRequest;
  readonly rejectRequest: RejectRequest;
  /** Open registry: SP3 registers `agent-command`, SP5 its workflow handler. */
  readonly handlers: ApprovalHandlerRegistry;
};

/** Binds the approval use cases to their adapters. */
export const createApprovalServices = (deps: ApprovalDeps): ApprovalServices => ({
  requestApproval: makeRequestApproval(deps),
  listApprovalRequests: makeListApprovalRequests(deps),
  approveRequest: makeApproveRequest(deps),
  rejectRequest: makeRejectRequest(deps),
  handlers: deps.handlers,
});

/**
 * The approval vertical over Firestore (`createCoreServer`).
 * @param handlers handlers known at startup; later ones go through `handlers.register`.
 * @throws {ApprovalHandlerRegistryError} for duplicate or malformed handler kinds.
 */
export const createFirestoreApprovalServices = (
  deps: Omit<ApprovalDeps, "approvals" | "handlers" | "unitOfWork"> & { firestore: Firestore; handlers?: readonly ApprovalActionHandler[] | undefined },
): ApprovalServices => {
  const { firestore, handlers, ...rest } = deps;
  return createApprovalServices({
    ...rest,
    approvals: createFirestoreApprovalRequestRepository({ firestore }),
    handlers: createApprovalHandlerRegistry(handlers ?? []),
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
  });
};
