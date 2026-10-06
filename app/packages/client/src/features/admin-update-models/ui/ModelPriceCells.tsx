"use client";

import { createContext, use } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import {
  isStaffPriced,
  type ModelRow,
  type ModelSettingsFormState,
  type PriceField,
  resetActionOf,
  rolesUsing,
} from "../model/model-settings-form.ts";
import { PriceInput } from "./PriceInput.tsx";

/** What the row controls need; read from context so the table columns stay the same objects. */
export type PriceRowContext = {
  readonly form: ModelSettingsFormState;
  readonly disabled: boolean;
  /** `null` while the field holds something that is not a price. */
  readonly onPrice: (modelId: string, field: PriceField, microUsd: number | null) => void;
  readonly onRestore: (modelId: string) => void;
  readonly onKeep: (modelId: string) => void;
  readonly onRemove: (modelId: string) => void;
  /** Bumped after a save, so the price fields show the saved values. */
  readonly generation: number;
};

export const PriceRowContextValue = createContext<PriceRowContext | null>(null);

const usePriceRowContext = (): PriceRowContext => {
  const context = use(PriceRowContextValue);
  if (context === null) throw new Error("model price cells must render inside ModelPricesSection");
  return context;
};

export function PriceCell({ row, field }: { row: ModelRow; field: PriceField }) {
  const t = useTranslations("admin.models.prices");
  const context = usePriceRowContext();
  return (
    <PriceInput
      key={`${String(context.generation)}-${String(row.revision)}`}
      label={t(field === "inputMicroUsdPerMTok" ? "inputNamed" : "outputNamed", { model: row.modelId })}
      labelHidden
      value={row[field]}
      disabled={context.disabled}
      onValueChange={(microUsd) => context.onPrice(row.modelId, field, microUsd)}
    />
  );
}

export function OriginPill({ row }: { row: ModelRow }) {
  const t = useTranslations("admin.models.prices.origin");
  if (row.dropped) return <StatusPill tone="amber">{t("dropped")}</StatusPill>;
  return isStaffPriced(row) ? (
    <StatusPill tone="blue">{t("staff")}</StatusPill>
  ) : (
    <StatusPill tone="neutral">{t("code")}</StatusPill>
  );
}

export function ProviderPill({ row }: { row: ModelRow }) {
  const t = useTranslations("admin.models.prices.provider");
  if (row.available === null) return <StatusPill tone="neutral">{t("unknown")}</StatusPill>;
  return row.available ? (
    <StatusPill tone="emerald">{t("available")}</StatusPill>
  ) : (
    <StatusPill tone="amber" icon="alert-triangle">
      {t("unavailable")}
    </StatusPill>
  );
}

function RemoveButton({ row }: { row: ModelRow }) {
  const t = useTranslations("admin.models");
  const format = useFormatter();
  const context = usePriceRowContext();
  const usedBy = rolesUsing(context.form, row.modelId);
  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={context.disabled || usedBy.length > 0}
        aria-label={t("prices.removeNamed", { model: row.modelId })}
        onClick={() => context.onRemove(row.modelId)}
      >
        {t("prices.remove")}
      </Button>
      {usedBy.length === 0 ? null : (
        <span className="text-caption text-muted-foreground">
          {t("prices.inUse", { roles: format.list(usedBy.map((role) => t(`roles.names.${role}`))) })}
        </span>
      )}
    </span>
  );
}

/** Restore a code price, drop a staff price from the save (and undo it), or remove a model added here. */
export function PriceRowAction({ row }: { row: ModelRow }) {
  const t = useTranslations("admin.models.prices");
  const context = usePriceRowContext();
  if (row.dropped) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={context.disabled}
        aria-label={t("keepNamed", { model: row.modelId })}
        onClick={() => context.onKeep(row.modelId)}
      >
        {t("keep")}
      </Button>
    );
  }
  const action = resetActionOf(row);
  if (action === null) return null;
  if (action === "remove") return <RemoveButton row={row} />;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={context.disabled}
      aria-label={t("restoreNamed", { model: row.modelId })}
      onClick={() => context.onRestore(row.modelId)}
    >
      {t("restore")}
    </Button>
  );
}
