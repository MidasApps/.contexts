"use client";

import { adminRevokeStaffEndpoint, adminSetStaffRoleEndpoint, type PlatformRole } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { platformStaffKeys } from "#/entities/platform-staff/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
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
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { StaffRoleChoice } from "./StaffRoleChoice.tsx";

/** A staff member as the dialogs need them: uid, a label to show and the current role. */
export type StaffTarget = { readonly uid: string; readonly label: string; readonly role: PlatformRole };

function RoleForm({ target, onClose }: { target: StaffTarget; onClose: () => void }) {
  const t = useTranslations("admin.team.role");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<PlatformRole>(target.role);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      await callEndpoint(adminSetStaffRoleEndpoint, { params: { userId: target.uid }, body: { role } });
      await queryClient.invalidateQueries({ queryKey: platformStaffKeys.all() });
      notify.success(t("done", { name: target.label }));
      onClose();
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
      {failure === null ? null : <ApiErrorAlert error={failure} />}
      <StaffRoleChoice value={role} onChange={setRole} />
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" pending={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Changes the role of a staff member, or gives a revoked one access again (`PUT
 * /v1/admin/staff/{uid}`, platform.staff.manage). The API refuses one's own record.
 */
export function StaffRoleDialog({
  target,
  onOpenChange,
}: {
  target: StaffTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.team.role");
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: target?.label ?? "" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {target === null ? null : <RoleForm target={target} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Revokes a staff member (`DELETE /v1/admin/staff/{uid}`): their platform permissions go at once
 * and their open support sessions end. The API refuses one's own record.
 */
export function RevokeStaffDialog({
  target,
  onOpenChange,
}: {
  target: StaffTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.team.revoke");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const name = target?.label ?? "";
  const action = useConfirmedAction(
    async () => {
      if (target === null) return;
      await callEndpoint(adminRevokeStaffEndpoint, { params: { userId: target.uid } });
      await queryClient.invalidateQueries({ queryKey: platformStaffKeys.all() });
    },
    () => notify.success(t("done", { name })),
  );
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
