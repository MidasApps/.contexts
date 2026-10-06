import { createHash } from "node:crypto";
import {
  type AdminSchedule,
  AdminScheduleSchema,
  type AgentRequestContext,
  type Schedule,
  ScheduleSchema,
} from "@core/contracts";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { resourceIdOf } from "../../auth/agent-principal.ts";
import { AGENT_PRINCIPAL_KEY } from "../../context/agent-request-context.ts";
import type { AccessPrincipal } from "../../runtime/runtime-ports.ts";
import { SCHEDULE_ID_CONTEXT_KEY } from "../runs/workflow-run-view.ts";

/**
 * Tenant schedules on Mastra Schedules (decision 0037). Mastra slugifies ids (lowercase, `_` and
 * case changes become `-`), so the id carries a stable tenant key instead of the raw tenant id:
 * `schedule_<first 16 hex of SHA-256(tenantId)>-<slug>`. Ownership is never read from the id: it
 * is `metadata.tenantId`, written only by the schedule routes from the verified context.
 */

/** The part of Mastra's `WorkflowSchedule` view the routes read. */
export type StoredSchedule = {
  readonly id: string;
  readonly workflowId?: string | undefined;
  readonly cron: string;
  readonly timezone?: string | undefined;
  readonly status: "active" | "paused";
  readonly nextFireAt: number;
  readonly lastFireAt?: number | undefined;
  readonly inputData?: unknown;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export const tenantKeyOf = (tenantId: string): string =>
  createHash("sha256").update(tenantId).digest("hex").slice(0, 16);

export const scheduleIdOf = (tenantId: string, slug: string): string => `schedule_${tenantKeyOf(tenantId)}-${slug}`;

export const isTenantSchedule = (schedule: StoredSchedule, tenantId: string): boolean =>
  schedule.metadata?.["tenantId"] === tenantId && typeof schedule.workflowId === "string";

const iso = (ms: number | undefined): string | null =>
  typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

/** `/v1` view; `null` for a row that is not a well-formed tenant schedule. */
export const toScheduleView = (schedule: StoredSchedule): Schedule | null => {
  const view = ScheduleSchema.safeParse({
    id: schedule.id,
    tenantId: schedule.metadata?.["tenantId"],
    workflowId: schedule.workflowId,
    cron: schedule.cron,
    timezone: schedule.timezone,
    inputData: typeof schedule.inputData === "object" && schedule.inputData !== null ? schedule.inputData : {},
    status: schedule.status,
    nextFireAt: schedule.status === "paused" ? null : iso(schedule.nextFireAt),
    lastFireAt: iso(schedule.lastFireAt),
    createdBy: schedule.metadata?.["createdBy"],
    createdAt: iso(schedule.createdAt),
    updatedAt: iso(schedule.updatedAt),
  });
  return view.success ? view.data : null;
};

/**
 * Staff view of any schedule row: `tenant` when the tenant routes wrote its `metadata.tenantId`,
 * else `platform` (the boot-time rows of the core crons). `null` for a row that fits neither.
 */
export const toAdminScheduleView = (schedule: StoredSchedule): AdminSchedule | null => {
  const tenantId = typeof schedule.metadata?.["tenantId"] === "string" ? schedule.metadata["tenantId"] : null;
  const view = AdminScheduleSchema.safeParse({
    id: schedule.id,
    scope: tenantId === null ? "platform" : "tenant",
    tenantId,
    workflowId: schedule.workflowId,
    cron: schedule.cron,
    timezone: schedule.timezone,
    status: schedule.status,
    nextFireAt: schedule.status === "paused" ? null : iso(schedule.nextFireAt),
    lastFireAt: iso(schedule.lastFireAt),
    createdBy: tenantId === null ? null : (schedule.metadata?.["createdBy"] ?? null),
    createdAt: iso(schedule.createdAt),
    updatedAt: iso(schedule.updatedAt),
  });
  return view.success ? view.data : null;
};

/**
 * The request context every run of the schedule starts with: the creator's verified context (no
 * conversation, no screen), the principal, the resource `tenantId:uid` and the schedule id. The
 * first step re-authorizes it against the creator's current grants.
 */
export const scheduledRunContextOf = (args: {
  readonly context: AgentRequestContext;
  readonly principal: AccessPrincipal;
  readonly scheduleId: string;
}): Record<string, unknown> => {
  const context = args.context;
  // A schedule has no conversation or screen: those keys never reach its runs.
  const durable = Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== "conversationId" && key !== "activeScreen"),
  );
  return {
    ...durable,
    [AGENT_PRINCIPAL_KEY]: args.principal,
    [MASTRA_RESOURCE_ID_KEY]: resourceIdOf({ tenantId: context.tenantId, uid: context.userId }),
    [SCHEDULE_ID_CONTEXT_KEY]: args.scheduleId,
  };
};
