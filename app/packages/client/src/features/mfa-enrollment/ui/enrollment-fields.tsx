"use client";

import { CircleAlertIcon } from "lucide-react";
import { type Ref, useEffect, useRef } from "react";
import { useTranslations } from "use-intl";
import type { AuthErrorCode } from "#/shared/lib/auth/auth-port.ts";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";

export { CODE_PATTERN } from "../model/one-time-code.ts";

/** A focused alert for failures that are not about one field (`auth.errors.<code>`). */
export function EnrollmentAlert({ code }: { code: AuthErrorCode }) {
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

/** The 6-digit one-time code (authenticator app or SMS), numeric keypad on phones. */
export function CodeField({
  value,
  onChange,
  error,
  inputRef,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  inputRef?: Ref<HTMLInputElement>;
  hint: string;
}) {
  const t = useTranslations("profile.security.mfa");
  return (
    <Field>
      <FieldLabel>{t("code")}</FieldLabel>
      <FieldControl>
        <Input
          ref={inputRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/gu, ""))}
          className="w-40 font-mono tracking-[0.3em] tabular-nums"
        />
      </FieldControl>
      <FieldDescription>{hint}</FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  );
}

/** Name of the factor as the user will recognize it later ("Work phone", "Authenticator"). */
export function FactorNameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("profile.security.mfa");
  return (
    <Field>
      <FieldLabel>{t("factorName")}</FieldLabel>
      <FieldControl>
        <Input value={value} maxLength={60} onChange={(event) => onChange(event.target.value)} />
      </FieldControl>
      <FieldDescription>{t("factorNameHint")}</FieldDescription>
    </Field>
  );
}
