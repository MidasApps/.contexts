"use client";

import { createInvitationEndpoint, type Role, type RoleRef } from "@core/contracts";
import { isSupportedLocale } from "@core/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "use-intl";
import { z } from "zod";
import { invitationKeys } from "#/entities/invitation/index.ts";
import { NodeSelect, type TenantNodeInput } from "#/entities/project/index.ts";
import { RoleChecklist, useRoleOptions } from "#/entities/role/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { CopyField } from "#/shared/ui/molecules/CopyField/CopyField.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { localizeAcceptUrl } from "../model/localize-accept-url.ts";

export type InviteMemberDialogProps = {
  organization: { id: string; name: string };
  customRoles: readonly Role[] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Draft = { email: string; node: TenantNodeInput; roles: RoleRef[] };
type Problems = { email?: "required" | "invalid"; roles?: boolean };

const EmailSchema = z.email();
const DEFAULT_ROLES: RoleRef[] = [{ kind: "system", key: "member" }];
const emptyDraft = (organizationId: string): Draft => ({ email: "", node: { level: "organization", tenantId: organizationId }, roles: DEFAULT_ROLES });

const validate = (draft: Draft): Problems => ({
  ...(draft.email.trim() === "" ? { email: "required" as const } : EmailSchema.safeParse(draft.email.trim()).success ? {} : { email: "invalid" as const }),
  ...(draft.roles.length === 0 ? { roles: true } : {}),
});

/** A server `VALIDATION_FAILED` on `email` becomes the field error; everything else is the alert. */
const emailIssueOf = (error: unknown): boolean => error instanceof ApiError && error.code === "VALIDATION_FAILED" && (error.details ?? []).some((detail) => detail.field === "email");

/**
 * The one-time accept link, shown right after creation and never again (the API keeps only a hash),
 * in the inviter's UI locale.
 */
function InvitationLink({ email, acceptUrl, onAnother, onDone }: { email: string; acceptUrl: string; onAnother: () => void; onDone: () => void }) {
  const t = useTranslations("settings.invitations.inviteDialog");
  const locale = useLocale();
  // "Done" and "Invite another" are deliberate; Esc, outside click or X ask before the link is lost.
  useDialogDismissGuard("confirmOneTime");
  return (
    <div className="flex flex-col gap-5">
      <Alert variant="success">
        <AlertTitle>{t("createdTitle", { email })}</AlertTitle>
        <AlertDescription>{t("createdDescription")}</AlertDescription>
      </Alert>
      <CopyField label={t("link")} value={isSupportedLocale(locale) ? localizeAcceptUrl(acceptUrl, locale) : acceptUrl} description={t("linkHint")} />
      <DialogFooter>
        <Button variant="secondary" onClick={onAnother}>
          {t("another")}
        </Button>
        <Button onClick={onDone}>{t("done")}</Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Invites an email at a node with roles (`POST …/invitations`, core.member.invite, no escalation).
 * One `Idempotency-Key` per attempt. The answer's `acceptUrl` is shown once with a copy button;
 * closing the dialog drops it, so it is never rendered again.
 */
function InviteMemberDialogBody({ organization, customRoles, onOpenChange }: InviteMemberDialogProps) {
  const t = useTranslations("settings.invitations.inviteDialog");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const options = useRoleOptions(customRoles);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(organization.id));
  const [problems, setProblems] = useState<Problems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ email: string; acceptUrl: string } | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  // Closing mid-request would create the invitation and drop its only copy of the link.
  useDialogDismissGuard(pending ? "block" : "allow");

  const reset = (): void => {
    setDraft(emptyDraft(organization.id));
    setProblems({});
    setFailure(null);
    setCreated(null);
    idempotency.reset();
  };
  // Closing forgets everything, the one-time link included.
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = validate(draft);
    setProblems(found);
    setFailure(null);
    if (found.email !== undefined) return emailInput.current?.focus();
    if (found.roles === true) return;
    const body = { email: draft.email.trim(), node: draft.node, roles: draft.roles };
    setPending(true);
    try {
      const { data } = await callEndpoint(createInvitationEndpoint, { params: { organizationId: organization.id }, body, idempotencyKey: idempotency.keyFor(body) });
      idempotency.reset();
      setCreated({ email: body.email, acceptUrl: data.acceptUrl });
      await queryClient.invalidateQueries({ queryKey: invitationKeys.all(organization.id) });
    } catch (error: unknown) {
      if (!emailIssueOf(error)) return setFailure(error);
      setProblems({ email: "invalid" });
      emailInput.current?.focus();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { organization: organization.name })}</DialogDescription>
        </DialogHeader>
        {created !== null ? (
          <InvitationLink email={created.email} acceptUrl={created.acceptUrl} onAnother={reset} onDone={() => onOpenChange(false)} />
        ) : (
          <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
            {failure === null ? null : <ApiErrorAlert error={failure} />}
            <FieldGroup>
              <Field>
                <FieldLabel>{t("email")}</FieldLabel>
                <FieldControl>
                  <Input ref={emailInput} type="email" autoComplete="off" required value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
                </FieldControl>
                <FieldError errors={[problems.email === undefined ? undefined : t(`errors.${problems.email}`)]} />
              </Field>
              <Field>
                <FieldLabel>{t("node")}</FieldLabel>
                <FieldControl>
                  <NodeSelect organization={organization} value={draft.node} onValueChange={(node) => setDraft({ ...draft, node })} />
                </FieldControl>
                <FieldDescription>{t("nodeHint")}</FieldDescription>
              </Field>
              <RoleChecklist legend={t("roles")} options={options} value={draft.roles} onChange={(roles) => setDraft({ ...draft, roles })} error={problems.roles === true ? t("errors.roles") : undefined} />
            </FieldGroup>
            <DialogFooter>
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
export function InviteMemberDialog(props: InviteMemberDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <InviteMemberDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
