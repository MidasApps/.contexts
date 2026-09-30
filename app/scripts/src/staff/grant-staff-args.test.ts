import { describe, expect, it } from "vitest";
import { GrantStaffArgsError, parseGrantStaffArgs } from "./grant-staff-args.ts";

const argv = (overrides: Record<string, string> = {}) =>
  Object.entries({ "--project": "acme-staging", "--email": "ana@example.com", "--role": "platform-support", "--confirm": "acme-staging", ...overrides }).flat();

describe("parseGrantStaffArgs", () => {
  it("accepts a remote project confirmed by name", () => {
    expect(parseGrantStaffArgs(argv(), { APP_ENV: "staging" })).toEqual({
      projectId: "acme-staging",
      email: "ana@example.com",
      role: "platform-support",
      appEnv: "staging",
    });
  });

  it("refuses unless --confirm repeats --project", () => {
    expect(() => parseGrantStaffArgs(argv({ "--confirm": "acme-prod" }), { APP_ENV: "staging" })).toThrow(/--confirm must equal --project/);
    const withoutConfirm = argv().slice(0, 6);
    expect(() => parseGrantStaffArgs(withoutConfirm, { APP_ENV: "staging" })).toThrow(GrantStaffArgsError);
  });

  it("refuses an unknown role, a malformed email or project, and unknown or repeated flags", () => {
    expect(() => parseGrantStaffArgs(argv({ "--role": "owner" }), { APP_ENV: "staging" })).toThrow(/--role/);
    expect(() => parseGrantStaffArgs(argv({ "--email": "not-an-email" }), { APP_ENV: "staging" })).toThrow(/--email/);
    expect(() => parseGrantStaffArgs(argv({ "--project": "Acme!", "--confirm": "Acme!" }), { APP_ENV: "staging" })).toThrow(/--project/);
    expect(() => parseGrantStaffArgs([...argv(), "--force", "yes"], { APP_ENV: "staging" })).toThrow(/--force/);
    expect(() => parseGrantStaffArgs([...argv(), "--role", "platform-admin"], { APP_ENV: "staging" })).toThrow(/--role/);
  });

  it("keeps local runs on demo-* emulator projects and remote runs off them", () => {
    expect(parseGrantStaffArgs(argv({ "--project": "demo-core", "--confirm": "demo-core" }), { APP_ENV: "local" })).toMatchObject({ appEnv: "local" });
    expect(() => parseGrantStaffArgs(argv(), { APP_ENV: "local" })).toThrow(/APP_ENV=local/);
    expect(() => parseGrantStaffArgs(argv({ "--project": "demo-core", "--confirm": "demo-core" }), { APP_ENV: "prod" })).toThrow(/demo-/);
    expect(() => parseGrantStaffArgs(argv(), {})).toThrow(/APP_ENV/);
  });

  it("never echoes the email in an error", () => {
    const run = () => parseGrantStaffArgs(argv({ "--email": "ana@@example.com" }), { APP_ENV: "staging" });
    expect(run).toThrow(GrantStaffArgsError);
    expect(run).not.toThrow(/ana@@example.com/);
  });
});
