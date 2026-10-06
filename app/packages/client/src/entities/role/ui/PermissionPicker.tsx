"use client";

import type { Permission, PermissionDefinition } from "@core/contracts";
import { useId, useMemo } from "react";
import { useTranslations } from "use-intl";
import { useModuleRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";
import { groupPermissionsByModule, type PermissionModuleGroup } from "../model/group-permissions.ts";

export type PermissionPickerProps = {
  legend: string;
  permissions: readonly PermissionDefinition[];
  value: readonly Permission[];
  onChange: (permissions: Permission[]) => void;
  /** Only these can be added (the actor's own permissions: no escalation); a selected one can always be removed. */
  grantable?: ((permission: Permission) => boolean) | undefined;
  error?: string | undefined;
};

/** A translated description when the registry key has copy, else the permission id itself. */
const usePermissionLabel = () => {
  const t = useTranslations();
  return (definition: PermissionDefinition): string =>
    t.has(definition.descriptionKey) ? t(definition.descriptionKey) : definition.id;
};

const useModuleLabel = () => {
  const t = useTranslations();
  const modules = useModuleRegistry();
  return (moduleId: string): string => {
    if (moduleId === "core") return t("settings.roles.picker.coreModule");
    const labelKey = modules.get(moduleId)?.manifest.labelKey;
    return labelKey !== undefined && t.has(labelKey) ? t(labelKey) : moduleId;
  };
};

type ModuleGroupProps = {
  group: PermissionModuleGroup;
  label: string;
  selected: ReadonlySet<string>;
  grantable: (permission: Permission) => boolean;
  onToggle: (permission: Permission, checked: boolean) => void;
};

function ModuleGroup({ group, label, selected, grantable, onToggle }: ModuleGroupProps) {
  const t = useTranslations("settings.roles.picker");
  const labelOf = usePermissionLabel();
  const id = useId();
  const ids = group.resources.flatMap((resource) => resource.permissions.map((permission) => permission.id));
  const count = ids.filter((permission) => selected.has(permission)).length;
  return (
    <FieldSet className="rounded-lg border border-border p-4">
      <FieldLegend className="px-1">
        {label}{" "}
        <span className="font-normal text-muted-foreground">{t("selectedCount", { count, total: ids.length })}</span>
      </FieldLegend>
      {group.resources.map((resource) => (
        <div key={resource.resource} className="flex flex-col gap-2">
          <p className="font-mono text-caption tracking-wide text-muted-foreground uppercase">{resource.resource}</p>
          <ul className="flex flex-col gap-2">
            {resource.permissions.map((permission) => {
              const checked = selected.has(permission.id);
              return (
                <li key={permission.id} className="flex items-start gap-2.5">
                  <Checkbox
                    id={`${id}-${permission.id}`}
                    className="mt-0.5"
                    checked={checked}
                    disabled={!checked && !grantable(permission.id)}
                    onCheckedChange={(next) => onToggle(permission.id, next === true)}
                  />
                  <Label htmlFor={`${id}-${permission.id}`} className="flex flex-col items-start gap-0.5 font-normal">
                    <span>{labelOf(permission)}</span>
                    <span className="font-mono text-caption text-muted-foreground">{permission.id}</span>
                  </Label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </FieldSet>
  );
}

const allowAll = (): boolean => true;

/**
 * Permission checklist grouped by module and resource (SP2 spec §8 role editor, API key scopes),
 * labelled with each permission's `descriptionKey` and its id in mono. Permissions outside
 * `grantable` stay disabled.
 */
export function PermissionPicker({
  legend,
  permissions,
  value,
  onChange,
  grantable = allowAll,
  error,
}: PermissionPickerProps) {
  const id = useId();
  const moduleLabel = useModuleLabel();
  const groups = useMemo(() => groupPermissionsByModule(permissions), [permissions]);
  const selected = new Set<string>(value);
  const toggle = (permission: Permission, checked: boolean): void => {
    onChange(checked ? [...value, permission] : value.filter((current) => current !== permission));
  };
  return (
    <FieldSet
      aria-describedby={error === undefined ? undefined : `${id}-error`}
      aria-invalid={error === undefined ? undefined : true}
    >
      <FieldLegend>{legend}</FieldLegend>
      {groups.map((group) => (
        <ModuleGroup
          key={group.moduleId}
          group={group}
          label={moduleLabel(group.moduleId)}
          selected={selected}
          grantable={grantable}
          onToggle={toggle}
        />
      ))}
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive-text">
          {error}
        </p>
      )}
    </FieldSet>
  );
}
