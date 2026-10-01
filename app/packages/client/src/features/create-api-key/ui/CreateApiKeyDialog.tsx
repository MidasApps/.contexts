"use client";

import { createApiKeyEndpoint, type Permission } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslations } from "use-intl";
import { apiKeyKeys } from "#/entities/api-key/index.ts";
import { usePermissions } from "#/entities/permission/index.ts";
import { NodeSelect } from "#/entities/project/index.ts";
import { PermissionPicker, usePermissionsCatalog } from "#/entities/role/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { OneTimeSecret } from "#/shared/ui/molecules/OneTimeSecret/OneTimeSecret.tsx";
import { EXPIRY_OPTIONS_DAYS, emptyApiKeyDraft, expiryFrom, validateApiKeyDraft, type ApiKeyDraft, type ApiKeyDraftProblems, type ExpiryDays } from "../model/api-key-draft.ts";

export type CreateApiKeyDialogProps = {
  organization: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Clock for the expiry (tests inject a fixed one). */
  now?: () => Date;
};

const systemNow = (): Date => new Date();

const nodeParams = (draft: ApiKeyDraft) =>
  draft.node.level === "organization"
    ? { organizationId: draft.node.tenantId }
    : { organizationId: draft.node.tenantId, projectId: draft.node.projectId, unitId: draft.node.level === "unit" ? draft.node.unitId : undefined };

function ApiKeyFields({ organization, draft, setDraft, problems, nameInput, now }: { organization: CreateApiKeyDialogProps["organization"]; draft: ApiKeyDraft; setDraft: (draft: ApiKeyDraft) => void; problems: ApiKeyDraftProblems; nameInput: RefObject<HTMLInputElement | null>; now: () => Date }) {
  const t = useTranslations("settings.apiKeys.createDialog");
  const formatDateTime = useFormatDateTime();
  const catalog = usePermissionsCatalog();
  // Scopes are limited to what the actor holds at the chosen node (no escalation, SP1 spec §5.3).
  const atNode = usePermissions(nodeParams(draft));
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{t("name")}</FieldLabel>
        <FieldControl>
          <Input ref={nameInput} required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </FieldControl>
        <FieldDescription>{t("nameHint")}</FieldDescription>
        <FieldError errors={[problems.name === undefined ? undefined : t(`errors.${problems.name}`)]} />
      </Field>
      <Field>
        <FieldLabel>{t("node")}</FieldLabel>
        <FieldControl>
          <NodeSelect organization={organization} value={draft.node} onValueChange={(node) => setDraft({ ...draft, node, scopes: [] })} />
        </FieldControl>
        <FieldDescription>{t("nodeHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>{t("expiry")}</FieldLabel>
        <Select value={String(draft.expiryDays)} onValueChange={(value) => setDraft({ ...draft, expiryDays: Number(value) as ExpiryDays })}>
          <FieldControl>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
          </FieldControl>
          <SelectContent>
            {EXPIRY_OPTIONS_DAYS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {t("expiryOption", { days })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{t("expiresOn", { date: formatDateTime(expiryFrom(now(), draft.expiryDays), "date") })}</FieldDescription>
      </Field>
      {catalog.isPending || atNode.status === "pending" ? (
        <LoadingState label={t("loadingScopes")} rows={3} />
      ) : (
        <PermissionPicker
          legend={t("scopes")}
          permissions={catalog.data ?? []}
          value={draft.scopes}
          onChange={(scopes: Permission[]) => setDraft({ ...draft, scopes })}
          grantable={atNode.can}
          error={problems.scopes === true ? t("errors.scopes") : undefined}
        />
      )}
    </FieldGroup>
  );
}

/**
 * Creates a scoped API key (`POST …/api-keys`, core.api-key.create): name, node, expiry (≤ 365
 * days) and scopes limited to the actor's permissions at that node. The full key is shown once
 * (masked, copy, "I stored it"); closing the dialog drops it, so it is never rendered again.
 */
function CreateApiKeyDialogBody({ organization, onOpenChange, now = systemNow }: CreateApiKeyDialogProps) {
  const t = useTranslations("settings.apiKeys.createDialog");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const [draft, setDraft] = useState<ApiKeyDraft>(() => emptyApiKeyDraft(organization.id));
  const [problems, setProblems] = useState<ApiKeyDraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = validateApiKeyDraft(draft);
    setProblems(found);
    setFailure(null);
    if (found.name !== undefined) return nameInput.current?.focus();
    if (found.scopes === true) return;
    const body = { name: draft.name.trim(), node: draft.node, scopes: draft.scopes, expiresAt: expiryFrom(now(), draft.expiryDays) };
    setPending(true);
    try {
      const { data } = await callEndpoint(createApiKeyEndpoint, { params: { organizationId: organization.id }, body, idempotencyKey: idempotency.keyFor({ ...body, expiresAt: draft.expiryDays }) });
      idempotency.reset();
      setSecret({ name: data.apiKey.name, value: data.secret });
      await queryClient.invalidateQueries({ queryKey: apiKeyKeys.all(organization.id) });
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{secret === null ? t("title") : t("createdTitle", { name: secret.name })}</DialogTitle>
          <DialogDescription>{secret === null ? t("description") : t("createdDescription")}</DialogDescription>
        </DialogHeader>
        {secret !== null ? (
          <OneTimeSecret title={t("secretTitle")} warning={t("secretWarning")} label={t("secretLabel")} secret={secret.value} hint={t("secretHint")} acknowledge={t("stored")} doneLabel={t("done")} onDone={() => onOpenChange(false)} />
        ) : (
          <form noValidate onSubmit={(event) => void submit(event)} className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
            {failure === null ? null : <ApiErrorAlert error={failure} />}
            <ApiKeyFields organization={organization} draft={draft} setDraft={setDraft} problems={problems} nameInput={nameInput} now={now} />
            <DialogFooter className="sticky bottom-0 bg-background pt-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" pending={pending}>
                {t("submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function CreateApiKeyDialog(props: CreateApiKeyDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <CreateApiKeyDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
