import { readProcessLogContext } from "@core/services";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { configureMastraProcessLogger } from "./process-log-context.ts";

// Same holder as @core/services' process logger (decision app/docs/decisions/0002).
const CONTEXT_KEY = Symbol.for("@core/services/process-log-context");
const holder = globalThis as { [CONTEXT_KEY]?: unknown };

describe("configureMastraProcessLogger", () => {
  let saved: unknown;

  beforeEach(() => {
    saved = holder[CONTEXT_KEY];
    delete holder[CONTEXT_KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete holder[CONTEXT_KEY];
    else holder[CONTEXT_KEY] = saved;
  });

  it("tags the shared process logger with service mastra and the validated APP_ENV", () => {
    const env = loadMastraEnv({
      APP_ENV: "staging",
      FIREBASE_PROJECT_ID: "acme-staging",
      DATABASE_URL: "postgresql://svc@10.0.0.5:5432/app",
      GOOGLE_GENERATIVE_AI_API_KEY: "google-test-key",
      MCP_REQUEST_STATE_KEY: "k".repeat(32),
      FILES_BUCKET: "acme-staging-files",
    });

    configureMastraProcessLogger(env);

    expect(readProcessLogContext()).toEqual({ service: "mastra", env: "staging" });
  });
});
