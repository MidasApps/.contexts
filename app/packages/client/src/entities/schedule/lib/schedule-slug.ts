// `schedule_<16 hex tenant key>-<slug>` (decision 0037 amendment); platform ids are `schedule_platform-<workflowId>`.
const TENANT_SCHEDULE_ID = /^schedule_[a-f0-9]{16}-([a-z0-9]+(?:-[a-z0-9]+)*)$/u;

/**
 * The slug an organization gave its schedule, read out of the id (the tenant key prefix is a hash
 * no one should read); `null` for platform schedules, which have none.
 * @example scheduleSlugOf("schedule_3fa9c0e1b2d4a6f8-daily-usage") // "daily-usage"
 */
export const scheduleSlugOf = (scheduleId: string): string | null => TENANT_SCHEDULE_ID.exec(scheduleId)?.[1] ?? null;
