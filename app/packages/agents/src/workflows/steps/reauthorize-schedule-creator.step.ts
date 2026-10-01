import type { Mastra } from "@mastra/core/mastra";
import { createStep } from "@mastra/core/workflows";
import type { z } from "zod";
import { nodeOfContext, readAgentContext } from "../../context/agent-request-context.ts";
import type { AccessPort, NotificationPort } from "../../runtime/runtime-ports.ts";
import { SCHEDULE_ID_CONTEXT_KEY } from "../runs/workflow-run-view.ts";

export const REAUTHORIZE_SCHEDULE_CREATOR_STEP_ID = "reauthorize-schedule-creator";
/** A tenant schedule keeps firing only while its creator may still write schedules. */
export const SCHEDULE_WRITE_PERMISSION = "core.schedule.write";

/** The run stops: the schedule's creator lost access (decision 0037). The run ends `failed`. */
export class ScheduleCreatorForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  readonly scheduleId: string;

  constructor(scheduleId: string, options?: ErrorOptions) {
    super("FORBIDDEN: the schedule's creator may no longer run it", options);
    this.name = "ScheduleCreatorForbiddenError";
    this.scheduleId = scheduleId;
  }
}

export type ReauthorizeScheduleCreatorOptions<TInput extends z.ZodType> = {
  readonly access: AccessPort;
  readonly notifications: NotificationPort;
  readonly workflowId: string;
  /** The workflow's input schema; the step passes the input through unchanged. */
  readonly inputSchema: TInput;
  /** The workflow's own permission, checked with `core.schedule.write`. */
  readonly permission?: string;
};

const stopSchedule = async (args: { mastra: Mastra | undefined; notifications: NotificationPort; scheduleId: string; tenantId: string | null; recipientUid: string | null; workflowId: string }) => {
  await args.mastra?.schedules.pause(args.scheduleId);
  if (args.tenantId !== null) {
    await args.notifications.notify({
      tenantId: args.tenantId,
      recipientUid: args.recipientUid,
      kind: "SCHEDULE_PAUSED",
      data: { scheduleId: args.scheduleId, workflowId: args.workflowId, reason: "FORBIDDEN" },
    });
  }
  throw new ScheduleCreatorForbiddenError(args.scheduleId);
};

const stringOf = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * First step of every schedulable workflow (SP5 spec §3.5, decision 0037). A run started by a
 * tenant schedule carries the creator's context from the schedule row; this step authorizes the
 * creator again with their **current** grants and refreshes the context's permissions, so the
 * run never acts with more rights than the creator has today. When the creator lost access the
 * schedule is paused, the creator is notified and the run fails `FORBIDDEN`. Runs not started by
 * a tenant schedule (platform schedules, manual starts) pass through.
 */
export const createReauthorizeScheduleCreatorStep = <TInput extends z.ZodType>(options: ReauthorizeScheduleCreatorOptions<TInput>) =>
  createStep({
    id: REAUTHORIZE_SCHEDULE_CREATOR_STEP_ID,
    description: "Re-authorizes the creator of the tenant schedule that started the run.",
    inputSchema: options.inputSchema,
    outputSchema: options.inputSchema,
    execute: async ({ inputData, requestContext, mastra }) => {
      const scheduleId = stringOf(requestContext.get(SCHEDULE_ID_CONTEXT_KEY));
      if (scheduleId === null) return inputData;
      const stop = { mastra, notifications: options.notifications, scheduleId, workflowId: options.workflowId };
      const snapshot = readAgentContext(requestContext);
      if (!snapshot.ok) return stopSchedule({ ...stop, tenantId: stringOf(requestContext.get("tenantId")), recipientUid: stringOf(requestContext.get("userId")) });
      const { context, principal } = snapshot.data;
      const node = nodeOfContext(context);
      const required = [SCHEDULE_WRITE_PERMISSION, ...(options.permission === undefined ? [] : [options.permission])];
      for (const permission of required) {
        const decision = await options.access.authorize({ principal, permission, node });
        if (!decision.allowed) return stopSchedule({ ...stop, tenantId: context.tenantId, recipientUid: context.userId });
      }
      const current = await options.access.resolveAccessContext({ principal, node });
      if (current === null) return stopSchedule({ ...stop, tenantId: context.tenantId, recipientUid: context.userId });
      requestContext.set("permissions", [...current.permissions].sort());
      return inputData;
    },
  });
