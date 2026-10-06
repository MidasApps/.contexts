"use client";

import { type Role, type RoleRef, roleRefKey, SYSTEM_ROLE_KEYS, type SystemRoleKey } from "@core/contracts";
import { useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";

/** A role a grant can hold, ready for a checklist. */
export type RoleOption = {
  /** `roleRefKey(ref)`: `system:admin`, `custom:<id>`. */
  readonly key: string;
  readonly ref: RoleRef;
  readonly label: string;
  readonly description: string;
};

/** System roles people can receive; `device` is only for device grants (SP1 spec §5.1). */
export const PERSON_SYSTEM_ROLES: readonly SystemRoleKey[] = SYSTEM_ROLE_KEYS.filter((key) => key !== "device");

/** System roles a device activation can carry. */
export const DEVICE_SYSTEM_ROLES: readonly SystemRoleKey[] = ["device"];

/**
 * Role options: the given system roles (translated) followed by the organization's custom roles
 * (their own names, never translated).
 */
export const useRoleOptions = (
  customRoles: readonly Role[] | undefined,
  systemRoles: readonly SystemRoleKey[] = PERSON_SYSTEM_ROLES,
): readonly RoleOption[] => {
  const t = useTranslations("settings.roles.system");
  return useMemo(() => {
    const system = systemRoles.map((key): RoleOption => {
      const ref: RoleRef = { kind: "system", key };
      return { key: roleRefKey(ref), ref, label: t(`${key}.name`), description: t(`${key}.description`) };
    });
    const custom = (customRoles ?? []).map((role): RoleOption => {
      const ref: RoleRef = { kind: "custom", roleId: role.id };
      return { key: roleRefKey(ref), ref, label: role.name, description: role.description };
    });
    return [...system, ...custom];
  }, [customRoles, systemRoles, t]);
};

/**
 * Names a role ref: system roles by their translated name, custom roles by their name (a role
 * deleted meanwhile shows the "removed role" copy instead of an id).
 */
export const useRoleRefLabel = (customRoles: readonly Role[] | undefined): ((ref: RoleRef) => string) => {
  const t = useTranslations("settings.roles");
  return useCallback(
    (ref: RoleRef) => {
      if (ref.kind === "system") return t(`system.${ref.key}.name`);
      return customRoles?.find((role) => role.id === ref.roleId)?.name ?? t("unknownRole");
    },
    [customRoles, t],
  );
};
