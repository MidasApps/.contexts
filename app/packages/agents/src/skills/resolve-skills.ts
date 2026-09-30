import { readFileSync } from "node:fs";
import path from "node:path";
import { type AgentSkillsResolver, createSkill, type InlineSkill, validateSkillContent } from "@mastra/core/skills";
import type { TenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import type { AgentModule } from "../runtime/agent-module.ts";

/**
 * Agent Skills (spec §7, decision 0029 D3-21): `SKILL.md` directories attached with the
 * agent-level `skills` option as inline skills (no Workspace, so no file-write tools; the
 * skill tools are read-only). Core skills live in `packages/agents/skills/<name>/SKILL.md`;
 * `apps/mastra` copies them next to the bundle (`public/skills`). Module skills come from
 * `AgentModule.skills` and reach a tenant only when it enabled the module.
 */

export const CORE_SKILLS = { dataCatalog: "data-catalog", knowledgeCitations: "knowledge-citations", safeActions: "safe-actions" } as const;

/** Boot error: a skill is missing or its SKILL.md is invalid. */
export class SkillLoadError extends Error {
  readonly code = "SKILL_INVALID";
  readonly skillName: string;

  constructor(skillName: string, reason: string, options?: ErrorOptions) {
    super(`skill ${skillName}: ${reason}`, options);
    this.name = "SkillLoadError";
    this.skillName = skillName;
  }
}

/** Bundle copy first (`<bundle>/skills`), then the package source folder. */
export const CORE_SKILL_DIRS: readonly string[] = [path.join(import.meta.dirname, "skills"), path.join(import.meta.dirname, "..", "..", "skills")];

const readSkillFile = (name: string, dirs: readonly string[]): string => {
  let lastError: unknown;
  for (const dir of dirs) {
    try {
      return readFileSync(path.join(dir, name, "SKILL.md"), "utf8");
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw new SkillLoadError(name, "SKILL.md not found", { cause: lastError });
};

/**
 * Parses a SKILL.md into an inline skill; the frontmatter `name` must equal the directory.
 * @throws {SkillLoadError} when the content fails Mastra's `validateSkillContent`.
 */
export const skillFromContent = (content: string, directoryName: string): InlineSkill => {
  const result = validateSkillContent({ content, directoryName });
  const description = result.metadata?.description;
  if (!result.valid || typeof description !== "string" || result.instructions === undefined) {
    throw new SkillLoadError(directoryName, result.errors.join("; ") || "missing description or body");
  }
  return createSkill({ name: directoryName, description, instructions: result.instructions });
};

/** @throws {SkillLoadError} for an unknown or invalid skill (boot error). */
export const loadSkill = (name: string, dirs: readonly string[] = CORE_SKILL_DIRS): InlineSkill => skillFromContent(readSkillFile(name, dirs), name);

/** A module is enabled for a tenant when `enabledAgents` names it or one of its agents (`<module>-<agent>`). */
export const isModuleEnabled = (moduleId: string, enabledAgents: ReadonlySet<string>): boolean =>
  [...enabledAgents].some((key) => key === moduleId || key.startsWith(`${moduleId}-`));

/**
 * The `skills` option of an agent: its core skills plus the skills of the modules the
 * run's tenant enabled (read from the server-side context, never from the model).
 */
export const createSkillsResolver = (args: {
  readonly core: readonly InlineSkill[];
  readonly modules: readonly AgentModule[];
  readonly settings: TenantAgentSettingsReader;
}): AgentSkillsResolver => {
  const moduleSkills = args.modules.filter((module) => (module.skills ?? []).length > 0);
  return async ({ requestContext }) => {
    if (moduleSkills.length === 0) return [...args.core];
    const { enabledAgents } = await args.settings(requestContext);
    const enabled = moduleSkills.filter((module) => isModuleEnabled(module.id, enabledAgents)).flatMap((module) => module.skills ?? []);
    return [...args.core, ...enabled];
  };
};
