import { z } from "zod";
import { PermissionDefinitionSchema } from "../access/permission-definition.schema.ts";
import type { ContractDefinition } from "../contract.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { LocaleSchema } from "../primitives/locale.schema.ts";
import { UnitTypeDefinitionSchema } from "../tenancy/unit-type.schema.ts";
import { CapabilityRefSchema } from "./capability-ref.schema.ts";
import { NavItemSchema } from "./nav-item.schema.ts";

/**
 * Ids a module may not take: the core's permission prefixes and every core message namespace
 * (decision 0015 amendment). `@core/contracts` cannot import `@core/i18n`, so the client keeps a
 * parity test against `CORE_MESSAGES`; add a namespace there and here together.
 */
export const RESERVED_MODULE_IDS = ["core", "platform", "common", "errors", "shell", "auth", "profile", "settings", "admin", "permissions"] as const;

/** Kebab-case module id: permission prefix, message namespace and route segment (`/m/:moduleId`). */
export const ModuleIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, { error: "Expected a kebab-case module id." });
export type ModuleId = z.infer<typeof ModuleIdSchema>;

const isContractDefinition = (value: unknown): value is ContractDefinition =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string" &&
  "meta" in value &&
  typeof value.meta === "object" &&
  "schema" in value &&
  value.schema instanceof z.ZodType;

/** The module's settings: a `settings` contract plus the permissions that read and change it. */
export const ModuleSettingsDefinitionSchema = z.strictObject({
  contract: z.custom<ContractDefinition>(isContractDefinition, { error: "Expected a contract from defineContract()." }),
  readPermission: PermissionSchema,
  updatePermission: PermissionSchema,
});
export type ModuleSettingsManifest = z.infer<typeof ModuleSettingsDefinitionSchema>;

/** One namespace (= module id) of messages per locale; `i18n:check` enforces the supported set. */
const MessagesSchema = z.record(LocaleSchema, z.record(z.string(), z.unknown()));

/**
 * The data-only module manifest (decision 0015 §1): safe to import on server and client. Field
 * shapes are checked here; cross-field rules (prefixes, duplicates, message keys) in `defineModule`.
 */
export const ModuleManifestSchema = z.strictObject({
  id: ModuleIdSchema,
  labelKey: z.string().min(1),
  permissions: z.array(PermissionDefinitionSchema),
  unitTypes: z.array(UnitTypeDefinitionSchema).optional(),
  navigation: z.array(NavItemSchema).optional(),
  settings: ModuleSettingsDefinitionSchema.optional(),
  messages: MessagesSchema,
  agents: z.array(CapabilityRefSchema).optional(),
  tools: z.array(CapabilityRefSchema).optional(),
  workflows: z.array(CapabilityRefSchema).optional(),
  skills: z.array(CapabilityRefSchema).optional(),
});
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export const CAPABILITY_KINDS = ["agents", "tools", "workflows", "skills"] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];
