import type { NotificationPort } from "@core/agents";
import type { Logger } from "@core/services";

/**
 * `NotificationPort` until a delivery channel exists (e-mail or an in-app inbox, SP5 follow-up):
 * each notice is one structured log line (`workflow_notification`) with ids and codes only, so
 * operators and log-based alerts see paused schedules and budget alerts.
 */
export const createLogNotificationPort = (logger: Pick<Logger, "info">): NotificationPort => ({
  notify: (notification) => {
    logger.info("workflow_notification", {
      tenantId: notification.tenantId,
      recipientUid: notification.recipientUid,
      kind: notification.kind,
      ...notification.data,
    });
    return Promise.resolve();
  },
});
