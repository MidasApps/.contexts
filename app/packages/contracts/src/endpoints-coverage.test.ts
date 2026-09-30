import { describe, expect, it } from "vitest";
import { CORE_ENDPOINTS } from "./composition.ts";
import { CORE_ERROR_CODES } from "./contracts/http/error-codes.ts";

// Every row of SP1 spec §7.3, as `METHOD path`; param names follow the route files.
const SP1_ROUTES = [
  "GET /v1/me",
  "PATCH /v1/me",
  "PUT /v1/me/active-organization",
  "POST /v1/me/claims/sync",
  "GET /v1/me/organizations",
  "GET /v1/me/context",
  "GET /v1/me/sessions",
  "DELETE /v1/me/sessions/{sessionId}",
  "POST /v1/me/sessions/revoke-all",
  "POST /v1/me/desktop-sessions",
  "POST /v1/desktop-sessions/exchange",
  "POST /v1/organizations",
  "GET /v1/organizations/{organizationId}",
  "PATCH /v1/organizations/{organizationId}",
  "DELETE /v1/organizations/{organizationId}",
  "GET /v1/organizations/{organizationId}/projects",
  "POST /v1/organizations/{organizationId}/projects",
  "GET /v1/projects/{projectId}",
  "PATCH /v1/projects/{projectId}",
  "DELETE /v1/projects/{projectId}",
  "GET /v1/projects/{projectId}/units",
  "POST /v1/projects/{projectId}/units",
  "GET /v1/units/{unitId}",
  "PATCH /v1/units/{unitId}",
  "DELETE /v1/units/{unitId}",
  "GET /v1/unit-types",
  "GET /v1/permissions",
  "GET /v1/organizations/{organizationId}/roles",
  "POST /v1/organizations/{organizationId}/roles",
  "GET /v1/roles/{roleId}",
  "PATCH /v1/roles/{roleId}",
  "DELETE /v1/roles/{roleId}",
  "GET /v1/organizations/{organizationId}/members",
  "DELETE /v1/organizations/{organizationId}/members/{userId}",
  "GET /v1/organizations/{organizationId}/memberships",
  "POST /v1/organizations/{organizationId}/memberships",
  "PATCH /v1/memberships/{membershipId}",
  "DELETE /v1/memberships/{membershipId}",
  "GET /v1/organizations/{organizationId}/invitations",
  "POST /v1/organizations/{organizationId}/invitations",
  "DELETE /v1/invitations/{invitationId}",
  "POST /v1/invitations/preview",
  "POST /v1/invitations/accept",
  "GET /v1/organizations/{organizationId}/api-keys",
  "POST /v1/organizations/{organizationId}/api-keys",
  "DELETE /v1/api-keys/{apiKeyId}",
  "GET /v1/organizations/{organizationId}/devices",
  "DELETE /v1/devices/{deviceId}",
  "POST /v1/organizations/{organizationId}/device-activations",
  "POST /v1/device-activations/redeem",
  "GET /v1/organizations/{organizationId}/audit-logs",
  "GET /v1/organizations/{organizationId}/approval-requests",
  "POST /v1/organizations/{organizationId}/approval-requests",
  "POST /v1/approval-requests/{approvalRequestId}/approve",
  "POST /v1/approval-requests/{approvalRequestId}/reject",
  "POST /v1/platform/impersonation-sessions",
  "POST /v1/platform/impersonation-sessions/{sessionId}/end",
];

const declared = CORE_ENDPOINTS.map((endpoint) => `${endpoint.method} ${endpoint.path}`);

describe("SP1 endpoint coverage", () => {
  it("has a descriptor for every row of SP1 spec §7.3", () => {
    expect(SP1_ROUTES.filter((route) => !declared.includes(route))).toEqual([]);
  });

  it("has no SP1 descriptor outside the spec table", () => {
    const sp1Contexts = /^(identity|tenancy|access|audit)\./;
    const extra = CORE_ENDPOINTS.filter((endpoint) => sp1Contexts.test(endpoint.id))
      .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
      .filter((route) => !SP1_ROUTES.includes(route));
    expect(extra).toEqual([]);
  });

  it("declares only error codes of CORE_ERROR_CODES", () => {
    const known: ReadonlySet<string> = new Set(CORE_ERROR_CODES);
    const unknown = CORE_ENDPOINTS.flatMap((endpoint) =>
      Object.values<readonly string[]>(endpoint.errors ?? {})
        .flat()
        .filter((code) => !known.has(code))
        .map((code) => `${endpoint.id}: ${code}`),
    );
    expect(unknown).toEqual([]);
  });

  it("rate limits the unauthenticated endpoints", () => {
    const open = CORE_ENDPOINTS.filter((endpoint) => endpoint.auth === "none" && endpoint.rateLimit === undefined).map((e) => e.id);
    expect(open).toEqual([]);
  });
});
