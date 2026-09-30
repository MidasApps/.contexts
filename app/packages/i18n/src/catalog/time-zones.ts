export type TimeZoneGroup = { region: string; zones: string[] };

/**
 * IANA zones the runtime knows, grouped by their first segment (`America`, `Europe`, …) for a
 * searchable picker. `UTC` is its own group; region names are IANA identifiers, not UI copy.
 */
export const listTimeZonesByRegion = (): TimeZoneGroup[] => {
  const groups = new Map<string, string[]>([["UTC", ["UTC"]]]);
  for (const zone of Intl.supportedValuesOf("timeZone")) {
    if (zone === "UTC") continue;
    const region = zone.includes("/") ? zone.slice(0, zone.indexOf("/")) : "Other";
    groups.set(region, [...(groups.get(region) ?? []), zone]);
  }
  return [...groups.entries()]
    .map(([region, zones]) => ({ region, zones: zones.toSorted() }))
    .sort((a, b) => a.region.localeCompare(b.region, "en"));
};
