"use client";

import { useTranslations } from "use-intl";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import type { AgentSettingsFailure } from "../model/use-save-tenant-agent-settings.ts";

/** Why the last change was refused, with the request reference when the API gave one. */
export function SaveFailure({ failure }: { failure: AgentSettingsFailure | null }) {
  const t = useTranslations();
  if (failure === null) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("settings.agents.saveFailed")}</AlertTitle>
      <AlertDescription>
        {failure.requestId === undefined ? failure.message : t("common.errorState.messageWithReference", { message: failure.message, requestId: failure.requestId })}
      </AlertDescription>
    </Alert>
  );
}
