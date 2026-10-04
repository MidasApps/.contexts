"use client";

import { MAX_IMPERSONATION_MINUTES, StartImpersonationInputSchema, startImpersonationEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { impersonationSessionKeys } from "#/entities/impersonation-session/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useAsyncAction } from "#/shared/lib/errors/use-async-action.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { useImpersonationStore } from "../model/use-impersonation-store.ts";

const FIELDS = ["targetUid", "organizationId", "reason", "durationMinutes"] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;

/** The errors without `field`'s (same object when it had none, so React skips the render). */
const withoutError = (errors: FieldErrors, field: Field): FieldErrors =>
  errors[field] === undefined ? errors : Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field));

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

/** 403 and 404 of the start endpoint have their own explanation; anything else keeps the code copy. */
const useStartError = () => {
  const t = useTranslations("admin.impersonation.form.errors");
  return (error: unknown): string | undefined => {
    if (!(error instanceof ApiError)) return undefined;
    if (error.status === 404) return t("notFound");
    if (error.status === 403 && error.code === "FORBIDDEN") return t("forbidden");
    return undefined;
  };
};

function FieldMessage({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} className="text-sm font-medium text-destructive-text">
      {message}
    </p>
  );
}

/**
 * Starts read-only, time-boxed impersonation of a user in one organization (SP1 spec §6.6;
 * platform.user.impersonate with MFA; audited in the platform log and the organization's).
 * The session id and expiry go to the session store so staff can open or end it later; the
 * answer's one-time custom token is not kept (the web session mints one on entry, decision 0047).
 */
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
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const start = useImpersonationStore((state) => state.start);
  const explain = useStartError();
  const ids = { uid: useId(), reason: useId(), minutes: useId(), error: useId() };
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(String(MAX_IMPERSONATION_MINUTES));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | undefined>();
  const save = useAsyncAction();
  const targetBox = useFocusOnPick(target?.id);
  const clearError = (field: Field): void => setErrors((current) => withoutError(current, field));

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFailure(undefined);
    const parsed = StartImpersonationInputSchema.safeParse({
      targetUid: target?.id,
      organizationId,
      reason,
      durationMinutes: Number(minutes),
    });
    if (!parsed.success) {
      const invalid = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
      setErrors(
        Object.fromEntries(FIELDS.filter((field) => invalid.has(field)).map((field) => [field, t(`errors.${field}`)])),
      );
      return;
    }
    setErrors({});
    const body = parsed.data;
    await save.run(async () => {
      try {
        const { data } = await callEndpoint(startImpersonationEndpoint, { body });
        start({
          sessionId: data.sessionId,
          expiresAt: data.expiresAt,
          targetUid: body.targetUid,
          organizationId: body.organizationId,
          ...(target === undefined ? {} : { targetLabel: target.label }),
          ...(organizationName === undefined ? {} : { organizationName }),
        });
        void queryClient.invalidateQueries({ queryKey: impersonationSessionKeys.all() });
        notify.success(t("started"));
        onTargetClear();
        setReason("");
        onStarted?.(data.sessionId);
      } catch (error: unknown) {
        const explained = explain(error);
        if (explained === undefined) throw error;
        setFailure(explained);
      }
    });
  };

  const formError = failure ?? save.error;
  // The organization error only stands while none is chosen: picking one fixes it.
  const organizationError = organizationId === undefined ? errors.organizationId : undefined;
  const organizationErrorId = `${ids.uid}-organization-error`;
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <div
        ref={targetBox}
        tabIndex={-1}
        role="group"
        aria-labelledby={ids.uid}
        aria-describedby={errors.targetUid === undefined || target !== undefined ? undefined : `${ids.uid}-error`}
        className="flex scroll-mt-20 flex-col gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span id={ids.uid} className="text-sm leading-none font-medium">
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
              onClick={onTargetClear}
              aria-label={t("targetChangeNamed", { name: target.label })}
            >
              {t("targetChange")}
            </Button>
          </div>
        )}
        <FieldMessage id={`${ids.uid}-error`} message={target === undefined ? errors.targetUid : undefined} />
      </div>
      <div className="flex flex-col gap-1.5 sm:w-96">
        {organizationField({
          invalid: organizationError !== undefined,
          describedBy: organizationError === undefined ? undefined : organizationErrorId,
        })}
        <FieldMessage id={organizationErrorId} message={organizationError} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.reason}>{t("reason")}</Label>
        <Textarea
          id={ids.reason}
          value={reason}
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            clearError("reason");
          }}
          aria-invalid={errors.reason !== undefined}
          aria-describedby={`${ids.reason}-hint ${ids.reason}-error`}
        />
        <p id={`${ids.reason}-hint`} className="text-xs text-muted-foreground">
          {t("reasonHint")}
        </p>
        <FieldMessage id={`${ids.reason}-error`} message={errors.reason} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.minutes}>{t("durationMinutes")}</Label>
        <Input
          id={ids.minutes}
          type="number"
          min={1}
          max={MAX_IMPERSONATION_MINUTES}
          className="w-28 text-right font-mono tabular-nums"
          value={minutes}
          onChange={(event) => {
            setMinutes(event.target.value);
            clearError("durationMinutes");
          }}
          aria-invalid={errors.durationMinutes !== undefined}
          aria-describedby={`${ids.minutes}-hint ${ids.minutes}-error`}
        />
        <p id={`${ids.minutes}-hint`} className="text-xs text-muted-foreground">
          {t("durationHint", { max: MAX_IMPERSONATION_MINUTES })}
        </p>
        <FieldMessage id={`${ids.minutes}-error`} message={errors.durationMinutes} />
      </div>
      {formError === undefined ? null : (
        <p id={ids.error} role="alert" className="text-sm font-medium text-destructive-text">
          {formError}
        </p>
      )}
      <div>
        <Button type="submit" pending={save.pending} disabled={!online}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
