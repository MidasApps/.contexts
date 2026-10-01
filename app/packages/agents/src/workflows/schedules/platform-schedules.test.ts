import { describe, expect, it } from "vitest";
import { ensurePlatformSchedules, platformScheduleIdOf } from "./platform-schedules.ts";

type Row = { id: string; workflowId: string; cron: string; timezone?: string; status: "active" | "paused" };

const fakeSchedules = (rows: Row[]) => {
  const calls: string[] = [];
  return {
    calls,
    rows,
    api: {
      get: (id: string) => Promise.resolve(rows.find((row) => row.id === id) ?? null),
      create: (input: { id?: string; workflowId: string; cron: string; timezone?: string }) => {
        calls.push(`create ${input.id ?? ""}`);
        const row: Row = { id: input.id ?? "", workflowId: input.workflowId, cron: input.cron, status: "active", ...(input.timezone === undefined ? {} : { timezone: input.timezone }) };
        rows.push(row);
        return Promise.resolve(row);
      },
      update: (id: string, patch: { cron?: string; timezone?: string }) => {
        calls.push(`update ${id}`);
        const row = rows.find((candidate) => candidate.id === id);
        if (row !== undefined) Object.assign(row, patch);
        return Promise.resolve(row);
      },
    },
  };
};

const logger = { info: () => undefined };

describe("ensurePlatformSchedules", () => {
  it("creates missing rows in UTC, realigns a changed cron and leaves a paused row paused", async () => {
    const paused: Row = { id: platformScheduleIdOf("conversation-purge"), workflowId: "conversation-purge", cron: "30 4 * * *", timezone: "UTC", status: "paused" };
    const stale: Row = { id: platformScheduleIdOf("usage-report"), workflowId: "usage-report", cron: "0 * * * *", timezone: "UTC", status: "active" };
    const fake = fakeSchedules([paused, stale]);
    const specs = [
      { workflowId: "catalog-reindex", cron: "0 3 * * *" },
      { workflowId: "usage-report", cron: "15 * * * *" },
      { workflowId: "conversation-purge", cron: "30 4 * * *" },
    ];
    await ensurePlatformSchedules({ schedules: fake.api as never, specs, logger });
    expect(fake.calls).toEqual([`create ${platformScheduleIdOf("catalog-reindex")}`, `update ${platformScheduleIdOf("usage-report")}`]);
    expect(fake.rows.find((row) => row.workflowId === "catalog-reindex")).toMatchObject({ cron: "0 3 * * *", timezone: "UTC" });
    expect(stale.cron).toBe("15 * * * *");
    expect(paused.status).toBe("paused");
    await ensurePlatformSchedules({ schedules: fake.api as never, specs, logger });
    expect(fake.calls).toHaveLength(2);
  });
});
