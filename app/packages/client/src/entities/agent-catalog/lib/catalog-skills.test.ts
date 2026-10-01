import { describe, expect, it } from "vitest";
import { buildCatalogAgent } from "../agent-catalog.fixture.ts";
import { skillsOfCatalog } from "./catalog-skills.ts";

describe("skillsOfCatalog", () => {
  it("lists each skill once with its agents and is active when one of them is enabled", () => {
    const shared = { name: "safe-actions", description: "Confirm before changing data.", source: "core" as const };
    const skills = skillsOfCatalog([
      buildCatalogAgent({ key: "action", name: "Action", enabled: false, skills: [shared] }),
      buildCatalogAgent({ key: "data", name: "Data", enabled: true, skills: [shared, { name: "data-catalog", description: "Find entities.", source: "core" }] }),
      buildCatalogAgent({ key: "example-notes", name: "Notes", enabled: false, skills: [{ name: "example-notes", description: "Take notes.", source: "module" }] }),
    ]);
    expect(skills.map((skill) => [skill.name, skill.active, skill.agents.map((agent) => agent.key)])).toEqual([
      ["data-catalog", true, ["data"]],
      ["example-notes", false, ["example-notes"]],
      ["safe-actions", true, ["action", "data"]],
    ]);
  });
});
