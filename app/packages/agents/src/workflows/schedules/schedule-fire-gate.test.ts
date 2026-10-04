import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { gateScheduleFires } from "./schedule-fire-gate.ts";

const WORKFLOW_ID = "gate-probe";
const PAST = Date.parse("2026-01-01T00:00:00.000Z");

const probe = createWorkflow({ id: WORKFLOW_ID, inputSchema: z.object({}), outputSchema: z.object({}) })
  .then(
    createStep({
      id: "noop",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      execute: ({ inputData }) => Promise.resolve(inputData),
    }),
  )
  .commit();

/** A store with one due schedule row, gated by a switch the test flips. */
const setup = async () => {
  const flag = { on: false as boolean | "throws" };
  const decisions: string[] = [];
  const storage = gateScheduleFires({
    storage: new InMemoryStore(),
    isEnabled: () => (flag.on === "throws" ? Promise.reject(new Error("store down")) : Promise.resolve(flag.on)),
    logger: { info: (message) => decisions.push(message) },
  });
  const schedules = await storage.getStore("schedules");
  if (schedules === undefined) throw new Error("no schedules domain");
  await schedules.createSchedule({
    id: "schedule_due",
    target: { type: "workflow", workflowId: WORKFLOW_ID },
    cron: "* * * * *",
    status: "active",
    nextFireAt: PAST,
    createdAt: PAST,
    updatedAt: PAST,
  });
  return { flag, decisions, storage, schedules };
};

let mastra: Mastra | undefined;
afterEach(async () => {
  await mastra?.stopWorkers();
  mastra = undefined;
});

describe("workflows.schedules gate on schedule fires", () => {
  it("lists no due schedule while the flag is off and the due rows once it is on, leaving rows untouched", async () => {
    const { flag, decisions, schedules } = await setup();
    expect(await schedules.listDueSchedules(Date.now())).toEqual([]);
    expect((await schedules.getSchedule("schedule_due"))?.nextFireAt).toBe(PAST);
    flag.on = true;
    expect((await schedules.listDueSchedules(Date.now())).map((row) => row.id)).toEqual(["schedule_due"]);
    expect(decisions).toEqual(["schedule_fires_paused", "schedule_fires_resumed"]);
  });

  it("keeps firing when the flag cannot be read (the caller's fallback decides; this gate only reads it)", async () => {
    const { flag, schedules } = await setup();
    flag.on = "throws";
    expect((await schedules.listDueSchedules(Date.now())).map((row) => row.id)).toEqual(["schedule_due"]);
  });

  it("holds Mastra's scheduler tick while off, and the due fire happens once when turned back on", async () => {
    const { flag, storage, schedules } = await setup();
    mastra = new Mastra({
      workflows: { [WORKFLOW_ID]: probe },
      storage,
      logger: false,
      scheduler: { enabled: true, tickIntervalMs: 3_600_000 },
    });
    await mastra.startWorkers();
    await mastra.scheduler?.tick();
    expect((await schedules.getSchedule("schedule_due"))?.lastRunId).toBeUndefined();
    flag.on = true;
    await mastra.scheduler?.tick();
    const fired = await schedules.getSchedule("schedule_due");
    expect(fired?.lastRunId).toBe(`sched_schedule_due_${PAST}`);
    expect(fired?.nextFireAt).toBeGreaterThan(Date.now() - 1000);
  });
});
