"use client";

import { createOrganizationEndpoint, type Organization } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { ulid } from "ulid";
import { useLocale, useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useMe } from "#/entities/session/index.ts";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import {
  CreateOrganizationFormContract,
  organizationFormDefaults,
  toCreateOrganizationInput,
  type CreateOrganizationForm as FormValues,
} from "../model/create-organization-form.contract.ts";

/** Same body as the failed attempt → same key (a retry); anything changed → a new operation. */
const keyForAttempt = (attempt: { current: { key: string; body: string } | null }, body: unknown): string => {
  const serialized = JSON.stringify(body);
  if (attempt.current?.body !== serialized) attempt.current = { key: ulid(), body: serialized };
  return attempt.current.key;
};

/**
 * Creates an organization (SP1 spec §6.1): name plus regional defaults prefilled from the UI
 * locale and the user's preferences. One `Idempotency-Key` per logical attempt, reused when the
 * user resubmits the same values after a failure, so a retried request never creates two organizations. On
 * success the claims are refreshed (the creator is owner) and the user lands in `/o/:id`.
 */
export function CreateOrganizationForm({ className }: { className?: string }) {
  const t = useTranslations("shell.organizations.create");
  const locale = useLocale();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const router = useRouter();
  const attempt = useRef<{ key: string; body: string } | null>(null);
  const me = useMe();
  const preferences = me.data?.preferences;
  const defaults = useMemo(() => ({ name: "", ...organizationFormDefaults({ locale, preferences }) }), [locale, preferences]);

  const submit = async (values: FormValues): Promise<SchemaFormResult> => {
    const body = toCreateOrganizationInput(values);
    const idempotencyKey = keyForAttempt(attempt, body);
    let organization: Organization;
    try {
      organization = (await callEndpoint(createOrganizationEndpoint, { body, idempotencyKey })).data;
    } catch (error: unknown) {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    }
    attempt.current = null;
    await auth.getIdToken({ forceRefresh: true });
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    notify.success(t("created", { name: organization.name }));
    router.navigate({ id: "organization", organizationId: organization.id });
    return { ok: true };
  };

  return (
    <SchemaForm
      // Remount once the preferences arrive: the form reads its defaults on mount.
      key={me.isPending ? "pending" : "ready"}
      loading={me.isPending}
      contract={CreateOrganizationFormContract}
      defaultValues={defaults}
      onSubmit={submit}
      submitLabelKey="shell.organizations.create.submit"
      successMessageKey="shell.organizations.create.createdStatus"
      aria-label={t("title")}
      className={className}
    />
  );
}
