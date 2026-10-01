// Test helper: a scripted microphone and `MediaRecorder` (jsdom has neither), so the push-to-talk
// machine and the composer are driven without real audio.
import type { RecorderLike, StreamLike } from "../model/push-to-talk.ts";

export type FakeMicrophone = {
  readonly getUserMedia: () => Promise<StreamLike>;
  readonly createRecorder: (stream: StreamLike) => RecorderLike;
  /** Recorders created so far, in order. */
  readonly recorders: FakeRecorder[];
  /** Tracks stopped so far (a released microphone stops its one track). */
  readonly released: () => number;
  /** How many times the microphone was asked for. */
  readonly requests: () => number;
};

export type FakeRecorder = RecorderLike & {
  readonly state: () => "inactive" | "recording" | "stopped";
};

export type FakeMicrophoneOptions = {
  /** Rejects `getUserMedia` with a `DOMException` of this name (`NotAllowedError`, `NotFoundError`). */
  readonly refuse?: string | undefined;
  /** What a recording contains when it stops (default: a few bytes). */
  readonly recorded?: (() => Blob) | undefined;
  /** Resolve `getUserMedia` only when the test calls the returned `grant`. */
  readonly manual?: boolean | undefined;
};

export const createFakeMicrophone = (options: FakeMicrophoneOptions = {}): FakeMicrophone & { readonly grant: () => void } => {
  const recorders: FakeRecorder[] = [];
  let released = 0;
  let requests = 0;
  let grant: () => void = () => undefined;
  const stream: StreamLike = { getTracks: () => [{ stop: () => void (released += 1) }] };
  return {
    recorders,
    released: () => released,
    requests: () => requests,
    grant: () => grant(),
    getUserMedia: () => {
      requests += 1;
      if (options.refuse !== undefined) return Promise.reject(new DOMException("refused", options.refuse));
      if (options.manual !== true) return Promise.resolve(stream);
      return new Promise<StreamLike>((resolve) => {
        grant = () => resolve(stream);
      });
    },
    createRecorder: () => {
      let state: "inactive" | "recording" | "stopped" = "inactive";
      const recorder: FakeRecorder = {
        mimeType: "audio/webm;codecs=opus",
        ondataavailable: null,
        onstop: null,
        onerror: null,
        state: () => state,
        start: () => {
          state = "recording";
        },
        stop: () => {
          if (state !== "recording") return;
          state = "stopped";
          recorder.ondataavailable?.({ data: (options.recorded ?? (() => new Blob(["opus-bytes"], { type: "audio/webm" })))() });
          recorder.onstop?.();
        },
      };
      recorders.push(recorder);
      return recorder;
    },
  };
};
