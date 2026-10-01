import type { Permission, Role, UpdateRoleInput } from "@core/contracts";

export type RoleDraft = { name: string; description: string; permissions: Permission[] };

export type RoleDraftProblems = { name?: "required" | "tooLong"; permissions?: boolean };

const NAME_MAX = 80;

export const draftOf = (role: Role | null): RoleDraft =>
  role === null ? { name: "", description: "", permissions: [] } : { name: role.name, description: role.description, permissions: [...role.permissions] };

/** Client checks (the API validates again): a name up to 80 chars and at least one permission. */
export const validateRoleDraft = (draft: RoleDraft): RoleDraftProblems => {
  const name = draft.name.trim();
  return {
    ...(name === "" ? { name: "required" as const } : name.length > NAME_MAX ? { name: "tooLong" as const } : {}),
    ...(draft.permissions.length === 0 ? { permissions: true } : {}),
  };
};

const samePermissions = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** `PATCH` body with only the changed fields, or `null` when nothing changed. */
export const changedRole = (role: Role, draft: RoleDraft): UpdateRoleInput | null => {
  const body: UpdateRoleInput = {
    ...(draft.name.trim() === role.name ? {} : { name: draft.name.trim() }),
    ...(draft.description.trim() === role.description ? {} : { description: draft.description.trim() }),
    ...(samePermissions(draft.permissions, role.permissions) ? {} : { permissions: draft.permissions }),
  };
  return Object.keys(body).length === 0 ? null : body;
};
