"use client";

import { updateModuleSettingsEndpoint, type AccessContext, type ContractDefinition, type ModuleSettings } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { moduleSettingsKeys } from "#/entities/module-settings/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";

export type ModuleSettingsFormProps = {
  organizationId: string;
  moduleId: string;
  /** The module's `settings` contract (its manifest). */
  contract: ContractDefinition;
  settings: ModuleSettings;
  canUpdate: boolean;
  /** `can()` for fields with `ui.visibleWith`, and the default currency for money fields. */
  context: AccessContext;
};

/**
 * A module's settings rendered from its contract with `SchemaForm` and saved with `PUT
 * …/module-settings/{moduleId}` (decision 0015 §6; the server validates with the same contract).
 * Without the update permission the form is shown disabled with a note.
 */
export function ModuleSettingsForm({ organizationId, moduleId, contract, settings, canUpdate, context }: ModuleSettingsFormProps) {
  const t = useTranslations("settings.module");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const can = (permission: string): boolean => context.permissions.includes(permission);
  const submit = async (values: unknown): Promise<SchemaFormResult> => {
    try {
      const saved = (await callEndpoint(updateModuleSettingsEndpoint, { params: { organizationId, moduleId }, body: values as Record<string, unknown> })).data;
      queryClient.setQueryData(moduleSettingsKeys.detail(organizationId, moduleId), saved);
      return { ok: true };
    } catch (error: unknown) {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {canUpdate ? null : (
        <Alert variant="info">
          <AlertDescription>{t("readOnly")}</AlertDescription>
        </Alert>
      )}
      <fieldset disabled={!canUpdate} className="min-w-0">
        <SchemaForm contract={contract} defaultValues={(settings.values ?? {})} onSubmit={submit} can={can} defaultCurrency={context.regional.currency} />
      </fieldset>
    </div>
  );
}
