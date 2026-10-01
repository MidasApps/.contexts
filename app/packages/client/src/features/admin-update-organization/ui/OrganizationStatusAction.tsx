"use client";

import type { OrganizationAdminSummary } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { useOrganizationWrites } from "../model/use-organization-writes.ts";

/**
 * Suspends an active organization (its members lose access until it is reactivated) or
 * reactivates a suspended one. Both ask for confirmation; suspending is the destructive one.
 */
export function OrganizationStatusAction({ organization }: { organization: OrganizationAdminSummary }) {
  const t = useTranslations("admin.organizationDetail.status");
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const writes = useOrganizationWrites(organization.id);
  const suspending = organization.status === "active";
  const action = useConfirmedAction(
    async () => void (await writes.update({ status: suspending ? "suspended" : "active" })),
    () => notify.success(suspending ? t("suspended", { name: organization.name }) : t("reactivated", { name: organization.name })),
  );
  return (
    <>
      <Button variant={suspending ? "destructive" : "secondary"} onClick={() => setOpen(true)} disabled={!online}>
        {suspending ? t("suspend") : t("reactivate")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) action.reset();
          setOpen(next);
        }}
        title={suspending ? t("suspendTitle", { name: organization.name }) : t("reactivateTitle", { name: organization.name })}
        description={suspending ? t("suspendDescription") : t("reactivateDescription")}
        confirmLabel={suspending ? t("suspendConfirm") : t("reactivateConfirm")}
        destructive={suspending}
        onConfirm={action.confirm}
        error={action.error}
      />
    </>
  );
}
