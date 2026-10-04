"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ApiError } from "#/shared/api/api-error.ts";
import { useApiConnection } from "#/shared/api/api-context.tsx";
import { transcribeRecording } from "../api/voice-api.ts";
import { createPushToTalk, type PushToTalk, type PushToTalkDeps, type PushToTalkProblem, type PushToTalkState, type RecorderLike, type StreamLike } from "./push-to-talk.ts";

/** Test seams: a fake microphone and recorder (jsdom has neither). */
export type VoiceSeams = Pick<PushToTalkDeps, "getUserMedia" | "createRecorder" | "maxMs" | "maxBytes" | "setTimer" | "clearTimer">;

export type UsePushToTalkArgs = {
  readonly organizationId: string;
  /** Receives the transcript; the composer puts it in the draft (or sends it, with auto-send on). */
  readonly onTranscript: (text: string) => void;
  readonly seams?: Partial<VoiceSeams> | undefined;
};

const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

class RecordingUnsupportedError extends Error {
  readonly code = "RECORDING_UNSUPPORTED";
  constructor() {
    super("this browser cannot record audio");
    this.name = "RecordingUnsupportedError";
  }
}

const browserGetUserMedia = (): Promise<StreamLike> => {
  // Absent on insecure origins and in old webviews, whatever the DOM types say.
  const devices: MediaDevices | undefined = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (devices === undefined || typeof globalThis.MediaRecorder !== "function") return Promise.reject(new RecordingUnsupportedError());
  return devices.getUserMedia({ audio: true });
};

/** Opus in WebM where the browser has it (spec §4.5); otherwise the first type it can record. */
const browserCreateRecorder = (stream: StreamLike): RecorderLike => {
  const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  return new MediaRecorder(stream as MediaStream, mimeType === undefined ? {} : { mimeType }) as unknown as RecorderLike;
};

const problemOf = (error: unknown): PushToTalkProblem => {
  if (!(error instanceof ApiError)) return "failed";
  if (error.code === "BUDGET_EXCEEDED") return "budget";
  return error.code === "FEATURE_UNAVAILABLE" ? "unavailable" : "failed";
};

/** What the latest render wants, read by the machine at event time (the machine outlives renders). */
const createLink = (initial: { organizationId: string; onTranscript: (text: string) => void }) => {
  let current = initial;
  return {
    get: () => current,
    set: (next: typeof initial): void => {
      current = next;
    },
  };
};

/**
 * Push-to-talk for one composer: the recorder machine over the browser's microphone and
 * `POST /v1/voice/transcriptions`. Unmounting discards a recording in progress and releases the
 * microphone.
 */
export const usePushToTalk = ({ organizationId, onTranscript, seams }: UsePushToTalkArgs): PushToTalkState & Pick<PushToTalk, "start" | "stop" | "cancel"> => {
  const connection = useApiConnection();
  const [link] = useState(() => createLink({ organizationId, onTranscript }));
  useEffect(() => link.set({ organizationId, onTranscript }), [link, organizationId, onTranscript]);
  const [machine] = useState(() =>
    createPushToTalk({
      getUserMedia: browserGetUserMedia,
      createRecorder: browserCreateRecorder,
      ...seams,
      transcribe: (audio, signal) => transcribeRecording(connection, { organizationId: link.get().organizationId, audio, signal }),
      onTranscript: (text) => link.get().onTranscript(text),
      problemOf,
    }),
  );
  useEffect(() => () => machine.cancel(), [machine]);
  const state = useSyncExternalStore(machine.subscribe, machine.getSnapshot, machine.getSnapshot);
  return { ...state, start: machine.start, stop: machine.stop, cancel: machine.cancel };
};
