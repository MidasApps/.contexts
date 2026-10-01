"use client";

import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { useAdminItems } from "#/widgets/admin-sidebar/index.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { PageNotFound, QueryPage } from "#/widgets/page-state/index.ts";

function AdminSlotPage({ rest }: { rest: string }) {
  const t = useTranslations();
  const { items } = useAdminItems();
  // The area is the item whose path is `rest` or contains it (`users/42` belongs to `users`).
  const area = items.find(({ route }) => route.id === "admin" && route.rest !== "" && (rest === route.rest || rest.startsWith(`${route.rest}/`)));
  if (area === undefined) return <PageNotFound />;
  const name = area.route.id === "admin" ? area.route.rest : "";
  const descriptionKey = `admin.descriptions.${name}`;
  return (
    <>
      <PageHeader eyebrow={t("admin.slot.eyebrow")} title={t(area.item.labelKey)} {...(t.has(descriptionKey) ? { description: t(descriptionKey) } : {})} />
      <EmptyState
        headingLevel={2}
        icon={area.item.icon}
        title={t("admin.slot.emptyTitle")}
        description={t("admin.slot.emptyDescription")}
        action={
          <Button variant="secondary" asChild>
            <RouteLink to={{ id: "admin", rest: "" }}>{t("admin.slot.backToHome")}</RouteLink>
          </Button>
        }
      />
    </>
  );
}

/**
 * `/admin/<area>/…` (SP2 spec §7): an admin area registered in the `admin` navigation slot and
 * open to the staff role renders its empty state until SP5 (or a module) provides the page; any
 * other path — or an area the role cannot open — is not found, like the surface itself.
 */
export function AdminSlotView() {
  const t = useTranslations("admin.slot");
  const rest = useRouter().useRouteParams()["rest"] ?? "";
  const me = useMe();
  return (
    <QueryPage query={me} loadingLabel={t("loading")}>
      {() => <AdminSlotPage rest={rest} />}
    </QueryPage>
  );
}
