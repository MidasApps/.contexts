import { describe, expect, it } from "vitest";
import { composeCoreContracts, composeCoreEndpoints, CORE_CONTRACTS, CORE_ENDPOINTS } from "./composition.ts";
import { IDENTITY_CONTRACTS } from "./contracts/identity/contracts.ts";
import { TENANCY_CONTRACTS } from "./contracts/tenancy/contracts.ts";
import { inspectSchema } from "./contracts/field-meta-rules.ts";

describe("composeCoreContracts", () => {
  it("registers every core contract in a fresh registry, sorted by id", () => {
    const ids = composeCoreContracts().listContracts().map((contract) => contract.id);
    expect(ids).toEqual([...CORE_CONTRACTS.map((contract) => contract.id)].sort());
    expect(ids).toEqual(expect.arrayContaining([...TENANCY_CONTRACTS, ...IDENTITY_CONTRACTS].map((contract) => contract.id)));
    expect(ids).toEqual(expect.arrayContaining([
      "agents.AgentRequestContext",
      "agents.AgentSettings",
      "agents.ApprovalRequest",
      "agents.ToolUi",
      "connectors.Connector",
      "connectors.ConnectorToolPolicy",
      "example.Note",
      "files.FileUploadRequest",
      "files.StoredFile",
      "http.ErrorEnvelope",
      "knowledge.Citation",
      "knowledge.KnowledgeDocument",
      "knowledge.KnowledgeSource",
      "usage.LlmCall",
      "usage.UsageSummary",
    ]));
  });

  it("keeps every field meta valid after registration (a nested registered schema would inherit contract meta)", () => {
    const problems = composeCoreContracts()
      .listContracts()
      .flatMap((contract) => inspectSchema(contract.schema).problems.map((problem) => `${contract.id}.${problem.path}`));
    expect(problems).toEqual([]);
  });

  it("parses every catalog example with its own schema", () => {
    const failing = CORE_CONTRACTS.flatMap((contract) =>
      contract.meta.examples.filter((example) => !contract.schema.safeParse(example).success).map(() => contract.id),
    );
    expect(failing).toEqual([]);
  });

  it("can be composed more than once without duplicate-id errors", () => {
    composeCoreContracts();
    expect(() => composeCoreContracts()).not.toThrow();
  });
});

describe("composeCoreEndpoints", () => {
  it("builds a registry with every core endpoint", () => {
    expect(composeCoreEndpoints().list()).toHaveLength(CORE_ENDPOINTS.length);
  });

  it("can be composed more than once", () => {
    composeCoreEndpoints();
    expect(() => composeCoreEndpoints()).not.toThrow();
  });
});
