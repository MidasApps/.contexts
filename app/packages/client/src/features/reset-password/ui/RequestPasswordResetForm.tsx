"use client";

import { CircleAlertIcon } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { z } from "zod";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode } from "#/shared/lib/auth/auth-port.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Field, FieldControl, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";

const EmailSchema = z.email();

const emailProblemOf = (email: string): "emailRequired" | "emailInvalid" | undefined =>
  email === "" ? "emailRequired" : EmailSchema.safeParse(email).success ? undefined : "emailInvalid";

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

/** The neutral confirmation: the same words whether or not an account uses the email. */
function SentNotice({ email, onUseAnother }: { email: string; onUseAnother: () => void }) {
  const t = useTranslations("auth.resetPassword");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="flex flex-col gap-3" data-slot="password-reset-sent">
      <h2 ref={heading} tabIndex={-1} className="text-base font-semibold outline-none">
        {t("sentTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("sent", { email })}</p>
      <Button type="button" variant="outline" className="self-start" onClick={onUseAnother}>
        {t("useAnotherEmail")}
      </Button>
    </div>
  );
}

/**
 * Asks Firebase to email a password reset link in the UI language (SH-02). The answer never says
 * whether the email has an account; only failures the user can act on (offline, rate limited)
 * are shown, focused.
 */
export function RequestPasswordResetForm() {
  const t = useTranslations("auth");
  const auth = useAuth();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<"emailRequired" | "emailInvalid" | undefined>(undefined);
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const trimmed = email.trim();
    const found = emailProblemOf(trimmed);
    setProblem(found);
    setFailure(null);
    if (found !== undefined) return input.current?.focus();
    setPending(true);
    try {
      await auth.sendPasswordReset(trimmed, locale);
      setSentTo(trimmed);
    } catch (error: unknown) {
      setFailure(authErrorCode(error));
    } finally {
      setPending(false);
    }
  };

  if (sentTo !== null) return <SentNotice email={sentTo} onUseAnother={() => setSentTo(null)} />;
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      {failure === null ? null : <FailureAlert code={failure} />}
      <Field>
        <FieldLabel>{t("resetPassword.email")}</FieldLabel>
        <FieldControl>
          <Input
            ref={input}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FieldControl>
        <FieldError errors={[problem === undefined ? undefined : t(`validation.${problem}`)]} />
      </Field>
      <Button type="submit" pending={pending} className="w-full">
        {pending ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </Button>
    </form>
  );
}
