// Fixture: a module whose contract id is outside its namespace.
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

export const CATALOG_MODULES = [{ moduleId: "sample", contracts: [StrayContract] }];
