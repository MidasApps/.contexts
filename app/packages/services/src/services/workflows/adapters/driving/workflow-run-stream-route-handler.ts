import { streamWorkflowRunEndpoint, type WorkflowEvent, type WorkflowRunStatus } from "@core/contracts";
import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { ResolveAccessContext } from "#/services/identity/application/use-cases/resolve-access-context.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";
import { type GetRunEvents, makeGetRunEvents } from "../../application/use-cases/get-run.ts";
import {
  encodeDone,
  encodeError,
  encodeWorkflowEvent,
  HEARTBEAT,
  resumeIndexOf,
  SSE_HEADERS,
} from "../driven/workflow-event-sse.ts";
import { workflowCallScope, workflowGatewayErrorResponse } from "./workflow-call-scope.ts";
import { WORKFLOW_RUN_PERMISSIONS } from "./workflow-runs-route-handler.ts";

/** Poll interval of the run's events, heartbeat interval and longest stream (the client reconnects with `Last-Event-Id`). */
export const STREAM_TIMING = { pollMs: 1_000, heartbeatMs: 15_000, maxDurationMs: 5 * 60_000 } as const;

const SETTLED: ReadonlySet<WorkflowRunStatus> = new Set(["success", "failed", "canceled", "tripwire"]);

export type WorkflowRunStreamDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly gateway: Pick<WorkflowRuntimeGateway, "getRunEvents">;
  readonly resolveAccessContext: ResolveAccessContext;
  /** Test seams. */
  readonly timing?: Partial<typeof STREAM_TIMING>;
  readonly wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

const defaultWait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

type StreamState = { last: number; status: WorkflowRunStatus };

type PumpArgs = {
  readonly scope: AgentCallScope;
  readonly runId: string;
  readonly getRunEvents: GetRunEvents;
  readonly first: { readonly events: readonly WorkflowEvent[]; readonly status: WorkflowRunStatus };
  readonly resumeAfter: number;
  readonly timing: typeof STREAM_TIMING;
  readonly wait: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly signal: AbortSignal;
};

const emitNew = (write: (text: string) => void, state: StreamState, events: readonly WorkflowEvent[]): void => {
  for (const event of events) {
    if (event.index <= state.last) continue;
    write(encodeWorkflowEvent(event));
    state.last = event.index;
  }
};

// Polls until the run settles, the window ends or the client leaves; each frame is written once.
const pump = async (args: PumpArgs, write: (text: string) => void): Promise<void> => {
  const state: StreamState = { last: args.resumeAfter, status: args.first.status };
  emitNew(write, state, args.first.events);
  let waited = 0;
  let sinceHeartbeat = 0;
  while (!SETTLED.has(state.status) && waited < args.timing.maxDurationMs && !args.signal.aborted) {
    await args.wait(args.timing.pollMs, args.signal);
    if (args.signal.aborted) return;
    waited += args.timing.pollMs;
    sinceHeartbeat += args.timing.pollMs;
    if (sinceHeartbeat >= args.timing.heartbeatMs) {
      write(HEARTBEAT);
      sinceHeartbeat = 0;
    }
    const next = await args.getRunEvents(args.scope, args.runId);
    if (!next.ok) {
      write(
        encodeError({
          code: next.error.code,
          message: "The run progress is unavailable.",
          requestId: args.scope.requestId,
        }),
      );
      return;
    }
    state.status = next.data.run.status;
    emitNew(write, state, next.data.events);
  }
  if (!args.signal.aborted) write(encodeDone({ requestId: args.scope.requestId, status: state.status }));
};

const sseResponse = (args: PumpArgs): Response => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        await pump(args, write);
      } catch {
        // The client left (the gateway rethrows its abort) or the runtime failed mid-stream.
        if (!args.signal.aborted)
          write(
            encodeError({
              code: "UPSTREAM_UNAVAILABLE",
              message: "The run progress is unavailable.",
              requestId: args.scope.requestId,
            }),
          );
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: SSE_HEADERS });
};

/**
 * `GET /v1/workflows/runs/{runId}/stream` (SP5 spec §3.6, decision 0040): the run's progress in
 * the `api.md` §14 format. Errors before the first byte answer the §6 envelope; afterwards an
 * `event: error` closes the stream. The events are derived from the stored run, so the indexes
 * are stable and `Last-Event-Id` resumes after one.
 */
export const buildWorkflowRunStreamRoutes = (deps: WorkflowRunStreamDeps): Record<string, RouteHandler> => {
  const getRunEvents = makeGetRunEvents(deps);
  const timing = { ...STREAM_TIMING, ...deps.timing };
  return {
    [streamWorkflowRunEndpoint.id]: withApiRoute(streamWorkflowRunEndpoint, deps.pipeline, async (ctx) => {
      const scope = await workflowCallScope({
        ctx,
        organizationId: ctx.input.query.organizationId,
        permission: WORKFLOW_RUN_PERMISSIONS.read,
        resolveAccessContext: deps.resolveAccessContext,
      });
      if (scope instanceof Response) return scope;
      const runId = ctx.input.params.runId;
      const first = await getRunEvents(scope, runId);
      if (!first.ok) return workflowGatewayErrorResponse(first.error, ctx.requestId);
      return sseResponse({
        scope,
        runId,
        getRunEvents,
        first: { events: first.data.events, status: first.data.run.status },
        resumeAfter: resumeIndexOf(ctx.request.headers.get("last-event-id")),
        timing,
        wait: deps.wait ?? defaultWait,
        signal: ctx.request.signal,
      });
    }),
  };
};
