"use client";

import { CircleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type FormEvent, type RefObject } from "react";
import { useTranslations } from "use-intl";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode } from "#/shared/lib/auth/auth-port.ts";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { validateNewAccount, type NewAccountInput, type NewAccountProblems } from "../model/validate-new-account.ts";

type FieldName = keyof NewAccountInput;
const FIELD_ORDER: readonly FieldName[] = ["name", "email", "password"];

function FailureAlert({ code }: { code: AuthErrorCode }) {
  const t = useTranslations("auth.errors");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [code]);
  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1} data-slot="create-account-error">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-inherit">{t(code)}</AlertDescription>
    </Alert>
  );
}

type TextFieldProps = { label: string; hint?: string; error: string | undefined; inputRef: RefObject<HTMLInputElement | null> } & ComponentProps<typeof Input>;

function TextField({ label, hint, error, inputRef, ...input }: TextFieldProps) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldControl>
        <Input ref={inputRef} required {...input} />
      </FieldControl>
      {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
      <FieldError errors={[error]} />
    </Field>
  );
}

function NewPasswordField({ value, onChange, error, inputRef }: { value: string; onChange: (value: string) => void; error: string | undefined; inputRef: RefObject<HTMLInputElement | null> }) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  return (
    <Field>
      <FieldLabel>{t("createAccount.password")}</FieldLabel>
      <div className="relative">
        <FieldControl>
          <Input ref={inputRef} name="new-password" type={visible ? "text" : "password"} autoComplete="new-password" required value={value} onChange={(event) => onChange(event.target.value)} className="pr-11" />
        </FieldControl>
        <Button type="button" variant="ghost" size="icon-sm" aria-pressed={visible} className="absolute top-1/2 right-1 -translate-y-1/2" onClick={() => setVisible((current) => !current)}>
          <Icon name={visible ? "eye-off" : "eye"} />
          <span className="sr-only">{t("signIn.showPassword")}</span>
        </Button>
      </div>
      <FieldDescription>{t("createAccount.passwordHint")}</FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  );
}

/** Creates the account, then hands over to the session like an email sign-in. */
const useCreateAccount = () => {
  const auth = useAuth();
  const session = useSession();
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const create = async (values: NewAccountInput): Promise<boolean> => {
    setFailure(null);
    setPending(true);
    try {
      const result = await auth.createAccount({ email: values.email.trim(), password: values.password, displayName: values.name.trim() });
      if (result.kind === "mfa-required") session.requireMfa(result.challenge);
      else await session.completeSignIn();
      return true;
    } catch (error: unknown) {
      setFailure(authErrorCode(error));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { create, failure, pending };
};

/**
 * New email/password account (decision 0049): on the invitation page for an invitee without an
 * account, and on `/sign-up` when the app offers open sign-up. Field problems are shown per field
 * and the first one takes focus; a Firebase refusal shows one focused message and clears the
 * password.
 */
export function CreateAccountForm() {
  const t = useTranslations("auth");
  const [values, setValues] = useState<NewAccountInput>({ name: "", email: "", password: "" });
  const [problems, setProblems] = useState<NewAccountProblems>({});
  const { create, failure, pending } = useCreateAccount();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const set = (name: FieldName) => (value: string) => setValues((current) => ({ ...current, [name]: value }));
  const problem = (name: FieldName): string | undefined => (problems[name] === undefined ? undefined : t(`validation.${problems[name]}`));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const found = validateNewAccount(values);
    setProblems(found);
    const firstInvalid = FIELD_ORDER.find((name) => found[name] !== undefined);
    if (firstInvalid !== undefined) return { name: nameRef, email: emailRef, password: passwordRef }[firstInvalid].current?.focus();
    if (!(await create(values))) setValues((current) => ({ ...current, password: "" }));
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      {failure === null ? null : <FailureAlert code={failure} />}
      <FieldGroup>
        <TextField label={t("createAccount.name")} hint={t("createAccount.nameHint")} error={problem("name")} inputRef={nameRef} name="name" autoComplete="name" value={values.name} onChange={(event) => set("name")(event.target.value)} />
        <TextField
          label={t("createAccount.email")}
          error={problem("email")}
          inputRef={emailRef}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={values.email}
          onChange={(event) => set("email")(event.target.value)}
        />
        <NewPasswordField value={values.password} onChange={set("password")} error={problem("password")} inputRef={passwordRef} />
      </FieldGroup>
      <Button type="submit" pending={pending} className="w-full">
        {pending ? t("createAccount.submitting") : t("createAccount.submit")}
      </Button>
    </form>
  );
}
