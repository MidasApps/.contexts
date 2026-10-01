// Test data factories of the `/admin` flags and costs pages (rules/testing.md: data by factory).
type Json = Record<string, unknown>;

export const buildFeatureFlag = (overrides: Json = {}): Json => ({
  key: "ai.kill-switch",
  owner: "platform-team",
  reason: "Stops every agent and chat run during an incident.",
  kind: "kill-switch",
  default: false,
  createdAt: "2026-09-30T00:00:00.000Z",
  expiresAt: "2027-09-30T00:00:00.000Z",
  value: false,
  tenantOverride: null,
  expired: false,
  ...overrides,
});

/** A rollout flag that is on and past its expiry (the `/admin/flags` warning). */
export const buildExpiredFlag = (overrides: Json = {}): Json =>
  buildFeatureFlag({
    key: "chat.voice",
    owner: "chat-team",
    reason: "Voice input and output in chat.",
    kind: "rollout",
    createdAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:00:00.000Z",
    value: true,
    expired: true,
    ...overrides,
  });
