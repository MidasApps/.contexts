"use client";

import { useTranslations } from "use-intl";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import type { Route, RouteId } from "#/shared/lib/router/route-paths.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useModuleRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";

type DynamicLabelRouteId = "settings" | "profile" | "module" | "settings-module";

/**
 * Label keys of the routes whose label does not depend on the route's data; `undefined` for pages
 * that are the context itself. Every other route id is listed, so a new one needs a decision here.
 */
const STATIC_LABEL_KEYS: Readonly<Record<Exclude<RouteId, DynamicLabelRouteId>, string | undefined>> = {
  organization: "shell.nav.organizationHome",
  project: "shell.nav.projectHome",
  chat: "shell.nav.chat",
  "settings-index": "shell.nav.organizationSettings",
  home: undefined,
  organizations: undefined,
  "sign-in": undefined,
  invite: undefined,
  "sign-up": undefined,
  "reset-password": undefined,
  admin: undefined,
  // The guide has its own frame, outside the shell's top bar.
  docs: undefined,
};

/** The i18n key of a route's page label; a module page takes its manifest's label. */
const pageLabelKey = (
  route: Route | null,
  moduleLabelKey: (moduleId: string) => string | undefined,
): string | undefined => {
  if (route === null) return undefined;
  if (route.id === "settings") return `shell.nav.settings.${route.section}`;
  if (route.id === "profile") return `shell.nav.profile.${route.section}`;
  if (route.id === "module" || route.id === "settings-module") return moduleLabelKey(route.moduleId);
  return STATIC_LABEL_KEYS[route.id];
};

/**
 * The name of the current page for the last breadcrumb: the navigation label of the route
 * (settings section, profile section, project overview, module name), or `undefined` for pages
 * that are the context itself (organization list, home, admin).
 */
export const usePageLabel = (): string | undefined => {
  const t = useTranslations();
  const modules = useModuleRegistry();
  const route = parseRoute(useRouter().useLocationPath());
  const key = pageLabelKey(route, (moduleId) => modules.get(moduleId)?.manifest.labelKey);
  return key === undefined ? undefined : t(key);
};
