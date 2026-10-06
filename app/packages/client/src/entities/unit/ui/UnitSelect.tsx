"use client";

import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useLocale, useTranslations } from "use-intl";
import { Combobox, type ComboboxOption } from "#/shared/ui/molecules/Combobox/Combobox.tsx";
import type { TreeNode } from "#/shared/ui/organisms/TreeView/tree-model.ts";
import { useUnitTree } from "../api/unit-queries.ts";
import { buildUnitTree } from "../model/build-unit-tree.ts";

/** Value of the "whole project" option (no unit). */
const WHOLE_PROJECT = "";

/** Depth-first options, each labelled with its path ("Filial SP › Vendas") so equal names stay apart. */
const optionsOf = (nodes: readonly TreeNode[], ancestors: readonly string[] = []): ComboboxOption[] =>
  nodes.flatMap((node) => {
    const path = [...ancestors, node.label];
    return [
      { value: node.id, label: path.join(" › "), keywords: [node.label] },
      ...optionsOf(node.children ?? [], path),
    ];
  });

export type UnitSelectProps = Omit<ComponentProps<"button">, "value" | "onChange" | "children"> & {
  organizationId: string;
  projectId: string;
  /** The chosen unit; `undefined` is the whole project. */
  value: string | undefined;
  onValueChange: (unitId: string | undefined) => void;
};

/**
 * A unit of one project, or the whole project (searchable, every level of the tree). Pickers of
 * where a grant, invitation, device or API key applies show it below the project. Label it with
 * an outside `FieldLabel` (the trigger is a `combobox`).
 */
export function UnitSelect({ organizationId, projectId, value, onValueChange, ...triggerProps }: UnitSelectProps) {
  const t = useTranslations("settings.nodes");
  const locale = useLocale();
  const tree = useUnitTree({ organizationId, projectId });
  const groups = useMemo(
    () => [
      { options: [{ value: WHOLE_PROJECT, label: t("wholeProject") }] },
      ...(tree.data === undefined || tree.data.length === 0
        ? []
        : [{ heading: t("unitGroup"), options: optionsOf(buildUnitTree(tree.data, locale)) }]),
    ],
    [locale, t, tree.data],
  );
  return (
    <Combobox
      groups={groups}
      value={value ?? WHOLE_PROJECT}
      onValueChange={(selected) => onValueChange(selected === WHOLE_PROJECT ? undefined : selected)}
      placeholder={t("wholeProject")}
      searchLabel={t("searchUnit")}
      searchPlaceholder={t("searchUnit")}
      emptyText={tree.isPending ? t("loadingUnits") : t("emptyUnits")}
      {...triggerProps}
    />
  );
}
