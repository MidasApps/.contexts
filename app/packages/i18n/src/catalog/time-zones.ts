export type TimeZoneGroup = { region: string; zones: string[] };

/**
 * CLDR (and so `Intl.supportedValuesOf`) keeps some pre-rename ids as canonical — `Asia/Calcutta`,
 * `Europe/Kiev`. Users search for the current IANA names, and both spellings are valid inputs to
 * `Intl` and to `TimeZoneSchema`, so the picker lists the current name.
 */
const CURRENT_IANA_NAMES: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

const isKnownZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    // RangeError: this ICU build does not know the renamed id; keep the legacy one.
    return false;
  }
};

const currentName = (zone: string): string => {
  const renamed = CURRENT_IANA_NAMES[zone];
  return renamed !== undefined && isKnownZone(renamed) ? renamed : zone;
};

/**
 * IANA zones the runtime knows, grouped by their first segment (`America`, `Europe`, …) for a
 * searchable picker, under their current IANA names. `UTC` is its own group; region names are
 * IANA identifiers, not UI copy.
 */
export const listTimeZonesByRegion = (): TimeZoneGroup[] => {
  const groups = new Map<string, Set<string>>([["UTC", new Set(["UTC"])]]);
  for (const supported of Intl.supportedValuesOf("timeZone")) {
    if (supported === "UTC") continue;
    const zone = currentName(supported);
    const region = zone.includes("/") ? zone.slice(0, zone.indexOf("/")) : "Other";
    groups.set(region, (groups.get(region) ?? new Set()).add(zone));
  }
  return [...groups.entries()]
    .map(([region, zones]) => ({ region, zones: [...zones].toSorted() }))
    .sort((a, b) => a.region.localeCompare(b.region, "en"));
};
