import { z } from "zod";
import { none } from "../field-docs.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";

/**
 * Where the shell renders a navigation item (decision 0015 §2). Core items, SP4's chat and
 * SP5's admin pages use the same slots, so every item is filtered by `can(permission)` alike.
 */
export const NAV_SLOTS = ["organization", "project", "settings", "admin", "user-menu"] as const;
export const NavSlotSchema = z.enum(NAV_SLOTS);
export type NavSlot = z.infer<typeof NavSlotSchema>;

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** A page key of the module, relative to `/m/:moduleId/`: `""` (the module root) or `items/archived`. */
const NAV_PATH = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

/** A navigation entry a module contributes (data only: no component, no route file). */
export const NavItemSchema = z.strictObject({
  id: z
    .string()
    .regex(KEBAB, { error: "Expected a kebab-case id." })
    .meta(none("Id of the item, unique inside the module.")),
  slot: NavSlotSchema.meta(none("Shell slot the item appears in.")),
  labelKey: z.string().min(1).meta(none("i18n key of the label, in the module namespace.")),
  icon: z
    .string()
    .regex(KEBAB, { error: "Expected a kebab-case icon name." })
    .meta(none("Icon name of the client icon registry.")),
  path: z
    .string()
    .regex(NAV_PATH, { error: "Expected a relative path without params, e.g. items/archived." })
    .meta(none("Page key under the module route; empty for its root.")),
  permission: PermissionSchema.optional().meta(none("Shown only when the viewer holds it at the current node.")),
  order: z.int().nonnegative().optional().meta(none("Position inside the slot; lower first, then by id.")),
});
export type NavItem = z.infer<typeof NavItemSchema>;
