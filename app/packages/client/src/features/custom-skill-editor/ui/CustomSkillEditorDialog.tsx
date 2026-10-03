"use client";

import { createCustomSkillEndpoint, updateCustomSkillEndpoint, type CustomSkill } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { draftFromSkill, emptySkillDraft, skillInputOf, skillProblemsFromDetails, type SkillDraft, type SkillDraftProblems } from "../model/custom-skill-draft.ts";
import { invalidateSkillData } from "../model/invalidate-skill-data.ts";

export type CustomSkillEditorDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The skill to edit; absent creates one. */
  skill?: CustomSkill | null | undefined;
  /** The plan's cap for instructions (`limits.maxInstructionChars`). */
  maxInstructionChars: number;
};

type FieldsProps = { draft: SkillDraft; setDraft: (draft: SkillDraft) => void; problems: SkillDraftProblems; maxInstructionChars: number };

function SkillFields({ draft, setDraft, problems, maxInstructionChars }: FieldsProps) {
  const t = useTranslations("settings.skills.custom.editor");
  const problem = (field: keyof SkillDraftProblems): (string | undefined)[] => {
    const kind = problems[field];
    return [kind === undefined ? undefined : t(`errors.${field}.${kind}`, { maximum: maxInstructionChars })];
  };
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{t("fields.name")}</FieldLabel>
        <FieldControl>
          <Input required autoComplete="off" spellCheck={false} className="font-mono" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </FieldControl>
        <FieldDescription>{t("hints.name")}</FieldDescription>
        <FieldError errors={problem("name")} />
      </Field>
      <Field>
        <FieldLabel>{t("fields.description")}</FieldLabel>
        <FieldControl>
          <Textarea required rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </FieldControl>
        <FieldDescription>{t("hints.description")}</FieldDescription>
        <FieldError errors={problem("description")} />
      </Field>
      <Field>
        <FieldLabel>{t("fields.instructions")}</FieldLabel>
        <FieldControl>
          <Textarea required rows={10} className="font-mono text-body-sm" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
        </FieldControl>
        <FieldDescription>
          {t("hints.instructions")} {t("counter", { count: draft.instructions.length, maximum: maxInstructionChars })}
        </FieldDescription>
        <FieldError errors={problem("instructions")} />
      </Field>
      <Field orientation="horizontal">
        <FieldLabel>{t("fields.enabled")}</FieldLabel>
        <FieldControl>
          <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
        </FieldControl>
      </Field>
    </FieldGroup>
  );
}

function SkillEditorBody({ organizationId, onOpenChange, skill = null, maxInstructionChars }: CustomSkillEditorDialogProps) {
  const t = useTranslations("settings.skills.custom.editor");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const [draft, keepDraft] = useState<SkillDraft>(() => (skill === null ? emptySkillDraft() : draftFromSkill(skill)));
  // Typed work has no draft elsewhere: Esc, an outside click or the X ask before dropping it (decision 0048).
  const [dirty, setDirty] = useState(false);
  useDialogDismissGuard(dirty ? "confirmUnsaved" : "allow");
  const setDraft = (next: SkillDraft): void => {
    keepDraft(next);
    setDirty(true);
  };
  const [problems, setProblems] = useState<SkillDraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const mode = skill === null ? "create" : "edit";

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const result = skillInputOf(draft, maxInstructionChars);
    setFailure(null);
    setProblems(result.ok ? {} : result.problems);
    if (!result.ok) return;
    const { input } = result;
    setPending(true);
    try {
      if (skill === null) {
        await callEndpoint(createCustomSkillEndpoint, { query: { organizationId }, body: input, idempotencyKey: idempotency.keyFor(input) });
        idempotency.reset();
      } else {
        await callEndpoint(updateCustomSkillEndpoint, { params: { skillId: skill.id }, query: { organizationId }, body: input });
      }
      await invalidateSkillData(queryClient, organizationId);
      notify.success(t(mode === "create" ? "created" : "saved", { name: input.name }));
      onOpenChange(false);
    } catch (error: unknown) {
      setFailure(error);
      if (error instanceof ApiError) setProblems(error.status === 409 ? { name: "taken" } : skillProblemsFromDetails(error.details));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(mode === "create" ? "createTitle" : "editTitle", { name: skill?.name ?? "" })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        {failure === null ? null : <ApiErrorAlert error={failure} />}
        <SkillFields draft={draft} setDraft={setDraft} problems={problems} maxInstructionChars={maxInstructionChars} />
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" pending={pending}>
            {t(mode === "create" ? "submitCreate" : "submitSave")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Creates or edits a skill of the organization (`POST /v1/skills`, `PATCH /v1/skills/{id}`,
 * core.agent-settings.update). The contract schema and the plan's cap give early feedback; the
 * API's `VALIDATION_FAILED` details and a taken name (409) land next to their fields. The body
 * mounts on open, so a draft never outlives the dialog.
 */
export function CustomSkillEditorDialog(props: CustomSkillEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <SkillEditorBody key={props.skill?.id ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  );
}
