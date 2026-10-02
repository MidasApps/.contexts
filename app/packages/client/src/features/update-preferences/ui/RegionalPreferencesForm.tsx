"use client";

import type { Me } from "@core/contracts";
import type { SupportedLocale } from "@core/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLocale, useTimeZone } from "use-intl";
import { useUpdateMe } from "#/entities/session/index.ts";
import { ApiError } from "#/shared/api/api-error.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";
import { changedPreferences, RegionalPreferencesFormContract, regionalFormDefaults, type RegionalPreferencesForm } from "../model/regional-preferences.contract.ts";

// A starting point when the user never chose one; saving it makes it a preference.
const CURRENCY_BY_LOCALE: Record<SupportedLocale, string> = { "pt-BR": "BRL", "en-US": "USD", "es-419": "USD" };

/** Access contexts carry `regional.displayTimeZone`, which follows the user's preference (SP1 §10). */
const isAccessContextKey = (queryKey: readonly unknown[]): boolean => queryKey[0] === "organizations" && queryKey[2] === "access-context";

/**
 * Language, time zone (IANA search) and currency of the signed-in user (SP2 spec §8). Sends only
 * the fields that changed; a new language is saved first and then applied through the router
 * port (`switchLocale`: same page, new locale), so the choice survives other devices and reloads.
 */
export function RegionalPreferencesForm({ me }: { me: Me }) {
  const uiLocale = useLocale() as SupportedLocale;
  const timeZone = useTimeZone();
  const router = useRouter();
  const queryClient = useQueryClient();
  const updateMe = useUpdateMe();
  const initial = useMemo(() => regionalFormDefaults(me, { locale: uiLocale, timeZone, currency: CURRENCY_BY_LOCALE[uiLocale] }), [me, uiLocale, timeZone]);

  const submit = async (values: RegionalPreferencesForm): Promise<SchemaFormResult> => {
    const preferences = changedPreferences(initial, values);
    if (preferences === null) return { ok: true };
    try {
      await updateMe({ preferences });
    } catch (error: unknown) {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    }
    if (preferences.timeZone !== undefined || preferences.currency !== undefined) {
      await queryClient.invalidateQueries({ predicate: (query) => isAccessContextKey(query.queryKey) });
    }
    if (preferences.locale !== undefined && preferences.locale !== uiLocale) router.switchLocale(preferences.locale as SupportedLocale);
    return { ok: true };
  };

  // No remount after a save: SchemaForm keeps the saved values and `initial` follows the new `me`.
  return <SchemaForm contract={RegionalPreferencesFormContract} defaultValues={initial} onSubmit={submit} requireChanges />;
}
