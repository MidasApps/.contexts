import { z } from "zod";
import { CORE_PERMISSIONS } from "../access/core-permissions.ts";
import { ModuleDefinitionError } from "./module-definition-error.ts";
import { CAPABILITY_KINDS, ModuleManifestSchema, RESERVED_MODULE_IDS, type ModuleManifest } from "./module-manifest.schema.ts";

const CORE_PERMISSION_IDS: ReadonlySet<string> = new Set(CORE_PERMISSIONS.map((permission) => permission.id));
const RESERVED: ReadonlySet<string> = new Set(RESERVED_MODULE_IDS);

const duplicates = (values: readonly string[]): string[] => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

const checkIds = (manifest: ModuleManifest): string[] => {
  const { id } = manifest;
  const permissionIds = manifest.permissions.map((permission) => permission.id);
  const unitTypeIds = (manifest.unitTypes ?? []).map((unitType) => unitType.id);
  return [
    ...(RESERVED.has(id) ? [`id ${id} is reserved (core, platform and the core message namespaces)`] : []),
    ...permissionIds.flatMap((permissionId, index) => (permissionId.startsWith(`${id}.`) ? [] : [`permissions[${index}].id must start with ${id}.`])),
    ...duplicates(permissionIds).map((permissionId) => `duplicate permission ${permissionId}`),
    ...unitTypeIds.flatMap((unitTypeId, index) => (unitTypeId.startsWith(`${id}.`) ? [] : [`unitTypes[${index}].id must start with ${id}.`])),
    ...duplicates(unitTypeIds).map((unitTypeId) => `duplicate unit type ${unitTypeId}`),
  ];
};

const checkNavigation = (manifest: ModuleManifest, own: ReadonlySet<string>): string[] => {
  const items = manifest.navigation ?? [];
  const unknownPermissions = items.flatMap((item, index) =>
    item.permission === undefined || own.has(item.permission) || CORE_PERMISSION_IDS.has(item.permission)
      ? []
      : [`navigation[${index}].permission ${item.permission} is neither declared by the module nor a core permission`],
  );
  return [...duplicates(items.map((item) => item.id)).map((itemId) => `duplicate navigation item ${itemId}`), ...unknownPermissions];
};

const checkSettings = (manifest: ModuleManifest, own: ReadonlySet<string>): string[] => {
  const { settings } = manifest;
  if (settings === undefined) return [];
  return [
    ...(settings.contract.meta.kind === "settings" ? [] : ["settings.contract must have kind settings"]),
    ...(settings.contract.schema instanceof z.ZodObject ? [] : ["settings.contract must be an object schema"]),
    ...(["readPermission", "updatePermission"] as const).flatMap((field) =>
      own.has(settings[field]) ? [] : [`settings.${field} ${settings[field]} must be declared by the module`],
    ),
  ];
};

/** Every message key the manifest references, with where it was declared. */
const messageKeysOf = (manifest: ModuleManifest): { where: string; key: string }[] => [
  { where: "labelKey", key: manifest.labelKey },
  ...manifest.permissions.map((permission, index) => ({ where: `permissions[${index}].descriptionKey`, key: permission.descriptionKey })),
  ...(manifest.unitTypes ?? []).map((unitType, index) => ({ where: `unitTypes[${index}].labelKey`, key: unitType.labelKey })),
  ...(manifest.navigation ?? []).map((item, index) => ({ where: `navigation[${index}].labelKey`, key: item.labelKey })),
];

const hasMessage = (tree: unknown, path: readonly string[]): boolean => {
  const leaf = path.reduce<unknown>((node, segment) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[segment] : undefined), tree);
  return typeof leaf === "string" && leaf.length > 0;
};

const checkMessages = (manifest: ModuleManifest): string[] => {
  const locales = Object.entries(manifest.messages);
  if (locales.length === 0) return ["messages must have at least one locale"];
  const prefix = `${manifest.id}.`;
  return messageKeysOf(manifest).flatMap(({ where, key }) => {
    if (!key.startsWith(prefix)) return [`${where} ${key} must start with ${prefix}`];
    const path = key.slice(prefix.length).split(".");
    return locales.flatMap(([locale, tree]) => (hasMessage(tree, path) ? [] : [`${key} is missing in ${locale}`]));
  });
};

const checkCapabilities = (manifest: ModuleManifest): string[] =>
  CAPABILITY_KINDS.flatMap((kind) => {
    const ids = (manifest[kind] ?? []).map((ref) => ref.id);
    const unprefixed = ids.flatMap((refId, index) =>
      refId.startsWith(`${manifest.id}-`) || refId.startsWith(`${manifest.id}.`) ? [] : [`${kind}[${index}].id must start with ${manifest.id}- or ${manifest.id}.`],
    );
    return [...unprefixed, ...duplicates(ids).map((refId) => `duplicate ${kind} ref ${refId}`)];
  });

const schemaProblems = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.length === 0 ? "(manifest)" : issue.path.map(String).join(".")}: ${issue.message}`);

const readModuleId = (manifest: unknown): string =>
  typeof manifest === "object" && manifest !== null && "id" in manifest && typeof manifest.id === "string" ? manifest.id : "<unknown>";

/**
 * Validates a module manifest (decision 0015) and returns it unchanged. Pure: nothing is
 * registered; the apps list their modules explicitly (`apps/<app>/src/modules.ts`).
 * @throws {ModuleDefinitionError} listing every problem: bad shape, reserved id, ids outside the
 *   module prefix, duplicates, unknown navigation or settings permissions, a settings contract
 *   that is not `kind: "settings"` over an object, or message keys missing from a locale.
 * @example export const sampleManifest = defineModule({ id: "sample", labelKey: "sample.module.name", permissions: [], messages: { "pt-BR": { module: { name: "Amostra" } } } });
 */
export const defineModule = <const M extends ModuleManifest>(manifest: M): M => {
  const parsed = ModuleManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new ModuleDefinitionError({ moduleId: readModuleId(manifest), problems: schemaProblems(parsed.error) });
  const own: ReadonlySet<string> = new Set(parsed.data.permissions.map((permission) => permission.id));
  const problems = [
    ...checkIds(parsed.data),
    ...checkNavigation(parsed.data, own),
    ...checkSettings(parsed.data, own),
    ...checkMessages(parsed.data),
    ...checkCapabilities(parsed.data),
  ];
  if (problems.length > 0) throw new ModuleDefinitionError({ moduleId: parsed.data.id, problems });
  return manifest;
};
