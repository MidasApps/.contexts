import { describe, expect, it } from "vitest";
import { composeCoreContracts } from "./composition.ts";

describe("composeCoreContracts", () => {
  it("registers every core contract in a fresh registry", () => {
    expect(composeCoreContracts().listContracts().map((contract) => contract.id)).toEqual(["example.Note"]);
  });

  it("can be composed more than once without duplicate-id errors", () => {
    composeCoreContracts();
    expect(() => composeCoreContracts()).not.toThrow();
  });
});
