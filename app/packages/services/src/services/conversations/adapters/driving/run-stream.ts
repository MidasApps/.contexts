/**
 * Passes Mastra's UI message stream to the client byte for byte (decision 0031) and reports how
 * it ended:
 * - `onUpstreamEnd` runs when Mastra closed the stream (with `finish` or without: an aborted
 *   durable run just closes) or failed it; the run is over, so `/v1` clears `activeRunId`. It
 *   runs before the client sees the end, so a following `GET …/stream` never finds a stale run.
 * - A client that goes away cancels the upstream read only: the run keeps going on Mastra and
 *   `activeRunId` stays, so the client can resume.
 */
export const trackRunStream = (upstream: ReadableStream<Uint8Array>, onUpstreamEnd: () => Promise<void>): ReadableStream<Uint8Array> => {
  const reader = upstream.getReader();
  let ended = false;
  const end = async () => {
    if (ended) return;
    ended = true;
    await onUpstreamEnd();
  };
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch (error: unknown) {
        await end();
        controller.error(error);
        return;
      }
      if (chunk.done) {
        await end();
        controller.close();
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel: async (reason: unknown) => {
      ended = true;
      await reader.cancel(reason);
    },
  });
};
