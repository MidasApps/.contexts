import { WorkflowEventSchema, type WorkflowEvent } from "@core/contracts";

/** One server-sent event frame: its `event` name and the joined `data` lines. */
export type SseFrame = { readonly event: string; readonly data: string };

/**
 * Splits a text buffer of a `text/event-stream` into its complete frames (blank-line separated,
 * `api.md` §14) and the unfinished tail to keep for the next chunk. Comment lines (heartbeats)
 * and frames without data are dropped.
 */
export const takeSseFrames = (buffer: string): { frames: SseFrame[]; rest: string } => {
  const blocks = buffer.replaceAll("\r\n", "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const frames = blocks.flatMap((block): SseFrame[] => {
    const lines = block.split("\n").filter((line) => !line.startsWith(":"));
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
    return data.length === 0 ? [] : [{ event, data: data.join("\n") }];
  });
  return { frames, rest };
};

/** The workflow event of an `event: data` frame, or `null` for anything else or a shape that does not parse. */
export const workflowEventOf = (frame: SseFrame): WorkflowEvent | null => {
  if (frame.event !== "data") return null;
  try {
    const parsed = WorkflowEventSchema.safeParse(JSON.parse(frame.data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
