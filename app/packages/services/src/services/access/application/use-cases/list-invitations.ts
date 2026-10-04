import type { Invitation, InvitationStatus, Principal, TenantId } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { invitationView } from "../../domain/invitation-state.ts";
import { requirePermission } from "../grant-checks.ts";
import type { MemberDeps } from "../member-deps.ts";

export type ListInvitationsCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly status?: InvitationStatus | undefined;
  readonly page: PageRequest;
};

export type ListInvitations = (command: ListInvitationsCommand) => Promise<Result<Page<Invitation>, AccessDeniedError>>;

// `expired` is derived from a stored `pending` past its expiry, so both filters read `pending`
// and the page is filtered on the effective status (a page may hold fewer than `limit` items).
const storedStatusesFor = (status: InvitationStatus | undefined): readonly InvitationStatus[] | undefined => {
  if (status === undefined) return undefined;
  return status === "pending" || status === "expired" ? ["pending", "expired"] : [status];
};

/** Invitations of an organization, newest first, never their token (`core.member.read`). */
export const makeListInvitations =
  (deps: Pick<MemberDeps, "invitations" | "clock">): ListInvitations =>
  async (command) => {
    const { tenantId, status, page } = command;
    const allowed = await requirePermission({
      ...command,
      permission: "core.member.read",
      node: { level: "organization", tenantId },
    });
    if (!allowed.ok) return allowed;
    const stored = await deps.invitations.list({ tenantId, statuses: storedStatusesFor(status), page });
    const now = deps.clock.now();
    const items = stored.items
      .map((invitation) => invitationView(invitation, now))
      .filter((invitation) => status === undefined || invitation.status === status);
    return ok({ items, nextCursor: stored.nextCursor });
  };
