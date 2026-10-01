"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "#/shared/api/api-error.ts";
import { useApiConnection } from "#/shared/api/api-context.tsx";
import { synthesizeSpeech } from "../api/voice-api.ts";

export type SpeechPlayback =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  /** The audio is ready: `url` is an object URL of the returned blob. */
  | { readonly status: "ready"; readonly url: string }
  /** `unavailable`: voice was switched off on the server. */
  | { readonly status: "error"; readonly reason: "unavailable" | "failed" };

export type SpeechPlaybackSeams = { readonly createUrl: (blob: Blob) => string; readonly revokeUrl: (url: string) => void };

const BROWSER_URLS: SpeechPlaybackSeams = { createUrl: (blob) => URL.createObjectURL(blob), revokeUrl: (url) => URL.revokeObjectURL(url) };

/**
 * Read aloud for one message (`POST /v1/voice/speech`, decision 0034): asks for the audio when
 * the member wants it, plays it from an object URL, and frees it when stopped or unmounted. The
 * audio is never stored or logged.
 */
export const useSpeechPlayback = (args: { organizationId: string; text: string; seams?: SpeechPlaybackSeams | undefined }): { readonly playback: SpeechPlayback; readonly play: () => void; readonly stop: () => void } => {
  const connection = useApiConnection();
  const urls = args.seams ?? BROWSER_URLS;
  const [playback, setPlayback] = useState<SpeechPlayback>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);

  const release = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (url.current !== null) urls.revokeUrl(url.current);
    url.current = null;
  }, [urls]);

  useEffect(() => release, [release]);

  const play = (): void => {
    release();
    const controller = new AbortController();
    request.current = controller;
    setPlayback({ status: "loading" });
    synthesizeSpeech(connection, { organizationId: args.organizationId, text: args.text, signal: controller.signal }).then(
      (audio) => {
        if (controller.signal.aborted) return;
        url.current = urls.createUrl(audio);
        setPlayback({ status: "ready", url: url.current });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setPlayback({ status: "error", reason: error instanceof ApiError && error.code === "FEATURE_UNAVAILABLE" ? "unavailable" : "failed" });
      },
    );
  };

  const stop = (): void => {
    release();
    setPlayback({ status: "idle" });
  };

  return { playback, play, stop };
};
