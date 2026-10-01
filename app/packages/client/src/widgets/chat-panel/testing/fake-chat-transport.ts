// Test helper: a scripted `ChatTransport`. Each send (or resume) opens a stream the test drives
// chunk by chunk, so every chat state can be reached deterministically, without timers or HTTP.
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export type FakeStream = {
  /** What the chat sent to open this stream (`resume` for a reconnect). */
  readonly trigger: "submit-message" | "regenerate-message" | "resume";
  readonly messages: readonly UIMessage[];
  readonly emit: (...chunks: UIMessageChunk[]) => void;
  /** Ends the stream normally (with or without a `finish` chunk before it). */
  readonly close: () => void;
  /** Fails the stream; a `TypeError("network error")` is what a dropped connection looks like. */
  readonly fail: (error: Error) => void;
  /** The chat aborted the request (stop). */
  readonly aborted: () => boolean;
};

export type FakeChatTransport = ChatTransport<UIMessage> & {
  readonly streams: FakeStream[];
  /** The next send rejects with this error instead of opening a stream. */
  readonly failNextSend: (error: Error) => void;
  /** What a resume finds: `true` opens a stream, `false` answers "nothing to resume". */
  resumable: boolean;
  readonly resumeCalls: () => number;
};

const openStream = (trigger: FakeStream["trigger"], messages: readonly UIMessage[], abortSignal: AbortSignal | undefined): { stream: ReadableStream<UIMessageChunk>; handle: FakeStream } => {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | undefined;
  let done = false;
  let aborted = false;
  const stream = new ReadableStream<UIMessageChunk>({
    start: (streamController) => {
      controller = streamController;
    },
  });
  const finish = (action: () => void): void => {
    if (done) return;
    done = true;
    action();
  };
  abortSignal?.addEventListener("abort", () => {
    aborted = true;
    finish(() => controller?.error(new DOMException("The request was aborted.", "AbortError")));
  });
  return {
    stream,
    handle: {
      trigger,
      messages,
      emit: (...chunks) => {
        if (!done) chunks.forEach((chunk) => controller?.enqueue(chunk));
      },
      close: () => finish(() => controller?.close()),
      fail: (error) => finish(() => controller?.error(error)),
      aborted: () => aborted,
    },
  };
};

export const createFakeChatTransport = (): FakeChatTransport => {
  const streams: FakeStream[] = [];
  let nextFailure: Error | undefined;
  let resumeCalls = 0;
  const transport: FakeChatTransport = {
    streams,
    resumable: false,
    resumeCalls: () => resumeCalls,
    failNextSend: (error) => {
      nextFailure = error;
    },
    sendMessages: ({ trigger, messages, abortSignal }) => {
      if (nextFailure !== undefined) {
        const failure = nextFailure;
        nextFailure = undefined;
        return Promise.reject(failure);
      }
      const { stream, handle } = openStream(trigger, messages, abortSignal);
      streams.push(handle);
      return Promise.resolve(stream);
    },
    reconnectToStream: () => {
      resumeCalls += 1;
      if (!transport.resumable) return Promise.resolve(null);
      const { stream, handle } = openStream("resume", [], undefined);
      streams.push(handle);
      return Promise.resolve(stream);
    },
  };
  return transport;
};

/** Chunks of a plain text answer: `start`, the text in `pieces`, optionally the `finish`. */
export const textChunks = (pieces: readonly string[], options: { messageId?: string; finish?: boolean; metadata?: unknown } = {}): UIMessageChunk[] => [
  { type: "start", messageId: options.messageId ?? "a-1", ...(options.metadata === undefined ? {} : { messageMetadata: options.metadata }) },
  { type: "text-start", id: "t-1" },
  ...pieces.map((delta): UIMessageChunk => ({ type: "text-delta", id: "t-1", delta })),
  ...(options.finish === false ? [] : ([{ type: "text-end", id: "t-1" }, { type: "finish" }] satisfies UIMessageChunk[])),
];
