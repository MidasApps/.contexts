import type { App, AppOptions } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { createFirebaseAdmin, EmulatorOutsideLocalError, type FirebaseAdminSdk, FirebaseProjectMismatchError } from "./firebase-admin.ts";

const LOCAL_ENV = { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" } as const;
const PROD_ENV = { APP_ENV: "prod", FIREBASE_PROJECT_ID: "acme-prod" } as const;
const EMULATOR_HOSTS = { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };

// Test doubles: the factory only passes these objects through.
const fakeAuth = {} as Auth;
const fakeFirestore = {} as Firestore;

const makeFakeSdk = (existing: App[] = []) => {
  const initialized: Array<{ options: AppOptions; name: string }> = [];
  const sdk: FirebaseAdminSdk = {
    getApps: () => existing,
    initializeApp: (options, name) => {
      initialized.push({ options, name });
      return { name, options };
    },
    getAuth: () => fakeAuth,
    getFirestore: () => fakeFirestore,
  };
  return { sdk, initialized };
};

describe("createFirebaseAdmin", () => {
  it("initializes the app for the configured project in local with emulator hosts", () => {
    const { sdk, initialized } = makeFakeSdk();
    const admin = createFirebaseAdmin({ env: LOCAL_ENV, processEnv: EMULATOR_HOSTS, sdk });
    expect(initialized).toEqual([{ options: { projectId: "demo-core" }, name: "core-services" }]);
    expect(admin.auth).toBe(fakeAuth);
    expect(admin.firestore).toBe(fakeFirestore);
  });

  it("initializes in prod when no emulator host is set", () => {
    const { sdk, initialized } = makeFakeSdk();
    createFirebaseAdmin({ env: PROD_ENV, processEnv: { NODE_ENV: "production", FIRESTORE_EMULATOR_HOST: "" }, sdk });
    expect(initialized).toHaveLength(1);
  });

  it.each([
    ["FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099"],
    ["FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080"],
    ["FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:9199"],
  ])("refuses to initialize in prod when %s is set", (key, value) => {
    const { sdk, initialized } = makeFakeSdk();
    const create = () => createFirebaseAdmin({ env: PROD_ENV, processEnv: { [key]: value }, sdk });
    expect(create).toThrow(EmulatorOutsideLocalError);
    expect(create).toThrow(new RegExp(key));
    expect(create).not.toThrow(new RegExp(value.replaceAll(".", "\\.")));
    expect(initialized).toEqual([]);
  });

  it("lists every emulator host it found outside local", () => {
    const { sdk } = makeFakeSdk();
    try {
      createFirebaseAdmin({ env: { ...PROD_ENV, APP_ENV: "staging" }, processEnv: EMULATOR_HOSTS, sdk });
      expect.unreachable("expected EmulatorOutsideLocalError");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(EmulatorOutsideLocalError);
      if (!(error instanceof EmulatorOutsideLocalError)) return;
      expect(error.code).toBe("EMULATOR_OUTSIDE_LOCAL");
      expect(error.keys).toEqual(["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]);
    }
  });

  it("reuses an app already initialized under the same name (dev server reloads)", () => {
    const existing: App = { name: "core-services", options: { projectId: "demo-core" } };
    const { sdk, initialized } = makeFakeSdk([existing]);
    const admin = createFirebaseAdmin({ env: LOCAL_ENV, processEnv: EMULATOR_HOSTS, sdk });
    expect(admin.app).toBe(existing);
    expect(initialized).toEqual([]);
  });

  it("refuses to reuse an app initialized for another project", () => {
    const existing: App = { name: "core-services", options: { projectId: "other-project" } };
    const { sdk } = makeFakeSdk([existing]);
    const create = () => createFirebaseAdmin({ env: LOCAL_ENV, processEnv: {}, sdk });
    expect(create).toThrow(FirebaseProjectMismatchError);
    expect(create).toThrow(/demo-core/);
  });
});
