import { ApprovalRequestIdSchema, type ApprovalRequest } from "@core/contracts";
import { paginateInMemory } from "../../../shared/pagination/page.ts";
import type { ApprovalRequestRepository } from "../../application/ports/driven/approval-request-repository.ts";

export type InMemoryApprovalRequestRepository = ApprovalRequestRepository & {
  readonly rowOf: (id: string) => ApprovalRequest | undefined;
  /** Stores a request as is (tests seed expired or decided requests). */
  readonly put: (request: ApprovalRequest) => void;
};

// Newest first: sort by an inverted key, like `createdAt desc, id desc` in Firestore.
const descending = (value: string): string => [...value].map((char) => String.fromCharCode(0xffff - char.charCodeAt(0))).join("");

/** In-memory `ApprovalRequestRepository` for unit tests; ids are `approval-1`, `approval-2`, … */
export const createInMemoryApprovalRequestRepository = (): InMemoryApprovalRequestRepository => {
  const rows = new Map<string, ApprovalRequest>();
  let sequence = 0;
  return {
    newId: () => ApprovalRequestIdSchema.parse(`approval-${(sequence += 1)}`),
    create: (_tx, { request }) => void rows.set(request.id, request),
    get: (_tx, id) => Promise.resolve(rows.get(id) ?? null),
    list: ({ tenantId, statuses, page }) => {
      const items = [...rows.values()].filter((row) => row.tenantId === tenantId && (statuses === undefined || statuses.includes(row.status)));
      return Promise.resolve(paginateInMemory({ items, page, positionOf: (row) => [descending(row.createdAt), descending(row.id)] }));
    },
    setStatus: (_tx, { id, status, decidedBy, reason, updatedAt }) => {
      const row = rows.get(id);
      if (row === undefined) return;
      rows.set(id, { ...row, status, ...(decidedBy === undefined ? {} : { decidedBy }), ...(reason === undefined ? {} : { reason }), updatedAt });
    },
    rowOf: (id) => rows.get(id),
    put: (request) => void rows.set(request.id, request),
  };
};
