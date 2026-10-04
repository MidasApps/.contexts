/**
 * Push-to-talk (SP4 spec §4.5, decision 0034): record with `MediaRecorder` for at most 60 s and
 * 5 MB, send the recording to be transcribed, hand the text to the composer. Framework-free so the
 * state machine is tested with a fake recorder. The audio lives only in memory until it is sent
 * and is never logged; the microphone is released as soon as the recording stops.
 */

export const MAX_RECORDING_MS = 60_000;
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;

export type PushToTalkPhase =
  | "idle"
  /** Asking for the microphone. */
  | "requesting"
  | "recording"
  | "transcribing";

/** Why the last attempt gave no text. */
export type PushToTalkProblem =
  /** The member (or the system) refused the microphone. */
  | "denied"
  /** No microphone, or the browser cannot record. */
  | "unsupported"
  /** The recording was over the size limit. */
  | "too-large"
  /** Nothing was said (an empty recording or transcript). */
  | "empty"
  /** Voice was switched off on the server (503 `FEATURE_UNAVAILABLE`). */
  | "unavailable"
  /** The organization reached its AI budget (429 `BUDGET_EXCEEDED`, decision 0065). */
  | "budget"
  | "failed";

export type PushToTalkState = { readonly phase: PushToTalkPhase; readonly problem: PushToTalkProblem | undefined };

/** The subset of `MediaRecorder` the machine uses. */
export type RecorderLike = {
  readonly mimeType: string;
  start: () => void;
  stop: () => void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
};

/** The subset of `MediaStream` the machine uses (releasing the microphone). */
export type StreamLike = { getTracks: () => readonly { stop: () => void }[] };

export type PushToTalkDeps = {
  /** `navigator.mediaDevices.getUserMedia({ audio: true })`; rejects when refused. */
  readonly getUserMedia: () => Promise<StreamLike>;
  readonly createRecorder: (stream: StreamLike) => RecorderLike;
  /** Sends the recording and answers its text. */
  readonly transcribe: (audio: Blob, signal: AbortSignal) => Promise<string>;
  readonly onTranscript: (text: string) => void;
  /** Maps a transcription failure to a problem (the hook knows `ApiError`). */
  readonly problemOf?: ((error: unknown) => PushToTalkProblem) | undefined;
  readonly maxMs?: number | undefined;
  readonly maxBytes?: number | undefined;
  readonly setTimer?: ((run: () => void, ms: number) => unknown) | undefined;
  readonly clearTimer?: ((timer: unknown) => void) | undefined;
};

export type PushToTalk = {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => PushToTalkState;
  /** Starts recording (asks for the microphone first); ignored unless idle. */
  readonly start: () => void;
  /** Ends the recording and transcribes it; ignored unless recording or still asking. */
  readonly stop: () => void;
  /** Throws the recording away and aborts a transcription in flight. */
  readonly cancel: () => void;
};

const NOT_ALLOWED = new Set(["NotAllowedError", "SecurityError", "PermissionDeniedError"]);

// A `DOMException` is not an `Error` in every runtime: read the name off the object.
const nameOf = (error: unknown): string => (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : "");

const microphoneProblem = (error: unknown): PushToTalkProblem => (NOT_ALLOWED.has(nameOf(error)) ? "denied" : "unsupported");

type Session = { stream: StreamLike | undefined; recorder: RecorderLike | undefined; chunks: Blob[]; timer: unknown; controller: AbortController; released: boolean; stopRequested: boolean; discarded: boolean };

export const createPushToTalk = (deps: PushToTalkDeps): PushToTalk => {
  const listeners = new Set<() => void>();
  let state: PushToTalkState = { phase: "idle", problem: undefined };
  let session: Session | undefined;
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number): unknown => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((timer: unknown): void => clearTimeout(timer as ReturnType<typeof setTimeout>));

  const set = (next: PushToTalkState): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const release = (current: Session): void => {
    if (current.released) return;
    current.released = true;
    clearTimer(current.timer);
    current.stream?.getTracks().forEach((track) => track.stop());
  };

  const finish = (current: Session, problem?: PushToTalkProblem): void => {
    release(current);
    if (session !== current) return;
    session = undefined;
    set({ phase: "idle", problem });
  };

  const transcribe = async (current: Session, mimeType: string): Promise<void> => {
    const audio = new Blob(current.chunks, { type: mimeType });
    current.chunks = [];
    if (audio.size === 0) return finish(current, "empty");
    if (audio.size > (deps.maxBytes ?? MAX_RECORDING_BYTES)) return finish(current, "too-large");
    set({ phase: "transcribing", problem: undefined });
    try {
      const text = await deps.transcribe(audio, current.controller.signal);
      if (current.discarded) return;
      if (text === "") return finish(current, "empty");
      finish(current);
      deps.onTranscript(text);
    } catch (error: unknown) {
      if (!current.discarded) finish(current, deps.problemOf?.(error) ?? "failed");
    }
  };

  const record = (current: Session, stream: StreamLike): void => {
    current.stream = stream;
    // The member let go (or cancelled) while the permission prompt was open: nothing to record.
    if (current.discarded || current.stopRequested) {
      // `finish` may already have run (cancel) before the stream existed: release it here.
      stream.getTracks().forEach((track) => track.stop());
      current.released = true;
      return finish(current);
    }
    let recorder: RecorderLike;
    try {
      recorder = deps.createRecorder(stream);
    } catch {
      return finish(current, "unsupported");
    }
    current.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) current.chunks.push(event.data);
    };
    recorder.onerror = () => finish(current, "failed");
    recorder.onstop = () => {
      release(current);
      if (current.discarded) return;
      void transcribe(current, recorder.mimeType);
    };
    recorder.start();
    current.timer = setTimer(() => recorder.stop(), deps.maxMs ?? MAX_RECORDING_MS);
    set({ phase: "recording", problem: undefined });
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    start: () => {
      if (session !== undefined) return;
      const current: Session = { stream: undefined, recorder: undefined, chunks: [], timer: undefined, controller: new AbortController(), released: false, stopRequested: false, discarded: false };
      session = current;
      set({ phase: "requesting", problem: undefined });
      deps.getUserMedia().then(
        (stream) => record(current, stream),
        (error: unknown) => finish(current, microphoneProblem(error)),
      );
    },
    stop: () => {
      const current = session;
      if (current === undefined) return;
      if (state.phase === "requesting") current.stopRequested = true;
      if (state.phase === "recording") current.recorder?.stop();
    },
    cancel: () => {
      const current = session;
      if (current === undefined) return;
      current.discarded = true;
      current.controller.abort();
      if (state.phase === "recording") current.recorder?.stop();
      finish(current);
    },
  };
};
