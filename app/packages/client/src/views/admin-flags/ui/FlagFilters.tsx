"use client";

import type { FeatureFlag } from "@core/contracts";
import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import type { CatalogLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";

/** Expired keys named in the alert; the rest are counted ("and N more") and one press lists them all. */
const EXPIRED_SHOWN = 5;

/** The flag filters of `/admin/flags`, as the URL holds them (`?q=` and `?expired=1`). */
export type FlagFilter = { readonly query: string; readonly expiredOnly: boolean };

/** Flags whose key or translated name contains the query (any case), optionally only the expired ones. */
export const filterFlags = (flags: readonly FeatureFlag[], filter: FlagFilter, label: CatalogLabel): FeatureFlag[] => {
  const query = filter.query.trim().toLocaleLowerCase();
  return flags.filter(
    (flag) =>
      (!filter.expiredOnly || flag.expired) &&
      (query === "" || flag.key.toLocaleLowerCase().includes(query) || label.name(flag.key).toLocaleLowerCase().includes(query)),
  );
};

export function ExpiredAlert({ flags, expiredOnly, onExpiredOnlyChange }: { flags: readonly FeatureFlag[]; expiredOnly: boolean; onExpiredOnlyChange: (next: boolean) => void }) {
  const t = useTranslations("admin.flags");
  const expired = flags.filter((flag) => flag.expired);
  if (expired.length === 0) return null;
  const hidden = expired.length - EXPIRED_SHOWN;
  return (
    <Alert variant="warning">
      <Icon name="alert-triangle" />
      <AlertTitle>{t("expiredAlertTitle", { count: expired.length })}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{t("expiredAlertDescription")}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <ul className="flex flex-wrap gap-1.5">
            {expired.slice(0, EXPIRED_SHOWN).map((flag) => (
              <li key={flag.key}>
                <Badge variant="outline" className="font-mono">
                  {flag.key}
                </Badge>
              </li>
            ))}
          </ul>
          {hidden > 0 ? <span className="text-xs">{t("expiredMore", { count: hidden })}</span> : null}
        </span>
        <Button variant={expiredOnly ? "default" : "outline"} size="sm" aria-pressed={expiredOnly} onClick={() => onExpiredOnlyChange(!expiredOnly)}>
          {t("expiredOnly")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The key search of the flag table: applied as it is typed (the list is the code registry, already
 * loaded), written to the URL so a shared link keeps it.
 */
export function FlagSearch({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useTranslations("admin.flags");
  const id = useId();
  // The field keeps what is typed; the URL follows it (its writes replace, they never lag the caret).
  const [draft, setDraft] = useState(value);
  return (
    <div role="search" className="flex flex-col gap-1.5 sm:max-w-sm">
      <Label htmlFor={id}>{t("searchLabel")}</Label>
      <Input
        id={id}
        type="search"
        value={draft}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
      />
    </div>
  );
}
