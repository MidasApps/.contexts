import type { WorkflowEvent, WorkflowRunStatus } from "@core/contracts";

/**
 * `api.md` §14 encoding of workflow progress (decision 0040): `event: data` with the SSE `id`
 * set to the event index (so `Last-Event-Id` resumes after it), `event: done` closes a run that
 * settled or a window that ended, `event: error` closes with the §6 envelope. One JSON line each.
 */

const frame = (event: string, data: unknown, id?: number): string =>
  `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export const encodeWorkflowEvent = (event: WorkflowEvent): string => frame("data", event, event.index);

export const encodeDone = (data: { readonly requestId: string; readonly status: WorkflowRunStatus }): string => frame("done", data);

export const encodeError = (error: { readonly code: string; readonly message: string; readonly requestId: string }): string => frame("error", { error });

/** Comment line that keeps proxies from closing an idle stream. */
export const HEARTBEAT = ": keep-alive\n\n";

/**
 * Index after which to resume, from `Last-Event-Id`; `-1` (from the start) when absent or not a
 * non-negative integer.
 */
export const resumeIndexOf = (lastEventId: string | null): number => {
  if (lastEventId === null || !/^\d{1,9}$/.test(lastEventId.trim())) return -1;
  return Number(lastEventId.trim());
};

export const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
} as const;
