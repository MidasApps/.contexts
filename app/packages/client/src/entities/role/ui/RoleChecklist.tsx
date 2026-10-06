"use client";

import { MAX_ROLES_PER_GRANT, type RoleRef, roleRefKey } from "@core/contracts";
import { useId } from "react";
import { useTranslations } from "use-intl";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";
import type { RoleOption } from "../model/role-options.ts";

export type RoleChecklistProps = {
  legend: string;
  options: readonly RoleOption[];
  value: readonly RoleRef[];
  onChange: (roles: RoleRef[]) => void;
  /** Translated error (e.g. "choose at least one role"), announced with the group. */
  error?: string | undefined;
};

/**
 * Checkbox list of roles for a grant (1–10 roles, SP1 spec §4): system roles with their
 * description, then custom roles. A `fieldset` with a legend, so the group is announced once;
 * the hint and the error are linked to it.
 */
export function RoleChecklist({ legend, options, value, onChange, error }: RoleChecklistProps) {
  const t = useTranslations("settings.roles");
  const id = useId();
  const selected = new Set(value.map(roleRefKey));
  const full = selected.size >= MAX_ROLES_PER_GRANT;
  const toggle = (option: RoleOption, checked: boolean): void => {
    onChange(checked ? [...value, option.ref] : value.filter((ref) => roleRefKey(ref) !== option.key));
  };
  return (
    <FieldSet
      aria-describedby={error === undefined ? `${id}-hint` : `${id}-hint ${id}-error`}
      aria-invalid={error === undefined ? undefined : true}
    >
      <FieldLegend>{legend}</FieldLegend>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t("checklistHint", { max: MAX_ROLES_PER_GRANT })}
      </p>
      <ul className="flex flex-col gap-2.5">
        {options.map((option) => {
          const checked = selected.has(option.key);
          const descriptionId = `${id}-${option.key}-description`;
          return (
            <li key={option.key} className="flex items-start gap-2.5">
              <Checkbox
                id={`${id}-${option.key}`}
                className="mt-0.5"
                checked={checked}
                disabled={full && !checked}
                aria-describedby={option.description === "" ? undefined : descriptionId}
                onCheckedChange={(next) => toggle(option, next === true)}
              />
              <span className="flex flex-col gap-0.5">
                <Label htmlFor={`${id}-${option.key}`} className="font-normal">
                  {option.label}
                </Label>
                {option.description === "" ? null : (
                  <span id={descriptionId} className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive-text">
          {error}
        </p>
      )}
    </FieldSet>
  );
}
