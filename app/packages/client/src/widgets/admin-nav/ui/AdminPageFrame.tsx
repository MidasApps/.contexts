"use client";

import type { Permission } from "@core/contracts";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";

export type AdminPageFrameProps = {
  /** Platform permission of the page; a staff role without it sees the no-access state. */
  permission: Permission;
  /** The page's only `h1`. */
  title: string;
  description?: string | undefined;
  /** Parent page of a detail page (`/admin/organizations` above one organization). */
  back?: { rest: string; label: string } | undefined;
  /** Status next to the title. */
  meta?: ReactNode;
  /** Page actions; rendered only when the role holds the permission. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Frame of every `/admin` page (SP5 spec §6): the header with the page `h1` and, by the staff role
 * read from `GET /v1/me`, the content or a no-access state. The server layout already required
 * staff with MFA and each `/v1/admin` endpoint authorizes again; this only keeps a role from
 * staring at a page whose calls would all answer 403.
 */
export function AdminPageFrame({ permission, title, description, back, meta, actions, children }: AdminPageFrameProps) {
  const t = useTranslations("admin.states");
  const permissions = usePlatformPermissions();
  const allowed = permissions.status === "success" && permissions.can(permission);
  return (
    <>
      <div data-slot="page-header" className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {back === undefined ? (
            <p className="text-xs font-medium text-muted-foreground">{t("eyebrow")}</p>
          ) : (
            <RouteLink
              to={{ id: "admin", rest: back.rest }}
              className="inline-flex items-center gap-1 self-start rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <Icon name="arrow-left" className="size-3.5" />
              {back.label}
            </RouteLink>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
            {meta}
          </div>
          {description === undefined ? null : <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
        </div>
        {allowed && actions !== undefined ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {permissions.status === "pending" ? (
        <LoadingState label={t("loading")} rows={4} />
      ) : permissions.status === "error" ? (
        <ApiErrorState error={permissions.error} onRetry={permissions.refetch} />
      ) : allowed ? (
        children
      ) : (
        <NoAccessState description={t("noAccessDescription")} />
      )}
    </>
  );
}
