"use client";

import { CircleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslations } from "use-intl";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode } from "#/shared/lib/auth/auth-port.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { validateCredentials, type CredentialProblems } from "../model/validate-credentials.ts";

type FieldName = "email" | "password";

function FailureAlert({ code }: { code: AuthErrorCode }) {
  const t = useTranslations("auth.errors");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [code]);
  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1} data-slot="sign-in-error">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-inherit">{t(code)}</AlertDescription>
    </Alert>
  );
}

function PasswordField({ value, onChange, error, inputRef }: { value: string; onChange: (value: string) => void; error: string | undefined; inputRef: RefObject<HTMLInputElement | null> }) {
  const t = useTranslations("auth.signIn");
  const [visible, setVisible] = useState(false);
  return (
    <Field>
      <FieldLabel>{t("password")}</FieldLabel>
      <div className="relative">
        <FieldControl>
          <Input ref={inputRef} name="password" type={visible ? "text" : "password"} autoComplete="current-password" required value={value} onChange={(event) => onChange(event.target.value)} className="pr-11" />
        </FieldControl>
        <Button type="button" variant="ghost" size="icon-sm" aria-pressed={visible} className="absolute top-1/2 right-1 -translate-y-1/2" onClick={() => setVisible((current) => !current)}>
          <Icon name={visible ? "eye-off" : "eye"} />
          <span className="sr-only">{t("showPassword")}</span>
        </Button>
      </div>
      <FieldError errors={[error]} />
      <RouteLink to={{ id: "reset-password" }} className="self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {t("forgotPassword")}
      </RouteLink>
    </Field>
  );
}

/**
 * Email + password sign-in (shadcn block `login-03`, SP1 spec §3.3). Firebase answers either
 * signed in (the session bridge then persists the session) or an MFA challenge (handed to the
 * session). Any credential failure shows one generic message that never says which field was
 * wrong; the message takes focus, and the password is cleared.
 */
export function SignInForm() {
  const t = useTranslations("auth");
  const auth = useAuth();
  const session = useSession();
  const [values, setValues] = useState({ email: "", password: "" });
  const [problems, setProblems] = useState<CredentialProblems>({});
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const found = validateCredentials(values);
    setProblems(found);
    setFailure(null);
    const firstInvalid = (["email", "password"] as const).find((name: FieldName) => found[name] !== undefined);
    if (firstInvalid !== undefined) return (firstInvalid === "email" ? emailInput : passwordInput).current?.focus();
    setPending(true);
    try {
      const result = await auth.signInWithEmail(values.email.trim(), values.password);
      if (result.kind === "mfa-required") session.requireMfa(result.challenge);
      else await session.completeSignIn();
    } catch (error: unknown) {
      setValues((current) => ({ ...current, password: "" }));
      setFailure(authErrorCode(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      {failure === null ? null : <FailureAlert code={failure} />}
      <FieldGroup>
        <Field>
          <FieldLabel>{t("signIn.email")}</FieldLabel>
          <FieldControl>
            <Input ref={emailInput} name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} />
          </FieldControl>
          <FieldError errors={[problems.email === undefined ? undefined : t(`validation.${problems.email}`)]} />
        </Field>
        <PasswordField
          value={values.password}
          onChange={(password) => setValues((current) => ({ ...current, password }))}
          error={problems.password === undefined ? undefined : t(`validation.${problems.password}`)}
          inputRef={passwordInput}
        />
      </FieldGroup>
      <Button type="submit" pending={pending} className="w-full">
        {pending ? t("signIn.submitting") : t("signIn.submit")}
      </Button>
    </form>
  );
}
