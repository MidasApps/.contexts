import { describe, expect, it } from "vitest";
import { composeCoreContracts, composeCoreEndpoints, CORE_ENDPOINTS } from "./composition.ts";

describe("composeCoreContracts", () => {
  it("registers every core contract in a fresh registry", () => {
    expect(composeCoreContracts().listContracts().map((contract) => contract.id)).toEqual([
      "example.Note",
      "http.ErrorEnvelope",
    ]);
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
