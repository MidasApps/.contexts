// Test data factories of the `/admin` console (rules/testing.md: data by factory). Shapes follow
// the `@core/contracts` examples so the fake API answers parse like real ones.
import { buildMe, IDS } from "./fixtures.ts";

type Json = Record<string, unknown>;

const CREATED = "2026-09-29T14:30:00.000Z";

export const ADMIN_IDS = { plan: "Pl1aB2cD3eF4gH5iJ6kL", otherPlan: "Pm7nO8pQ9rS0tU1vW2xY" } as const;

/** `GET /v1/me` of a platform staff member (`platform-admin` holds every `platform.*`). */
export const buildStaffMe = (role: "platform-admin" | "platform-support" = "platform-admin", overrides: Json = {}): Json =>
  buildMe({ isPlatformStaff: true, platformRole: role, mfaEnrolled: true, ...overrides });

export const buildPlan = (overrides: Json = {}): Json => ({
  id: ADMIN_IDS.plan,
  name: "Standard",
  limits: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000, maxConnectors: 5, features: ["web-tools"] },
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

export const buildOrganizationSummary = (overrides: Json = {}): Json => ({
  id: IDS.organization,
  name: "Northwind",
  status: "active",
  planId: ADMIN_IDS.plan,
  budget: { caps: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 }, source: "plan", override: null },
  costMtdMicroUsd: 1_250_000,
  ...overrides,
});

/** `GET /v1/admin/organizations/{id}`: the list row plus the member count. */
export const buildOrganizationDetail = (overrides: Json = {}): Json => ({ ...buildOrganizationSummary(), memberCount: 12, ...overrides });

export const buildAdminOverview = (overrides: Json = {}): Json => ({
  organizations: 12,
  activeUsers7d: 87,
  costMtdMicroUsd: 12_500_000,
  tripwireRate: 0.012,
  approvalRate: 0.92,
  evalStatus: "passed",
  generatedAt: "2026-09-30T12:00:00.000Z",
  ...overrides,
});
