"use client";

import { deleteCustomSkillEndpoint, updateCustomSkillEndpoint, type CustomSkill } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { invalidateSkillData } from "../model/invalidate-skill-data.ts";

type SkillDialogProps = { organizationId: string; skill: CustomSkill | null; onOpenChange: (open: boolean) => void };

/**
 * Deletes a skill (`DELETE /v1/skills/{id}`, core.agent-settings.update). Agents that selected it
 * keep running without it. A failure stays in the dialog with its reference.
 */
export function DeleteCustomSkillDialog({ organizationId, skill, onOpenChange }: SkillDialogProps) {
  const t = useTranslations("settings.skills.custom.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (skill === null) return;
      await callEndpoint(deleteCustomSkillEndpoint, { params: { skillId: skill.id }, query: { organizationId } });
      await invalidateSkillData(queryClient, organizationId);
    },
    () => notify.success(t("done", { name: skill?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={skill !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name: skill?.name ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}

/** Enables or disables a skill for the agents that selected it (`PATCH /v1/skills/{id}` `enabled`). */
export function ToggleCustomSkillDialog({ organizationId, skill, onOpenChange }: SkillDialogProps) {
  const t = useTranslations("settings.skills.custom.toggle");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const disabling = skill?.enabled === true;
  const action = useConfirmedAction(
    async () => {
      if (skill === null) return;
      await callEndpoint(updateCustomSkillEndpoint, { params: { skillId: skill.id }, query: { organizationId }, body: { enabled: !disabling } });
      await invalidateSkillData(queryClient, organizationId);
    },
    () => notify.success(t(disabling ? "doneDisabled" : "doneEnabled", { name: skill?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={skill !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t(disabling ? "disableTitle" : "enableTitle", { name: skill?.name ?? "" })}
      description={t(disabling ? "disableDescription" : "enableDescription")}
      confirmLabel={t(disabling ? "disableConfirm" : "enableConfirm")}
      destructive={disabling}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
