// Test world of the approval use cases: the access write world (org-a > p1) with a module
// permission that requires approval (held by members), a recording test handler, an
// in-memory approval store and audit log, and a movable clock.
import { OrganizationIdSchema, UserIdSchema, type PermissionDefinition, type UserPrincipal } from "@core/contracts";
import { z } from "zod";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { inMemoryUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { createInMemoryApprovalRequestRepository } from "../../adapters/driven/in-memory-approval-request-repository.ts";
import { createApprovalServices } from "../../approval-composition.ts";
import { createAccessCore } from "../../composition.ts";
import { createApprovalHandlerRegistry } from "../approval-handler-registry.ts";
import type { ApprovalActionContext } from "../ports/driven/approval-action-handler.ts";
import { makeAccessWriteWorld, nodes, system } from "./access-write.fixture.ts";

export const APPROVAL_NOW = "2026-09-30T12:00:00.000Z";
export const tenantId = OrganizationIdSchema.parse("org-a");

export const DELETE_INVOICE: PermissionDefinition = {
  id: "sample.invoice.delete",
  descriptionKey: "permissions.sample.invoice.delete",
  kind: "write",
  scope: "tenant",
  requiresApproval: true,
  defaultRoles: ["member"],
};

const READ_INVOICE: PermissionDefinition = { ...DELETE_INVOICE, id: "sample.invoice.read", descriptionKey: "permissions.sample.invoice.read", kind: "read", requiresApproval: false };

export const as = (uid: string): UserPrincipal => ({ type: "user", uid: UserIdSchema.parse(uid), mfa: false });

export const deleteInvoiceInput = (input: Record<string, unknown> = { invoiceId: "inv-42" }) => ({
  node: nodes.p1,
  permission: "sample.invoice.delete",
  action: { kind: "sample-delete-invoice", input, summary: "Delete invoice 42" },
});

export const buildApprovalWorld = async (options: { failWith?: Error } = {}) => {
  let now = new Date(APPROVAL_NOW);
  const clock = { now: () => new Date(now.getTime()) };
  const world = makeAccessWriteWorld();
  await world.grant("owner", nodes.orgA, [system("owner")]);
  await world.grant("admin", nodes.orgA, [system("admin")]);
  await world.grant("member", nodes.orgA, [system("member")]);
  await world.grant("viewer", nodes.orgA, [system("viewer")]);
  const core = createAccessCore({
    permissions: [{ moduleId: "sample", permissions: [DELETE_INVOICE, READ_INVOICE] }],
    readers: { ...world.store, grants: world.writes.grantReader, roles: world.writes.roleReader },
    clock,
  });
  const executions: { input: unknown; context: ApprovalActionContext }[] = [];
  const handlers = createApprovalHandlerRegistry([
    {
      kind: "sample-delete-invoice",
      inputSchema: z.strictObject({ invoiceId: z.string().min(1) }),
      execute: (input, context) => {
        executions.push({ input, context });
        return options.failWith === undefined ? Promise.resolve() : Promise.reject(options.failWith);
      },
    },
  ]);
  const approvals = createInMemoryApprovalRequestRepository();
  const writer = createInMemoryAuditLogWriter();
  const services = createApprovalServices({
    approvals,
    handlers,
    accessCore: core,
    principals: world.store.principals,
    audit: makeRecordAudit({ writer, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
  });
  return {
    ...world,
    approvals,
    services,
    accessServices: world.services,
    executions,
    access: () => core.forRequest(),
    actions: () => writer.entries("tenant").map((entry) => entry.action),
    setNow: (iso: string) => {
      now = new Date(iso);
    },
  };
};
