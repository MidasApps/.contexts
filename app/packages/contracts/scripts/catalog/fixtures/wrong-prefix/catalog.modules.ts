// Fixture: a module whose contract and endpoint ids are outside its namespace.
import { z } from "zod";
import { defineContract } from "../../../../src/contracts/contract.ts";

const StrayContract = defineContract(z.object({ label: z.string().meta({ description: "Label.", pii: "none" }) }), {
  id: "tenancy.Stray",
  kind: "settings",
  description: "A contract outside the module namespace.",
  examples: [{ label: "x" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});

// Not a defineEndpoint() call: only the id matters for the prefix check.
const strayEndpoint = { id: "tenancy.stray", method: "GET", path: "/v1/stray", responses: {} };

export const CATALOG_MODULES = [{ moduleId: "sample", contracts: [StrayContract], endpoints: [strayEndpoint] }];
