import { describe, expect, it } from "vitest";
import { createModelProvider, FakeModeNotAllowedError, type ModelFactoryEnv } from "./model-factory.ts";
import type { ProviderFactories, ProviderSettings } from "./provider-registry.ts";
import type { ModelProvider } from "./model-roles.ts";

const baseEnv: ModelFactoryEnv = {
  APP_ENV: "local",
  AI_MODE: "fake",
  AI_MODEL_CHAT: "google/gemini-3.5-flash",
  AI_MODEL_FAST: "google/gemini-3.5-flash-lite",
  AI_MODEL_REASONING: "google/gemini-3.5-flash",
  AI_MODEL_JUDGE: "google/gemini-3.5-flash",
  AI_MODEL_EMBEDDING: "google/gemini-embedding-001",
  AI_MODEL_TRANSCRIPTION: "openai/gpt-transcribe",
  AI_MODEL_SPEECH: "openai/gpt-4o-mini-tts",
  GOOGLE_AI_BACKEND: "ai-studio",
};

type FactoryCall = { provider: ModelProvider; settings: ProviderSettings };

/** Records provider construction; models are plain descriptors (no network). */
const recordingFactories = (calls: FactoryCall[]): ProviderFactories => {
  const build = (provider: ModelProvider) => (settings: ProviderSettings) => {
    calls.push({ provider, settings });
    const model = (kind: string) => (modelId: string) => ({ kind, provider, modelId }) as never;
    return {
      specificationVersion: "v4" as const,
      languageModel: model("language"),
      embeddingModel: model("embedding"),
      imageModel: model("image"),
      transcriptionModel: model("transcription"),
      speechModel: model("speech"),
    };
  };
  return { google: build("google"), openai: build("openai"), anthropic: build("anthropic") };
};

describe("createModelProvider in fake mode", () => {
  it.each(["staging", "prod"] as const)("refuses fake models in %s even if the env check was skipped", (APP_ENV) => {
    const calls: FactoryCall[] = [];
    expect(() => createModelProvider({ ...baseEnv, APP_ENV }, { providerFactories: recordingFactories(calls) })).toThrow(FakeModeNotAllowedError);
    expect(calls).toEqual([]);
  });

  it("allows fake models in dev", () => {
    expect(createModelProvider({ ...baseEnv, APP_ENV: "dev" }).mode).toBe("fake");
  });

  it("never constructs a real provider", async () => {
    const calls: FactoryCall[] = [];
    const models = createModelProvider(baseEnv, { providerFactories: recordingFactories(calls) });
    const language = models.language("chat");
    await language.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] });
    await models.embedding().doEmbed({ values: ["hi"] });
    expect(models.transcription()).not.toBeNull();
    expect(models.speech()).not.toBeNull();
    expect(language.provider).toBe("fake");
    expect(calls).toEqual([]);
  });

  it("lets agents script keyword scenarios", async () => {
    const models = createModelProvider(baseEnv);
    models.registerFakeScenario("data", {
      id: "always-text",
      matches: () => true,
      respond: () => ({ text: "scripted" }),
    });
    const result = await models.language("chat", { agentId: "data" }).doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "anything" }] }],
    });
    expect(result.content).toEqual([{ type: "text", text: "scripted" }]);
  });
});

describe("createModelProvider in real mode", () => {
  const realEnv: ModelFactoryEnv = { ...baseEnv, AI_MODE: "real", GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key" };

  it("builds the role's provider with the key from env", () => {
    const calls: FactoryCall[] = [];
    const models = createModelProvider(realEnv, { providerFactories: recordingFactories(calls) });
    expect(models.language("chat")).toMatchObject({ kind: "language", modelId: "gemini-3.5-flash" });
    expect(models.language("fast")).toMatchObject({ modelId: "gemini-3.5-flash-lite" });
    expect(calls).toEqual([{ provider: "google", settings: { backend: "ai-studio", apiKey: "test-google-key" } }]);
  });

  it("uses Vertex project and location when the backend is vertex", () => {
    const calls: FactoryCall[] = [];
    const env: ModelFactoryEnv = {
      ...realEnv,
      GOOGLE_AI_BACKEND: "vertex",
      GOOGLE_VERTEX_PROJECT: "demo-project",
      GOOGLE_VERTEX_LOCATION: "southamerica-east1",
    };
    createModelProvider(env, { providerFactories: recordingFactories(calls) }).language("chat");
    expect(calls[0]?.settings).toEqual({ backend: "vertex", project: "demo-project", location: "southamerica-east1" });
  });

  it("returns configured fallbacks in order", () => {
    const models = createModelProvider(
      { ...realEnv, AI_MODEL_CHAT_FALLBACK: "anthropic/claude-sonnet-5", ANTHROPIC_API_KEY: "test-anthropic-key" },
      { providerFactories: recordingFactories([]) },
    );
    expect(models.languageFallbacks("chat")).toEqual([expect.objectContaining({ provider: "anthropic", modelId: "claude-sonnet-5" })]);
    expect(models.languageFallbacks("fast")).toEqual([]);
  });

  it("disables voice roles whose provider key is missing", () => {
    const models = createModelProvider(realEnv, { providerFactories: recordingFactories([]) });
    expect(models.transcription()).toBeNull();
    expect(models.speech()).toBeNull();
  });

  it("builds voice models when the key exists", () => {
    const models = createModelProvider({ ...realEnv, OPENAI_API_KEY: "test-openai-key" }, { providerFactories: recordingFactories([]) });
    expect(models.transcription()).toMatchObject({ kind: "transcription", provider: "openai", modelId: "gpt-transcribe" });
  });

  it("pins google embeddings to 1536 dimensions", () => {
    const models = createModelProvider(realEnv);
    expect(models.embeddingProviderOptions).toEqual({ google: { outputDimensionality: 1536 } });
    expect(models.embedding().modelId).toBe("gemini-embedding-001");
  });

  it("builds the default AI Studio provider without calling the network", () => {
    expect(createModelProvider(realEnv).language("chat").provider).toMatch(/^google/);
  });
});
