import { describe, expect, it } from "vitest";
import type { ErrorEnvelope } from "../../../shared/http/error-envelope.ts";
import { makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { AgentCallScope, GatewayResult } from "../../application/ports/agent-runtime-gateway.ts";
import type { VoiceRuntimeGateway } from "../../application/ports/chat-runtime-gateway.ts";
import { buildVoiceRoutes } from "./realtime-session-route-handler.ts";
import { MAX_AUDIO_UPLOAD_BYTES } from "./voice-transcriptions-route-handler.ts";

const ORG = "OrgAaaaaaaaaaaaaaaaaa";
const OTHER = "OrgBbbbbbbbbbbbbbbbbb";
const REGIONAL = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 1]);

const setup = (script: { transcribe?: GatewayResult<unknown>; realtime?: GatewayResult<unknown> } = {}) => {
  const { pipeline } = makeInMemoryPipeline({ now: "2026-09-30T12:00:00.000Z", members: [{ uid: "alice", tenantId: ORG, role: "member" }] });
  const calls: { kind: string; scope: AgentCallScope; mediaType?: string; size?: number }[] = [];
  const voice: VoiceRuntimeGateway = {
    transcribe: ({ scope, audio, mediaType }) => {
      calls.push({ kind: "transcribe", scope, mediaType, size: audio.byteLength });
      return Promise.resolve(script.transcribe ?? { ok: true, data: { data: { text: "fake transcript", language: "en", durationInSeconds: 1 } } });
    },
    synthesize: ({ scope }) => {
      calls.push({ kind: "synthesize", scope });
      return Promise.resolve({ ok: true, data: { body: new Blob([new Uint8Array([0x49, 0x44, 0x33])]).stream(), contentType: "audio/mpeg" } });
    },
    createRealtimeSession: ({ scope }) => {
      calls.push({ kind: "realtime", scope });
      return Promise.resolve(script.realtime ?? { ok: false, error: { code: "FEATURE_UNAVAILABLE", status: 503 } });
    },
  };
  const routes = buildVoiceRoutes({
    pipeline,
    voice,
    resolveAccessContext: ({ principal, node }) =>
      Promise.resolve(node.level === "organization" && node.tenantId === ORG ? { tenantId: node.tenantId, principal: principal, permissions: [], regional: REGIONAL } : null),
  });
  return { routes, calls };
};

const upload = (routes: ReturnType<typeof setup>["routes"], bytes: Uint8Array<ArrayBuffer>, org = ORG, as: string | null = "alice") => {
  const form = new FormData();
  form.set("audio", new Blob([bytes], { type: "audio/webm" }), "clip.webm");
  const encoded = new Response(form);
  return encoded.arrayBuffer().then((body) =>
    routes["voice.transcribe"]!(
      new Request(`http://localhost/v1/voice/transcriptions?organizationId=${org}`, {
        method: "POST",
        headers: { "content-type": encoded.headers.get("content-type") ?? "", "content-length": String(body.byteLength), ...(as === null ? {} : { authorization: `Bearer ${as}-token` }) },
        body,
      }),
    ),
  );
};

const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;

describe("/v1/voice", () => {
  it("transcribes a recording identified by its magic bytes", async () => {
    const { routes, calls } = setup();
    const response = await upload(routes, WEBM);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { text: "fake transcript", language: "en", durationInSeconds: 1 } });
    expect(calls[0]).toMatchObject({ kind: "transcribe", mediaType: "audio/webm", size: WEBM.byteLength, scope: { tenantId: ORG, bearer: "alice-token" } });
  });

  it("rejects audio of another type, an oversized upload, a missing token and another organization", async () => {
    const { routes, calls } = setup();
    const notAudio = await upload(routes, new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]));
    expect(notAudio.status).toBe(400);
    expect((await errorOf(notAudio)).details).toEqual([{ field: "audio", issue: "TYPE_NOT_ALLOWED" }]);
    const big = new Uint8Array(MAX_AUDIO_UPLOAD_BYTES + 1);
    big.set(WEBM);
    expect((await errorOf(await upload(routes, big))).details).toEqual([{ field: "audio", issue: "TOO_LARGE" }]);
    expect((await upload(routes, WEBM, ORG, null)).status).toBe(401);
    expect((await upload(routes, WEBM, OTHER)).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("passes the voice gate through: 503 FEATURE_UNAVAILABLE while voice is off", async () => {
    const { routes } = setup({ transcribe: { ok: false, error: { code: "FEATURE_UNAVAILABLE", status: 503 } } });
    const refused = await upload(routes, WEBM);
    expect(refused.status).toBe(503);
    expect((await errorOf(refused)).code).toBe("FEATURE_UNAVAILABLE");
  });

  it("streams speech audio without caching it", async () => {
    const { routes } = setup();
    const response = await routes["voice.synthesize"]!(
      new Request(`http://localhost/v1/voice/speech?organizationId=${ORG}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer alice-token" },
        body: JSON.stringify({ text: "Read this aloud" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x49, 0x44, 0x33]));
  });

  it("answers 503 for realtime sessions in fake mode or with the flag off, and 201 with a secret otherwise", async () => {
    const realtime = (routes: ReturnType<typeof setup>["routes"]) =>
      routes["voice.createRealtimeSession"]!(new Request(`http://localhost/v1/voice/realtime-sessions?organizationId=${ORG}`, { method: "POST", headers: { authorization: "Bearer alice-token" } }));
    expect((await realtime(setup().routes)).status).toBe(503);
    const minted = await realtime(setup({ realtime: { ok: true, data: { data: { clientSecret: "ek_1", expiresAt: "2026-09-30T12:01:00.000Z", model: "gpt-realtime-2.1" } } } }).routes);
    expect(minted.status).toBe(201);
    expect(minted.headers.get("cache-control")).toBe("no-store");
  });
});
