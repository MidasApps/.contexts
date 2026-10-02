"use client";

import { createConnectorEndpoint, updateConnectorEndpoint, type Connector } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { tenantConnectorKeys } from "#/entities/connector/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { connectorInputOf, draftFromConnector, emptyConnectorDraft, problemsFromDetails, type ConnectorDraft, type DraftProblems } from "../model/connector-draft.ts";
import { ConnectorFields } from "./ConnectorFields.tsx";

export type ConnectorEditorDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The connector to edit; absent creates one. */
  connector?: Connector | null | undefined;
  /** Called with a created connector after the dialog closes (the page then asks for its secret). */
  onCreated?: ((connector: Connector) => void) | undefined;
};

function ConnectorEditorBody({ organizationId, onOpenChange, connector = null, onCreated }: ConnectorEditorDialogProps) {
  const t = useTranslations("settings.connectors.editor");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const [draft, setDraft] = useState<ConnectorDraft>(() => (connector === null ? emptyConnectorDraft() : draftFromConnector(connector)));
  const [problems, setProblems] = useState<DraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const mode = connector === null ? "create" : "edit";

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const result = connectorInputOf(draft);
    setFailure(null);
    setProblems(result.ok ? {} : result.problems);
    if (!result.ok) return;
    const { input } = result;
    setPending(true);
    let created: Connector | null = null;
    try {
      if (connector === null) {
        created = (await callEndpoint(createConnectorEndpoint, { params: { organizationId }, body: input, idempotencyKey: idempotency.keyFor(input) })).data;
        idempotency.reset();
      } else {
        // The type never changes: `config` replaces the whole config of the connector's own type.
        await callEndpoint(updateConnectorEndpoint, { params: { organizationId, connectorId: connector.id }, body: { name: input.name, toolPolicy: input.toolPolicy, config: input.config } });
      }
      await queryClient.invalidateQueries({ queryKey: tenantConnectorKeys.all(organizationId) });
      notify.success(t(mode === "create" ? "created" : "saved", { name: input.name }));
      onOpenChange(false);
      if (created !== null) onCreated?.(created);
    } catch (error: unknown) {
      setFailure(error);
      if (error instanceof ApiError) setProblems(problemsFromDetails(error.details));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(mode === "create" ? "createTitle" : "editTitle", { name: connector?.name ?? "" })}</DialogTitle>
        <DialogDescription>{t(mode === "create" ? "createDescription" : "editDescription")}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
        {failure === null ? null : <ApiErrorAlert error={failure} />}
        <ConnectorFields draft={draft} setDraft={setDraft} problems={problems} typeLocked={connector !== null} />
        <DialogFooter className="sticky bottom-0 bg-background pt-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" pending={pending}>
            {t(mode === "create" ? "submitCreate" : "submitSave")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Creates or edits a connector (`POST|PATCH …/connectors`, core.connector.write): name, type,
 * where it reaches and the tool policy. The contract schema gives early feedback; the API's
 * `VALIDATION_FAILED` details land next to their fields. The body mounts on open, so a draft
 * never outlives the dialog.
 */
export function ConnectorEditorDialog(props: ConnectorEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <ConnectorEditorBody key={props.connector?.id ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  );
}
