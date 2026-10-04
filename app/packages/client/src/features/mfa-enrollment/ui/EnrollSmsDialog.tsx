"use client";

import { type Ref, useEffect, useRef } from "react";
import { useTranslations } from "use-intl";
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
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { useSmsEnrollment } from "../model/use-sms-enrollment.ts";
import { CodeField, EnrollmentAlert, FactorNameField } from "./enrollment-fields.tsx";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onEnrolled: () => Promise<void> };

/** The phone number in international format; read-only once the code went to it. */
function PhoneField({
  inputRef,
  phone,
  locked,
  onPhoneChange,
  error,
}: {
  inputRef: Ref<HTMLInputElement>;
  phone: string;
  locked: boolean;
  onPhoneChange: (phone: string) => void;
  error: string | undefined;
}) {
  const t = useTranslations("profile.security.mfa");
  return (
    <Field>
      <FieldLabel>{t("phone")}</FieldLabel>
      <FieldControl>
        <Input
          ref={inputRef}
          type="tel"
          autoComplete="tel"
          required
          readOnly={locked}
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
        />
      </FieldControl>
      <FieldDescription>{t("phoneHint")}</FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  );
}

/** Announces where the code went (live status, empty before) and, once sent, asks for the name and the code. */
function SentCodeFields({
  sentTo,
  name,
  onNameChange,
  code,
  onCodeChange,
  error,
  codeInput,
}: {
  sentTo: string | null;
  name: string;
  onNameChange: (name: string) => void;
  code: string;
  onCodeChange: (code: string) => void;
  error: string | undefined;
  codeInput: Ref<HTMLInputElement>;
}) {
  const t = useTranslations("profile.security.mfa");
  return (
    <>
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {sentTo === null ? "" : t("codeSent", { phone: sentTo })}
      </p>
      {sentTo === null ? null : (
        <>
          <FactorNameField value={name} onChange={onNameChange} />
          <CodeField value={code} onChange={onCodeChange} error={error} inputRef={codeInput} hint={t("smsCodeHint")} />
        </>
      )}
    </>
  );
}

/** "Send code" before the code went out; "change phone" and "verify" after. */
function SmsEnrollmentActions({
  codeSent,
  pending,
  onChangePhone,
}: {
  codeSent: boolean;
  pending: boolean;
  onChangePhone: () => void;
}) {
  const t = useTranslations("profile.security.mfa");
  return (
    <DialogFooter>
      {codeSent ? (
        <Button type="button" variant="ghost" disabled={pending} onClick={onChangePhone}>
          {t("changePhone")}
        </Button>
      ) : null}
      <Button type="submit" pending={pending}>
        {codeSent ? t("verify") : t("sendCode")}
      </Button>
    </DialogFooter>
  );
}

/**
 * SMS enrollment (the factor the Auth Emulator supports, SP1 §3.4): phone number in international
 * format → code sent through the invisible reCAPTCHA (announced) → code confirms it.
 */
function EnrollSmsDialogBody({ onOpenChange, onEnrolled }: Props) {
  const t = useTranslations("profile.security.mfa");
  const phoneInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const recaptcha = useRef<HTMLDivElement>(null);
  const enrollment = useSmsEnrollment({
    onEnrolled,
    onClose: () => onOpenChange(false),
    phoneInput,
    codeInput,
    recaptcha,
  });
  const { step, errors, failure, pending } = enrollment;
  // The code field mounts once the SMS is sent; move focus to it then.
  useEffect(() => {
    if (step.verificationId !== null) codeInput.current?.focus();
  }, [step.verificationId]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("smsTitle")}</DialogTitle>
        <DialogDescription>{t("smsDescription")}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={enrollment.submit} className="flex flex-col gap-5">
        {failure === null ? null : <EnrollmentAlert code={failure} />}
        <PhoneField
          inputRef={phoneInput}
          phone={step.phone}
          locked={step.verificationId !== null}
          onPhoneChange={enrollment.changePhone}
          error={errors.phone}
        />
        <SentCodeFields
          sentTo={step.verificationId === null ? null : step.phone}
          name={enrollment.name}
          onNameChange={enrollment.setName}
          code={enrollment.code}
          onCodeChange={enrollment.setCode}
          error={errors.code}
          codeInput={codeInput}
        />
        <div ref={recaptcha} />
        <SmsEnrollmentActions
          codeSent={step.verificationId !== null}
          pending={pending}
          onChangePhone={enrollment.editPhone}
        />
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
