import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

const count = (description: string) => z.int().nonnegative().meta(none(description));
const rate = (description: string) => z.number().min(0).max(1).meta(none(description));

/** Numbers of the `/admin` overview (SP5 spec §6). */
export const AdminOverviewSchema = z.strictObject({
  organizations: count("Active organizations."),
  activeUsers7d: count("Distinct users with activity in the last 7 days."),
  costMtdMicroUsd: count("Model cost month to date, all tenants, in micro-USD."),
  tripwireRate: rate("Share of agent runs stopped by a guardrail in the last 7 days."),
  approvalRate: rate("Share of settled approval requests approved in the last 7 days."),
  evalStatus: z.enum(["passed", "failed", "unknown"]).meta(none("Verdict of the latest eval gate run.")),
  generatedAt: IsoDateTimeSchema.meta(none("When the numbers were computed (UTC).")),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;

export const AdminOverviewContract = defineContract(AdminOverviewSchema, {
  id: "platform.AdminOverview",
  kind: "view",
  description: "Platform overview for staff: organizations, active users, cost, guardrail and approval rates, eval status.",
  examples: [
    { organizations: 12, activeUsers7d: 87, costMtdMicroUsd: 12_500_000, tripwireRate: 0.01, approvalRate: 0.92, evalStatus: "passed", generatedAt: "2026-09-30T12:00:00.000Z" },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.usage.read",
});
