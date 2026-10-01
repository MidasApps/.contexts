"use client";

import { CircleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslations } from "use-intl";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode, MfaChallenge, MfaHint } from "#/shared/lib/auth/auth-port.ts";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { RadioGroup, RadioGroupItem } from "#/shared/ui/atoms/RadioGroup/RadioGroup.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";

const CODE_PATTERN = /^\d{6}$/u;

function FactorChoice({ hints, value, onChange }: { hints: readonly MfaHint[]; value: string; onChange: (uid: string) => void }) {
  const t = useTranslations("auth.mfa");
  return (
    <FieldSet>
      <FieldLegend>{t("factorLegend")}</FieldLegend>
      <RadioGroup value={value} onValueChange={onChange}>
        {hints.map((hint) => (
          <div key={hint.uid} className="flex items-center gap-2.5">
            <RadioGroupItem id={`mfa-hint-${hint.uid}`} value={hint.uid} />
            <Label htmlFor={`mfa-hint-${hint.uid}`} className="font-normal">
              {hint.factor === "totp" ? t("factorTotp") : hint.phoneNumber === null ? t("factorPhoneUnknown") : t("factorPhone", { phone: hint.phoneNumber })}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

function FailureAlert({ code }: { code: AuthErrorCode }) {
  const t = useTranslations("auth.errors");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [code]);
  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-inherit">{t(code)}</AlertDescription>
    </Alert>
  );
}

type Step = { readonly hintUid: string; readonly verificationId: string | undefined };

/** The SMS step: send (or resend) the code through Firebase's invisible reCAPTCHA. */
const useSmsCode = (challenge: MfaChallenge, recaptcha: RefObject<HTMLDivElement | null>, onFailure: (code: AuthErrorCode) => void) => {
  const auth = useAuth();
  const [sending, setSending] = useState(false);
  const send = async (hintUid: string): Promise<string | undefined> => {
    if (recaptcha.current === null) return undefined;
    setSending(true);
    try {
      return await auth.sendMfaSmsCode(challenge, hintUid, recaptcha.current);
    } catch (error: unknown) {
      onFailure(authErrorCode(error));
      return undefined;
    } finally {
      setSending(false);
    }
  };
  return { sending, send };
};

/**
 * Second factor of a sign-in (SP1 spec §3.4): TOTP from an authenticator app or an SMS code
 * (the Auth Emulator supports SMS only), chosen per enrolled hint. A wrong code is a field error
 * on the code input (focused); other failures are a focused alert. "Use another account" cancels.
 */
export type MfaChallengeFormProps = {
  challenge: MfaChallenge;
  /** After the code is accepted; defaults to finishing the sign-in (re-authentication passes its own). */
  onResolved?: (() => Promise<void>) | undefined;
  /** "Use another account" by default (sign-in); re-authentication passes a plain cancel. */
  onCancel?: (() => void) | undefined;
  cancelLabel?: string | undefined;
};

export function MfaChallengeForm({ challenge, onResolved, onCancel, cancelLabel }: MfaChallengeFormProps) {
  const t = useTranslations("auth");
  const auth = useAuth();
  const session = useSession();
  const [step, setStep] = useState<Step>({ hintUid: challenge.hints[0]?.uid ?? "", verificationId: undefined });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const recaptcha = useRef<HTMLDivElement>(null);
  const sms = useSmsCode(challenge, recaptcha, setFailure);
  const hint = challenge.hints.find((candidate) => candidate.uid === step.hintUid);
  const needsSms = hint?.factor === "phone" && step.verificationId === undefined;

  const sendCode = async () => {
    setFailure(null);
    const verificationId = await sms.send(step.hintUid);
    if (verificationId === undefined) return;
    setStep((current) => ({ ...current, verificationId }));
  };

  // The code field mounts once the SMS is sent; move focus to it then.
  useEffect(() => {
    if (step.verificationId !== undefined) codeInput.current?.focus();
  }, [step.verificationId]);

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || needsSms) return;
    setFailure(null);
    if (!CODE_PATTERN.test(code)) {
      setCodeError(t(code === "" ? "mfa.codeRequired" : "mfa.codeInvalid"));
      return codeInput.current?.focus();
    }
    setCodeError(undefined);
    setPending(true);
    try {
      await auth.resolveMfa(challenge, { hintUid: step.hintUid, code, ...(step.verificationId === undefined ? {} : { verificationId: step.verificationId }) });
      await (onResolved ?? session.completeSignIn)();
    } catch (error: unknown) {
      const failed = authErrorCode(error);
      setCode("");
      if (failed === "INVALID_MFA_CODE") {
        setCodeError(t("errors.INVALID_MFA_CODE"));
        codeInput.current?.focus();
      } else setFailure(failed);
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void verify(event)} className="flex flex-col gap-5">
      {failure === null ? null : <FailureAlert code={failure} />}
      {challenge.hints.length > 1 ? (
        <FactorChoice hints={challenge.hints} value={step.hintUid} onChange={(hintUid) => setStep({ hintUid, verificationId: undefined })} />
      ) : null}
      {hint?.factor === "phone" ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {step.verificationId === undefined ? "" : t("mfa.codeSent", { phone: hint.phoneNumber ?? "" })}
          </p>
          <Button type="button" variant={needsSms ? "default" : "outline"} pending={sms.sending} onClick={() => void sendCode()}>
            {needsSms ? t("mfa.sendCode") : t("mfa.resendCode")}
          </Button>
        </div>
      ) : null}
      {needsSms ? null : (
        <Field>
          <FieldLabel>{t("mfa.code")}</FieldLabel>
          <FieldDescription>{hint?.factor === "totp" ? t("mfa.codeHintTotp") : t("mfa.codeHintSms")}</FieldDescription>
          <FieldControl>
            <Input ref={codeInput} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, ""))} className="font-mono tracking-[0.3em]" />
          </FieldControl>
          <FieldError errors={[codeError]} />
        </Field>
      )}
      <div ref={recaptcha} data-slot="recaptcha" />
      <div className="flex flex-col gap-2">
        {needsSms ? null : (
          <Button type="submit" pending={pending} className="w-full">
            {t("mfa.verify")}
          </Button>
        )}
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel ?? session.cancelMfa}>
          {cancelLabel ?? t("mfa.cancel")}
        </Button>
      </div>
    </form>
  );
}
