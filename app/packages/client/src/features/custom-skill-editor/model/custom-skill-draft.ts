import { CreateCustomSkillInputSchema, type CreateCustomSkillInput, type CustomSkill, type ErrorDetail } from "@core/contracts";

/** The skill form as the user types it; nothing is trusted yet. */
export type SkillDraft = { readonly name: string; readonly description: string; readonly instructions: string; readonly enabled: boolean };

export const SKILL_DRAFT_FIELDS = ["name", "description", "instructions"] as const;
export type SkillDraftField = (typeof SKILL_DRAFT_FIELDS)[number];
/** `invalid`: the field breaks its rule; `tooLong`: the instructions pass the plan's cap; `taken`: the name exists. */
export type SkillProblem = "invalid" | "tooLong" | "taken";
export type SkillDraftProblems = Partial<Record<SkillDraftField, SkillProblem>>;

export const emptySkillDraft = (): SkillDraft => ({ name: "", description: "", instructions: "", enabled: true });

export const draftFromSkill = (skill: CustomSkill): SkillDraft => ({ name: skill.name, description: skill.description, instructions: skill.instructions, enabled: skill.enabled });

const fieldOf = (path: string): SkillDraftField | undefined => SKILL_DRAFT_FIELDS.find((field) => field === path.split(".")[0]);

/** Problems the API reported (`VALIDATION_FAILED` details), mapped to form fields. */
export const skillProblemsFromDetails = (details: readonly ErrorDetail[] | undefined): SkillDraftProblems => {
  const problems: SkillDraftProblems = {};
  for (const detail of details ?? []) {
    const field = fieldOf(detail.field);
    if (field !== undefined) problems[field] = field === "instructions" && detail.issue === "TOO_BIG" ? "tooLong" : "invalid";
  }
  return problems;
};

export type SkillDraftResult = { readonly ok: true; readonly input: CreateCustomSkillInput } | { readonly ok: false; readonly problems: SkillDraftProblems };

/**
 * Builds the wire input and checks it with the contract schema and the plan's instruction cap, for
 * early feedback only: the API validates again and is the authority.
 */
export const skillInputOf = (draft: SkillDraft, maxInstructionChars: number): SkillDraftResult => {
  const parsed = CreateCustomSkillInputSchema.safeParse({ name: draft.name.trim(), description: draft.description, instructions: draft.instructions, enabled: draft.enabled });
  const problems: SkillDraftProblems = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldOf(issue.path.map(String).join("."));
      if (field !== undefined) problems[field] = "invalid";
    }
  }
  if (draft.instructions.length > maxInstructionChars) problems.instructions = "tooLong";
  return parsed.success && Object.keys(problems).length === 0 ? { ok: true, input: parsed.data } : { ok: false, problems };
};
