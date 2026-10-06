"use client";

import { useTranslations } from "use-intl";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { usePermissionsCatalog } from "../api/role-queries.ts";
import { PermissionPicker, type PermissionPickerProps } from "./PermissionPicker.tsx";

/** A second read the picker depends on (what the actor holds at the chosen node), shown with the catalog's states. */
export type PermissionGrantsState = {
  readonly status: "pending" | "error" | "success";
  readonly error: unknown;
  readonly refetch: () => void;
};

export type PermissionCatalogFieldProps = Omit<PermissionPickerProps, "permissions"> & {
  grants?: PermissionGrantsState | undefined;
};

/** `true` once the catalog has permissions to pick from: dialogs keep submit disabled until then. */
export const usePermissionCatalogReady = (): boolean => {
  const catalog = usePermissionsCatalog();
  return catalog.isSuccess && catalog.data.length > 0;
};

/**
 * The permission picker fed by `GET /v1/permissions`, with its own loading, error (code copy,
 * reference and retry) and empty states, so a role or API-key dialog never shows a bare legend
 * that then fails with "choose at least one permission" (UX review U-15).
 */
export function PermissionCatalogField({ grants, ...picker }: PermissionCatalogFieldProps) {
  const t = useTranslations("settings.roles.picker");
  const catalog = usePermissionsCatalog();
  if (catalog.isError) {
    return (
      <ApiErrorState
        frame="plain"
        title={t("loadError")}
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
        retrying={catalog.isFetching}
      />
    );
  }
  if (grants?.status === "error") {
    return <ApiErrorState frame="plain" title={t("grantsError")} error={grants.error} onRetry={grants.refetch} />;
  }
  if (catalog.isPending || grants?.status === "pending") return <LoadingState label={t("loading")} rows={3} />;
  if (catalog.data.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }
  return <PermissionPicker {...picker} permissions={catalog.data} />;
}
