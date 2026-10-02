"use client";

import type { AccessContext } from "@core/contracts";
import { useEffect, useMemo } from "react";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { PageForbidden, QueryPage } from "#/widgets/page-state/index.ts";

/** The first entry of the `settings` navigation slot the viewer may read, as a route. */
const useFirstSettingsRoute = (context: AccessContext): Route | null => {
  const registry = useNavigationRegistry();
  return useMemo(() => {
    const granted = new Set<string>(context.permissions);
    for (const item of registry.visibleItems("settings", (permission) => granted.has(permission))) {
      const route = navItemRoute(item.target, { organizationId: context.organization.id });
      if (route !== null) return route;
    }
    return null;
  }, [registry, context]);
};

function OpenFirstSection({ context }: { context: AccessContext }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const target = useFirstSettingsRoute(context);
  useEffect(() => {
    // Replace: the bare address is not a page of its own, so Back skips it.
    if (target !== null) router.navigate(target, { replace: true });
  }, [target, router]);
  if (target === null) return <PageForbidden />;
  return <LoadingState variant="spinner" label={t("indexLoading")} />;
}

/**
 * `/o/:organizationId/settings` (no section): opens the first settings section the viewer can
 * read, in navigation order (general first for most members). Not-found for an organization the
 * viewer cannot see, forbidden when no section is readable.
 */
export function SettingsIndexView() {
  const t = useTranslations("settings");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("indexLoading")}>
      {(data) => <OpenFirstSection context={data} />}
    </QueryPage>
  );
}
