"use client";

import { type Connector, setConnectorSecretEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { tenantConnectorKeys } from "#/entities/connector/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type ConnectorSecretDialogProps = {
  organizationId: string;
  connector: Connector | null;
  onOpenChange: (open: boolean) => void;
};

/** The contract's bound (`SetConnectorSecretInputSchema`). */
const MAX_SECRET_LENGTH = 8192;

function SecretBody({
  organizationId,
  connector,
  onOpenChange,
}: {
  organizationId: string;
  connector: Connector;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.connectors.secret");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  // The only place the secret lives on the client: this state, dropped when the dialog closes.
  const [value, setValue] = useState("");
  const [missing, setMissing] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const replacing = connector.secretRef !== null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    setMissing(value === "");
    if (value === "") return;
    setPending(true);
    try {
      await callEndpoint(setConnectorSecretEndpoint, {
        params: { organizationId, connectorId: connector.id },
        body: { value },
      });
      setValue("");
      await queryClient.invalidateQueries({ queryKey: tenantConnectorKeys.all(organizationId) });
      notify.success(t("done", { name: connector.name }));
      onOpenChange(false);
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(replacing ? "replaceTitle" : "setTitle", { name: connector.name })}</DialogTitle>
        <DialogDescription>{t(replacing ? "replaceDescription" : "setDescription")}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        {failure === null ? null : <ApiErrorAlert error={failure} />}
        <Field>
          <FieldLabel>{t(`label.${connector.type}`)}</FieldLabel>
          <FieldControl>
            {/* No show/hide toggle and no autofill: the value is write-only from the first keystroke. */}
            <Input
              type="password"
              required
              autoComplete="off"
              maxLength={MAX_SECRET_LENGTH}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </FieldControl>
          <FieldDescription>{t("hint")}</FieldDescription>
          <FieldError errors={[missing ? t("required") : undefined]} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" pending={pending}>
            {t(replacing ? "submitReplace" : "submitSet")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Stores or replaces a connector's secret (`PUT …/connectors/{id}/secret`, core.connector.write).
 * Write-only: the field is never prefilled, the value is never echoed, and it is cleared once
 * saved; afterwards the page only knows that a secret is set.
 */
export function ConnectorSecretDialog({ organizationId, connector, onOpenChange }: ConnectorSecretDialogProps) {
  return (
    <Dialog open={connector !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {connector === null ? null : (
          <SecretBody
            key={connector.id}
            organizationId={organizationId}
            connector={connector}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
