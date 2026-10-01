import { describe, expect, it } from "vitest";
import { buildCustomSkill } from "#/entities/custom-skill/custom-skill.fixture.ts";
import { draftFromSkill, emptySkillDraft, skillInputOf, skillProblemsFromDetails } from "./custom-skill-draft.ts";

describe("skillInputOf", () => {
  it("builds the wire input of a valid draft", () => {
    const result = skillInputOf({ name: " weekly-report ", description: "How to report.", instructions: "# Report", enabled: false }, 8000);
    expect(result).toEqual({ ok: true, input: { name: "weekly-report", description: "How to report.", instructions: "# Report", enabled: false } });
  });

  it("points at every field that breaks its rule", () => {
    expect(skillInputOf(emptySkillDraft(), 8000)).toEqual({ ok: false, problems: { name: "invalid", description: "invalid", instructions: "invalid" } });
    expect(skillInputOf({ ...draftFromSkill(buildCustomSkill()), name: "Weekly Report" }, 8000)).toEqual({ ok: false, problems: { name: "invalid" } });
  });

  it("refuses instructions longer than the plan allows", () => {
    const draft = { ...draftFromSkill(buildCustomSkill()), instructions: "x".repeat(11) };
    expect(skillInputOf(draft, 10)).toEqual({ ok: false, problems: { instructions: "tooLong" } });
    expect(skillInputOf(draft, 11).ok).toBe(true);
  });
});

describe("skillProblemsFromDetails", () => {
  it("maps API details to form fields", () => {
    expect(skillProblemsFromDetails([{ field: "instructions", issue: "TOO_BIG" }, { field: "name", issue: "INVALID_FORMAT" }, { field: "other", issue: "X" }])).toEqual({
      instructions: "tooLong",
      name: "invalid",
    });
    expect(skillProblemsFromDetails(undefined)).toEqual({});
  });
});
