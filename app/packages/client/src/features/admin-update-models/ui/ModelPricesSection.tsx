"use client";

import { useMemo } from "react";
import { useTranslations } from "use-intl";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import type { AddedModel, ModelRow, ModelSettingsFormState } from "../model/model-settings-form.ts";
import { AddModelForm } from "./AddModelForm.tsx";
import {
  OriginPill,
  PriceCell,
  type PriceRowContext,
  PriceRowContextValue,
  PriceRowAction,
  ProviderPill,
} from "./ModelPriceCells.tsx";

const column = dataTableColumnHelper<ModelRow>();

const useColumns = () => {
  const t = useTranslations("admin.models.prices");
  return useMemo(
    () => [
      column.accessor("modelId", {
        header: () => t("columns.model"),
        cell: ({ getValue }) => <span className="font-mono text-body-sm">{getValue()}</span>,
      }),
      column.display({
        id: "input",
        header: () => t("columns.input"),
        cell: ({ row }) => <PriceCell row={row.original} field="inputMicroUsdPerMTok" />,
      }),
      column.display({
        id: "output",
        header: () => t("columns.output"),
        cell: ({ row }) => <PriceCell row={row.original} field="outputMicroUsdPerMTok" />,
      }),
      column.display({
        id: "origin",
        header: () => t("columns.origin"),
        cell: ({ row }) => <OriginPill row={row.original} />,
      }),
      column.display({
        id: "provider",
        header: () => t("columns.provider"),
        cell: ({ row }) => <ProviderPill row={row.original} />,
      }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => <PriceRowAction row={row.original} />,
      }),
    ],
    [t],
  );
};

function PriceCard({ row }: { row: ModelRow }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-body-sm">{row.modelId}</span>
      <span className="grid grid-cols-2 gap-2">
        <PriceCell row={row} field="inputMicroUsdPerMTok" />
        <PriceCell row={row} field="outputMicroUsdPerMTok" />
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <OriginPill row={row} />
        <ProviderPill row={row} />
      </span>
      <PriceRowAction row={row} />
    </div>
  );
}

export type ModelPricesSectionProps = {
  context: PriceRowContext;
  onAdd: (added: AddedModel) => void;
};

/** "Custo dos modelos": the price of each model per 1M tokens, editable, and a form to add a model. */
export function ModelPricesSection({ context, onAdd }: ModelPricesSectionProps) {
  const t = useTranslations("admin.models.prices");
  const columns = useColumns();
  const form: ModelSettingsFormState = context.form;
  return (
    <SectionCard title={t("title")} description={t("description")}>
      <PriceRowContextValue value={context}>
        <DataTable
          caption={t("caption")}
          captionHidden
          columns={columns}
          data={form.rows}
          getRowId={(row) => row.modelId}
          renderCard={(row) => <PriceCard row={row} />}
          empty={
            <EmptyState
              frame="plain"
              headingLevel={3}
              icon="cpu"
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          }
        />
      </PriceRowContextValue>
      <AddModelForm form={form} disabled={context.disabled} onAdd={onAdd} />
    </SectionCard>
  );
}
