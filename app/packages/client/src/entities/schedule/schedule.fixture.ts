import type { Schedule } from "@core/contracts";
import { IDS } from "#/shared/testing/fixtures.ts";

/** Test data: a schedule of the fixture organization (wire shape, before parsing). */
export const buildSchedule = (overrides: Partial<Record<keyof Schedule, unknown>> = {}): Record<string, unknown> => ({
  id: "schedule_3fa9c0e1b2d4a6f8-daily-usage",
  tenantId: IDS.organization,
  workflowId: "usage-report",
  cron: "0 9 * * *",
  timezone: "America/Sao_Paulo",
  inputData: {},
  status: "active",
  nextFireAt: "2026-10-02T12:00:00.000Z",
  lastFireAt: null,
  createdBy: IDS.user,
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T14:30:00.000Z",
  ...overrides,
});
