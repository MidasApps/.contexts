import { describe, expect, it } from "vitest";
import { DEFAULT_OWNER_PASSWORD, OWNER_EMAIL, resolveSeedTarget, UnsafeSeedTargetError } from "./seed-target.ts";

const LOCAL_ENV = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "demo-core",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
};

describe("resolveSeedTarget", () => {
  it("targets the auth emulator of a demo project with the default owner", () => {
    expect(resolveSeedTarget(LOCAL_ENV)).toEqual({
      projectId: "demo-core",
      authEmulatorOrigin: "http://127.0.0.1:9099",
      owner: { email: OWNER_EMAIL, password: DEFAULT_OWNER_PASSWORD, displayName: "Demo Owner" },
      users: {
        member: { email: "member@demo.local", password: "demo-member-password", displayName: "Demo Member" },
        viewer: { email: "viewer@demo.local", password: "demo-viewer-password", displayName: "Demo Viewer" },
        invitee: { email: "invitee@demo.local", password: "demo-invitee-password", displayName: "Demo Invitee" },
        staff: { email: "staff@demo.local", password: "demo-staff-password", displayName: "Demo Staff" },
      },
    });
  });

  it("takes each seeded user's password from its SEED_*_PASSWORD variable", () => {
    expect(
      resolveSeedTarget({ ...LOCAL_ENV, SEED_STAFF_PASSWORD: "staff-secret", SEED_MEMBER_PASSWORD: "" }).users,
    ).toMatchObject({
      staff: { password: "staff-secret" },
      member: { password: "demo-member-password" },
    });
  });

  it("treats an empty SEED_OWNER_PASSWORD (as copied from .env.example) as unset", () => {
    expect(resolveSeedTarget({ ...LOCAL_ENV, SEED_OWNER_PASSWORD: "" }).owner.password).toBe(DEFAULT_OWNER_PASSWORD);
  });

  it("takes the owner password from SEED_OWNER_PASSWORD", () => {
    expect(resolveSeedTarget({ ...LOCAL_ENV, SEED_OWNER_PASSWORD: "another-secret" }).owner.password).toBe(
      "another-secret",
    );
  });

  it.each([
    ["a non-demo project", { FIREBASE_PROJECT_ID: "acme-prod" }, "FIREBASE_PROJECT_ID"],
    ["no auth emulator", { FIREBASE_AUTH_EMULATOR_HOST: undefined }, "FIREBASE_AUTH_EMULATOR_HOST"],
    [
      "a remote auth emulator host",
      { FIREBASE_AUTH_EMULATOR_HOST: "auth.example.com:9099" },
      "FIREBASE_AUTH_EMULATOR_HOST",
    ],
    ["an environment other than local", { APP_ENV: "staging" }, "APP_ENV"],
    ["a short password", { SEED_OWNER_PASSWORD: "12345" }, "SEED_OWNER_PASSWORD"],
    ["a short member password", { SEED_MEMBER_PASSWORD: "12345" }, "SEED_MEMBER_PASSWORD"],
    ["no firestore emulator", { FIRESTORE_EMULATOR_HOST: undefined }, "FIRESTORE_EMULATOR_HOST"],
    [
      "a remote firestore emulator host",
      { FIRESTORE_EMULATOR_HOST: "firestore.example.com:8080" },
      "FIRESTORE_EMULATOR_HOST",
    ],
  ])("refuses %s and names the variable, never its value", (_label, overrides, variable) => {
    const env = { ...LOCAL_ENV, SEED_OWNER_PASSWORD: "hunter2-value", ...overrides };
    const error: unknown = (() => {
      try {
        resolveSeedTarget(env);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(UnsafeSeedTargetError);
    expect(error).toMatchObject({ code: "UNSAFE_SEED_TARGET", variables: [variable] });
    expect(String(error)).toContain(variable);
    expect(String(error)).not.toContain("hunter2-value");
    expect(String(error)).not.toContain("acme-prod");
  });
});
