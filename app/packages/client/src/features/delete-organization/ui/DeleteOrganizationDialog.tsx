"use client";

import { deleteOrganizationEndpoint, type Organization } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { queryKeys } from "#/shared/api/query-keys.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
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
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type DeleteOrganizationDialogProps = {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * `DELETE /v1/organizations/{id}` (core.organization.delete, owners): the API revokes every access
 * first, so afterwards the organization's queries are dropped (not refetched: they would 404) and
 * the member lands on their organizations list.
 */
const useDeleteOrganization = (organization: Organization) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (): Promise<void> => {
    await callEndpoint(deleteOrganizationEndpoint, { params: { organizationId: organization.id } });
    router.navigate({ id: "organizations" }, { replace: true });
    queryClient.removeQueries({ queryKey: queryKeys.organization(organization.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
  };
};

/** Typing the organization's name arms the button, so a slip of the mouse deletes nothing. */
function DeleteOrganizationDialogBody({ organization, onOpenChange }: DeleteOrganizationDialogProps) {
  const t = useTranslations("settings.general.delete");
  const remove = useDeleteOrganization(organization);
  const [typed, setTyped] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  useDialogDismissGuard(pending ? "block" : "allow");

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    if (typed.trim() !== organization.name) return setMismatch(true);
    setPending(true);
    setError(null);
    try {
      await remove();
      notify.success(t("done", { name: organization.name }));
      onOpenChange(false);
    } catch (failure: unknown) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title", { name: organization.name })}</DialogTitle>
        <DialogDescription>{t("dialogDescription")}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        {error === null ? null : <ApiErrorAlert error={error} />}
        <Field>
          <FieldLabel>{t("confirmLabel", { name: organization.name })}</FieldLabel>
          <FieldControl>
            <Input
              autoComplete="off"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setMismatch(false);
              }}
            />
          </FieldControl>
          <FieldDescription>{t("confirmHint")}</FieldDescription>
          <FieldError errors={[mismatch ? t("mismatch") : undefined]} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="destructive" pending={pending}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so the typed name never outlives it. */
export function DeleteOrganizationDialog(props: DeleteOrganizationDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DeleteOrganizationDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
