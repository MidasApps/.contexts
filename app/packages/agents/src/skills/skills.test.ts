import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import { createSkill, validateSkillContent } from "@mastra/core/skills";
import { describe, expect, it } from "vitest";
import { createTenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import { defineAgentModule } from "../runtime/agent-module.ts";
import { buildAgentContextEntries } from "../testing/agent-context-fixture.ts";
import { createFakeSettingsPort } from "../testing/fake-ports.ts";
import { CORE_SKILLS, createSkillsResolver, isModuleEnabled, loadSkill, SkillLoadError, skillFromContent } from "./resolve-skills.ts";

const SKILLS_DIR = path.join(import.meta.dirname, "..", "..", "skills");
const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

const moduleSkill = createSkill({ name: "example-notes", description: "How to write good notes.", instructions: "Keep notes short." });
const noteModule = defineAgentModule({ id: "example", skills: [moduleSkill] });
const namesOf = (skills: readonly unknown[]) => skills.map((skill) => (typeof skill === "string" ? skill : (skill as { name: string }).name));
const context = () => new RequestContext<unknown>(buildAgentContextEntries());

describe("core skills", () => {
  it.each(skillDirs)("%s/SKILL.md passes validateSkillContent", (name) => {
    const result = validateSkillContent({ content: readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8"), directoryName: name });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("ships the three core skills of spec §7", () => {
    expect(skillDirs.sort()).toEqual(Object.values(CORE_SKILLS).sort());
    expect(loadSkill(CORE_SKILLS.safeActions).instructions).toContain("pending-approval");
  });

  it("refuses a skill whose name differs from its directory or that does not exist", () => {
    const content = readFileSync(path.join(SKILLS_DIR, CORE_SKILLS.dataCatalog, "SKILL.md"), "utf8");
    expect(() => skillFromContent(content, "other-name")).toThrow(SkillLoadError);
    expect(() => loadSkill("missing-skill")).toThrow(SkillLoadError);
  });
});

describe("resolve skills per tenant", () => {
  it("adds module skills only for tenants that enabled the module", async () => {
    const enabled = createSkillsResolver({ core: [loadSkill(CORE_SKILLS.dataCatalog)], modules: [noteModule], settings: createTenantAgentSettingsReader(createFakeSettingsPort({ enabledAgents: ["data", "example-helper"] })) });
    expect(namesOf(await enabled({ requestContext: context() }))).toEqual(["data-catalog", "example-notes"]);
    const disabled = createSkillsResolver({ core: [loadSkill(CORE_SKILLS.dataCatalog)], modules: [noteModule], settings: createTenantAgentSettingsReader(createFakeSettingsPort()) });
    expect(namesOf(await disabled({ requestContext: context() }))).toEqual(["data-catalog"]);
  });

  it("matches a module by its id or an agent key prefixed with it", () => {
    expect(isModuleEnabled("example", new Set(["example"]))).toBe(true);
    expect(isModuleEnabled("example", new Set(["example-helper"]))).toBe(true);
    expect(isModuleEnabled("example", new Set(["examples", "knowledge"]))).toBe(false);
  });

  it("rejects module skills that are not prefixed with the module id", () => {
    expect(() => defineAgentModule({ id: "example", skills: [createSkill({ name: "notes", description: "x", instructions: "y" })] })).toThrow(/UNPREFIXED_CAPABILITY/);
  });
});
