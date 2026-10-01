// Test data factories for the settings pages (members, roles, invitations, API keys, devices,
// permission registry, unit types). Shapes follow the `@core/contracts` schemas so the fake API
// answers parse like real ones.
import { IDS } from "./fixtures.ts";

const CREATED = "2026-09-29T14:30:00.000Z";
const UPDATED = "2026-09-29T15:00:00.000Z";

type Json = Record<string, unknown>;

export const ORGANIZATION_NODE = { level: "organization", tenantId: IDS.organization } as const;
export const PROJECT_NODE = { level: "project", tenantId: IDS.organization, projectId: IDS.project } as const;

export const buildMember = (overrides: Json = {}): Json => ({
  uid: "uB2c3D4e5F6g7H8i9J0k",
  displayName: "Bruno Lima",
  email: "bruno@example.com",
  grants: [{ membershipId: "Mb6nB8vC0xZ2lK4jH6gF", node: ORGANIZATION_NODE, roles: [{ kind: "system", key: "member" }] }],
  ...overrides,
});

export const buildRole = (overrides: Json = {}): Json => ({
  id: "Rl3kJ5hG7fD9sA1qW2eR",
  tenantId: IDS.organization,
  name: "Project editor",
  description: "Edits projects and units.",
  permissions: ["core.project.read", "core.project.update"],
  createdAt: CREATED,
  updatedAt: UPDATED,
  ...overrides,
});

export const buildInvitation = (overrides: Json = {}): Json => ({
  id: "Iv7cX9zA1sD3fG5hJ7kL",
  tenantId: IDS.organization,
  email: "carla@example.com",
  node: ORGANIZATION_NODE,
  roles: [{ kind: "system", key: "member" }],
  status: "pending",
  expiresAt: "2026-10-06T14:30:00.000Z",
  invitedBy: IDS.user,
  acceptedByUid: null,
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

export const buildApiKey = (overrides: Json = {}): Json => ({
  id: "Ak2wS4xE6dC8rF0vT1gB",
  tenantId: IDS.organization,
  name: "Reporting export",
  publicId: "K7QX2M4PZ6AB",
  scopes: ["core.project.read", "core.unit.read"],
  node: ORGANIZATION_NODE,
  ownerUid: IDS.user,
  expiresAt: "2099-03-29T14:30:00.000Z",
  lastUsedAt: null,
  status: "active",
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

export const buildDevice = (overrides: Json = {}): Json => ({
  id: "Dv1qA3zW5sX7eD9cR2fV",
  tenantId: IDS.organization,
  label: "Front desk tablet",
  node: ORGANIZATION_NODE,
  status: "active",
  lastSeenAt: null,
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

/** A tenant permission of the registry (`GET /v1/permissions`). */
export const permissionDefinition = (id: string, kind: "read" | "write" = "read"): Json => ({
  id,
  descriptionKey: `permissions.${id}`,
  kind,
  scope: "tenant",
  defaultRoles: ["owner", "admin"],
});

export const PERMISSION_REGISTRY = [
  permissionDefinition("core.project.read"),
  permissionDefinition("core.project.update", "write"),
  permissionDefinition("core.unit.read"),
  permissionDefinition("core.member.read"),
];

export const UNIT_TYPES = [
  { id: "sample.site", labelKey: "sample.site", allowedParents: ["project"] },
  { id: "sample.room", labelKey: "sample.room", allowedParents: ["sample.site"] },
];
