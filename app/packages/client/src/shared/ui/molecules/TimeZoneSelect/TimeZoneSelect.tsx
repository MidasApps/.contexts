"use client";

import { listTimeZonesByRegion } from "@core/i18n";
import { type ComponentProps, useMemo } from "react";
import { useLocale, useTranslations } from "use-intl";
import { Combobox, type ComboboxGroup } from "#/shared/ui/molecules/Combobox/Combobox.tsx";

/** "GMT-03:00"-style offset of `timeZone` now, from `Intl` in the UI locale. */
const currentOffset = (timeZone: string, locale: string, now: Date): string =>
  new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "longOffset" })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value ?? "";

/** "(GMT-03:00) America/Sao Paulo": how the picker names a zone, also used where a zone is only shown. */
export const timeZoneLabel = (zone: string, locale: string, now: Date): string =>
  `(${currentOffset(zone, locale, now)}) ${zone.replaceAll("_", " ")}`;

/** IANA zones grouped by region; labels show the current offset and the zone with spaces. */
export const buildTimeZoneGroups = (locale: string, now: Date): ComboboxGroup[] =>
  listTimeZonesByRegion().map(({ region, zones }) => ({
    heading: region,
    options: zones.map((zone) => {
      const offset = currentOffset(zone, locale, now);
      const readable = zone.replaceAll("_", " ");
      return { value: zone, label: timeZoneLabel(zone, locale, now), keywords: [zone, readable, offset] };
    }),
  }));

export type TimeZoneSelectProps = Omit<
  ComponentProps<typeof Combobox>,
  "groups" | "placeholder" | "searchLabel" | "emptyText" | "searchPlaceholder"
> & {
  /** Instant used for the offsets shown (injectable for tests; defaults to now). */
  now?: Date;
};

/**
 * Searchable IANA time-zone picker grouped by region (SP2 spec §8 "time zone (IANA search)").
 * Value is the IANA id (`America/Sao_Paulo`); search matches id, spaced name or offset.
 */
export function TimeZoneSelect({ now, ...props }: TimeZoneSelectProps) {
  const locale = useLocale();
  const t = useTranslations("common.pickers.timeZone");
  const groups = useMemo(() => buildTimeZoneGroups(locale, now ?? new Date()), [locale, now]);
  return (
    <Combobox
      groups={groups}
      placeholder={t("placeholder")}
      searchLabel={t("search")}
      searchPlaceholder={t("search")}
      emptyText={t("empty")}
      {...props}
    />
  );
}
