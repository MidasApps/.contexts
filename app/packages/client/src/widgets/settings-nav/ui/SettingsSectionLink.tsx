"use client";

import type { ComponentProps } from "react";
import type { SettingsSection } from "#/shared/lib/router/route-paths.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { useCarriedSearch } from "#/shared/lib/router/use-route-search.ts";

export type SettingsSectionLinkProps = Omit<ComponentProps<typeof RouteLink>, "to"> & {
  organizationId: string;
  section: SettingsSection;
  /** A detail page of the section (`runs/<id>`); absent for the list itself. */
  rest?: string | undefined;
};

/**
 * A link between a settings list and its detail pages that carries the current query string, so
 * the list's tab, filters and page survive the round trip (UX review U-26).
 */
export function SettingsSectionLink({ organizationId, section, rest, ...props }: SettingsSectionLinkProps) {
  const search = useCarriedSearch();
  return (
    <RouteLink
      to={{ id: "settings", organizationId, section, ...(rest === undefined ? {} : { rest }), search }}
      {...props}
    />
  );
}
