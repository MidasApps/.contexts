"use client";

import type { Me } from "@core/contracts";
import { useOptimistic, useTransition } from "react";
import { useTranslations } from "use-intl";
import { useUpdateMe } from "#/entities/session/index.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { Field, FieldContent, FieldControl, FieldDescription, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

/**
 * Notification opt-ins (`preferences.notifications`, SP2 spec §8): product updates toggle at once
 * (optimistic, reverted with an error toast when the save fails); security alerts are always on
 * and shown as a disabled, checked switch with the reason.
 */
export function NotificationPreferencesForm({ me }: { me: Me }) {
  const t = useTranslations("profile.notifications");
  const describe = useDescribeError();
  const updateMe = useUpdateMe();
  const [pending, startTransition] = useTransition();
  const [productUpdates, setOptimistic] = useOptimistic(me.preferences.notifications.productUpdates);

  const toggle = (next: boolean): void => {
    startTransition(async () => {
      setOptimistic(next);
      try {
        await updateMe({ preferences: { notifications: { productUpdates: next } } });
        notify.success(next ? t("productUpdates.enabled") : t("productUpdates.disabled"));
      } catch (error: unknown) {
        const described = describe(error);
        notify.error(
          t("saveFailed"),
          described.requestId === undefined ? {} : { description: t("reference", { requestId: described.requestId }) },
        );
      }
    });
  };

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      <Field orientation="horizontal" className="p-4">
        <FieldContent>
          <FieldLabel>{t("productUpdates.label")}</FieldLabel>
          <FieldDescription>{t("productUpdates.description")}</FieldDescription>
        </FieldContent>
        <FieldControl>
          {/* Locked while saving: overlapping PATCHes could settle out of order (and toast twice). */}
          <Switch
            checked={productUpdates}
            onCheckedChange={toggle}
            disabled={pending}
            aria-busy={pending || undefined}
          />
        </FieldControl>
      </Field>
      <Field orientation="horizontal" className="p-4" data-disabled="true">
        <FieldContent>
          <FieldLabel>{t("securityAlerts.label")}</FieldLabel>
          <FieldDescription>{t("securityAlerts.description")}</FieldDescription>
        </FieldContent>
        <FieldControl>
          <Switch checked disabled />
        </FieldControl>
      </Field>
    </div>
  );
}
