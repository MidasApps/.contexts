import type { UpdateModelSettingsInput } from "@core/contracts";
import { createInMemoryModelSettingsRepository, type ModelSettingsRepository } from "@core/services";
import { describe, expect, it } from "vitest";
import { createModelProvider, type ModelFactoryEnv } from "./model-factory.ts";
import { MODEL_PRICES } from "./model-prices.ts";
import { createModelSettingsService } from "./model-settings.ts";

const ENV = {
  AI_MODEL_CHAT: "google/gemini-3.5-flash",
  AI_MODEL_FAST: "google/gemini-3.5-flash-lite",
  AI_MODEL_REASONING: "google/gemini-3.5-flash",
  AI_MODEL_JUDGE: "google/gemini-3.5-flash",
  AI_MODEL_EMBEDDING: "google/gemini-embedding-2",
  AI_MODEL_TRANSCRIPTION: "openai/gpt-transcribe",
  AI_MODEL_SPEECH: "openai/gpt-4o-mini-tts",
  AI_MODEL_REALTIME: "openai/gpt-realtime-2.1",
} as const;

const INPUT: UpdateModelSettingsInput = {
  roles: {
    chat: "openai/gpt-6-sol",
    fast: "openai/gpt-6-luna",
    reasoning: "openai/gpt-6-sol",
    judge: "openai/gpt-6-luna",
  },
  models: [{ modelId: "openai/gpt-6-luna", inputMicroUsdPerMTok: 150_000, outputMicroUsdPerMTok: 600_000 }],
};

const setup = (options: { store?: ModelSettingsRepository; aiMode?: "fake" | "real"; configured?: string[] } = {}) => {
  let clock = Date.parse("2026-10-05T12:00:00.000Z");
  const warnings: string[] = [];
  const store = options.store ?? createInMemoryModelSettingsRepository();
  const service = createModelSettingsService({
    store,
    env: ENV,
    aiMode: options.aiMode ?? "real",
    codePrices: MODEL_PRICES,
    isConfigured: (provider) => (options.configured ?? ["google", "openai"]).includes(provider),
    logger: { warn: (message) => void warnings.push(message) },
    now: () => new Date(clock),
  });
  return {
    service,
    store,
    warnings,
    advance: (ms: number): void => {
      clock += ms;
    },
  };
};

