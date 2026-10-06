import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "../../application/ports/agent-runtime-gateway.ts";
import { createMastraVoiceGateway } from "./mastra-voice-gateway.ts";

const SCOPE: AgentCallScope = {
  bearer: "user-token",
  tenantId: "org-1",
  regional: {
    locale: "pt-BR",
    displayTimeZone: "America/Sao_Paulo",
    nodeTimeZone: "America/Sao_Paulo",
    currency: "BRL",
  },
  requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
};

const gatewayAnswering = (answer: () => Response) =>
  createMastraVoiceGateway({
    baseUrl: "http://mastra.local",
    serverlessToken: null,
    fetch: () => Promise.resolve(answer()),
  });

const transcribe = (answer: () => Response) =>
  gatewayAnswering(answer).transcribe({ scope: SCOPE, audio: new Uint8Array([1, 2, 3]), mediaType: "audio/webm" });

describe("Mastra voice gateway errors", () => {
  it("answers FEATURE_DISABLED for the kill-switch 503, ahead of the voice gate mapping", async () => {
    const result = await transcribe(() =>
      Response.json({ error: { code: "FEATURE_DISABLED", message: "This feature is turned off." } }, { status: 503 }),
    );
    expect(result).toEqual({ ok: false, error: { code: "FEATURE_DISABLED", status: 503 } });
  });

  it("keeps the voice gate: 503 FEATURE_UNAVAILABLE, and a bare 503 maps to FEATURE_UNAVAILABLE", async () => {
    expect(await transcribe(() => Response.json({ error: { code: "FEATURE_UNAVAILABLE" } }, { status: 503 }))).toEqual({
      ok: false,
      error: { code: "FEATURE_UNAVAILABLE", status: 503 },
    });
    expect(await transcribe(() => new Response(null, { status: 503 }))).toEqual({
      ok: false,
      error: { code: "FEATURE_UNAVAILABLE", status: 503 },
    });
  });

  it("keeps the tenant budget refusal: 429 BUDGET_EXCEEDED, not RATE_LIMITED (follow-up #29)", async () => {
    const result = await transcribe(() =>
      Response.json(
        { error: { code: "BUDGET_EXCEEDED", message: "The organization reached its AI budget." } },
        { status: 429 },
      ),
    );
    expect(result).toEqual({ ok: false, error: { code: "BUDGET_EXCEEDED", status: 429 } });
  });

  it("maps a refused audio by status when its code is not a core code", async () => {
    const result = await transcribe(() => Response.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, { status: 413 }));
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION_FAILED", status: 400 } });
  });
});
