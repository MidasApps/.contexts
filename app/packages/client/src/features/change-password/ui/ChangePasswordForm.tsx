"use client";

import { CircleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode, MfaChallenge } from "#/shared/lib/auth/auth-port.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { PasswordInput } from "#/shared/ui/molecules/PasswordInput/PasswordInput.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { MIN_PASSWORD_LENGTH, validatePasswordChange, type PasswordChange, type PasswordChangeProblems } from "../model/validate-password-change.ts";

/** Props of the second-factor step of the re-authentication (the view passes a `MfaChallengeForm` wrapper). */
export type MfaStepProps = { challenge: MfaChallenge; onResolved: () => Promise<void>; onCancel: () => void };

const EMPTY: PasswordChange = { current: "", next: "", confirmation: "" };
const FIELDS = ["current", "next", "confirmation"] as const;

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

type PasswordFieldProps = {
  name: keyof PasswordChange;
  value: string;
  onChange: (value: string) => void;
  problem: PasswordChangeProblems[keyof PasswordChange] | "wrongPassword" | "weak" | undefined;
  inputRef: (element: HTMLInputElement | null) => void;
};

function PasswordField({ name, value, onChange, problem, inputRef }: PasswordFieldProps) {
  const t = useTranslations("profile.security.password");
  return (
    <Field>
      <FieldLabel>{t(`fields.${name}`)}</FieldLabel>
      <FieldControl>
        <PasswordInput ref={inputRef} name={name} autoComplete={name === "current" ? "current-password" : "new-password"} required value={value} onChange={(event) => onChange(event.target.value)} />
      </FieldControl>
      {name === "next" ? <FieldDescription>{t("hint", { min: MIN_PASSWORD_LENGTH })}</FieldDescription> : null}
      <FieldError errors={[problem === undefined ? undefined : t(`errors.${problem}`, { min: MIN_PASSWORD_LENGTH })]} />
    </Field>
  );
}

type Problems = Partial<Record<keyof PasswordChange, PasswordFieldProps["problem"]>>;

/**
 * Change password (SP2 spec §8 profile/security): current password re-authenticates first (and
 * the second factor when one is enrolled, through `MfaStep`), then the new password is set.
 * Client checks run before any call; a wrong current password or a weak new one is a field error
 * (focused); other failures are a focused alert. Success clears the form and toasts.
 */
export function ChangePasswordForm({ MfaStep }: { MfaStep: ComponentType<MfaStepProps> }) {
  const t = useTranslations("profile.security.password");
  const auth = useAuth();
  const [values, setValues] = useState<PasswordChange>(EMPTY);
  const [problems, setProblems] = useState<Problems>({});
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const inputs = useRef<Partial<Record<keyof PasswordChange, HTMLInputElement | null>>>({});

  const focusFirst = (found: Problems): void => {
    const first = FIELDS.find((name) => found[name] !== undefined);
    if (first !== undefined) inputs.current[first]?.focus();
  };

  const fail = (error: unknown): void => {
    const code = authErrorCode(error);
    const fieldProblem: Problems | null = code === "INVALID_CREDENTIALS" ? { current: "wrongPassword" } : code === "WEAK_PASSWORD" ? { next: "weak" } : null;
    if (fieldProblem === null) return setFailure(code);
    setProblems(fieldProblem);
    focusFirst(fieldProblem);
  };

  const finish = async (): Promise<void> => {
    await auth.updatePassword(values.next);
    setChallenge(null);
    setValues(EMPTY);
    notify.success(t("changed"));
  };

  const resolveChallenge = async (): Promise<void> => {
    try {
      await finish();
    } catch (error: unknown) {
      setChallenge(null);
      fail(error);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    const found = validatePasswordChange(values);
    setProblems(found);
    if (Object.keys(found).length > 0) return focusFirst(found);
    setPending(true);
    try {
      const result = await auth.reauthenticate(values.current);
      if (result.kind === "mfa-required") setChallenge(result.challenge);
      else await finish();
    } catch (error: unknown) {
      fail(error);
    } finally {
      setPending(false);
    }
  };

  const set = (name: keyof PasswordChange) => (value: string) => setValues((current) => ({ ...current, [name]: value }));
  // The MFA dialog stays outside the <form>: React events bubble through portals, so its own
  // submit would also submit this form.
  return (
    <>
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      {failure === null ? null : <FailureAlert code={failure} />}
      <FieldGroup>
        {FIELDS.map((name) => (
          <PasswordField key={name} name={name} value={values[name]} onChange={set(name)} problem={problems[name]} inputRef={(element) => void (inputs.current[name] = element)} />
        ))}
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
      <Dialog open={challenge !== null} onOpenChange={(open) => !open && setChallenge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mfaTitle")}</DialogTitle>
            <DialogDescription>{t("mfaDescription")}</DialogDescription>
          </DialogHeader>
          {challenge === null
            ? null
            : <MfaStep challenge={challenge} onResolved={resolveChallenge} onCancel={() => setChallenge(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
