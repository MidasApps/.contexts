import { z } from "zod";

/**
 * System roles of every organization (SP1 spec §5.1). `owner` holds every tenant
 * permission of the registry, `admin` all but `core.organization.delete`; the others
 * hold what each permission's `defaultRoles` lists. `device` is the role of device grants.
 */
export const SYSTEM_ROLE_KEYS = ["owner", "admin", "member", "viewer", "device"] as const;
export const SystemRoleKeySchema = z.enum(SYSTEM_ROLE_KEYS);
export type SystemRoleKey = z.infer<typeof SystemRoleKeySchema>;

/** The one tenant permission `admin` does not get by rule. */
export const OWNER_ONLY_PERMISSION = "core.organization.delete";
