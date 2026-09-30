import { describe, expect, it } from "vitest";
import { buildSilentWav, createFakeSpeechModel, createFakeTranscriptionModel } from "../models/fake/fake-voice-models.ts";
import { createVoice, type CoreVoice } from "./create-voice.ts";
import {
  createVoiceRoutes,
  handleSpeech,
  handleTranscription,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_SPEECH_BODY_BYTES,
  SPEECH_ROUTE_PATH,
  TRANSCRIPTION_ROUTE_PATH,
} from "./voice-routes.ts";

const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";
const fakeVoice = (): CoreVoice | null => createVoice({ models: { transcription: () => createFakeTranscriptionModel(), speech: () => createFakeSpeechModel() } });
const silentLogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const deps = (voice: CoreVoice | null = fakeVoice()) => ({ voice, logger: silentLogger });

const audioRequest = (body: Uint8Array, contentType = "audio/webm", headers: Record<string, string> = {}) =>
  new Request(`http://mastra.local${TRANSCRIPTION_ROUTE_PATH}`, {
    method: "POST",
    headers: { "content-type": contentType, "x-request-id": REQUEST_ID, ...headers },
    body,
  });

const speechRequest = (body: unknown) =>
  new Request(`http://mastra.local${SPEECH_ROUTE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": REQUEST_ID },
    body: JSON.stringify(body),
  });

const errorOf = async (response: Response) => ((await response.json()) as { error: { code: string; requestId: string } }).error;

describe("voice routes", () => {
  it("registers both routes as authenticated POST routes outside the API prefix", () => {
    const routes = createVoiceRoutes(deps());
    expect(routes.map((route) => [route.method, route.path, route.requiresAuth])).toEqual([
      ["POST", "/voice/transcriptions", true],
      ["POST", "/voice/speech", true],
    ]);
  });

  describe("POST /voice/transcriptions", () => {
    it("answers the deterministic fake transcript", async () => {
      const response = await handleTranscription(audioRequest(new Uint8Array(42)), deps());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { text: "fake transcript 42 bytes", language: "en", durationInSeconds: 0 } });
    });

    it("accepts a codec parameter on the media type", async () => {
      const response = await handleTranscription(audioRequest(new Uint8Array(4), "audio/webm;codecs=opus"), deps());
      expect(response.status).toBe(200);
    });

    it("answers 503 FEATURE_UNAVAILABLE when voice is off (keys missing)", async () => {
      const response = await handleTranscription(audioRequest(new Uint8Array(4)), deps(null));
      expect(response.status).toBe(503);
      expect(await errorOf(response)).toMatchObject({ code: "FEATURE_UNAVAILABLE", requestId: REQUEST_ID });
    });

    it("refuses an unsupported media type with 415", async () => {
      const response = await handleTranscription(audioRequest(new Uint8Array(4), "text/plain"), deps());
      expect(response.status).toBe(415);
      expect((await errorOf(response)).code).toBe("UNSUPPORTED_MEDIA_TYPE");
    });

    it("refuses an empty body with 400", async () => {
      const response = await handleTranscription(audioRequest(new Uint8Array(0)), deps());
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("VALIDATION_FAILED");
    });

    it("refuses audio over 5 MB with 413 before calling the model", async () => {
      const response = await handleTranscription(audioRequest(new Uint8Array(MAX_AUDIO_BYTES + 1)), deps());
      expect(response.status).toBe(413);
      expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
    });

    it("refuses a WAV longer than 60 s from its header, before calling the model", async () => {
      const wav = buildSilentWav(MAX_AUDIO_SECONDS + 1, 8000);
      const response = await handleTranscription(audioRequest(wav, "audio/wav"), deps());
      expect(response.status).toBe(422);
      expect((await errorOf(response)).code).toBe("AUDIO_TOO_LONG");
    });

    it("refuses a transcript whose reported duration exceeds 60 s", async () => {
      const voice = fakeVoice();
      const long = voice === null ? null : { ...voice, transcribe: () => Promise.resolve({ text: "x", language: "en", durationInSeconds: 61 }) };
      const response = await handleTranscription(audioRequest(new Uint8Array(4)), deps(long));
      expect(response.status).toBe(422);
    });

    it("maps a provider failure to 502 without leaking the message", async () => {
      const voice = fakeVoice();
      const broken = voice === null ? null : { ...voice, transcribe: () => Promise.reject(new Error("provider said secret-thing")) };
      const response = await handleTranscription(audioRequest(new Uint8Array(4)), deps(broken));
      expect(response.status).toBe(502);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("UPSTREAM_UNAVAILABLE");
      expect(body).not.toContain("secret-thing");
    });
  });

  describe("POST /voice/speech", () => {
    it("streams a WAV for the fake model", async () => {
      const response = await handleSpeech(speechRequest({ text: "Hello there" }), deps());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("audio/wav");
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    });

    it("answers 503 FEATURE_UNAVAILABLE when voice is off", async () => {
      const response = await handleSpeech(speechRequest({ text: "Hello" }), deps(null));
      expect(response.status).toBe(503);
      expect((await errorOf(response)).code).toBe("FEATURE_UNAVAILABLE");
    });

    it("answers 503 when only transcription is configured", async () => {
      const onlyStt = createVoice({ models: { transcription: () => createFakeTranscriptionModel(), speech: () => null } });
      const response = await handleSpeech(speechRequest({ text: "Hello" }), deps(onlyStt));
      expect(response.status).toBe(503);
    });

    it("validates the body strictly (400 with every field)", async () => {
      const response = await handleSpeech(speechRequest({ text: "", extra: true }), deps());
      expect(response.status).toBe(400);
      const error = (await response.json()) as { error: { code: string; details: { field: string }[] } };
      expect(error.error.code).toBe("VALIDATION_FAILED");
      expect(error.error.details.map((detail) => detail.field).sort()).toEqual(["", "text"]);
    });

    it("refuses a body over 64 KiB with 413 before parsing it", async () => {
      const response = await handleSpeech(speechRequest({ text: "x".repeat(MAX_SPEECH_BODY_BYTES) }), deps());
      expect(response.status).toBe(413);
      expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
    });

    it("refuses a body that is not JSON with 400", async () => {
      const request = new Request(`http://mastra.local${SPEECH_ROUTE_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
      const response = await handleSpeech(request, deps());
      expect(response.status).toBe(400);
    });
  });
});
