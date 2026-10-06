import type { CustomSkill } from "@core/contracts";

export const CUSTOM_SKILL_ID = "Sk7cX9zA1sD3fG5hJ7kL";

/** A record in the shape of `agents.CustomSkill` (test data by factory). */
export const buildCustomSkill = (overrides: Partial<Record<keyof CustomSkill, unknown>> = {}): CustomSkill =>
  ({
    id: CUSTOM_SKILL_ID,
    tenantId: "Jd8sK2lPq0WnR5tYu3bV",
    name: "weekly-report",
    description: "How to write the weekly report.",
    instructions: "# Weekly report\n\nStart with a summary.",
    enabled: true,
    createdBy: "uA1b2C3d4E5f6G7h8I9j",
    createdAt: "2026-09-29T14:30:00.000Z",
    updatedAt: "2026-09-29T14:30:00.000Z",
    ...overrides,
  }) as CustomSkill;
