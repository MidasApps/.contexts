// Test data factories of the `/admin` operations pages (workflow runs, schedules, connectors, logs).
import { IDS } from "./fixtures.ts";

type Json = Record<string, unknown>;

const CREATED = "2026-09-29T14:30:00.000Z";
const UPDATED = "2026-09-29T15:00:00.000Z";

export const OPS_IDS = {
  run: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  otherRun: "01J8Z3K4M5N6P7Q8R9S0T1V2W4",
  approval: "Ap1rQ2sT3uV4wX5yZ6aB",
  platformSchedule: "schedule_platform-usage-report",
  tenantSchedule: "schedule_3fa9c0e1b2d4a6f8-daily-usage",
  connector: "Cn4sK2lPq0WnR5tYu3bV",
  trace: "4bf92f3577b34da6a3ce929d0e0e4736",
  request: "01K6REQ0000000000000000000",
} as const;

export const buildAdminRun = (overrides: Json = {}): Json => ({
  runId: OPS_IDS.run,
  workflowId: "approval-demo",
  tenantId: IDS.organization,
  status: "suspended",
  startedBy: IDS.user,
  scheduleId: null,
  approvalRequestId: OPS_IDS.approval,
  createdAt: CREATED,
  updatedAt: UPDATED,
  ...overrides,
});

export const buildAdminSchedule = (overrides: Json = {}): Json => ({
  id: OPS_IDS.tenantSchedule,
  scope: "tenant",
  tenantId: IDS.organization,
  workflowId: "usage-report",
  cron: "0 9 * * *",
  timezone: "Asia/Tokyo",
  status: "active",
  nextFireAt: "2026-09-30T00:00:00.000Z",
  lastFireAt: null,
  createdBy: IDS.user,
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

export const buildPlatformSchedule = (overrides: Json = {}): Json =>
  buildAdminSchedule({
    id: OPS_IDS.platformSchedule,
    scope: "platform",
    tenantId: null,
    cron: "15 * * * *",
    timezone: "UTC",
    createdBy: null,
    nextFireAt: "2026-09-30T12:15:00.000Z",
    ...overrides,
  });

export const buildConnector = (overrides: Json = {}): Json => ({
  id: OPS_IDS.connector,
  tenantId: IDS.organization,
  name: "issues-api",
  type: "openapi",
  status: "active",
  secretRef: "connector-secret-name",
  toolPolicy: { allow: ["listIssues", "createIssue"], readOnly: ["listIssues"] },
  config: { specUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"], auth: "bearer", apiKeyHeader: null },
  createdBy: IDS.user,
  createdAt: CREATED,
  updatedAt: UPDATED,
  ...overrides,
});

export const buildLogLine = (overrides: Json = {}): Json => ({
  timestamp: "2026-09-30T12:00:00.000Z",
  level: "info",
  message: "order_placed",
  service: "web",
  env: "local",
  requestId: OPS_IDS.request,
  traceId: OPS_IDS.trace,
  fields: { durationMs: 42, endpointId: "admin.getOverview" },
  ...overrides,
});
