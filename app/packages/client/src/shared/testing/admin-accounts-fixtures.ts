// Test data factories of the `/admin` organization page and support access (SP5 Task 12).
import { IDS } from "./fixtures.ts";

type Json = Record<string, unknown>;

export const IMPERSONATION_IDS = { session: "Im5sK2lPq0WnR5tYu3bV", target: "uT9s8R7q6P5o4N3m2L1k" } as const;

/** A row of `GET /v1/admin/users` (the default is the impersonation target). */
export const buildAdminUser = (overrides: Json = {}): Json => ({
  id: IMPERSONATION_IDS.target,
  email: "ana@example.com",
  displayName: "Ana Souza",
  status: "active",
  createdAt: "2026-09-29T14:30:00.000Z",
  ...overrides,
});

/** `201` of `POST /v1/platform/impersonation-sessions`; `expiresAt` defaults to one hour from now. */
export const buildImpersonationStart = (overrides: Json = {}): Json => ({
  sessionId: IMPERSONATION_IDS.session,
  customToken: "eyJhbGciOiJSUzI1NiJ9.eyJpbXAiOiJJbTUifQ.c2ln",
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  ...overrides,
});

/** What the impersonation store keeps in `sessionStorage` (zustand `persist` envelope, version 1). */
export const storedImpersonation = (overrides: Json = {}): string =>
  JSON.stringify({
    state: {
      session: {
        sessionId: IMPERSONATION_IDS.session,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        targetUid: IMPERSONATION_IDS.target,
        organizationId: IDS.organization,
        ...overrides,
      },
    },
    version: 1,
  });
