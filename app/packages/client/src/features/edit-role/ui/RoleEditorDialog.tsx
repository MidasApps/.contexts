"use client";

import { createRoleEndpoint, updateRoleEndpoint, type Permission, type Role } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { PermissionCatalogField, roleKeys, usePermissionCatalogReady } from "#/entities/role/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { changedRole, draftOf, validateRoleDraft, type RoleDraft, type RoleDraftProblems } from "../model/role-draft.ts";

export type RoleEditorDialogProps = {
  organizationId: string;
  /** `null` creates a role; a role edits it (named `customRole`: `role` is an ARIA attribute). */
  customRole: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the actor holds at the organization: only those can be granted (no escalation). */
  grantable: (permission: Permission) => boolean;
};

/** Creates (`POST`, with an Idempotency-Key per attempt) or patches only the changed fields. */
const useSaveRole = (organizationId: string, role: Role | null) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return async (draft: RoleDraft): Promise<Role | null> => {
    let saved: Role | null = null;
    if (role === null) {
      const body = { name: draft.name.trim(), description: draft.description.trim(), permissions: draft.permissions };
      saved = (await callEndpoint(createRoleEndpoint, { params: { organizationId }, body, idempotencyKey: idempotency.keyFor(body) })).data;
      idempotency.reset();
    } else {
      const body = changedRole(role, draft);
      if (body !== null) saved = (await callEndpoint(updateRoleEndpoint, { params: { roleId: role.id }, body })).data;
    }
    await queryClient.invalidateQueries({ queryKey: roleKeys.all(organizationId) });
    return saved ?? role;
  };
};

/**
 * Role editor (SP2 spec §8 settings/roles): name, description and the permission picker grouped
 * by module with each permission's description. Permissions the actor does not hold are disabled
 * (the API answers `ESCALATION_FORBIDDEN` anyway); failures stay in the dialog with the reference.
 * The registry is read here, with its loading and error states, so every entry point gets them.
 */
function RoleEditorDialogBody({ organizationId, customRole: role, onOpenChange, grantable }: RoleEditorDialogProps) {
  const t = useTranslations("settings.roles.editor");
  // Without the registry the picker has nothing to offer; saving would only fail "choose a permission".
  const catalogReady = usePermissionCatalogReady();
  const save = useSaveRole(organizationId, role);
  const [draft, keepDraft] = useState<RoleDraft>(() => draftOf(role));
  // Typed work has no draft elsewhere: Esc, an outside click or the X ask before dropping it (decision 0048).
  const [dirty, setDirty] = useState(false);
  useDialogDismissGuard(dirty ? "confirmUnsaved" : "allow");
  const setDraft = (next: RoleDraft): void => {
    keepDraft(next);
    setDirty(true);
  };
  const [problems, setProblems] = useState<RoleDraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = validateRoleDraft(draft);
    setProblems(found);
    setFailure(null);
    if (found.name !== undefined) return nameInput.current?.focus();
    if (found.permissions === true) return;
    setPending(true);
    try {
      const saved = await save(draft);
      notify.success(role === null ? t("created", { name: saved?.name ?? draft.name }) : t("updated", { name: saved?.name ?? draft.name }));
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
          <DialogTitle>{role === null ? t("createTitle") : t("editTitle", { name: role.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          {failure === null ? null : <ApiErrorAlert error={failure} />}
          <FieldGroup>
            <Field>
              <FieldLabel>{t("name")}</FieldLabel>
              <FieldControl>
                <Input ref={nameInput} required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </FieldControl>
              <FieldError errors={[problems.name === undefined ? undefined : t(`errors.${problems.name}`)]} />
            </Field>
            <Field>
              <FieldLabel>{t("descriptionField")}</FieldLabel>
              <FieldControl>
                <Textarea rows={2} maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </FieldControl>
            </Field>
            <PermissionCatalogField
              legend={t("permissions")}
              value={draft.permissions}
              onChange={(next) => setDraft({ ...draft, permissions: next })}
              grantable={grantable}
              error={problems.permissions === true ? t("errors.permissions") : undefined}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" pending={pending} disabled={!catalogReady}>
              {role === null ? t("create") : t("save")}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function RoleEditorDialog(props: RoleEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <RoleEditorDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
