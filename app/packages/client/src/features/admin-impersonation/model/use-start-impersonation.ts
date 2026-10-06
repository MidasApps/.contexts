"use client";

import { MAX_IMPERSONATION_MINUTES, StartImpersonationInputSchema, startImpersonationEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { impersonationSessionKeys } from "#/entities/impersonation-session/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useAsyncAction } from "#/shared/lib/errors/use-async-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { useImpersonationStore } from "./use-impersonation-store.ts";

const FIELDS = ["targetUid", "organizationId", "reason", "durationMinutes"] as const;
type Field = (typeof FIELDS)[number];
export type StartImpersonationFieldErrors = Partial<Record<Field, string>>;

/** The errors without `field`'s (same object when it had none, so React skips the render). */
const withoutError = (errors: StartImpersonationFieldErrors, field: Field): StartImpersonationFieldErrors =>
  errors[field] === undefined ? errors : Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field));

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

/**
 * State and submit of the start-impersonation form: validates with the contract schema, starts the
 * session, keeps it in the session store and resets the form. 403/404 become the form error;
 * anything else goes to `useAsyncAction`'s copy.
 */
export const useStartImpersonation = ({
  target,
  organizationId,
  organizationName,
  onTargetClear,
  onStarted,
}: {
  target: { readonly id: string; readonly label: string } | undefined;
  organizationId: string | undefined;
  organizationName: string | undefined;
  onTargetClear: () => void;
  onStarted: ((sessionId: string) => void) | undefined;
}) => {
  const t = useTranslations("admin.impersonation.form");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const start = useImpersonationStore((state) => state.start);
  const explain = useStartError();
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(String(MAX_IMPERSONATION_MINUTES));
  const [errors, setErrors] = useState<StartImpersonationFieldErrors>({});
  const [failure, setFailure] = useState<string | undefined>();
  const save = useAsyncAction();
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

  return {
    reason,
    changeReason: (value: string): void => {
      setReason(value);
      clearError("reason");
    },
    minutes,
    changeMinutes: (value: string): void => {
      setMinutes(value);
      clearError("durationMinutes");
    },
    errors,
    formError: failure ?? save.error,
    pending: save.pending,
    submit,
  };
};
