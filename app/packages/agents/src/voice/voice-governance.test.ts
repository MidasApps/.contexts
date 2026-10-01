import type { LlmCall } from "@core/contracts";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { createFakeSpeechModel, createFakeTranscriptionModel } from "../models/fake/fake-voice-models.ts";
import type { AuditEntry, BudgetCheck } from "../runtime/runtime-ports.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createVoice } from "./create-voice.ts";
import { createVoiceGovernance } from "./voice-governance.ts";
import { handleRealtimeSession, handleSpeech, handleTranscription } from "./voice-routes.ts";

const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";
const silentLogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const voice = createVoice({ models: { transcription: () => createFakeTranscriptionModel(), speech: () => createFakeSpeechModel() } });

const setup = (options: { enabled?: boolean; realtime?: boolean; offFor?: string; budget?: BudgetCheck | "fails" } = {}) => {
  const rows: LlmCall[] = [];
  const audits: AuditEntry[] = [];
  const usage = {
    recordLlmCalls: (calls: readonly LlmCall[]) => Promise.resolve(void rows.push(...calls)),
    checkTenantBudget: (): Promise<BudgetCheck> => {
      const budget = options.budget;
      if (budget === "fails") return Promise.reject(new Error("ledger down"));
      return Promise.resolve(budget ?? { allowed: true, alert: false });
    },
  };
  const audit = { record: (entry: AuditEntry) => Promise.resolve(void audits.push(entry)) };
  const governance = createVoiceGovernance({
    isEnabled: ({ tenantId, feature }) =>
      Promise.resolve(tenantId !== options.offFor && (feature === "voice" ? (options.enabled ?? true) : (options.realtime ?? true))),
    usage,
    audit,
    logger: silentLogger,
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    newId: () => "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
  });
  return { rows, audits, deps: { voice, logger: silentLogger, governance } };
};

const memberContext = () => new RequestContext<unknown>(buildAgentContextEntries({ permissions: ["core.chat.use"] }));
const audio = () => new Request("http://mastra.local/voice/transcriptions", { method: "POST", headers: { "content-type": "audio/webm", "x-request-id": REQUEST_ID }, body: new Uint8Array(8) });
const speech = () =>
  new Request("http://mastra.local/voice/speech", { method: "POST", headers: { "content-type": "application/json", "x-request-id": REQUEST_ID }, body: JSON.stringify({ text: "Hello" }) });
const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

describe("voice governance (SP3 follow-ups #29 and #30)", () => {
  it("records a usage-ledger row and an audit entry for each provider call", async () => {
    const { rows, audits, deps } = setup();
    expect((await handleTranscription(audio(), deps, memberContext())).status).toBe(200);
    expect((await handleSpeech(speech(), deps, memberContext())).status).toBe(200);
    expect(rows.map((row) => [row.agentId, row.provider, row.model, row.tenantId, row.userId, row.costMicroUsd, row.inputTokens])).toEqual([
      ["voice-transcription", "fake", "fake-transcription", TEST_TENANT, TEST_UID, null, 0],
      ["voice-speech", "fake", "fake-speech", TEST_TENANT, TEST_UID, null, 0],
    ]);
    expect(audits.map((entry) => [entry.action, entry.tenantId, entry.target?.type])).toEqual([
      ["VOICE_TRANSCRIBED", TEST_TENANT, "voice-call"],
      ["VOICE_SYNTHESIZED", TEST_TENANT, "voice-call"],
    ]);
    expect(Object.keys(audits[0]?.metadata ?? {})).toEqual(["durationMs"]);
  });

  it("answers 503 for the one tenant whose chat.voice flag is off, after reading its context (decision 0039)", async () => {
    const { rows, deps } = setup({ offFor: TEST_TENANT });
    const response = await handleSpeech(speech(), deps, memberContext());
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe("FEATURE_UNAVAILABLE");
    expect(rows).toEqual([]);
    expect((await handleSpeech(speech(), setup({ offFor: "OtherTenantaaaaaaaaaa" }).deps, memberContext())).status).toBe(200);
  });

  it("refuses a realtime session while chat.voice.realtime is off, even with a minter", async () => {
    const realtime = { mint: () => Promise.resolve({ clientSecret: "ek_test", expiresAt: "2026-09-30T12:01:00.000Z", model: "gpt-realtime-2.1" }) };
    const { deps } = setup({ realtime: false });
    const response = await handleRealtimeSession(new Request("http://mastra.local/voice/realtime-sessions", { method: "POST" }), { ...deps, realtime }, memberContext());
    expect(response.status).toBe(503);
  });

  it("answers 503 FEATURE_UNAVAILABLE while the voice flag is off, before any provider call", async () => {
    const { rows, deps } = setup({ enabled: false });
    const response = await handleTranscription(audio(), deps, memberContext());
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe("FEATURE_UNAVAILABLE");
    expect(rows).toEqual([]);
  });

  it("refuses a call over budget (429) and fails closed when the ledger is down (503)", async () => {
    const over = setup({ budget: { allowed: false, reason: "BUDGET_EXCEEDED" } });
    const refused = await handleSpeech(speech(), over.deps, memberContext());
    expect(refused.status).toBe(429);
    expect(await codeOf(refused)).toBe("BUDGET_EXCEEDED");
    expect((await handleSpeech(speech(), setup({ budget: "fails" }).deps, memberContext())).status).toBe(503);
  });

  it("answers 403 without the caller's verified context", async () => {
    expect((await handleTranscription(audio(), setup().deps, undefined)).status).toBe(403);
  });

  it("keeps realtime off without a minter (flag off, fake mode or no key)", async () => {
    const response = await handleRealtimeSession(new Request("http://mastra.local/voice/realtime-sessions", { method: "POST" }), setup().deps, memberContext());
    expect(response.status).toBe(503);
  });

  it("mints a realtime session through the minter after the budget check", async () => {
    const { deps } = setup();
    const realtime = { mint: () => Promise.resolve({ clientSecret: "ek_test", expiresAt: "2026-09-30T12:01:00.000Z", model: "gpt-realtime-2.1" }) };
    const response = await handleRealtimeSession(new Request("http://mastra.local/voice/realtime-sessions", { method: "POST" }), { ...deps, realtime }, memberContext());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { clientSecret: "ek_test", expiresAt: "2026-09-30T12:01:00.000Z", model: "gpt-realtime-2.1" } });
  });
});
