import type { Invitation } from "@core/contracts";

/**
 * Delivers a new invitation (SP1 spec §6.2). The core has no email provider: its adapter
 * only logs `invitation_created` (no email, no token), and the inviter gets the link once
 * in the `201`. An application adapter may send the link by email.
 */
export type InvitationNotifier = {
  /** Called after the invitation is committed; a failure is logged, never surfaced. */
  readonly invitationCreated: (args: { invitation: Invitation; acceptUrl: string; requestId: string }) => Promise<void>;
};
