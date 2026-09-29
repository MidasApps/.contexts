import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidDesktopEnvError } from "../src/config/desktop-env.schema.ts";
import { loadDesktopBuildEnv } from "./load-desktop-build-env.ts";

let envDir: string;

beforeEach(() => {
  envDir = mkdtempSync(path.join(tmpdir(), "desktop-env-"));
});

afterEach(() => {
  rmSync(envDir, { recursive: true, force: true });
});

describe("loadDesktopBuildEnv", () => {
  it("reads VITE_API_URL from the mode's env file, as Vite does", () => {
    writeFileSync(path.join(envDir, ".env.production"), "VITE_API_URL=https://api.example.com\n");

    expect(loadDesktopBuildEnv({ mode: "production", envDir })).toEqual({ VITE_API_URL: "https://api.example.com" });
  });

  it("fails closed when the mode has no VITE_API_URL", () => {
    writeFileSync(path.join(envDir, ".env.development"), "VITE_API_URL=http://localhost:3000\n");

    expect(() => loadDesktopBuildEnv({ mode: "production", envDir })).toThrow(InvalidDesktopEnvError);
  });

  it("fails closed on an invalid value, naming only the variable", () => {
    writeFileSync(path.join(envDir, ".env.production"), "VITE_API_URL=http://api.example.com\n");

    expect(() => loadDesktopBuildEnv({ mode: "production", envDir })).toThrow(/^invalid environment: VITE_API_URL$/);
  });
});
