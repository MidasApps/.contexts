"use client";

import type { Me } from "@core/contracts";
import { useEffect } from "react";
import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import { usePlatform } from "#/shared/lib/platform/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";

/**
 * Where `/admin` leads (decision 0077): the platform console for staff on web (what they sign in
 * there for), else the settings of the organization used last, else nowhere (`null`): the user
 * belongs to no organization yet.
 */
export const adminHomeRoute = (me: Pick<Me, "lastContext" | "isPlatformStaff">, web: boolean): Route | null => {
  if (me.isPlatformStaff && web) return { id: "admin", rest: "" };
  const { organizationId } = me.lastContext;
  return organizationId === undefined ? null : { id: "settings-index", organizationId };
};

/**
 * `/admin`: opens the platform console for staff, the administration of the organization the user
 * worked in last for everyone else (`replace`, so Back skips the bare address). A user without organizations is told so and offered the
 * organizations page, where one is created or an invitation accepted.
 */
export function AdminHomeView() {
  const t = useTranslations("admin.home");
  const me = useMe();
  const router = useRouter();
  const web = usePlatform().kind === "web";
  const target = me.data === undefined ? undefined : adminHomeRoute(me.data, web);
  useEffect(() => {
    if (target !== undefined && target !== null) router.navigate(target, { replace: true });
  }, [target, router]);
  if (me.isError) return <ApiErrorState error={me.error} onRetry={() => void me.refetch()} retrying={me.isFetching} />;
  if (target !== null) {
    return (
      <>
        <h1 className="sr-only">{t("title")}</h1>
        <LoadingState variant="spinner" label={t("loading")} />
      </>
    );
  }
  return (
    <>
      <h1 className="sr-only">{t("title")}</h1>
      <EmptyState
        icon="building"
        title={t("noOrganizationTitle")}
        description={t("noOrganizationDescription")}
        action={
          <Button asChild>
            <RouteLink to={{ id: "organizations" }}>{t("noOrganizationAction")}</RouteLink>
          </Button>
        }
      />
    </>
  );
}
