"use client";

import { adminUpdateModelSettingsEndpoint, type ModelSettings } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { modelSettingsKeys } from "#/entities/model-settings/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import {
  type AddedModel,
  addRow,
  isModelSettingsDirty,
  keepRow,
  type ModelSettingsFormState,
  modelSettingsFormOf,
  type PriceField,
  removeRow,
  restoreRow,
  setRoleModel,
  setRowPrice,
  toUpdateModelSettingsInput,
} from "../model/model-settings-form.ts";
import type { PriceRowContext } from "./ModelPriceCells.tsx";
import { ModelPricesSection } from "./ModelPricesSection.tsx";
import { ModelRolesSection } from "./ModelRolesSection.tsx";

/** The refusal of a save that named an unpriced model or a provider without a key, with its reference. */
function SaveRefused({ error }: { error: ApiError }) {
  const t = useTranslations();
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-inherit">
        {t("admin.models.saveRefused")}
        {error.requestId === undefined ? null : (
          <span className="mt-1 block font-mono text-caption">
            {t("common.errorState.reference", { requestId: error.requestId })}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}

function SaveFailure({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === "VALIDATION_FAILED") return <SaveRefused error={error} />;
  return <ApiErrorAlert error={error} />;
}

/** The form state of the page: the saved settings, the edits on top and the price fields that hold no price. */
const useModelSettingsForm = (settings: ModelSettings) => {
  const [initial, setInitial] = useState(() => modelSettingsFormOf(settings));
  const [form, setForm] = useState(initial);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [generation, setGeneration] = useState(0);
  const onPrice = (modelId: string, field: PriceField, microUsd: number | null): void => {
    const key = `${modelId} ${field}`;
    setInvalid((current) => {
      const next = new Set(current);
      if (microUsd === null) next.add(key);
      else next.delete(key);
      return next;
    });
    if (microUsd !== null) setForm((current) => setRowPrice(current, modelId, field, microUsd));
  };
  const update = (change: (current: ModelSettingsFormState) => ModelSettingsFormState): void => setForm(change);
  /** Restoring or removing a model also drops what its price fields held. */
  const resetRow = (modelId: string, change: (current: ModelSettingsFormState) => ModelSettingsFormState): void => {
    setInvalid((current) => new Set([...current].filter((key) => !key.startsWith(`${modelId} `))));
    setForm(change);
  };
  const reset = (saved: ModelSettings): void => {
    const next = modelSettingsFormOf(saved);
    setInitial(next);
    setForm(next);
    setInvalid(new Set());
    setGeneration((count) => count + 1);
  };
  return { form, dirty: isModelSettingsDirty(form, initial), invalid, generation, onPrice, update, resetRow, reset };
};

/**
 * Staff choose the model of each text role and the price of each model, then save the whole page
 * at once (`PUT /v1/admin/models`, platform.model.manage). Edits stay on the page until saved; a
 * background refetch does not replace them. Writes wait for the connection.
 */
export function ModelSettingsEditor({ settings }: { settings: ModelSettings }) {
  const t = useTranslations("admin.models");
  const online = useOnlineStatus();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const state = useModelSettingsForm(settings);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const disabled = !online || saving;

  const save = async (): Promise<void> => {
    setSaving(true);
    setFailure(null);
    try {
      const body = toUpdateModelSettingsInput(state.form);
      const saved = (await callEndpoint(adminUpdateModelSettingsEndpoint, { body })).data;
      queryClient.setQueryData(modelSettingsKeys.all(), saved);
      state.reset(saved);
      notify.success(t("saved"));
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setSaving(false);
    }
  };

  const context: PriceRowContext = {
    form: state.form,
    disabled,
    generation: state.generation,
    onPrice: state.onPrice,
    onRestore: (modelId) => state.resetRow(modelId, (form) => restoreRow(form, modelId)),
    onKeep: (modelId) => state.update((form) => keepRow(form, modelId)),
    onRemove: (modelId) => state.resetRow(modelId, (form) => removeRow(form, modelId)),
  };
  return (
    <div className="flex flex-col gap-6">
      <ModelRolesSection
        roles={settings.roles}
        form={state.form}
        disabled={disabled}
        onChange={(role, modelId) => state.update((form) => setRoleModel(form, role, modelId))}
      />
      <ModelPricesSection
        context={context}
        onAdd={(added: AddedModel) => state.update((form) => addRow(form, added))}
      />
      {failure === null ? null : <SaveFailure error={failure} />}
      <div>
        <Button
          onClick={() => void save()}
          pending={saving}
          disabled={!online || !state.dirty || state.invalid.size > 0}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
