"use client";

import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Combobox } from "#/shared/ui/molecules/Combobox/Combobox.tsx";
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
import type { MoveTarget } from "../model/unit-tree-rules.ts";

export type MoveUnitDialogProps = {
  /** The unit's name, or `null` to close. */
  unitName: string | null;
  targets: readonly MoveTarget[];
  onOpenChange: (open: boolean) => void;
  onMove: (parentUnitId: string | null) => Promise<void>;
};

/**
 * "Move to…" (no drag-only interaction, rules/accessibility.md): a searchable list of valid
 * destinations by path. `INVALID_UNIT_PARENT` and `SUBTREE_TOO_LARGE` stay in the dialog.
 */
function MoveUnitDialogBody({ unitName, targets, onOpenChange, onMove }: MoveUnitDialogProps) {
  const t = useTranslations("settings.units.move");
  const [target, setTarget] = useState<string | undefined>();
  const [missing, setMissing] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const chosen = targets.find((candidate) => candidate.value === target);
    if (pending) return;
    if (chosen === undefined) return setMissing(true);
    setPending(true);
    setFailure(null);
    try {
      await onMove(chosen.parentUnitId);
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
        <DialogTitle>{t("title", { name: unitName ?? "" })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        {failure === null ? null : <ApiErrorAlert error={failure} />}
        <Field>
          <FieldLabel>{t("destination")}</FieldLabel>
          {targets.length === 0 ? (
            <FieldDescription>{t("noTargets")}</FieldDescription>
          ) : (
            <FieldControl>
              <Combobox
                groups={[{ options: targets.map(({ value, label }) => ({ value, label })) }]}
                value={target}
                onValueChange={(value) => {
                  setTarget(value);
                  setMissing(false);
                }}
                placeholder={t("placeholder")}
                searchLabel={t("search")}
                searchPlaceholder={t("search")}
                emptyText={t("empty")}
              />
            </FieldControl>
          )}
          <FieldError errors={[missing ? t("required") : undefined]} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" pending={pending} disabled={targets.length === 0}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function MoveUnitDialog(props: MoveUnitDialogProps) {
  return (
    <Dialog open={props.unitName !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <MoveUnitDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
