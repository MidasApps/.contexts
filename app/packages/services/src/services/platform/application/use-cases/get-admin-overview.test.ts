import type { EvalExperimentSummary } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createInMemoryConsoleStores } from "../../adapters/driven/in-memory-console-stores.ts";
import type { ApprovalStats } from "../ports/console-ports.ts";
import { makeGetAdminOverview } from "./get-admin-overview.ts";

const NOW = "2026-10-08T12:00:00.000Z";
const clock = fixedClock(NOW);
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.parse(NOW) - days * DAY);

const experiment = (verdict: EvalExperimentSummary["verdict"], finishedAt: string | null, startedAt = "2026-10-01T00:00:00.000Z"): EvalExperimentSummary => ({
  experimentId: `exp-${verdict}-${finishedAt ?? "running"}`,
  datasetId: "ds-1",
  agentId: "data",
  promptVersionId: null,
  status: finishedAt === null ? "running" : "completed",
  itemCount: 10,
  scores: [],
  verdict,
  startedAt,
  finishedAt,
});

const setup = (extra: { approvals?: ApprovalStats; experiments?: () => Promise<EvalExperimentSummary[]> } = {}) => {
  const memory = createInMemoryConsoleStores({ organizations: [{ id: "OrgA" }, { id: "OrgB" }, { id: "OrgC", status: "suspended" }] });
  const evals =
    extra.experiments === undefined
      ? undefined
      : {
          listExperiments: async () => {
            const experiments = await extra.experiments?.();
            return { ok: true as const, data: { experiments: experiments ?? [], hasMore: false } };
          },
        };
  const getOverview = makeGetAdminOverview({
    ...memory.stores,
    clock,
    ...(extra.approvals === undefined ? {} : { approvals: extra.approvals }),
    ...(evals === undefined ? {} : { evals }),
  });
  return { memory, getOverview };
};

describe("admin overview", () => {
  it("counts distinct users with ledger activity in the last 7 days across active organizations", async () => {
    const { memory, getOverview } = setup();
    memory.activity.push(
      { tenantId: "OrgA", userId: "u1", at: ago(1) },
      { tenantId: "OrgA", userId: "u1", at: ago(2) },
      { tenantId: "OrgA", userId: "u2", at: ago(6) },
      { tenantId: "OrgB", userId: "u1", at: ago(3) },
      { tenantId: "OrgB", userId: "u3", at: ago(8) },
      { tenantId: "OrgC", userId: "u4", at: ago(1) },
    );
    expect(await getOverview()).toMatchObject({ organizations: 2, activeUsers7d: 2 });
  });

  it("computes the approval rate of the last 7 days and answers 0 without decisions", async () => {
    const seen: Date[] = [];
    const approvals: ApprovalStats = {
      countDecidedSince: (since) => {
        seen.push(since);
        return Promise.resolve({ approved: 3, rejected: 1 });
      },
    };
    expect((await setup({ approvals }).getOverview()).approvalRate).toBe(0.75);
    expect(seen).toEqual([ago(7)]);
    const none: ApprovalStats = { countDecidedSince: () => Promise.resolve({ approved: 0, rejected: 0 }) };
    expect((await setup({ approvals: none }).getOverview()).approvalRate).toBe(0);
  });

  it("takes the verdict of the latest finished experiment, ignoring runs still pending", async () => {
    const experiments = () =>
      Promise.resolve([
        experiment("passed", "2026-10-05T00:00:00.000Z"),
        experiment("failed", "2026-10-07T00:00:00.000Z"),
        experiment("pending", null, "2026-10-08T00:00:00.000Z"),
      ]);
    expect((await setup({ experiments }).getOverview()).evalStatus).toBe("failed");
  });

  it("answers unknown eval status without experiments, without a console, or when the console fails", async () => {
    expect((await setup({ experiments: () => Promise.resolve([]) }).getOverview()).evalStatus).toBe("unknown");
    expect((await setup().getOverview()).evalStatus).toBe("unknown");
    expect((await setup({ experiments: () => Promise.reject(new Error("mastra down")) }).getOverview()).evalStatus).toBe("unknown");
  });

  it("keeps the tripwire rate at 0 and says it is not measured: guardrail stops are not recorded anywhere yet", async () => {
    const overview = await setup().getOverview();
    expect(overview.tripwireRate).toBe(0);
    expect(overview.unmeasured).toEqual(["tripwireRate"]);
  });
});
