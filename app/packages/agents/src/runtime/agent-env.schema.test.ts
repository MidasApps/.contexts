import { InvalidEnvError } from "@core/services";
import { describe, expect, it } from "vitest";
import { AgentEnvSchema, findAgentEnvIssues, resolveAgentEnv, type AgentRuntimeFlags } from "./agent-env.schema.ts";

type Source = Record<string, string | undefined>;

const LOCAL_FAKE: AgentRuntimeFlags = { APP_ENV: "local", AI_MODE: "fake" };
const PROD_REAL: AgentRuntimeFlags = { APP_ENV: "prod", AI_MODE: "real" };
const PROD_SOURCE: Source = {
  GOOGLE_GENERATIVE_AI_API_KEY: "google-test-key",
  MCP_REQUEST_STATE_KEY: "k".repeat(32),
};

const load = (source: Source, flags: AgentRuntimeFlags = LOCAL_FAKE) =>
  resolveAgentEnv({ ...AgentEnvSchema.parse(source), ...flags });

const issueFields = (source: Source, flags: AgentRuntimeFlags) =>
  findAgentEnvIssues({ ...AgentEnvSchema.parse(source), ...flags }).map((issue) => issue.field);

const schemaIssueFields = (source: Source) => {
  const result = AgentEnvSchema.safeParse(source);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("AgentEnvSchema defaults", () => {
  it("uses the spec model per role and leaves fallbacks unset", () => {
    expect(load({})).toMatchObject({
      AI_MODEL_CHAT: "google/gemini-3.5-flash",
      AI_MODEL_FAST: "google/gemini-3.5-flash-lite",
      AI_MODEL_REASONING: "google/gemini-3.5-flash",
      AI_MODEL_JUDGE: "google/gemini-3.5-flash",
      AI_MODEL_EMBEDDING: "google/gemini-embedding-2",
      AI_MODEL_TRANSCRIPTION: "openai/gpt-transcribe",
      AI_MODEL_SPEECH: "openai/gpt-4o-mini-tts",
      AI_MODEL_REALTIME: "openai/gpt-realtime-2.1",
    });
    expect(load({}).AI_MODEL_CHAT_FALLBACK).toBeUndefined();
  });

  it("defaults the runtime switches to the conservative local values", () => {
    const env = load({});

    expect(env).toMatchObject({
      GOOGLE_AI_BACKEND: "ai-studio",
      AI_MEMORY_OBSERVATIONAL: false,
      AI_KB_RERANK: false,
      MASTRA_PUBSUB: "memory",
      MASTRA_STORAGE_INIT: "auto",
      USAGE_SINK: "none",
      BIGQUERY_DATASET_AI_OBSERVABILITY: "ai_observability",
    });
    expect(Buffer.byteLength(env.MCP_REQUEST_STATE_KEY)).toBeGreaterThanOrEqual(32);
  });

  it("treats empty provider keys from .env files as unset", () => {
    expect(load({ OPENAI_API_KEY: "", GOOGLE_GENERATIVE_AI_API_KEY: "" })).toMatchObject({
      OPENAI_API_KEY: undefined,
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    });
  });

  it("parses boolean switches from the literal strings only", () => {
    expect(load({ AI_MEMORY_OBSERVATIONAL: "true", AI_KB_RERANK: "false" })).toMatchObject({
      AI_MEMORY_OBSERVATIONAL: true,
      AI_KB_RERANK: false,
    });
    expect(schemaIssueFields({ AI_KB_RERANK: "yes" })).toEqual(["AI_KB_RERANK"]);
  });

  it("rejects model ids without a supported provider prefix", () => {
    expect(schemaIssueFields({ AI_MODEL_CHAT: "gemini-3.5-flash", AI_MODEL_FAST_FALLBACK: "acme/model" })).toEqual([
      "AI_MODEL_CHAT",
      "AI_MODEL_FAST_FALLBACK",
    ]);
  });
});

describe("AI_MODE per environment", () => {
  it("allows fake only in local and dev", () => {
    expect(issueFields({}, { APP_ENV: "dev", AI_MODE: "fake" })).toEqual(["MCP_REQUEST_STATE_KEY"]);
    expect(issueFields(PROD_SOURCE, { APP_ENV: "staging", AI_MODE: "fake" })).toEqual(["AI_MODE"]);
    expect(issueFields(PROD_SOURCE, { APP_ENV: "prod", AI_MODE: "fake" })).toEqual(["AI_MODE"]);
  });
});

describe("provider keys in real mode", () => {
  it("fails naming GOOGLE_GENERATIVE_AI_API_KEY when AI Studio serves the text roles", () => {
    const boot = () => load({ ...PROD_SOURCE, GOOGLE_GENERATIVE_AI_API_KEY: undefined }, PROD_REAL);

    expect(boot).toThrow(InvalidEnvError);
    expect(boot).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("keeps voice keys optional: voice features turn off instead of failing the boot", () => {
    expect(load(PROD_SOURCE, PROD_REAL).OPENAI_API_KEY).toBeUndefined();
  });

  it("requires the key of an overridden text role and of a configured fallback", () => {
    const source = { ...PROD_SOURCE, AI_MODEL_FAST: "anthropic/claude-haiku-5", AI_MODEL_CHAT_FALLBACK: "openai/gpt-5.5" };

    expect(issueFields(source, PROD_REAL)).toEqual(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]);
  });

  it("asks Vertex for project and location instead of an API key", () => {
    const source = { MCP_REQUEST_STATE_KEY: "k".repeat(32), GOOGLE_AI_BACKEND: "vertex" };

    expect(issueFields(source, PROD_REAL)).toEqual(["GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION"]);
    expect(
      issueFields({ ...source, GOOGLE_VERTEX_PROJECT: "acme-prod", GOOGLE_VERTEX_LOCATION: "us-central1" }, PROD_REAL),
    ).toEqual([]);
  });

  it("needs no provider key in fake mode", () => {
    expect(issueFields({}, LOCAL_FAKE)).toEqual([]);
  });

  it("names the variables but never their values", () => {
    const boot = () => load({ ...PROD_SOURCE, MCP_REQUEST_STATE_KEY: "s3cr3t-short" }, PROD_REAL);

    expect(boot).toThrow(/MCP_REQUEST_STATE_KEY/);
    expect(boot).not.toThrow(/s3cr3t/);
  });
});

describe("remote-only requirements", () => {
  it("requires an MCP request state key of at least 32 bytes outside local", () => {
    expect(issueFields({ ...PROD_SOURCE, MCP_REQUEST_STATE_KEY: undefined }, PROD_REAL)).toEqual(["MCP_REQUEST_STATE_KEY"]);
    expect(issueFields({ ...PROD_SOURCE, MCP_REQUEST_STATE_KEY: "k".repeat(31) }, PROD_REAL)).toEqual([
      "MCP_REQUEST_STATE_KEY",
    ]);
  });

  it("skips Mastra storage init outside local unless told otherwise, and refuses auto there", () => {
    expect(load(PROD_SOURCE, PROD_REAL).MASTRA_STORAGE_INIT).toBe("skip");
    expect(issueFields({ ...PROD_SOURCE, MASTRA_STORAGE_INIT: "auto" }, PROD_REAL)).toEqual(["MASTRA_STORAGE_INIT"]);
    expect(load({ MASTRA_STORAGE_INIT: "skip" }).MASTRA_STORAGE_INIT).toBe("skip");
  });

  it("puts the event bus on Google Cloud Pub/Sub outside local unless told otherwise", () => {
    expect(load({}).MASTRA_PUBSUB).toBe("memory");
    expect(load(PROD_SOURCE, PROD_REAL).MASTRA_PUBSUB).toBe("gcp");
    expect(load({ ...PROD_SOURCE, MASTRA_PUBSUB: "memory" }, PROD_REAL).MASTRA_PUBSUB).toBe("memory");
  });

  it("keeps voice off outside local until it is switched on, and realtime off everywhere by default (decision 0034)", () => {
    expect(load({})).toMatchObject({ AI_VOICE_ENABLED: true, AI_VOICE_REALTIME_ENABLED: false });
    expect(load(PROD_SOURCE, PROD_REAL)).toMatchObject({ AI_VOICE_ENABLED: false, AI_VOICE_REALTIME_ENABLED: false });
    expect(load({ ...PROD_SOURCE, AI_VOICE_ENABLED: "true" }, PROD_REAL).AI_VOICE_ENABLED).toBe(true);
    expect(load({ AI_VOICE_ENABLED: "false", AI_VOICE_REALTIME_ENABLED: "true" })).toMatchObject({ AI_VOICE_ENABLED: false, AI_VOICE_REALTIME_ENABLED: true });
  });

  it("accepts a plain-http Firecrawl URL only in local (a self-hosted Firecrawl on the developer machine)", () => {
    expect(issueFields({ ...PROD_SOURCE, FIRECRAWL_API_URL: "http://firecrawl.internal.example.com" }, PROD_REAL)).toEqual(["FIRECRAWL_API_URL"]);
    expect(issueFields({ ...PROD_SOURCE, FIRECRAWL_API_URL: "https://firecrawl.internal.example.com" }, PROD_REAL)).toEqual([]);
    expect(issueFields({ FIRECRAWL_API_URL: "http://localhost:3002" }, LOCAL_FAKE)).toEqual([]);
  });
});
