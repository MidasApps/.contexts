// Test data factories (rules/testing.md: data by factory, never shared mutable fixtures). Shapes
// follow the `@core/contracts` examples so the fake API answers parse like real ones.
import type { Permission } from "@core/contracts";

const CREATED = "2026-09-29T14:30:00.000Z";
const UPDATED = "2026-09-29T15:00:00.000Z";

export const IDS = {
  organization: "Jd8sK2lPq0WnR5tYu3bV",
  otherOrganization: "Ox7tH2kLm9QwE4rTy6uI",
  project: "Pq4rS6tU8vW0xY2zA1bC",
  otherProject: "Pz1xC3vB5nM7aS9dF2gH",
  unitRoot: "Ua2bC4dE6fG8hJ0kL1mN",
  unit: "Un5mK7pQ9rS1tV3wX6yZ",
  user: "uA1b2C3d4E5f6G7h8I9j",
} as const;

type Json = Record<string, unknown>;

export const buildOrganization = (overrides: Json = {}): Json => ({
  id: IDS.organization,
  tenantId: overrides["id"] ?? IDS.organization,
  name: "Northwind",
  status: "active",
  defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" },
  createdAt: CREATED,
  updatedAt: UPDATED,
  ...overrides,
});

export const buildProject = (overrides: Json = {}): Json => ({
  id: IDS.project,
  tenantId: IDS.organization,
  name: "Launch",
  description: "Rollout of the new catalog.",
  status: "active",
  settings: {},
  createdAt: CREATED,
  updatedAt: UPDATED,
  ...overrides,
});

/** A unit; pass `ancestorIds` root first (`parentUnitId` and `depth` follow from it). */
export const buildUnit = (overrides: Json & { ancestorIds?: string[] } = {}): Json => {
  const ancestorIds = overrides.ancestorIds ?? [];
  return {
    id: IDS.unit,
    tenantId: IDS.organization,
    projectId: IDS.project,
    parentUnitId: ancestorIds.at(-1) ?? null,
    ancestorIds,
    depth: ancestorIds.length,
    type: "sample.room",
    name: "Room 101",
    settings: {},
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
};

export const buildMe = (overrides: Json = {}): Json => ({
  uid: IDS.user,
  email: "ana@example.com",
  displayName: "Ana Souza",
  preferences: { locale: "pt-BR", theme: "system", notifications: { productUpdates: false, securityAlerts: true } },
  lastContext: {},
  accessVersion: 3,
  isPlatformStaff: false,
  mfaEnrolled: false,
  capabilities: { createOrganization: true },
  ...overrides,
});

export const buildAccessContext = (args: { permissions?: readonly Permission[]; organization?: Json; project?: Json; unit?: Json; displayTimeZone?: string } = {}): Json => ({
  tenantId: args.organization?.["id"] ?? IDS.organization,
  organization: buildOrganization(args.organization),
  ...(args.project === undefined ? {} : { project: buildProject(args.project) }),
  ...(args.unit === undefined ? {} : { unit: buildUnit(args.unit) }),
  permissions: [...(args.permissions ?? [])].sort(),
  regional: { locale: "pt-BR", displayTimeZone: args.displayTimeZone ?? "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" },
});
