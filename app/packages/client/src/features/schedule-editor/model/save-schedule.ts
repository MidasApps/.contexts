import { createScheduleEndpoint, type Schedule, updateScheduleEndpoint } from "@core/contracts";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";

/**
 * Creates the schedule (`POST /v1/schedules`) or, given the one being edited, updates its cron, zone
 * and input (`PATCH /v1/schedules/{id}`; workflow and slug are fixed after creation). Resolves the
 * workflow id the server stored, for the success copy.
 * @throws {ApiError} for a refused or failed call.
 */
export const saveSchedule = async (args: {
  callEndpoint: CallEndpoint;
  organizationId: string;
  schedule: Schedule | null;
  workflowId: string | undefined;
  slug: string;
  cron: string;
  timezone: string;
  inputData: Record<string, unknown>;
}): Promise<string> => {
  const { callEndpoint, organizationId, schedule } = args;
  const shared = { cron: args.cron, timezone: args.timezone, inputData: args.inputData };
  if (schedule !== null)
    return (
      await callEndpoint(updateScheduleEndpoint, {
        params: { scheduleId: schedule.id },
        query: { organizationId },
        body: shared,
      })
    ).data.workflowId;
  const body = { workflowId: args.workflowId ?? "", slug: args.slug, ...shared };
  return (await callEndpoint(createScheduleEndpoint, { query: { organizationId }, body })).data.workflowId;
};
