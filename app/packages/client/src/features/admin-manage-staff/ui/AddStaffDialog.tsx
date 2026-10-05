"use client";

import { adminListUsersEndpoint, adminSetStaffRoleEndpoint, type PlatformRole } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { platformStaffKeys } from "#/entities/platform-staff/index.ts";
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
import { StaffRoleChoice } from "./StaffRoleChoice.tsx";

export type AddStaffDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

type Problem = "required" | "invalid" | "notFound";
const EmailSchema = z.email();

function AddStaffForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin.team.add");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PlatformRole>("platform-support");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const typed = email.trim().toLowerCase();
    setFailure(null);
    if (typed === "") return setProblem("required");
    if (!EmailSchema.safeParse(typed).success) return setProblem("invalid");
    setPending(true);
    try {
      // The account is found by its exact email; the staff record is keyed by its uid.
      const found = await callEndpoint(adminListUsersEndpoint, { query: { query: typed, by: "email", limit: 5 } });
      const user = found.data.find((candidate) => candidate.email?.toLowerCase() === typed);
      if (user === undefined) return setProblem("notFound");
      await callEndpoint(adminSetStaffRoleEndpoint, { params: { userId: user.id }, body: { role } });
      await queryClient.invalidateQueries({ queryKey: platformStaffKeys.all() });
      notify.success(t("done", { email: typed }));
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
      <Field invalid={problem !== null}>
        <FieldLabel>{t("email")}</FieldLabel>
        <FieldControl>
          <Input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setProblem(null);
            }}
          />
        </FieldControl>
        <FieldDescription>{t("emailHint")}</FieldDescription>
        <FieldError errors={[problem === null ? undefined : t(`errors.${problem}`)]} />
      </Field>
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
 * "Add to the team" (platform.staff.manage, decision 0075): finds the account by its exact email
 * (`GET /v1/admin/users`, platform.user.read) and grants the role (`PUT /v1/admin/staff/{uid}`).
 * The person still needs two-step verification to open the console.
 */
export function AddStaffDialog({ open, onOpenChange }: AddStaffDialogProps) {
  const t = useTranslations("admin.team.add");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open ? <AddStaffForm onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
