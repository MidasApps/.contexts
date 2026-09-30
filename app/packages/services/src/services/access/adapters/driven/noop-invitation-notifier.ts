import type { Logger } from "../../../shared/observability/logger.ts";
import type { InvitationNotifier } from "../../application/ports/driven/invitation-notifier.ts";

/**
 * The core's `InvitationNotifier`: no delivery (SP1 spec §6.2), only a log line without
 * the email or the token; the inviter shares the link returned in the `201`.
 */
export const createNoopInvitationNotifier = (deps: { logger: Logger }): InvitationNotifier => ({
  invitationCreated: ({ invitation, requestId }) => {
    deps.logger.info("invitation_created", { requestId, tenantId: invitation.tenantId, invitationId: invitation.id, delivery: "none" });
    return Promise.resolve();
  },
});
