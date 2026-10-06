import type { Plan } from "@core/contracts";
import type { ConsoleDeps } from "../console-deps.ts";

export type ListPlans = () => Promise<readonly Plan[]>;

/** The plan catalog, by name (`GET /v1/admin/plans`; the handler authorized staff). */
export const makeListPlans =
  (deps: Pick<ConsoleDeps, "plans">): ListPlans =>
  () =>
    deps.plans.list();
