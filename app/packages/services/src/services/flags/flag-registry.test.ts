import { describe, expect, it } from "vitest";
import {
  assertFlagRegistry,
  CORE_FLAGS,
  expiredFlags,
  flagEnvironmentDefaults,
  InvalidFlagRegistryError,
  isFlagExpired,
  type RegisteredFlag,
} from "./flag-registry.ts";

const flag = (overrides: Partial<RegisteredFlag> = {}): RegisteredFlag => ({
  key: "demo.flag",
  owner: "platform-team",
  reason: "Demo.",
  kind: "ops",
  default: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-06-01T00:00:00.000Z",
  tenantOverridable: false,
  ...overrides,
});

describe("flag registry", () => {
  it("declares every core flag with owner, reason, kind and an expiry after its creation", () => {
    expect(assertFlagRegistry(CORE_FLAGS)).toBe(CORE_FLAGS);
    for (const entry of CORE_FLAGS) {
      expect(entry.owner.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(["kill-switch", "rollout", "ops"]).toContain(entry.kind);
      expect(Date.parse(entry.expiresAt)).toBeGreaterThan(Date.parse(entry.createdAt));
    }
    expect(CORE_FLAGS.map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        "ai.kill-switch",
        "ai.web-tools",
        "chat.voice",
        "chat.voice.realtime",
        "ai.memory.observational",
        "workflows.schedules",
      ]),
    );
    expect(CORE_FLAGS.find((entry) => entry.key === "ai.kill-switch")).toMatchObject({
      kind: "kill-switch",
      default: false,
      tenantOverridable: false,
    });
  });

  it("refuses a flag without owner, with an expiry before creation, or a duplicated key", () => {
    expect(() => assertFlagRegistry([flag({ owner: "" })])).toThrow(InvalidFlagRegistryError);
    expect(() => assertFlagRegistry([flag({ expiresAt: "2025-12-31T00:00:00.000Z" })])).toThrow(
      InvalidFlagRegistryError,
    );
    expect(() => assertFlagRegistry([flag(), flag()])).toThrow(/duplicated/);
  });

  it("lists expired flags once their expiry has passed", () => {
    const flags = [flag({ key: "old.flag" }), flag({ key: "new.flag", expiresAt: "2027-01-01T00:00:00.000Z" })];
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(isFlagExpired(flags[0]!, now)).toBe(true);
    expect(expiredFlags(flags, now).map((entry) => entry.key)).toEqual(["old.flag"]);
    expect(expiredFlags(CORE_FLAGS, new Date("2026-10-01T00:00:00.000Z"))).toEqual([]);
  });
});

describe("flagEnvironmentDefaults", () => {
  it("turns voice on in local only unless AI_VOICE_ENABLED says otherwise", () => {
    expect(flagEnvironmentDefaults({ APP_ENV: "local" })["chat.voice"]).toBe(true);
    expect(flagEnvironmentDefaults({ APP_ENV: "prod" })["chat.voice"]).toBe(false);
    expect(
      flagEnvironmentDefaults({ APP_ENV: "local", AI_VOICE_ENABLED: false, AI_VOICE_REALTIME_ENABLED: true }),
    ).toMatchObject({ "chat.voice": false, "chat.voice.realtime": true });
  });
});
