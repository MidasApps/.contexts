import { type AdminSchedule, type AdminWorkflowRun, type PageMeta, WorkflowRunStatusSchema } from "@core/contracts";
import type { Mastra } from "@mastra/core/mastra";
import { z } from "zod";
import { isTenantRun, type StoredRun, toAdminWorkflowRunView } from "../workflows/runs/workflow-run-view.ts";
import { type StoredSchedule, toAdminScheduleView } from "../workflows/schedules/tenant-schedule-view.ts";

/**
 * Staff operations over workflow runs and schedules (decision 0043), behind the `/console/*`
 * routes: no user Bearer, Cloud Run IAM outside local; `/v1/admin` requires staff with MFA first
 * and audits. Unlike the tenant routes these read every tenant and the platform rows.
 */

/** Storage page while scanning runs, and how many pages a list reads at most (as the tenant list). */
const SCAN_PAGE = 200;
const SCAN_PAGES = 10;

export const AdminRunsQuerySchema = z.object({
  tenantId: z.string().min(1).max(128).optional(),
  workflowId: z.string().min(1).max(100).optional(),
  status: WorkflowRunStatusSchema.optional(),
  cursor: z.string().regex(/^\d{1,6}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminRunsQuery = z.infer<typeof AdminRunsQuerySchema>;

type WorkflowsStore = {
  readonly listWorkflowRuns: (args: { workflowName?: string; status?: string; perPage?: number; page?: number }) => Promise<{ runs: StoredRun[] }>;
  readonly getWorkflowRunById: (args: { runId: string }) => Promise<StoredRun | null>;
};

const storeOf = async (mastra: Mastra): Promise<WorkflowsStore> => {
  const store = (await mastra.getStorage()?.getStore("workflows")) as WorkflowsStore | undefined;
  if (store === undefined) throw new Error("workflow storage unavailable");
  return store;
};

/** Runs of every tenant and of the platform (or of one tenant), newest first; the cursor is an offset. */
export const listAdminRuns = async (mastra: Mastra, query: AdminRunsQuery): Promise<{ runs: AdminWorkflowRun[]; page: PageMeta }> => {
  const store = await storeOf(mastra);
  const offset = Number(query.cursor ?? "0");
  const matches: StoredRun[] = [];
  for (let page = 0; page < SCAN_PAGES && matches.length < offset + query.limit + 1; page += 1) {
    const { runs } = await store.listWorkflowRuns({
      ...(query.workflowId === undefined ? {} : { workflowName: query.workflowId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      perPage: SCAN_PAGE,
      page,
    });
    const tenantId = query.tenantId;
    matches.push(...(tenantId === undefined ? runs : runs.filter((run) => isTenantRun(run, tenantId))));
    if (runs.length < SCAN_PAGE) break;
  }
  const window = matches.slice(offset, offset + query.limit + 1);
  const hasMore = window.length > query.limit;
  return {
    runs: window.slice(0, query.limit).flatMap((run) => toAdminWorkflowRunView(run) ?? []),
    page: { cursor: hasMore ? String(offset + query.limit) : null, hasMore, limit: query.limit },
  };
};

/**
 * Cancels any run.
 * @returns the run as stored before the cancel (its tenant feeds the audit), or `null` when unknown.
 */
export const cancelAdminRun = async (mastra: Mastra, runId: string): Promise<AdminWorkflowRun | null> => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) return null;
  const run = await (await storeOf(mastra)).getWorkflowRunById({ runId });
  const view = run === null ? null : toAdminWorkflowRunView(run);
  if (run === null || view === null) return null;
  const live = await mastra.getWorkflow(run.workflowName).createRun({ runId, ...(run.resourceId === undefined ? {} : { resourceId: run.resourceId }) });
  await live.cancel();
  return view;
};

type SchedulesApi = Pick<Mastra["schedules"], "list" | "get" | "pause" | "resume" | "run">;

/** Tenant schedules of one organization, or every schedule (platform rows included) without a tenant. */
export const listAdminSchedules = async (mastra: Mastra, tenantId: string | null): Promise<AdminSchedule[]> => {
  const all = (await (mastra.schedules as SchedulesApi).list()) as StoredSchedule[];
  const views = all.flatMap((schedule) => toAdminScheduleView(schedule) ?? []);
  return tenantId === null ? views : views.filter((view) => view.tenantId === tenantId);
};

export const SCHEDULE_ACTIONS = ["pause", "resume", "run"] as const;
export type AdminScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/**
 * Pauses, resumes or fires any schedule. A fired tenant schedule still runs with its creator's
 * context, and its first step re-authorizes that creator (decision 0037).
 * @returns the row after the action, or `null` when unknown.
 */
export const actOnAdminSchedule = async (mastra: Mastra, scheduleId: string, action: AdminScheduleAction): Promise<AdminSchedule | null> => {
  if (!/^schedule_[a-z0-9-]{1,120}$/.test(scheduleId)) return null;
  const schedules = mastra.schedules as SchedulesApi;
  const current = (await schedules.get(scheduleId)) as StoredSchedule | null;
  if (current === null || toAdminScheduleView(current) === null) return null;
  if (action === "run") {
    await schedules.run(scheduleId);
    return toAdminScheduleView(current);
  }
  const updated = (action === "pause" ? await schedules.pause(scheduleId) : await schedules.resume(scheduleId)) as StoredSchedule;
  return toAdminScheduleView(updated);
};
