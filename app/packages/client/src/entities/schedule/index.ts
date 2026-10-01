// Public API of the schedule entity (SP5 Task 13): schedules as platform staff list them.
export { adminSchedulesQuery, scheduleKeys, useAdminSchedules } from "./api/schedule-queries.ts";
// Tenant side (SP5 Task 14): an organization's own schedules.
export { tenantScheduleKeys, tenantScheduleQuery, tenantSchedulesQuery, useTenantSchedule, useTenantSchedules } from "./api/tenant-schedule-queries.ts";
