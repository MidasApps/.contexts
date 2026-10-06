import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildE2eEnv,
  buildEmulatorExecArgs,
  DEFAULT_E2E_COMMAND,
  E2E_DATABASE_NAME,
  E2E_PROJECT_ID,
  InvalidE2eEnvError,
  joinCommandArgs,
} from "./e2e-env.ts";

const firebaseConfig: unknown = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../firebase.e2e.json"), "utf8"),
);
const devConfig: unknown = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../firebase.json"), "utf8"),
);

// Hub, logging and Firestore websocket defaults the dev config does not list.
const DEV_DEFAULT_PORTS = [4400, 4500, 9150];

const ports = (config: unknown): number[] => {
  const emulators = (config as { emulators: Record<string, { port?: number; websocketPort?: number }> }).emulators;
  return Object.values(emulators).flatMap((entry) =>
    [entry.port, entry.websocketPort].filter((port) => port !== undefined),
  );
};

/** `host:port` of an emulator in firebase.e2e.json, so the expectations follow the file. */
const emulatorHost = (name: string): string => {
  const entry = (firebaseConfig as { emulators: Record<string, { host?: string; port?: number }> }).emulators[name];
  if (entry?.host === undefined || entry.port === undefined) throw new Error(`firebase.e2e.json has no ${name} host`);
  return `${entry.host}:${String(entry.port)}`;
};

describe("buildE2eEnv", () => {
  it("targets the e2e emulators of firebase.e2e.json and the default web and desktop ports", () => {
    const env = buildE2eEnv({ firebaseConfig, overrides: {} });
    expect(env).toMatchObject({
      FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
      FIREBASE_AUTH_EMULATOR_HOST: emulatorHost("auth"),
      FIRESTORE_EMULATOR_HOST: emulatorHost("firestore"),
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: `http://${emulatorHost("auth")}`,
      VITE_AUTH_EMULATOR_URL: `http://${emulatorHost("auth")}`,
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      VITE_API_URL: "http://localhost:3100",
      CORS_ALLOWED_ORIGINS: "http://localhost:1420,http://tauri.localhost,tauri://localhost",
      AI_MODE: "fake",
      APP_ENV: "local",
    });
  });

  it("moves the web and desktop origins together when the ports are overridden", () => {
    const env = buildE2eEnv({ firebaseConfig, overrides: { E2E_WEB_PORT: "3110", E2E_DESKTOP_PORT: "1421" } });
    expect(env).toMatchObject({
      WEB_PORT: "3110",
      VITE_API_URL: "http://localhost:3110",
      CORS_ALLOWED_ORIGINS: "http://localhost:1421,http://tauri.localhost,tauri://localhost",
    });
  });

  it("refuses port 3000 and invalid ports, naming the variable", () => {
    expect(() => buildE2eEnv({ firebaseConfig, overrides: { E2E_WEB_PORT: "3000" } })).toThrow(InvalidE2eEnvError);
    expect(() => buildE2eEnv({ firebaseConfig, overrides: { E2E_DESKTOP_PORT: "abc" } })).toThrow(/E2E_DESKTOP_PORT/);
  });

  it("uses no port of the dev emulators, so both stacks can run at once", () => {
    const shared = ports(firebaseConfig).filter((port) => [...ports(devConfig), ...DEV_DEFAULT_PORTS].includes(port));
    expect(shared).toEqual([]);
  });
});

describe("buildEmulatorExecArgs", () => {
  it("runs the command inside the e2e project's auth, firestore, storage and functions emulators", () => {
    expect(buildEmulatorExecArgs("pnpm x")).toEqual([
      "--config",
      "firebase.e2e.json",
      "emulators:exec",
      "--project",
      E2E_PROJECT_ID,
      "--only",
      "auth,firestore,storage,functions",
      "pnpm x",
    ]);
  });
});

describe("the e2e command", () => {
  it("runs the Playwright script, which never goes through turbo run test:e2e (follow-up 87)", () => {
    expect(DEFAULT_E2E_COMMAND).toBe("node scripts/e2e-playwright.ts");
  });

  it("points the services at their own database in the local compose Postgres, never a remote one", () => {
    const env = buildE2eEnv({ firebaseConfig, overrides: {} });
    const url = new URL(env["DATABASE_URL"] ?? "");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe(`/${E2E_DATABASE_NAME}`);
  });

  it("keeps Postgres on 5432 and moves it with E2E_POSTGRES_PORT, naming the variable when it is invalid", () => {
    expect(new URL(buildE2eEnv({ firebaseConfig, overrides: {} })["DATABASE_URL"] ?? "").port).toBe("5432");
    const env = buildE2eEnv({ firebaseConfig, overrides: { E2E_POSTGRES_PORT: "15432" } });
    expect(env["DATABASE_URL"]).toBe(`postgresql://app:app@127.0.0.1:15432/${E2E_DATABASE_NAME}`);
    expect(() => buildE2eEnv({ firebaseConfig, overrides: { E2E_POSTGRES_PORT: "abc" } })).toThrow(/E2E_POSTGRES_PORT/);
  });

  it("starts the chat stack: storage and functions emulators, the agent runtime in fake mode and a long functions discovery", () => {
    const env = buildE2eEnv({ firebaseConfig, overrides: { E2E_MASTRA_PORT: "4192" } });
    expect(env).toMatchObject({
      FIREBASE_STORAGE_EMULATOR_HOST: emulatorHost("storage"),
      MASTRA_URL: "http://localhost:4192",
      E2E_MASTRA_ORIGIN: "http://localhost:4192",
      MASTRA_CORS_ORIGINS: "http://localhost:3100",
      FUNCTIONS_DISCOVERY_TIMEOUT: "180",
      AI_MODE: "fake",
    });
    expect(() => buildE2eEnv({ firebaseConfig, overrides: { E2E_MASTRA_PORT: "3000" } })).toThrow(/E2E_MASTRA_PORT/);
  });

  it("quotes passthrough arguments that hold spaces or shell operators", () => {
    expect(joinCommandArgs(["playwright", "test", "-g", "SMS code|theme", "--project=chromium"])).toBe(
      'playwright test -g "SMS code|theme" --project=chromium',
    );
  });
});
