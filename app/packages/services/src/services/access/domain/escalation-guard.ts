import type { Permission } from "@core/contracts";

export type EscalationCheck = { readonly ok: true } | { readonly ok: false; readonly missing: readonly Permission[] };

/**
 * No escalation (SP1 spec §5.3): granting, inviting or creating an API key with
 * permissions P at node N requires P ⊆ effective(actor, N). Returns a Result so the
 * use case maps `missing` to `403 ESCALATION_FORBIDDEN`; it never throws.
 * @example assertNoEscalation({ requested: rolePermissions, actorEffective }) // { ok: false, missing: [...] }
 */
export const assertNoEscalation = (args: {
  requested: Iterable<Permission>;
  actorEffective: ReadonlySet<Permission>;
}): EscalationCheck => {
  const missing = [...new Set(args.requested)].filter((permission) => !args.actorEffective.has(permission)).sort();
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
};
