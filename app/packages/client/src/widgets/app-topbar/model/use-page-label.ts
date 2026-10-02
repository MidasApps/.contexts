"use client";

import { useTranslations } from "use-intl";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useModuleRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";

/**
 * The name of the current page for the last breadcrumb: the navigation label of the route
 * (settings section, profile section, project overview, module name), or `undefined` for pages
 * that are the context itself (organization list, home, admin).
 */
export const usePageLabel = (): string | undefined => {
  const t = useTranslations();
  const modules = useModuleRegistry();
  const route = parseRoute(useRouter().useLocationPath());
  switch (route?.id) {
    case "organization":
      return t("shell.nav.organizationHome");
    case "project":
      return t("shell.nav.projectHome");
    case "chat":
      return t("shell.nav.chat");
    case "settings":
      return t(`shell.nav.settings.${route.section}`);
    case "profile":
      return t(`shell.nav.profile.${route.section}`);
    case "module":
    case "settings-module": {
      const manifest = modules.get(route.moduleId)?.manifest;
      return manifest === undefined ? undefined : t(manifest.labelKey);
    }
    case "home":
    case "organizations":
    case "sign-in":
    case "invite":
    case "sign-up":
    case "reset-password":
    case "admin":
    case undefined:
      return undefined;
  }
};
