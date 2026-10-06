"use client";

import type { Me } from "@core/contracts";
import { useEffect } from "react";
import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";

/** `users.lastContext` (SP1) as a route: project (with unit), else organization, else the picker. */
export const lastContextRoute = (lastContext: Me["lastContext"]): Route => {
  const { organizationId, projectId, unitId } = lastContext;
  if (organizationId === undefined) return { id: "organizations" };
  if (projectId === undefined) return { id: "organization", organizationId };
  return { id: "project", organizationId, projectId, unit: unitId };
};

/**
 * `/` (SP2 spec §4): sends the user to the last organization/project/unit they used, or to the
 * organizations page. `GET /v1/me` empties the context once the user left its organization; a
 * project deleted since renders not-found there, which also offers the organizations page.
 */
export function HomeView() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const router = useRouter();
  const lastContext = me.data?.lastContext;
  useEffect(() => {
    if (lastContext !== undefined) router.navigate(lastContextRoute(lastContext), { replace: true });
  }, [lastContext, router]);
  return (
    <>
      <h1 className="sr-only">{t("title")}</h1>
      {me.isError ? (
        <ApiErrorState error={me.error} onRetry={() => void me.refetch()} retrying={me.isFetching} />
      ) : (
        <LoadingState variant="spinner" label={t("loading")} />
      )}
    </>
  );
}
