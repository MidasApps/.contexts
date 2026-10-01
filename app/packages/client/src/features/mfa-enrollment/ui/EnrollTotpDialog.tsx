"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useClientConfig } from "#/shared/config/config-context.tsx";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { AuthErrorCode, TotpEnrollment } from "#/shared/lib/auth/auth-port.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { CopyField } from "#/shared/ui/molecules/CopyField/CopyField.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { CODE_PATTERN, CodeField, EnrollmentAlert, FactorNameField } from "./enrollment-fields.tsx";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onEnrolled: () => Promise<void> };

/** Starts a TOTP enrollment when opened; the secret lives only in this component's state. */
const useTotpEnrollment = () => {
  const auth = useAuth();
  const issuer = useClientConfig().firebase.projectId;
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [failure, setFailure] = useState<AuthErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    auth
      .startTotpEnrollment(issuer)
      .then((started) => active && setEnrollment(started))
      .catch((error: unknown) => active && setFailure(authErrorCode(error)));
    return () => {
      active = false;
    };
  }, [auth, issuer, attempt]);
  // The body unmounts on close, dropping the secret: it is never shown again.
  const retry = (): void => {
    setFailure(null);
    setAttempt((current) => current + 1);
  };
  return { enrollment, failure, setFailure, retry };
};

/**
 * Authenticator-app enrollment (TOTP, SP1 decision 0007): the setup link (opens the app on this
 * device) and the setup key to type or copy, then the 6-digit code confirms it. A wrong code is a
 * field error; other failures (e.g. `REQUIRES_RECENT_LOGIN`) are a focused alert.
 */
function EnrollTotpDialogBody({ onOpenChange, onEnrolled }: Props) {
  const t = useTranslations("profile.security.mfa");
  const auth = useAuth();
  const { enrollment, failure, setFailure, retry } = useTotpEnrollment();
  const [name, setName] = useState(t("totpDefaultName"));
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  const verify = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (enrollment === null || pending) return;
    if (!CODE_PATTERN.test(code)) {
      setCodeError(t(code === "" ? "codeRequired" : "codeInvalid"));
      return codeInput.current?.focus();
    }
    setCodeError(undefined);
    setPending(true);
    try {
      await auth.finishTotpEnrollment(enrollment, code, name.trim() === "" ? t("totpDefaultName") : name.trim());
      await onEnrolled();
      onOpenChange(false);
    } catch (error: unknown) {
      const failed = authErrorCode(error);
      setCode("");
      if (failed !== "INVALID_MFA_CODE") return setFailure(failed);
      setCodeError(t("codeWrong"));
      codeInput.current?.focus();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{t("totpTitle")}</DialogTitle>
          <DialogDescription>{t("totpDescription")}</DialogDescription>
        </DialogHeader>
        {failure === null ? null : <EnrollmentAlert code={failure} />}
        {enrollment === null ? (
          failure === null ? (
            <LoadingState variant="spinner" label={t("preparing")} />
          ) : (
            <Button variant="secondary" onClick={retry}>
              {t("retry")}
            </Button>
          )
        ) : (
          <form noValidate onSubmit={(event) => void verify(event)} className="flex flex-col gap-5">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
              <li>{t("totpStepScan")}</li>
              <li>{t("totpStepCode")}</li>
            </ol>
            <Button variant="outline" asChild className="self-start">
              <a href={enrollment.uri}>
                <Icon name="external-link" />
                {t("openAuthenticator")}
              </a>
            </Button>
            <CopyField label={t("setupKey")} value={enrollment.secretKey} sensitive description={t("setupKeyHint")} />
            <FactorNameField value={name} onChange={setName} />
            <CodeField value={code} onChange={setCode} error={codeError} inputRef={codeInput} hint={t("totpCodeHint")} />
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" pending={pending}>
                {t("verify")}
              </Button>
            </DialogFooter>
          </form>
        )}
    </>
  );
}

/** Dialog shell: the body mounts on open and unmounts on close, so its state (drafts, one-time values) never outlives the dialog. */
export function EnrollTotpDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <EnrollTotpDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
