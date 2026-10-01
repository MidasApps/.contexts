"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { Combobox } from "#/shared/ui/molecules/Combobox/Combobox.tsx";
import { nodeFromOptionValue, nodeOptionValue, useNodeOptions, type TenantNodeInput } from "../model/node-options.ts";

export type NodeSelectProps = Omit<ComponentProps<"button">, "value" | "onChange" | "children"> & {
  organization: { id: string; name: string };
  value: TenantNodeInput;
  onValueChange: (node: TenantNodeInput) => void;
};

/**
 * Where a grant, invitation, device or API key applies: the whole organization or one project
 * (searchable). Label it with an outside `FieldLabel` (the trigger is a `combobox`).
 */
export function NodeSelect({ organization, value, onValueChange, ...triggerProps }: NodeSelectProps) {
  const t = useTranslations("settings.nodes");
  const options = useNodeOptions(organization);
  return (
    <Combobox
      groups={options.groups}
      value={nodeOptionValue(value)}
      onValueChange={(selected) => {
        const node = nodeFromOptionValue(organization.id, selected);
        if (node !== null) onValueChange(node);
      }}
      placeholder={t("placeholder")}
      searchLabel={t("search")}
      searchPlaceholder={t("search")}
      emptyText={options.loading ? t("loading") : t("empty")}
      {...triggerProps}
    />
  );
}
