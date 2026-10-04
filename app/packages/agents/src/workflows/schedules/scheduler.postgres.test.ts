import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { PostgresStore } from "@mastra/pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../../testing/agent-context-fixture.ts";
import {
  createFakeAccessPort,
  createRecordingNotificationPort,
  type FakeMembership,
} from "../../testing/fake-ports.ts";
import { SCHEDULE_ID_CONTEXT_KEY, type StoredRun } from "../runs/workflow-run-view.ts";
import { createReauthorizeScheduleCreatorStep } from "../steps/reauthorize-schedule-creator.step.ts";
import { createWorkflowCatalog, policyOf } from "../workflow-catalog.ts";
import { minIntervalMinutesOf } from "./schedule-policy.ts";
import { handleCreateSchedule, type TenantScheduleRouteDeps } from "./tenant-schedule-routes.ts";

// Mastra Schedules on the local Postgres (schema `mastra`, `pnpm -F @core/mastra db:init`), with the
// local 1-minute policy (decision 0037). The scheduler polls every 500 ms; a `* * * * *` schedule
// must fire on its own within the next minute boundary.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://app:app@127.0.0.1:5432/app";
const WORKFLOW_ID = "schedule-probe";
const CREATOR = ["core.schedule.read", "core.schedule.write", "core.workflow-run.read"];
const suffix = Date.now().toString(36);

const memberships: FakeMembership[] = [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: CREATOR }];
const access = createFakeAccessPort({ memberships });
const notifications = createRecordingNotificationPort();
const seen: { scheduleId: unknown; userId: unknown; permissions: unknown; resourceId: unknown }[] = [];

const inputSchema = z.strictObject({ label: z.string().min(1) });
const probe = createWorkflow({ id: WORKFLOW_ID, inputSchema, outputSchema: z.strictObject({ label: z.string() }) })
  .then(createReauthorizeScheduleCreatorStep({ access, notifications, workflowId: WORKFLOW_ID, inputSchema }))
  .then(
    createStep({
      id: "record",
      inputSchema,
      outputSchema: z.strictObject({ label: z.string() }),
      execute: ({ inputData, requestContext }) => {
        seen.push({
          scheduleId: requestContext.get(SCHEDULE_ID_CONTEXT_KEY),
          userId: requestContext.get("userId"),
          permissions: requestContext.get("permissions"),
          resourceId: requestContext.get("mastra__resourceId"),
        });
        return Promise.resolve(inputData);
      },
    }),
  )
  .commit();

const storage = new PostgresStore({ id: "scheduler-test-store", connectionString: DATABASE_URL, schemaName: "mastra" });
let mastra: Mastra;
const created: string[] = [];

const deps: TenantScheduleRouteDeps = {
  access,
  catalog: createWorkflowCatalog([policyOf(WORKFLOW_ID, { schedulable: true })]),
  minIntervalMinutes: minIntervalMinutesOf({ APP_ENV: "local", SCHEDULE_MIN_INTERVAL_MINUTES: 1 }),
  logger: { info: () => undefined, error: () => undefined },
};

const createSchedule = async (slug: string): Promise<string> => {
  const requestContext = new RequestContext<unknown>(buildAgentContextEntries({ permissions: CREATOR }));
  const body = {
    workflowId: WORKFLOW_ID,
    slug: `${slug}-${suffix}`,
    cron: "* * * * *",
    timezone: "America/Sao_Paulo",
    inputData: { label: slug },
  };
  const response = await handleCreateSchedule(deps, () => Promise.resolve(body))({ mastra, requestContext });
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as { data: { id: string; status: string; nextFireAt: string } };
  created.push(data.id);
  return data.id;
};

const runsOf = async (scheduleId: string): Promise<StoredRun[]> => {
  const store = await storage.getStore("workflows");
  const { runs } = (await store?.listWorkflowRuns({ workflowName: WORKFLOW_ID })) ?? { runs: [] };
  return runs.filter((run) => run.runId.startsWith(`sched_${scheduleId}_`));
};

const waitFor = async <T>(probeValue: () => Promise<T | undefined>, timeoutMs: number): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probeValue();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("timed out");
};

const settledRun = (scheduleId: string) => async () => {
  const runs = await runsOf(scheduleId);
  const run = runs.find((candidate) => {
    const status = (
      typeof candidate.snapshot === "string"
        ? (JSON.parse(candidate.snapshot) as { status?: string })
        : (candidate.snapshot as { status?: string })
    ).status;
    return status === "success" || status === "failed";
  });
  return run === undefined ? undefined : { run, status: (run.snapshot as { status: string }).status };
};

beforeAll(async () => {
  await storage.init();
  mastra = new Mastra({
    workflows: { [WORKFLOW_ID]: probe },
    storage,
    logger: false,
    scheduler: { enabled: true, tickIntervalMs: 500 },
  });
  await mastra.startWorkers();
});

afterAll(async () => {
  for (const id of created) await mastra.schedules.delete(id);
  await mastra.stopWorkers();
  await storage.close?.();
});

describe("tenant schedules on Mastra Schedules (Postgres)", () => {
  it("run-now starts a run with the schedule's request context, re-authorized with current grants", async () => {
    const id = await createSchedule("manual");
    expect(id).toMatch(/^schedule_[a-f0-9]{16}-manual-/);
    await mastra.schedules.run(id);
    const { run, status } = await waitFor(settledRun(id), 20_000);
    expect(status).toBe("success");
    expect(run.resourceId).toBe(`${TEST_TENANT}:${TEST_UID}`);
    expect(seen.find((entry) => entry.scheduleId === id)).toEqual({
      scheduleId: id,
      userId: TEST_UID,
      permissions: [...CREATOR].sort(),
      resourceId: `${TEST_TENANT}:${TEST_UID}`,
    });
  }, 30_000);

  it("fires on its own with the local 1-minute policy", async () => {
    const id = await createSchedule("tick");
    const { status } = await waitFor(settledRun(id), 75_000);
    expect(status).toBe("success");
  }, 90_000);

  it("pauses the schedule, notifies the creator and fails the run when the creator lost access", async () => {
    const id = await createSchedule("revoked");
    const membership = memberships[0];
    if (membership === undefined) throw new Error("no membership");
    memberships[0] = { ...membership, permissions: ["core.schedule.read"] };
    try {
      await mastra.schedules.run(id);
      const { status } = await waitFor(settledRun(id), 20_000);
      expect(status).toBe("failed");
      expect(seen.some((entry) => entry.scheduleId === id)).toBe(false);
      expect((await mastra.schedules.get(id))?.status).toBe("paused");
      expect(notifications.sent).toContainEqual({
        tenantId: TEST_TENANT,
        recipientUid: TEST_UID,
        kind: "SCHEDULE_PAUSED",
        data: { scheduleId: id, workflowId: WORKFLOW_ID, reason: "FORBIDDEN" },
      });
    } finally {
      memberships[0] = membership;
    }
  }, 30_000);
});
