"use client";

import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { CopyField } from "#/shared/ui/molecules/CopyField/CopyField.tsx";
import { DialogFooter } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";

export type OneTimeSecretProps = {
  title: string;
  warning: string;
  label: string;
  secret: string;
  /** Hint under the field (where to paste it). */
  hint: string;
  acknowledge: string;
  doneLabel: string;
  onDone: () => void;
};

/**
 * One-time secret reveal (API keys, invitation links): the secret masked with reveal and copy, a warning that it is
 * never shown again, and "Done" enabled once the user confirms they stored it. Until then, closing the
 * dialog any other way (Esc, outside click, X) asks first.
 */
export function OneTimeSecret({
  title,
  warning,
  label,
  secret,
  hint,
  acknowledge,
  doneLabel,
  onDone,
}: OneTimeSecretProps) {
  const t = useTranslations("common.oneTimeSecret");
  const id = useId();
  const [stored, setStored] = useState(false);
  useDialogDismissGuard(stored ? "allow" : "confirmOneTime");
  return (
    <div className="flex flex-col gap-5">
      <Alert variant="warning">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{warning}</AlertDescription>
      </Alert>
      <CopyField label={label} value={secret} sensitive description={hint} />
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={`${id}-stored`}
          className="mt-0.5"
          checked={stored}
          onCheckedChange={(next) => setStored(next === true)}
        />
        <Label htmlFor={`${id}-stored`} className="font-normal">
          {acknowledge}
        </Label>
      </div>
      <DialogFooter>
        <Button onClick={onDone} disabled={!stored} aria-describedby={stored ? undefined : `${id}-why`}>
          {doneLabel}
        </Button>
        {stored ? null : (
          <span id={`${id}-why`} className="sr-only">
            {t("confirmFirst")}
          </span>
        )}
      </DialogFooter>
    </div>
  );
}
