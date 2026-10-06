// Fixture workspace composition: one module contributing one settings contract and one endpoint.
import { z } from "zod";
import { defineContract } from "../../../../src/contracts/contract.ts";
import { defineEndpoint } from "../../../../src/contracts/http/endpoint.ts";
import { dataEnvelope } from "../../../../src/contracts/http/envelopes.schema.ts";

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

const getSampleThingEndpoint = defineEndpoint({
  id: "sample.getThing",
  method: "GET",
  path: "/v1/sample-things",
  auth: "principal",
  responses: { 200: dataEnvelope(SampleSettingsContract.schema) },
  summary: "Reads the fixture module's thing.",
});

export const CATALOG_MODULES = [
  { moduleId: "sample", contracts: [SampleSettingsContract], endpoints: [getSampleThingEndpoint] },
];
