/**
 * Reads a response body as UTF-8 up to `maxBytes`, then cancels the stream: an external
 * API can never make the runtime buffer more than the cap.
 */
export const readCappedText = async (
  response: Response,
  maxBytes: number,
): Promise<{ readonly text: string; readonly truncated: boolean }> => {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
  if (reader === undefined) return { text: "", truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - size;
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room));
      size += room;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), truncated };
};
