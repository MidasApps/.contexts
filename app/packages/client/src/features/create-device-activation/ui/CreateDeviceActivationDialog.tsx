"use client";

import { createDeviceActivationEndpoint, type Role, type RoleRef } from "@core/contracts";
import { type FormEvent, type Ref, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { NodeSelect, type TenantNodeInput } from "#/entities/project/index.ts";
import { DEVICE_SYSTEM_ROLES, RoleChecklist, useRoleOptions } from "#/entities/role/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
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
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/shared/ui/molecules/Field/Field.tsx";
import { ActivationCode } from "./ActivationCode.tsx";

export type CreateDeviceActivationDialogProps = {
  organization: { id: string; name: string };
  customRoles: readonly Role[] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now?: () => Date;
};

type Draft = { label: string; node: TenantNodeInput; roles: RoleRef[] };
const DEVICE_ROLE: RoleRef[] = [{ kind: "system", key: "device" }];
const LABEL_MAX = 80;
const systemNow = (): Date => new Date();
const emptyDraft = (organizationId: string): Draft => ({
  label: "",
  node: { level: "organization", tenantId: organizationId },
  roles: DEVICE_ROLE,
});

type DraftProblems = { label?: string; roles?: string };

/** Device name, node and roles of the code to create. */
function DeviceActivationFields({
  organization,
  options,
  draft,
  onDraftChange,
  problems,
  labelInput,
}: {
  organization: { id: string; name: string };
  options: ReturnType<typeof useRoleOptions>;
  draft: Draft;
  onDraftChange: (draft: Draft) => void;
  problems: DraftProblems;
  labelInput: Ref<HTMLInputElement>;
}) {
  const t = useTranslations("settings.devices.createDialog");
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{t("label")}</FieldLabel>
        <FieldControl>
          <Input
            ref={labelInput}
            required
            value={draft.label}
            onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
          />
        </FieldControl>
        <FieldDescription>{t("labelHint")}</FieldDescription>
        <FieldError errors={[problems.label]} />
      </Field>
      <Field>
        <FieldLabel>{t("node")}</FieldLabel>
        <FieldControl>
          <NodeSelect
            organization={organization}
            value={draft.node}
            onValueChange={(node) => onDraftChange({ ...draft, node })}
          />
        </FieldControl>
        <FieldDescription>{t("nodeHint")}</FieldDescription>
      </Field>
      <RoleChecklist
        legend={t("roles")}
        options={options}
        value={draft.roles}
        onChange={(roles) => onDraftChange({ ...draft, roles })}
        error={problems.roles}
      />
    </FieldGroup>
  );
}

/**
 * Creates a one-time device activation code (`POST …/device-activations`, core.device.create):
 * device name, node and roles (no escalation). The code is shown once with a 10-minute countdown;
 * closing the dialog drops it. Devices appear in the list after they redeem the code.
 */
function CreateDeviceActivationDialogBody({
  organization,
  customRoles,
  onOpenChange,
  now = systemNow,
}: CreateDeviceActivationDialogProps) {
  const t = useTranslations("settings.devices.createDialog");
  const callEndpoint = useCallEndpoint();
  const idempotency = useIdempotencyKey();
  const resetKey = idempotency.reset;
  const options = useRoleOptions(customRoles, DEVICE_SYSTEM_ROLES);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(organization.id));
  const [problems, setProblems] = useState<DraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [activation, setActivation] = useState<{ label: string; code: string; expiresAt: string } | null>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  // Closing mid-request would create the code and drop its only copy.
  useDialogDismissGuard(pending ? "block" : "allow");

  const reset = (): void => {
    setDraft(emptyDraft(organization.id));
    setProblems({});
    setFailure(null);
    setActivation(null);
    resetKey();
  };
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const label = draft.label.trim();
    const found = {
      ...(label === ""
        ? { label: t("errors.labelRequired") }
        : label.length > LABEL_MAX
          ? { label: t("errors.labelTooLong", { max: LABEL_MAX }) }
          : {}),
      ...(draft.roles.length === 0 ? { roles: t("errors.roles") } : {}),
    };
    setProblems(found);
    setFailure(null);
    if (found.label !== undefined) return labelInput.current?.focus();
    if (found.roles !== undefined) return;
    const body = { label, node: draft.node, roles: draft.roles };
    setPending(true);
    try {
      const { data } = await callEndpoint(createDeviceActivationEndpoint, {
        params: { organizationId: organization.id },
        body,
        idempotencyKey: idempotency.keyFor(body),
      });
      resetKey();
      setActivation({ label, code: data.code, expiresAt: data.expiresAt });
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{activation === null ? t("title") : t("codeTitle", { label: activation.label })}</DialogTitle>
        <DialogDescription>{activation === null ? t("description") : t("codeDescription")}</DialogDescription>
      </DialogHeader>
      {activation !== null ? (
        <ActivationCode
          label={activation.label}
          code={activation.code}
          expiresAt={activation.expiresAt}
          now={now}
          onAnother={reset}
          onDone={() => onOpenChange(false)}
        />
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          {failure === null ? null : <ApiErrorAlert error={failure} />}
          <DeviceActivationFields
            organization={organization}
            options={options}
            draft={draft}
            onDraftChange={setDraft}
            problems={problems}
            labelInput={labelInput}
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
      )}
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function CreateDeviceActivationDialog(props: CreateDeviceActivationDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <CreateDeviceActivationDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
