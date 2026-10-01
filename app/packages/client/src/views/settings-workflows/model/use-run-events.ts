"use client";

import type { WorkflowEvent } from "@core/contracts";
import { useEffect, useState } from "react";
import { ulid } from "ulid";
import { useApiConnection, type ApiConnection } from "#/shared/api/api-context.tsx";
import { takeSseFrames, workflowEventOf } from "../lib/parse-sse.ts";

const streamPath = (organizationId: string, runId: string): string =>
  `/v1/workflows/runs/${encodeURIComponent(runId)}/stream?${new URLSearchParams({ organizationId }).toString()}`;

/** Reads the stream until `done`, `error` or the end; calls `onEvent` for each workflow event. */
const readEvents = async (response: Response, onEvent: (event: WorkflowEvent) => void): Promise<void> => {
  const reader = response.body?.getReader();
  if (reader === undefined) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const { frames, rest } = takeSseFrames(buffer + decoder.decode(value, { stream: true }));
    buffer = rest;
    for (const frame of frames) {
      if (frame.event === "done" || frame.event === "error") return void reader.cancel();
      const event = workflowEventOf(frame);
      if (event !== null) onEvent(event);
    }
  }
};

const openStream = async (connection: ApiConnection, path: string, signal: AbortSignal): Promise<Response | null> => {
  const token = await connection.getIdToken({ forceRefresh: false });
  if (token === null) return null;
  const response = await connection.fetch(`${connection.baseUrl}${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream", "x-request-id": ulid() },
    signal,
  });
  const streaming = response.ok && (response.headers.get("content-type") ?? "").startsWith("text/event-stream");
  return streaming ? response : null;
};

/**
 * Step events of a run from `GET /v1/workflows/runs/{runId}/stream` (SSE, `api.md` §14;
 * core.workflow-run.read), read with the shell's own fetch and the caller's Bearer token. The
 * stream is an extra: the run page already polls the run's status, so when the stream is refused,
 * cut or absent this hook just keeps what it got and stays quiet. One connection per run and
 * mount; `active: false` (a settled run) still reads the stored events once.
 */
export const useRunEvents = (organizationId: string, runId: string): readonly WorkflowEvent[] => {
  const connection = useApiConnection();
  const [state, setState] = useState<{ key: string; events: readonly WorkflowEvent[] }>({ key: "", events: [] });
  const key = `${organizationId}/${runId}`;
  useEffect(() => {
    const controller = new AbortController();
    const add = (event: WorkflowEvent): void =>
      setState((current) => {
        const events = current.key === key ? current.events : [];
        return events.some((known) => known.index === event.index) ? { key, events } : { key, events: [...events, event] };
      });
    openStream(connection, streamPath(organizationId, runId), controller.signal)
      .then((response) => (response === null ? undefined : readEvents(response, add)))
      // The status poll is the source of truth; a broken stream only means fewer details.
      .catch(() => undefined);
    return () => controller.abort();
  }, [connection, organizationId, runId, key]);
  return state.key === key ? state.events : [];
};
