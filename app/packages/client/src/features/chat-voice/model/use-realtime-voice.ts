"use client";

import type { RealtimeSession } from "@core/contracts";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "#/shared/api/api-error.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { createRealtimeSession } from "../api/voice-api.ts";

/** A live realtime voice connection; `close` ends the call and releases the microphone. */
export type RealtimeConnection = { readonly close: () => void };

/** Connects the browser to the provider with the ephemeral secret (WebRTC); injected so it can be faked. */
export type RealtimeConnector = (session: RealtimeSession) => Promise<RealtimeConnection>;

export type RealtimeVoiceStatus =
  | "idle"
  | "connecting"
  | "live"
  /** The session route answered 503 (flag off, fake mode or no provider key): the toggle goes away. */
  | "unavailable"
  | "error";

/** WebRTC endpoint of the provider the runtime mints secrets for (OpenAI Realtime, decision 0034). */
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/**
 * Default connector: microphone → `RTCPeerConnection` → SDP offer/answer with the ephemeral
 * secret → remote audio on an `Audio` element. Experimental and off by default: it was never
 * exercised against the provider (fake mode answers 503), and the app CSP does not allow the
 * provider origin until realtime is cleared for use (decision 0034: it needs its own metering).
 */
export const connectRealtimeOverWebRtc: RealtimeConnector = async (session) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const peer = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  const close = (): void => {
    stream.getTracks().forEach((track) => track.stop());
    peer.close();
    audio.srcObject = null;
  };
  try {
    peer.ontrack = (event) => {
      audio.srcObject = event.streams[0] ?? null;
    };
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const answer = await fetch(`${REALTIME_CALLS_URL}?model=${encodeURIComponent(session.model)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.clientSecret}`, "content-type": "application/sdp" },
      body: offer.sdp ?? "",
      credentials: "omit",
    });
    if (!answer.ok) throw new Error(`realtime call refused (${String(answer.status)})`);
    await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() });
    return { close };
  } catch (error: unknown) {
    close();
    throw error;
  }
};

/**
 * Optional realtime voice (flag `chat.voice.realtime`): asks `/v1/voice/realtime-sessions` for an
 * ephemeral secret and connects with it. Offered only when the availability says the flag is on
 * and until the session route answers 503; the secret is used once and never stored.
 */
export const useRealtimeVoice = (args: { organizationId: string; connect?: RealtimeConnector | undefined }): { readonly status: RealtimeVoiceStatus; readonly start: () => void; readonly stop: () => void } => {
  const callEndpoint = useCallEndpoint();
  const [status, setStatus] = useState<RealtimeVoiceStatus>("idle");
  const connection = useRef<RealtimeConnection | null>(null);
  const attempt = useRef(0);

  useEffect(
    () => () => {
      attempt.current += 1;
      connection.current?.close();
      connection.current = null;
    },
    [],
  );

  const start = (): void => {
    if (status === "connecting" || status === "live") return;
    const mine = (attempt.current += 1);
    setStatus("connecting");
    const open = async (): Promise<void> => {
      const session = await createRealtimeSession(callEndpoint, args.organizationId);
      const opened = await (args.connect ?? connectRealtimeOverWebRtc)(session);
      // Stopped or unmounted while connecting: close what just opened.
      if (attempt.current !== mine) return opened.close();
      connection.current = opened;
      setStatus("live");
    };
    open().catch((error: unknown) => {
      if (attempt.current !== mine) return;
      setStatus(error instanceof ApiError && error.code === "FEATURE_UNAVAILABLE" ? "unavailable" : "error");
    });
  };

  const stop = (): void => {
    attempt.current += 1;
    connection.current?.close();
    connection.current = null;
    setStatus((current) => (current === "unavailable" ? current : "idle"));
  };

  return { status, start, stop };
};
