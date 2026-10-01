"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode } from "#/shared/lib/auth/auth-port.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { CODE_PATTERN, CodeField, EnrollmentAlert, FactorNameField } from "./enrollment-fields.tsx";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onEnrolled: () => Promise<void> };

const E164 = /^\+[1-9]\d{7,14}$/u;

type Step = { verificationId: string | null; phone: string };

/**
 * SMS enrollment (the factor the Auth Emulator supports, SP1 §3.4): phone number in international
 * format → code sent through the invisible reCAPTCHA (announced) → code confirms it.
 */
function EnrollSmsDialogBody({ onOpenChange, onEnrolled }: Props) {
  const t = useTranslations("profile.security.mfa");
  const auth = useAuth();
  const [step, setStep] = useState<Step>({ verificationId: null, phone: "" });
  const [name, setName] = useState(t("smsDefaultName"));
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ phone?: string | undefined; code?: string | undefined }>({});
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const recaptcha = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step.verificationId !== null) codeInput.current?.focus();
  }, [step.verificationId]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setFailure(null);
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  };

  const sendCode = (): Promise<void> =>
    run(async () => {
      const phone = step.phone.replace(/[\s()-]/gu, "");
      if (!E164.test(phone)) {
        setErrors({ phone: t("phoneInvalid") });
        return phoneInput.current?.focus();
      }
      setErrors({});
      if (recaptcha.current === null) return;
      try {
        const verificationId = await auth.startSmsEnrollment(phone, recaptcha.current);
        setStep({ verificationId, phone });
      } catch (error: unknown) {
        const failed = authErrorCode(error);
        if (failed !== "INVALID_PHONE_NUMBER") return setFailure(failed);
        setErrors({ phone: t("phoneInvalid") });
        phoneInput.current?.focus();
      }
    });

  const verify = (verificationId: string): Promise<void> =>
    run(async () => {
      if (!CODE_PATTERN.test(code)) {
        setErrors({ code: t(code === "" ? "codeRequired" : "codeInvalid") });
        return codeInput.current?.focus();
      }
      try {
        await auth.finishSmsEnrollment(verificationId, code, name.trim() === "" ? t("smsDefaultName") : name.trim());
        await onEnrolled();
        onOpenChange(false);
      } catch (error: unknown) {
        const failed = authErrorCode(error);
        setCode("");
        if (failed !== "INVALID_MFA_CODE") return setFailure(failed);
        setErrors({ code: t("codeWrong") });
        codeInput.current?.focus();
      }
    });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending) return;
    void (step.verificationId === null ? sendCode() : verify(step.verificationId));
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{t("smsTitle")}</DialogTitle>
          <DialogDescription>{t("smsDescription")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          {failure === null ? null : <EnrollmentAlert code={failure} />}
          <Field>
            <FieldLabel>{t("phone")}</FieldLabel>
            <FieldControl>
              <Input
                ref={phoneInput}
                type="tel"
                autoComplete="tel"
                required
                readOnly={step.verificationId !== null}
                value={step.phone}
                onChange={(event) => setStep({ verificationId: null, phone: event.target.value })}
              />
            </FieldControl>
            <FieldDescription>{t("phoneHint")}</FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>
          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {step.verificationId === null ? "" : t("codeSent", { phone: step.phone })}
          </p>
          {step.verificationId === null ? null : (
            <>
              <FactorNameField value={name} onChange={setName} />
              <CodeField value={code} onChange={setCode} error={errors.code} inputRef={codeInput} hint={t("smsCodeHint")} />
            </>
          )}
          <div ref={recaptcha} />
          <DialogFooter>
            {step.verificationId === null ? null : (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setStep((current) => ({ ...current, verificationId: null }))}>
                {t("changePhone")}
              </Button>
            )}
            <Button type="submit" pending={pending}>
              {step.verificationId === null ? t("sendCode") : t("verify")}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function EnrollSmsDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <EnrollSmsDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
