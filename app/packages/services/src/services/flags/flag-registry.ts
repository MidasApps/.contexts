import { type FeatureFlagDefinition, FeatureFlagDefinitionSchema } from "@core/contracts";

/**
 * A flag of the code registry (decision 0039, governance "Feature flags"): every flag has an
 * owner, a reason, a kind and an expiry. `tenantOverridable` flags may be switched off by an
 * organization's admins (`/v1/flags`); every other override is staff-only (`/v1/admin/flags`).
 */
export type RegisteredFlag = FeatureFlagDefinition & { readonly tenantOverridable: boolean };

const CREATED = "2026-09-30T00:00:00.000Z";
const ONE_YEAR = "2027-09-30T00:00:00.000Z";
const OWNER = "platform-team";

/** Core flags (SP5 spec §5). `chat.voice` replaces the env-only `AI_VOICE_ENABLED` gate (decision 0034 amendment). */
export const CORE_FLAGS: readonly RegisteredFlag[] = [
  {
    key: "ai.kill-switch",
    owner: OWNER,
    reason: "Stops every agent, chat and voice run (503 FEATURE_DISABLED) during an incident.",
    kind: "kill-switch",
    default: false,
    createdAt: CREATED,
    expiresAt: ONE_YEAR,
    tenantOverridable: false,
  },
  {
    key: "ai.web-tools",
    owner: OWNER,
    reason: "Platform switch over the tenant opt-in for tools that reach the public web.",
    kind: "ops",
    default: true,
    createdAt: CREATED,
    expiresAt: ONE_YEAR,
    tenantOverridable: false,
  },
  {
    key: "chat.voice",
    owner: OWNER,
    reason: "Voice transcription and speech per environment and organization (sending audio needs compliance clearance).",
    kind: "rollout",
    default: false,
    createdAt: CREATED,
    expiresAt: ONE_YEAR,
    tenantOverridable: true,
  },
  {
    key: "chat.voice.realtime",
    owner: OWNER,
    reason: "Realtime voice sessions; audio flows between browser and provider and is not metered yet.",
    kind: "rollout",
    default: false,
    createdAt: CREATED,
    expiresAt: ONE_YEAR,
    tenantOverridable: true,
  },
  {
    key: "ai.memory.observational",
    owner: OWNER,
    reason: "Observational memory, off until the real-model comparison (follow-up #37). Boot-time: AI_MEMORY_OBSERVATIONAL decides when the runtime starts; a stored value does not change a running process.",
    kind: "rollout",
    default: false,
    createdAt: CREATED,
    expiresAt: ONE_YEAR,
    tenantOverridable: false,
  },
  {
    key: "workflows.schedules",
    owner: OWNER,
    reason: "Schedule fires of workflows, tenant and platform; off holds every fire (rows and paused states kept, a missed fire runs once when back on).",
    kind: "ops",
    default: true,
    createdAt: CREATED,
    expiresAt: ONE_YEAR,
    tenantOverridable: false,
  },
];

/** Bug: a registry entry breaks the governance shape (checked at module load and by the registry test). */
export class InvalidFlagRegistryError extends Error {
  readonly code = "INVALID_FLAG_REGISTRY";

  constructor(message: string) {
    super(message);
    this.name = "InvalidFlagRegistryError";
  }
}

/** Validates a registry (owner, reason, kind, expiry after creation, unique keys). */
export const assertFlagRegistry = (flags: readonly RegisteredFlag[]): readonly RegisteredFlag[] => {
  const keys = new Set<string>();
  for (const flag of flags) {
    const { tenantOverridable, ...definition } = flag;
    void tenantOverridable;
    if (!FeatureFlagDefinitionSchema.safeParse(definition).success) throw new InvalidFlagRegistryError(`invalid flag ${flag.key}`);
    if (keys.has(flag.key)) throw new InvalidFlagRegistryError(`duplicated flag ${flag.key}`);
    keys.add(flag.key);
  }
  return flags;
};

/** True once `expiresAt` has passed: the console shows a warning (governance asks to remove or renew). */
export const isFlagExpired = (flag: Pick<RegisteredFlag, "expiresAt">, now: Date): boolean => Date.parse(flag.expiresAt) <= now.getTime();

/** Expired flags of a registry, for the `/admin` warning. */
export const expiredFlags = (flags: readonly RegisteredFlag[], now: Date): readonly RegisteredFlag[] => flags.filter((flag) => isFlagExpired(flag, now));

export const findFlag = (flags: readonly RegisteredFlag[], key: string): RegisteredFlag | undefined => flags.find((flag) => flag.key === key);

/**
 * Environment defaults from boot env (decision 0034 amendment): `AI_VOICE_ENABLED` (unset = on in
 * local only), `AI_VOICE_REALTIME_ENABLED` and `AI_MEMORY_OBSERVATIONAL` seed `chat.voice`,
 * `chat.voice.realtime` and `ai.memory.observational` until a value is stored for the environment.
 * The web passes only `APP_ENV`, so a stored value is what keeps both sides in agreement.
 */
export const flagEnvironmentDefaults = (env: {
  readonly APP_ENV: string;
  readonly AI_VOICE_ENABLED?: boolean | undefined;
  readonly AI_VOICE_REALTIME_ENABLED?: boolean | undefined;
  readonly AI_MEMORY_OBSERVATIONAL?: boolean | undefined;
}): Readonly<Record<string, boolean | undefined>> => ({
  "chat.voice": env.AI_VOICE_ENABLED ?? env.APP_ENV === "local",
  "chat.voice.realtime": env.AI_VOICE_REALTIME_ENABLED,
  "ai.memory.observational": env.AI_MEMORY_OBSERVATIONAL,
});
