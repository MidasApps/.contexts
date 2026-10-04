import { describe, expect, it, vi } from "vitest";
import { createFakeMicrophone, type FakeMicrophoneOptions } from "../testing/fake-microphone.ts";
import { createPushToTalk, type PushToTalkDeps, type PushToTalkProblem } from "./push-to-talk.ts";

type Timers = { run: (() => void) | undefined; ms: number | undefined; cleared: number };

const setup = (options: FakeMicrophoneOptions = {}, deps: Partial<PushToTalkDeps> = {}) => {
  const microphone = createFakeMicrophone(options);
  const transcripts: string[] = [];
  const sent: Blob[] = [];
  const timers: Timers = { run: undefined, ms: undefined, cleared: 0 };
  const machine = createPushToTalk({
    getUserMedia: microphone.getUserMedia,
    createRecorder: microphone.createRecorder,
    transcribe: (audio) => {
      sent.push(audio);
      return Promise.resolve("qual é o prazo");
    },
    onTranscript: (text) => transcripts.push(text),
    setTimer: (run, ms) => {
      timers.run = run;
      timers.ms = ms;
      return 1;
    },
    clearTimer: () => void (timers.cleared += 1),
    ...deps,
  });
  const phases: string[] = [];
  machine.subscribe(() => phases.push(machine.getSnapshot().phase));
  const phase = () => machine.getSnapshot().phase;
  const problem = (): PushToTalkProblem | undefined => machine.getSnapshot().problem;
  return { machine, microphone, transcripts, sent, timers, phases, phase, problem };
};

describe("push-to-talk machine", () => {
  it("asks for the microphone, records, transcribes and hands over the text, releasing the microphone", async () => {
    const { machine, microphone, transcripts, sent, phases, phase } = setup();
    machine.start();
    expect(phase()).toBe("requesting");
    await vi.waitFor(() => expect(phase()).toBe("recording"));
    expect(microphone.recorders[0]?.state()).toBe("recording");
    machine.stop();
    expect(microphone.released()).toBe(1);
    await vi.waitFor(() => expect(phase()).toBe("idle"));
    expect(phases).toEqual(["requesting", "recording", "transcribing", "idle"]);
    expect(transcripts).toEqual(["qual é o prazo"]);
    expect(sent[0]?.type).toBe("audio/webm;codecs=opus");
    expect(sent[0]?.size).toBeGreaterThan(0);
  });

  it("ignores a second start while busy and a stop while idle", async () => {
    const { machine, microphone, phase } = setup();
    machine.stop();
    expect(phase()).toBe("idle");
    machine.start();
    machine.start();
    await vi.waitFor(() => expect(phase()).toBe("recording"));
    expect(microphone.requests()).toBe(1);
    expect(microphone.recorders).toHaveLength(1);
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "unsupported"],
  ] as const)("says why when the microphone answers %s", async (refuse, expected) => {
    const { machine, phase, problem, sent } = setup({ refuse });
    machine.start();
    await vi.waitFor(() => expect(problem()).toBe(expected));
    expect(phase()).toBe("idle");
    expect(sent).toEqual([]);
  });

  it("stops by itself at the 60 s limit and still transcribes", async () => {
    const { machine, timers, transcripts, phase } = setup();
    machine.start();
    await vi.waitFor(() => expect(phase()).toBe("recording"));
    expect(timers.ms).toBe(60_000);
    timers.run?.();
    await vi.waitFor(() => expect(transcripts).toEqual(["qual é o prazo"]));
    expect(timers.cleared).toBeGreaterThan(0);
  });

  it("refuses a recording over the size limit without sending it", async () => {
    const { machine, sent, phase, problem } = setup({ recorded: () => new Blob(["0123456789"]) }, { maxBytes: 5 });
    machine.start();
    await vi.waitFor(() => expect(phase()).toBe("recording"));
    machine.stop();
    expect(problem()).toBe("too-large");
    expect(sent).toEqual([]);
  });

  it("treats an empty recording or an empty transcript as nothing said", async () => {
    const silent = setup({ recorded: () => new Blob([]) });
    silent.machine.start();
    await vi.waitFor(() => expect(silent.phase()).toBe("recording"));
    silent.machine.stop();
    expect(silent.problem()).toBe("empty");
    const blank = setup({}, { transcribe: () => Promise.resolve("") });
    blank.machine.start();
    await vi.waitFor(() => expect(blank.phase()).toBe("recording"));
    blank.machine.stop();
    await vi.waitFor(() => expect(blank.problem()).toBe("empty"));
    expect(blank.transcripts).toEqual([]);
  });

  it("maps a transcription failure through problemOf", async () => {
    const { machine, phase, problem } = setup(
      {},
      { transcribe: () => Promise.reject(new Error("503")), problemOf: () => "unavailable" },
    );
    machine.start();
    await vi.waitFor(() => expect(phase()).toBe("recording"));
    machine.stop();
    await vi.waitFor(() => expect(problem()).toBe("unavailable"));
    expect(phase()).toBe("idle");
  });

  it("cancel discards the recording, releases the microphone and sends nothing", async () => {
    const { machine, microphone, sent, transcripts, phase, problem } = setup();
    machine.start();
    await vi.waitFor(() => expect(phase()).toBe("recording"));
    machine.cancel();
    expect(phase()).toBe("idle");
    expect(problem()).toBeUndefined();
    expect(microphone.released()).toBe(1);
    await Promise.resolve();
    expect(sent).toEqual([]);
    expect(transcripts).toEqual([]);
  });

  it("cancel aborts a transcription in flight and drops its text", async () => {
    let signal: AbortSignal | undefined;
    let answer: (text: string) => void = () => undefined;
    const { machine, transcripts, phase } = setup(
      {},
      {
        transcribe: (_audio, abort) => {
          signal = abort;
          return new Promise<string>((resolve) => {
            answer = resolve;
          });
        },
      },
    );
    machine.start();
    await vi.waitFor(() => expect(phase()).toBe("recording"));
    machine.stop();
    expect(phase()).toBe("transcribing");
    machine.cancel();
    expect(signal?.aborted).toBe(true);
    answer("texto tardio");
    await Promise.resolve();
    expect(transcripts).toEqual([]);
    expect(phase()).toBe("idle");
  });

  it("releases a microphone granted after the member already let go", async () => {
    const { machine, microphone, phase } = setup({ manual: true });
    machine.start();
    machine.stop();
    microphone.grant();
    await vi.waitFor(() => expect(phase()).toBe("idle"));
    expect(microphone.recorders).toHaveLength(0);
    expect(microphone.released()).toBe(1);
    const cancelled = setup({ manual: true });
    cancelled.machine.start();
    cancelled.machine.cancel();
    cancelled.microphone.grant();
    await vi.waitFor(() => expect(cancelled.microphone.released()).toBe(1));
    expect(cancelled.microphone.recorders).toHaveLength(0);
  });
});
