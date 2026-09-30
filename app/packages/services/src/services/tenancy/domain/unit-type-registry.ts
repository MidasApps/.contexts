import { UnitTypeDefinitionSchema, type UnitTypeDefinition } from "@core/contracts";

export type UnitTypeRegistryErrorCode = "INVALID_UNIT_TYPE" | "DUPLICATE_UNIT_TYPE" | "UNKNOWN_PARENT_TYPE";

/** Startup bug: the module manifests declare conflicting or invalid unit types. */
export class UnitTypeRegistryError extends Error {
  readonly code: UnitTypeRegistryErrorCode;
  readonly unitTypeId: string;

  constructor(args: { code: UnitTypeRegistryErrorCode; unitTypeId: string }) {
    super(`${args.code}: ${args.unitTypeId}`);
    this.name = "UnitTypeRegistryError";
    this.code = args.code;
    this.unitTypeId = args.unitTypeId;
  }
}

/** Where a unit sits: directly under the project, or under a unit of this type. */
export type UnitParentKind = "project" | (string & {});

export type UnitTypeRegistry = {
  /** Every registered type, sorted by id (`GET /v1/unit-types`). */
  readonly list: () => readonly UnitTypeDefinition[];
  readonly get: (id: string) => UnitTypeDefinition | undefined;
  /** Whether a unit of `type` may sit under `parent`; unknown types allow nothing. */
  readonly allowsParent: (args: { type: string; parent: UnitParentKind }) => boolean;
};

const validate = (definitions: readonly unknown[]): UnitTypeDefinition[] =>
  definitions.map((definition) => {
    const parsed = UnitTypeDefinitionSchema.safeParse(definition);
    if (parsed.success) return parsed.data;
    const id = typeof definition === "object" && definition !== null && "id" in definition ? String(definition.id) : "(unknown)";
    throw new UnitTypeRegistryError({ code: "INVALID_UNIT_TYPE", unitTypeId: id });
  });

/**
 * Registry of unit types (SP1 spec §4): `createTenancyServices` passes the core's
 * `CORE_UNIT_TYPES` and the ones the application modules declare.
 * @throws {UnitTypeRegistryError} for an invalid definition, a duplicate id, or an
 *   allowed parent that is neither `project` nor a registered type.
 */
export const createUnitTypeRegistry = (definitions: readonly UnitTypeDefinition[]): UnitTypeRegistry => {
  const byId = new Map<string, UnitTypeDefinition>();
  for (const definition of validate(definitions)) {
    if (byId.has(definition.id)) throw new UnitTypeRegistryError({ code: "DUPLICATE_UNIT_TYPE", unitTypeId: definition.id });
    byId.set(definition.id, definition);
  }
  for (const definition of byId.values()) {
    if (definition.allowedParents.some((parent) => parent !== "project" && !byId.has(parent))) {
      throw new UnitTypeRegistryError({ code: "UNKNOWN_PARENT_TYPE", unitTypeId: definition.id });
    }
  }
  const sorted = [...byId.values()].sort((left, right) => (left.id < right.id ? -1 : 1));
  return {
    list: () => sorted,
    get: (id) => byId.get(id),
    allowsParent: ({ type, parent }) => byId.get(type)?.allowedParents.includes(parent) ?? false,
  };
};
