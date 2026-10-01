"use client";

import { useId, useMemo } from "react";
import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Combobox, type ComboboxGroup } from "#/shared/ui/molecules/Combobox/Combobox.tsx";

/** Value of the "every organization" option (never a real id: organization ids have no dashes or dots). */
const ALL = "__all__";

export type AdminOrganizationFilterProps = {
  /** Selected organization id; `undefined` = every organization (or none chosen yet when `required`). */
  value: string | undefined;
  onValueChange: (organizationId: string | undefined) => void;
  /** Pages that work on one organization at a time have no "all" option. */
  required?: boolean;
  /** Visible label; defaults to "Organização". */
  label?: string;
};

/**
 * Organization picker of `/admin` lists (traces, flags, workflows, connectors): searchable by name
 * or id, fed by `GET /v1/admin/organizations`. While the list loads or fails the trigger still
 * shows the chosen id, so a shared link keeps its filter.
 */
export function AdminOrganizationFilter({ value, onValueChange, required = false, label }: AdminOrganizationFilterProps) {
  const t = useTranslations("admin.organizationFilter");
  const id = useId();
  const organizations = useAllAdminOrganizations();
  const groups = useMemo((): ComboboxGroup[] => {
    const known = (organizations.data ?? []).map((organization) => ({ value: organization.id, label: organization.name, keywords: [organization.id] }));
    const selectedMissing = value !== undefined && !known.some((option) => option.value === value);
    const options = [...(selectedMissing ? [{ value, label: value }] : []), ...known];
    return [{ options: required ? options : [{ value: ALL, label: t("all") }, ...options] }];
  }, [organizations.data, required, t, value]);
  return (
    <div className="flex min-w-48 flex-col gap-1.5">
      <Label htmlFor={id}>{label ?? t("label")}</Label>
      <Combobox
        id={id}
        groups={groups}
        value={value ?? (required ? undefined : ALL)}
        onValueChange={(next) => onValueChange(next === ALL ? undefined : next)}
        placeholder={organizations.isPending ? t("loading") : t("placeholder")}
        searchLabel={t("search")}
        searchPlaceholder={t("search")}
        emptyText={t("empty")}
      />
    </div>
  );
}
