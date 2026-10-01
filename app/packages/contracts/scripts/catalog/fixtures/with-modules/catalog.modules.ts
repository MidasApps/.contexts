// Fixture workspace composition: one module contributing one settings contract.
import { z } from "zod";
import { defineContract } from "../../../../src/contracts/contract.ts";

const SampleSettingsContract = defineContract(
  z.object({ label: z.string().min(1).meta({ description: "Label.", pii: "none" }) }),
  {
    id: "sample.SampleSettings",
    kind: "settings",
    description: "Settings of the fixture module.",
    examples: [{ label: "Hi" }],
    pii: "none",
    tenancyScope: "organization",
    relations: [],
  },
);

export const CATALOG_MODULES = [{ moduleId: "sample", contracts: [SampleSettingsContract] }];
