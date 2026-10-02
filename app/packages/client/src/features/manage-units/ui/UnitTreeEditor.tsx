"use client";

import type { Unit, UnitTypeDefinition } from "@core/contracts";
import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { buildUnitTree, MAX_TREE_UNITS, unitPathIn, useUnitTree, useUnitTypes } from "#/entities/unit/index.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { TreeView } from "#/shared/ui/organisms/TreeView/TreeView.tsx";
import { descendantIds, moveTargets, typesAllowedUnder } from "../model/unit-tree-rules.ts";
import { useUnitMutations } from "../model/use-unit-mutations.ts";
import { MoveUnitDialog } from "./MoveUnitDialog.tsx";
import { UnitNameDialog } from "./UnitNameDialog.tsx";

export type UnitTreeEditorProps = {
  organizationId: string;
  project: { id: string; name: string };
  can: { create: boolean; update: boolean; delete: boolean };
};

type Dialog = "create" | "rename" | "move" | "delete" | null;

const useTypeLabel = () => {
  const t = useTranslations();
  return (type: Pick<UnitTypeDefinition, "id" | "labelKey">): string => (t.has(type.labelKey) ? t(type.labelKey) : type.id);
};

/** Actions on the selected unit (or the project root when nothing is selected). */
function SelectionBar(props: { selected: Unit | null; path: string; typeName: string | null; canNest: boolean; can: UnitTreeEditorProps["can"]; open: (dialog: Dialog) => void }) {
  const t = useTranslations("settings.units");
  const reasonId = useId();
  const { selected, can, open } = props;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{selected === null ? t("noSelection") : props.path}</span>
        {props.typeName === null ? null : <span className="text-xs text-muted-foreground">{props.typeName}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {can.create ? (
          // Disabled with the reason beside it, rather than a dialog that can only say no.
          <Button size="sm" disabled={!props.canNest} aria-describedby={props.canNest ? undefined : reasonId} onClick={() => open("create")}>
            <Icon name="plus" />
            {selected === null ? t("createRoot") : t("createChild")}
          </Button>
        ) : null}
        {selected !== null && can.update ? (
          <>
            <Button size="sm" variant="outline" onClick={() => open("rename")}>
              {t("rename")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => open("move")}>
              {t("moveAction")}
            </Button>
          </>
        ) : null}
        {selected !== null && can.delete ? (
          <Button size="sm" variant="ghost" onClick={() => open("delete")}>
            {t("deleteAction")}
          </Button>
        ) : null}
      </div>
      {can.create && !props.canNest ? (
        <p id={reasonId} className="text-xs text-muted-foreground sm:basis-full">
          {selected === null ? t("noRootTypes") : t("noChildTypes")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Unit tree of one project (SP2 spec §8 settings/units): WAI-ARIA tree to pick a unit, then create
 * a child (type limited to what the parent allows), rename, move ("Move to…" dialog) or delete
 * (confirmed, subtree included). Loading, empty (with the create action) and error states.
 */
export function UnitTreeEditor({ organizationId, project, can }: UnitTreeEditorProps) {
  const t = useTranslations("settings.units");
  const locale = useLocale();
  const typeLabel = useTypeLabel();
  const tree = useUnitTree({ organizationId, projectId: project.id });
  const types = useUnitTypes();
  const mutations = useUnitMutations({ organizationId, projectId: project.id });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const units = useMemo(() => tree.data ?? [], [tree.data]);
  const nodes = useMemo(() => buildUnitTree(units, locale), [units, locale]);
  const selected = units.find((unit) => unit.id === selectedId) ?? null;
  const pathOf = (unit: Unit): string => unitPathIn(units, unit.id).map((segment) => segment.name).join(" › ");
  const typeOf = (id: string) => types.data?.find((type) => type.id === id);
  const creatable = typesAllowedUnder(types.data ?? [], selected === null ? "project" : selected.type);
  const subtree = selected === null ? 0 : descendantIds(units, selected.id).size;
  const removal = useConfirmedAction(
    async () => {
      if (selected === null) return;
      await mutations.remove(selected.id);
      setSelectedId(undefined);
    },
    () => notify.success(t("deleted", { name: selected?.name ?? "" })),
  );

  if (tree.isPending || types.isPending) return <LoadingState label={t("loadingTree")} rows={4} />;
  if (tree.isError || types.isError) {
    const retry = () => void Promise.all([tree.refetch(), types.refetch()]);
    return <ApiErrorState error={tree.error ?? types.error} onRetry={retry} retrying={tree.isFetching || types.isFetching} />;
  }
  const selectedType = selected === null ? undefined : typeOf(selected.type);
  return (
    <div className="flex flex-col gap-4">
      <SelectionBar
        selected={selected}
        path={selected === null ? "" : pathOf(selected)}
        typeName={selectedType === undefined ? null : typeLabel(selectedType)}
        canNest={creatable.length > 0}
        can={can}
        open={setDialog}
      />
      {nodes.length === 0 ? (
        <EmptyState
          headingLevel={3}
          icon="network"
          title={t("emptyTitle")}
          description={can.create ? t("emptyDescription", { project: project.name }) : t("emptyDescriptionNoPermission")}
          action={can.create && creatable.length > 0 ? <Button onClick={() => setDialog("create")}>{t("createRoot")}</Button> : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border p-2">
          <TreeView label={t("treeLabel", { project: project.name })} nodes={nodes} selectedId={selectedId} onSelect={(id) => setSelectedId(id === selectedId ? undefined : id)} />
        </div>
      )}
      {units.length >= MAX_TREE_UNITS ? <p className="text-xs text-muted-foreground">{t("truncated", { max: MAX_TREE_UNITS })}</p> : null}
      <UnitNameDialog
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : null)}
        title={t("createTitle")}
        description={selected === null ? t("createUnderProject", { project: project.name }) : t("createUnder", { parent: pathOf(selected) })}
        submitLabel={t("createSubmit")}
        types={creatable}
        typeLabel={typeLabel}
        onSubmit={async ({ name, type }) => {
          const unit = await mutations.create({ name, type: type ?? "", parentUnitId: selected?.id ?? null });
          notify.success(t("created", { name: unit.name }));
        }}
      />
      <UnitNameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
        title={t("renameTitle")}
        description={t("renameDescription")}
        submitLabel={t("renameSubmit")}
        initialName={selected?.name ?? ""}
        onSubmit={async ({ name }) => {
          if (selected === null || name === selected.name) return;
          await mutations.rename(selected.id, name);
          notify.success(t("renamed", { name }));
        }}
      />
      <MoveUnitDialog
        unitName={dialog === "move" && selected !== null ? selected.name : null}
        targets={selected === null ? [] : moveTargets({ unit: selected, units, types: types.data, projectLabel: t("projectRoot", { project: project.name }), pathOf })}
        onOpenChange={(open) => !open && setDialog(null)}
        onMove={async (parentUnitId) => {
          if (selected === null) return;
          await mutations.move(selected.id, parentUnitId);
          notify.success(t("moved", { name: selected.name }));
        }}
      />
      <ConfirmDialog
        open={dialog === "delete" && selected !== null}
        onOpenChange={(open) => {
          if (!open) removal.reset();
          setDialog(open ? "delete" : null);
        }}
        title={t("deleteTitle", { name: selected?.name ?? "" })}
        description={t("deleteDescription", { count: subtree })}
        confirmLabel={t("deleteConfirm")}
        destructive
        onConfirm={removal.confirm}
        error={removal.error}
      />
    </div>
  );
}
