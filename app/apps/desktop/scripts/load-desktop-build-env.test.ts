import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidDesktopEnvError } from "../src/config/desktop-env.schema.ts";
import { loadDesktopBuildEnv } from "./load-desktop-build-env.ts";

let envDir: string;

const REMOTE_ENV = [
  "VITE_APP_ENV=staging",
  "VITE_FIREBASE_API_KEY=public-key",
  "VITE_FIREBASE_AUTH_DOMAIN=demo.firebaseapp.com",
  "VITE_FIREBASE_PROJECT_ID=demo",
  "VITE_MFA_FACTORS=totp",
].join("\n");

beforeEach(() => {
  envDir = mkdtempSync(path.join(tmpdir(), "desktop-env-"));
});

afterEach(() => {
  rmSync(envDir, { recursive: true, force: true });
});

describe("loadDesktopBuildEnv", () => {
  it("reads the env from the mode's env file, as Vite does", () => {
    writeFileSync(path.join(envDir, ".env.production"), `VITE_API_URL=https://api.example.com\n${REMOTE_ENV}\n`);

    expect(loadDesktopBuildEnv({ mode: "production", envDir })).toMatchObject({ VITE_API_URL: "https://api.example.com", VITE_APP_ENV: "staging", VITE_MFA_FACTORS: ["totp"] });
  });

  it("fails closed when the mode has no VITE_API_URL", () => {
    writeFileSync(path.join(envDir, ".env.development"), `VITE_API_URL=http://localhost:3100\n${REMOTE_ENV}\n`);
    writeFileSync(path.join(envDir, ".env.production"), `${REMOTE_ENV}\n`);

    expect(() => loadDesktopBuildEnv({ mode: "production", envDir })).toThrow(InvalidDesktopEnvError);
  });

  it("fails closed on an invalid value, naming only the variable", () => {
    writeFileSync(path.join(envDir, ".env.production"), `VITE_API_URL=http://api.example.com\n${REMOTE_ENV}\n`);

    expect(() => loadDesktopBuildEnv({ mode: "production", envDir })).toThrow(/^invalid environment: VITE_API_URL$/);
  });
});
