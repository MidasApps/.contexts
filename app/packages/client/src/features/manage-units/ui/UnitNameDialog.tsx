"use client";

import type { UnitTypeDefinition } from "@core/contracts";
import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";

const NAME_MAX = 120;

export type UnitNameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initialName?: string;
  /** Present when creating: the unit types allowed under the chosen parent. */
  types?: readonly UnitTypeDefinition[] | undefined;
  typeLabel?: (type: UnitTypeDefinition) => string;
  onSubmit: (values: { name: string; type: string | undefined }) => Promise<void>;
};

/**
 * Name (and, when creating, type) of a unit. Client checks first (1–120 chars, a type); API
 * failures such as `INVALID_UNIT_PARENT` stay in the dialog as a focused alert.
 */
function UnitNameDialogBody({ onOpenChange, title, description, submitLabel, initialName = "", types, typeLabel, onSubmit }: UnitNameDialogProps) {
  const t = useTranslations("settings.units.form");
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<string | undefined>(() => (types?.length === 1 ? types[0]?.id : undefined));
  const [problems, setProblems] = useState<{ name?: string; type?: string }>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    const found = {
      ...(trimmed === "" ? { name: t("nameRequired") } : trimmed.length > NAME_MAX ? { name: t("nameTooLong", { max: NAME_MAX }) } : {}),
      ...(types !== undefined && type === undefined ? { type: t("typeRequired") } : {}),
    };
    setProblems(found);
    if (found.name !== undefined) return nameInput.current?.focus();
    if (found.type !== undefined) return;
    setPending(true);
    setFailure(null);
    try {
      await onSubmit({ name: trimmed, type });
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          {failure === null ? null : <ApiErrorAlert error={failure} />}
          <FieldGroup>
            <Field>
              <FieldLabel>{t("name")}</FieldLabel>
              <FieldControl>
                <Input ref={nameInput} required value={name} onChange={(event) => setName(event.target.value)} />
              </FieldControl>
              <FieldError errors={[problems.name]} />
            </Field>
            {types === undefined ? null : (
              <Field>
                <FieldLabel>{t("type")}</FieldLabel>
                {types.length === 0 ? (
                  <FieldDescription>{t("noTypes")}</FieldDescription>
                ) : (
                  <Select value={type ?? ""} onValueChange={setType}>
                    <FieldControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("typePlaceholder")} />
                      </SelectTrigger>
                    </FieldControl>
                    <SelectContent>
                      {types.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {typeLabel?.(candidate) ?? candidate.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FieldError errors={[problems.type]} />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" pending={pending} disabled={types?.length === 0}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function UnitNameDialog(props: UnitNameDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <UnitNameDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
