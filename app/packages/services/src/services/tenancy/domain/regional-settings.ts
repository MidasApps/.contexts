import type { NodeRegionalOverrides, RegionalDefaults, RegionalSettings, UserPreferences } from "@core/contracts";

type Overrides = { readonly settings: NodeRegionalOverrides };

/**
 * Regional settings of a user at a node (SP1 spec §4). Pure:
 * - `currency` and `nodeTimeZone`: nearest unit → ancestor units → project → organization;
 * - `displayTimeZone`: user preference → `nodeTimeZone`;
 * - `locale`: user preference → organization default (the web URL segment wins at render).
 * A user's currency preference is for display only and never changes the node currency.
 * @param units the unit chain root first, the node's own unit last.
 */
export const resolveRegionalSettings = (args: {
  organization: { readonly defaults: RegionalDefaults };
  project?: Overrides | undefined;
  units?: readonly Overrides[] | undefined;
  user?: Pick<UserPreferences, "locale" | "timeZone" | "currency"> | undefined;
}): RegionalSettings => {
  const nearestFirst = [...(args.units ?? [])].reverse().concat(args.project === undefined ? [] : [args.project]);
  const pick = <Key extends keyof NodeRegionalOverrides>(key: Key) => nearestFirst.find((node) => node.settings[key] !== undefined)?.settings[key];
  const nodeTimeZone = pick("timeZone") ?? args.organization.defaults.timeZone;
  return {
    locale: args.user?.locale ?? args.organization.defaults.locale,
    displayTimeZone: args.user?.timeZone ?? nodeTimeZone,
    nodeTimeZone,
    currency: pick("currency") ?? args.organization.defaults.currency,
  };
};
