"use client";

import { type Member, type Role, type RoleRef, updateMembershipEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslations } from "use-intl";
import { memberKeys } from "#/entities/member/index.ts";
import { RoleChecklist, useRoleOptions } from "#/entities/role/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

type Grant = Member["grants"][number];

export type EditGrantRolesDialogProps = {
  organizationId: string;
  /** The member and one of their grants; `null` closes the dialog. */
  target: { member: Member; grant: Grant } | null;
  customRoles: readonly Role[] | undefined;
  onOpenChange: (open: boolean) => void;
  /** Where the grant applies, in words (the view passes `NodeName`). */
  nodeLabel: ReactNode;
};

const memberName = (member: Member): string => (member.displayName === "" ? member.email : member.displayName);

/**
 * Changes the roles of one grant (`PATCH /v1/memberships/{id}`, core.member.update). The API
 * refuses roles above the actor's own (`ESCALATION_FORBIDDEN`) and removing the last owner
 * (`LAST_OWNER`); both stay in the dialog as a focused alert with the reference.
 */
function EditGrantRolesDialogBody({
  organizationId,
  target,
  customRoles,
  onOpenChange,
  nodeLabel,
}: EditGrantRolesDialogProps) {
  const t = useTranslations("settings.members.editRoles");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const options = useRoleOptions(customRoles);
  const [roles, setRoles] = useState<RoleRef[]>(() => (target === null ? [] : [...target.grant.roles]));
  const [error, setError] = useState<unknown>(null);
  const [empty, setEmpty] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (target === null || pending) return;
    if (roles.length === 0) return setEmpty(true);
    setPending(true);
    setError(null);
    try {
      await callEndpoint(updateMembershipEndpoint, {
        params: { membershipId: target.grant.membershipId },
        body: { roles },
      });
      await queryClient.invalidateQueries({ queryKey: memberKeys.all(organizationId) });
      notify.success(t("saved", { name: memberName(target.member) }));
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
        <DialogTitle>{t("title", { name: target === null ? "" : memberName(target.member) })}</DialogTitle>
        <DialogDescription>
          {t("description")} <span className="font-medium text-foreground">{nodeLabel}</span>
        </DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        {error === null ? null : <ApiErrorAlert error={error} />}
        <RoleChecklist
          legend={t("rolesLegend")}
          options={options}
          value={roles}
          onChange={(next) => {
            setRoles(next);
            setEmpty(false);
          }}
          error={empty ? t("rolesRequired") : undefined}
        />
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" pending={pending}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function EditGrantRolesDialog(props: EditGrantRolesDialogProps) {
  return (
    <Dialog open={props.target !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <EditGrantRolesDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
