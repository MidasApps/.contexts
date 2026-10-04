"use client";

import { type FormEvent, type RefObject, useState } from "react";
import { useTranslations } from "use-intl";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode } from "#/shared/lib/auth/auth-port.ts";
import { CODE_PATTERN } from "./one-time-code.ts";

const E164 = /^\+[1-9]\d{7,14}$/u;

type Step = { verificationId: string | null; phone: string };

/**
 * State of the SMS enrollment: the first submit sends the code to the phone (through the invisible
 * reCAPTCHA in `recaptcha`; the caller owns the refs), the second confirms it with the code and the factor's name. A wrong
 * phone or code is a field error with the focus on that field; other failures are `failure`.
 */
export const useSmsEnrollment = ({
  onEnrolled,
  onClose,
  phoneInput,
  codeInput,
  recaptcha,
}: {
  onEnrolled: () => Promise<void>;
  onClose: () => void;
  phoneInput: RefObject<HTMLInputElement | null>;
  codeInput: RefObject<HTMLInputElement | null>;
  recaptcha: RefObject<HTMLDivElement | null>;
}) => {
  const t = useTranslations("profile.security.mfa");
  const auth = useAuth();
  const [step, setStep] = useState<Step>({ verificationId: null, phone: "" });
  const [name, setName] = useState(t("smsDefaultName"));
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ phone?: string | undefined; code?: string | undefined }>({});
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [pending, setPending] = useState(false);

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
        onClose();
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

  return {
    step,
    changePhone: (phone: string): void => setStep({ verificationId: null, phone }),
    /** Back to the phone step, keeping the number. */
    editPhone: (): void => setStep((current) => ({ ...current, verificationId: null })),
    name,
    setName,
    code,
    setCode,
    errors,
    failure,
    pending,
    submit,
  };
};
