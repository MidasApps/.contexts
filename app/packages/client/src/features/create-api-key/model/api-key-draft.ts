import { API_KEY_MAX_LIFETIME_DAYS, type Permission } from "@core/contracts";
import type { TenantNodeInput } from "#/entities/project/index.ts";

/** Lifetimes offered for a new key (SP1 spec §6.3: required, at most 365 days). */
export const EXPIRY_OPTIONS_DAYS = [30, 90, 180, API_KEY_MAX_LIFETIME_DAYS] as const;
export type ExpiryDays = (typeof EXPIRY_OPTIONS_DAYS)[number];

export type ApiKeyDraft = { name: string; node: TenantNodeInput; expiryDays: ExpiryDays; scopes: Permission[] };
export type ApiKeyDraftProblems = { name?: "required" | "tooLong"; scopes?: boolean };

const NAME_MAX = 80;
const DAY_MS = 86_400_000;

export const emptyApiKeyDraft = (organizationId: string): ApiKeyDraft => ({
  name: "",
  node: { level: "organization", tenantId: organizationId },
  expiryDays: 90,
  scopes: [],
});

export const validateApiKeyDraft = (draft: ApiKeyDraft): ApiKeyDraftProblems => {
  const name = draft.name.trim();
  return {
    ...(name === "" ? { name: "required" as const } : name.length > NAME_MAX ? { name: "tooLong" as const } : {}),
    ...(draft.scopes.length === 0 ? { scopes: true } : {}),
  };
};

/** Expiry instant `days` after `now` (UTC ISO); `now` is injected so tests are deterministic. */
export const expiryFrom = (now: Date, days: number): string => new Date(now.getTime() + days * DAY_MS).toISOString();
