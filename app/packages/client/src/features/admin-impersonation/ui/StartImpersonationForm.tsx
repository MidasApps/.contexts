"use client";

import { MAX_IMPERSONATION_MINUTES } from "@core/contracts";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useTranslations } from "use-intl";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { useStartImpersonation } from "../model/use-start-impersonation.ts";

/** The user staff picked in the search: the id goes to the API, the rest is what the form shows. */
export type ImpersonationTarget = { readonly id: string; readonly label: string; readonly detail?: string | undefined };

export type StartImpersonationFormProps = {
  /** The user to act as, chosen in the user search of the page; `undefined` until one is picked. */
  target: ImpersonationTarget | undefined;
  /** Forgets the chosen user ("change", and after a session starts). */
  onTargetClear: () => void;
  /** Chosen organization (the view owns the picker: a widget, which features do not import). */
  organizationId: string | undefined;
  /** Its display name when known: kept with the session so the page and the banner name it. */
  organizationName?: string | undefined;
  /**
   * The organization picker, rendered between the user and the reason; it receives the error
   * state so the picker itself carries `aria-invalid` and points at the message.
   */
  organizationField: (a11y: OrganizationFieldA11y) => ReactNode;
  /** Called with the new session id once it starts (the view hands focus to "open"). */
  onStarted?: ((sessionId: string) => void) | undefined;
};

/** What the organization picker needs to expose the form's error on its own control. */
export type OrganizationFieldA11y = { readonly invalid: boolean; readonly describedBy: string | undefined };

function FieldMessage({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} className="text-sm font-medium text-destructive-text">
      {message}
    </p>
  );
}

/** Brings the chosen user into view and focus when staff pick one, so the hand-off is announced. */
const useFocusOnPick = (targetId: string | undefined) => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (targetId === undefined) return;
    box.current?.scrollIntoView({ block: "nearest" });
    box.current?.focus();
  }, [targetId]);
  return box;
};

/** The chosen user (or the hint to pick one), with "change" and the error shown while none is chosen. */
function TargetField({
  target,
  error,
  onClear,
}: {
  target: ImpersonationTarget | undefined;
  error: string | undefined;
  onClear: () => void;
}) {
  const t = useTranslations("admin.impersonation.form");
  const id = useId();
  const box = useFocusOnPick(target?.id);
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="group"
      aria-labelledby={id}
      aria-describedby={error === undefined || target !== undefined ? undefined : `${id}-error`}
      className="flex scroll-mt-20 flex-col gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span id={id} className="text-sm leading-none font-medium">
        {t("target")}
      </span>
      {target === undefined ? (
        <p className="text-sm text-muted-foreground">{t("targetEmpty")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 sm:w-96">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{target.label}</span>
            {target.detail === undefined ? null : (
              <span className="truncate text-xs text-muted-foreground">{target.detail}</span>
            )}
            <span className="font-mono text-caption break-all text-muted-foreground">{target.id}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            aria-label={t("targetChangeNamed", { name: target.label })}
          >
            {t("targetChange")}
          </Button>
        </div>
      )}
      <FieldMessage id={`${id}-error`} message={target === undefined ? error : undefined} />
    </div>
  );
}

/** Label, control, hint and error of one field; the control points at `${id}-hint ${id}-error` itself. */
function HintedField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <FieldMessage id={`${id}-error`} message={error} />
    </div>
  );
}

/**
 * Starts read-only, time-boxed impersonation of a user in one organization (SP1 spec §6.6;
 * platform.user.impersonate with MFA; audited in the platform log and the organization's).
 * The session id and expiry go to the session store so staff can open or end it later; the
 * answer's one-time custom token is not kept (the web session mints one on entry, decision 0047).
 */
export function StartImpersonationForm({
  target,
  onTargetClear,
  organizationId,
  organizationName,
  organizationField,
  onStarted,
}: StartImpersonationFormProps) {
  const t = useTranslations("admin.impersonation.form");
  const online = useOnlineStatus();
  const ids = { reason: useId(), minutes: useId(), error: useId(), organizationError: useId() };
  const form = useStartImpersonation({ target, organizationId, organizationName, onTargetClear, onStarted });
  const { errors, formError } = form;
  // The organization error only stands while none is chosen: picking one fixes it.
  const organizationError = organizationId === undefined ? errors.organizationId : undefined;
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void form.submit(event)}>
      <TargetField target={target} error={errors.targetUid} onClear={onTargetClear} />
      <div className="flex flex-col gap-1.5 sm:w-96">
        {organizationField({
          invalid: organizationError !== undefined,
          describedBy: organizationError === undefined ? undefined : ids.organizationError,
        })}
        <FieldMessage id={ids.organizationError} message={organizationError} />
      </div>
      <HintedField id={ids.reason} label={t("reason")} hint={t("reasonHint")} error={errors.reason}>
        <Textarea
          id={ids.reason}
          value={form.reason}
          maxLength={500}
          onChange={(event) => form.changeReason(event.target.value)}
          aria-invalid={errors.reason !== undefined}
          aria-describedby={`${ids.reason}-hint ${ids.reason}-error`}
        />
      </HintedField>
      <HintedField
        id={ids.minutes}
        label={t("durationMinutes")}
        hint={t("durationHint", { max: MAX_IMPERSONATION_MINUTES })}
        error={errors.durationMinutes}
      >
        <Input
          id={ids.minutes}
          type="number"
          min={1}
          max={MAX_IMPERSONATION_MINUTES}
          className="w-28 text-end font-mono tabular-nums"
          value={form.minutes}
          onChange={(event) => form.changeMinutes(event.target.value)}
          aria-invalid={errors.durationMinutes !== undefined}
          aria-describedby={`${ids.minutes}-hint ${ids.minutes}-error`}
        />
      </HintedField>
      {formError === undefined ? null : (
        <p id={ids.error} role="alert" className="text-sm font-medium text-destructive-text">
          {formError}
        </p>
      )}
      <div>
        <Button type="submit" pending={form.pending} disabled={!online}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