describe("model settings", () => {
  it("follows the environment and the code prices until staff saves", async () => {
    const { service } = setup();
    const view = await service.view();
    expect(service.modelIdOf("chat")).toBe("google/gemini-3.5-flash");
    expect(service.prices()).toEqual(MODEL_PRICES);
    expect(view.updatedAt).toBeNull();
    expect(view.roles.map((role) => [role.role, role.modelId, role.source, role.editable])).toEqual([
      ["chat", "google/gemini-3.5-flash", "environment", true],
      ["fast", "google/gemini-3.5-flash-lite", "environment", true],
      ["reasoning", "google/gemini-3.5-flash", "environment", true],
      ["judge", "google/gemini-3.5-flash", "environment", true],
      ["embedding", "google/gemini-embedding-2", "environment", false],
      ["transcription", "openai/gpt-transcribe", "environment", false],
      ["speech", "openai/gpt-4o-mini-tts", "environment", false],
      ["realtime", "openai/gpt-realtime-2.1", "environment", false],
    ]);
    expect(view.models.every((model) => model.source === "code" && model.available)).toBe(true);
  });

  it("serves what staff saved at once, with the staff price over the code price", async () => {
    const { service, store } = setup();
    const saved = await service.update(INPUT, "sam");
    expect(saved.ok).toBe(true);
    expect(service.modelIdOf("chat")).toBe("openai/gpt-6-sol");
    expect(service.modelIdOf("fast")).toBe("openai/gpt-6-luna");
    expect(service.prices()["openai/gpt-6-luna"]).toEqual({
      inputMicroUsdPerMTok: 150_000,
      outputMicroUsdPerMTok: 600_000,
    });
    expect(service.prices()["openai/gpt-6-sol"]).toEqual(MODEL_PRICES["openai/gpt-6-sol"]);
    const view = await service.view();
    expect(view.updatedAt).toBe("2026-10-05T12:00:00.000Z");
    expect(view.roles.find((role) => role.role === "chat")).toMatchObject({ source: "staff" });
    expect(view.models.find((model) => model.modelId === "openai/gpt-6-luna")).toMatchObject({ source: "staff" });
    expect(await store.get()).toMatchObject({ roles: INPUT.roles });
  });

  it("refuses a role on a model without a price, and on a provider without a key", async () => {
    const { service, store } = setup({ configured: ["google"] });
    expect(await service.update({ ...INPUT, roles: { ...INPUT.roles, chat: "openai/gpt-9" } }, "sam")).toEqual({
      ok: false,
      error: { code: "VALIDATION_FAILED", field: "roles.chat", issue: "UNPRICED" },
    });
    expect(await service.update(INPUT, "sam")).toEqual({
      ok: false,
      error: { code: "VALIDATION_FAILED", field: "roles.chat", issue: "PROVIDER_NOT_CONFIGURED" },
    });
    expect(await store.get()).toBeNull();
    const sol = (await service.view()).models.find((model) => model.modelId === "openai/gpt-6-sol");
    expect(sol?.available).toBe(false);
  });

  it("refuses a text role on an embedding model, and says which models are embeddings", async () => {
    const { service } = setup();
    expect(
      await service.update({ ...INPUT, roles: { ...INPUT.roles, chat: "openai/text-embedding-3-small" } }, "sam"),
    ).toEqual({ ok: false, error: { code: "VALIDATION_FAILED", field: "roles.chat", issue: "NOT_A_TEXT_MODEL" } });
    const kinds = Object.fromEntries((await service.view()).models.map((model) => [model.modelId, model.kind]));
    expect(kinds["openai/text-embedding-3-small"]).toBe("embedding");
    expect(kinds["openai/gpt-6-sol"]).toBe("text");
  });

  it("accepts a model staff priced themselves, and does not ask for keys in fake mode", async () => {
    const { service } = setup({ aiMode: "fake", configured: [] });
    const input: UpdateModelSettingsInput = {
      roles: { ...INPUT.roles, chat: "anthropic/claude-new" },
      models: [{ modelId: "anthropic/claude-new", inputMicroUsdPerMTok: 1, outputMicroUsdPerMTok: 2 }],
    };
    expect((await service.update(input, "sam")).ok).toBe(true);
  });

  it("picks up a change saved by another instance after the copy expires, without waiting", async () => {
    const store = createInMemoryModelSettingsRepository();
    const { service, advance } = setup({ store });
    await service.refresh();
    await store.save({ ...INPUT, updatedAt: "2026-10-05T12:00:30.000Z", actorId: "sam" });
    advance(30_000);
    expect(service.modelIdOf("chat")).toBe("google/gemini-3.5-flash");
    advance(30_000);
    // The expired copy is still served by this call; the read it starts lands right after.
    expect(service.modelIdOf("chat")).toBe("google/gemini-3.5-flash");
    await service.refresh();
    expect(service.modelIdOf("chat")).toBe("openai/gpt-6-sol");
  });

  it("keeps serving the last copy when the store fails", async () => {
    const good = createInMemoryModelSettingsRepository();
    let failing = false;
    const store: ModelSettingsRepository = {
      get: () => (failing ? Promise.reject(new Error("store down")) : good.get()),
      save: (input) => good.save(input),
    };
    const { service, warnings } = setup({ store });
    await service.update(INPUT, "sam");
    failing = true;
    await service.refresh();
    expect(service.modelIdOf("chat")).toBe("openai/gpt-6-sol");
    expect(warnings).toEqual(["model_settings_read_failed"]);
  });
});

describe("a role model resolved per call", () => {
  it("calls the model the role names now, so a change needs no restart", async () => {
    const env: ModelFactoryEnv = {
      ...ENV,
      APP_ENV: "local",
      AI_MODE: "real",
      GOOGLE_AI_BACKEND: "ai-studio",
      GOOGLE_GENERATIVE_AI_API_KEY: "g",
      OPENAI_API_KEY: "o",
    };
    const called: string[] = [];
    const build = (provider: string) => () => ({
      specificationVersion: "v4" as const,
      languageModel: (modelId: string) =>
        ({
          specificationVersion: "v4",
          provider,
          modelId,
          supportedUrls: {},
          doGenerate: () => {
            called.push(`${provider}/${modelId}`);
            return Promise.resolve({});
          },
        }) as never,
      embeddingModel: () => ({}) as never,
      imageModel: () => ({}) as never,
    });
    let chat = "google/gemini-3.5-flash";
    const models = createModelProvider(env, {
      providerFactories: { google: build("google"), openai: build("openai"), anthropic: build("anthropic") },
      modelIdOf: () => chat,
    });
    const model = models.language("chat");
    await model.doGenerate({ prompt: [] });
    expect([model.provider, model.modelId]).toEqual(["google", "gemini-3.5-flash"]);
    chat = "openai/gpt-6-sol";
    await model.doGenerate({ prompt: [] });
    expect([model.provider, model.modelId]).toEqual(["openai", "gpt-6-sol"]);
    expect(called).toEqual(["google/gemini-3.5-flash", "openai/gpt-6-sol"]);
  });
});
