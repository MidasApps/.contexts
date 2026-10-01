import type { Logger } from "@core/services";
import type { Mastra } from "@mastra/core/mastra";

/**
 * Platform schedules of the core workflows (SP5 spec §3.2, decision 0037 amendment). They are
 * Mastra Schedules rows written at boot, not `createWorkflow({ schedule })`: a declarative schedule
 * moves the workflow to Mastra's evented engine, which the core workflows do not use (they run on
 * the default engine, in process and in tests). Always UTC, no principal in the run's context
 * (the workflows treat that as a platform run) and no tenant metadata (tenants never see them).
 */
export type PlatformSchedule = { readonly workflowId: string; readonly cron: string };

export const PLATFORM_SCHEDULE_TIMEZONE = "UTC";

export const platformScheduleIdOf = (workflowId: string): string => `schedule_platform-${workflowId}`;

type SchedulesApi = Pick<Mastra["schedules"], "get" | "create" | "update">;

const isAlreadyExists = (error: unknown): boolean => typeof error === "object" && error !== null && "id" in error && error.id === "SCHEDULES_ID_EXISTS";

/**
 * Creates or realigns each platform schedule (idempotent; another instance creating the same row at
 * the same time is fine). A schedule an operator paused stays paused.
 */
export const ensurePlatformSchedules = async (args: {
  readonly schedules: SchedulesApi;
  readonly specs: readonly PlatformSchedule[];
  readonly logger: Pick<Logger, "info">;
}): Promise<void> => {
  for (const spec of args.specs) {
    const id = platformScheduleIdOf(spec.workflowId);
    const current = await args.schedules.get(id);
    if (current === null) {
      try {
        await args.schedules.create({ id, workflowId: spec.workflowId, cron: spec.cron, timezone: PLATFORM_SCHEDULE_TIMEZONE, inputData: {}, metadata: { platform: true } });
        args.logger.info("platform_schedule_created", { scheduleId: id, workflowId: spec.workflowId, cron: spec.cron });
      } catch (error: unknown) {
        if (!isAlreadyExists(error)) throw error;
      }
      continue;
    }
    if (current.cron !== spec.cron || current.timezone !== PLATFORM_SCHEDULE_TIMEZONE) {
      await args.schedules.update(id, { cron: spec.cron, timezone: PLATFORM_SCHEDULE_TIMEZONE });
      args.logger.info("platform_schedule_updated", { scheduleId: id, workflowId: spec.workflowId, cron: spec.cron });
    }
  }
};
