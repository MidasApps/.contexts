"use client";

import { grantMembershipEndpoint, type Member, type Role, type RoleRef } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { memberKeys } from "#/entities/member/index.ts";
import { NodeSelect, nodeWithUnit, type TenantNodeInput } from "#/entities/project/index.ts";
import { RoleChecklist, useRoleOptions } from "#/entities/role/index.ts";
import { UnitSelect } from "#/entities/unit/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type GrantAccessDialogProps = {
  organization: { id: string; name: string };
  /** The member to grant; `null` closes the dialog. */
  member: Member | null;
  customRoles: readonly Role[] | undefined;
  onOpenChange: (open: boolean) => void;
};

const memberName = (member: Member): string => (member.displayName === "" ? member.email : member.displayName);

const DEFAULT_ROLES: RoleRef[] = [{ kind: "system", key: "member" }];

/**
 * Gives an existing member access at one more place (`POST …/memberships`, core.member.update at
 * that place, no escalation): the whole organization, a project or a unit of it, with roles. A
 * second grant at the same place is refused (`MEMBERSHIP_EXISTS`); the dialog says to edit that one.
 */
function GrantAccessDialogBody({ organization, member, customRoles, onOpenChange }: GrantAccessDialogProps) {
  const t = useTranslations("settings.members.grant");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const options = useRoleOptions(customRoles);
  const [node, setNode] = useState<TenantNodeInput>({ level: "organization", tenantId: organization.id });
  const [roles, setRoles] = useState<RoleRef[]>(DEFAULT_ROLES);
  const [emptyRoles, setEmptyRoles] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (member === null || pending) return;
    if (roles.length === 0) return setEmptyRoles(true);
    const body = { userId: member.uid, node, roles };
    setPending(true);
    setError(null);
    try {
      await callEndpoint(grantMembershipEndpoint, {
        params: { organizationId: organization.id },
        body,
        idempotencyKey: idempotency.keyFor(body),
      });
      idempotency.reset();
      await queryClient.invalidateQueries({ queryKey: memberKeys.all(organization.id) });
      notify.success(t("done", { name: memberName(member) }));
      onOpenChange(false);
    } catch (failure: unknown) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  const exists = error instanceof ApiError && error.code === "MEMBERSHIP_EXISTS";
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title", { name: member === null ? "" : memberName(member) })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        {error === null ? null : exists ? (
          <Alert variant="destructive">
            <AlertDescription>{t("exists")}</AlertDescription>
          </Alert>
        ) : (
          <ApiErrorAlert error={error} />
        )}
        <FieldGroup>
          <Field>
            <FieldLabel>{t("node")}</FieldLabel>
            <FieldControl>
              <NodeSelect organization={organization} value={node} onValueChange={setNode} />
            </FieldControl>
            <FieldDescription>{t("nodeHint")}</FieldDescription>
          </Field>
          {node.level === "organization" ? null : (
            <Field>
              <FieldLabel>{t("unit")}</FieldLabel>
              <FieldControl>
                <UnitSelect
                  organizationId={organization.id}
                  projectId={node.projectId}
                  value={node.level === "unit" ? node.unitId : undefined}
                  onValueChange={(unitId) => setNode(nodeWithUnit(node, unitId))}
                />
              </FieldControl>
              <FieldDescription>{t("unitHint")}</FieldDescription>
            </Field>
          )}
          <RoleChecklist
            legend={t("roles")}
            options={options}
            value={roles}
            onChange={(next) => {
              setRoles(next);
              setEmptyRoles(false);
            }}
            error={emptyRoles ? t("rolesRequired") : undefined}
          />
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
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state never outlives the dialog. */
export function GrantAccessDialog(props: GrantAccessDialogProps) {
  return (
    <Dialog open={props.member !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <GrantAccessDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
