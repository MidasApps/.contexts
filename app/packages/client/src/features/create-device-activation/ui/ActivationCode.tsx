"use client";

import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { CopyField } from "#/shared/ui/molecules/CopyField/CopyField.tsx";
import { DialogFooter } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { groupActivationCode, useCountdown } from "../model/use-countdown.ts";

export type ActivationCodeProps = {
  label: string;
  code: string;
  expiresAt: string;
  now: () => Date;
  onAnother: () => void;
  onDone: () => void;
};

/**
 * The one-time activation code, large and grouped for typing on the device, with copy and a
 * visual countdown. The polite announcement changes once a minute (not every second) and when the
 * code expires; an expired code is hidden and a new one can be generated.
 */
export function ActivationCode({ label, code, expiresAt, now, onAnother, onDone }: ActivationCodeProps) {
  const t = useTranslations("settings.devices.activation");
  const seconds = useCountdown(expiresAt, now);
  const minutes = Math.ceil(seconds / 60);
  // A live code is shown once: Esc, outside click or X ask first; an expired one closes freely.
  useDialogDismissGuard(seconds === 0 ? "allow" : "confirmOneTime");
  const clock = `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
  if (seconds === 0) {
    return (
      <div className="flex flex-col gap-5">
        <Alert variant="warning">
          <AlertTitle>{t("expiredTitle")}</AlertTitle>
          <AlertDescription>{t("expiredDescription")}</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="secondary" onClick={onDone}>
            {t("close")}
          </Button>
          <Button onClick={onAnother}>{t("another")}</Button>
        </DialogFooter>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("instructions", { label })}</p>
      <p aria-hidden="true" className="text-center font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums">
        {groupActivationCode(code)}
      </p>
      <CopyField label={t("codeLabel")} value={groupActivationCode(code)} description={t("codeHint")} />
      <p className="text-center text-sm">
        <span aria-hidden="true" className="font-mono tabular-nums">
          {t("countdown", { clock })}
        </span>
      </p>
      <p role="status" className="sr-only">
        {t("expiresIn", { minutes })}
      </p>
      <DialogFooter>
        <Button onClick={onDone}>{t("done")}</Button>
      </DialogFooter>
    </div>
  );
}
