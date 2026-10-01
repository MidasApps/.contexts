"use client";

import { useState } from "react";
import { useTranslations } from "use-intl";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { useImpersonationStore } from "../model/use-impersonation-store.ts";

/**
 * "Leave support mode" (decision 0047): the server ends the impersonation (audited) and the tab
 * returns to the staff account on `/admin/users`, without a new sign-in. When the staff session
 * cannot be restored (it ended, or the platform has no `/admin`), it signs out completely: never
 * stay as the user.
 */
export function LeaveImpersonationButton() {
  const t = useTranslations("admin.impersonation.banner");
  const session = useSession();
  const router = useRouter();
  const reset = useImpersonationStore((state) => state.reset);
  const [pending, setPending] = useState(false);

  const leave = async (): Promise<void> => {
    setPending(true);
    try {
      await session.leaveImpersonation();
      reset();
      router.navigate({ id: "admin", rest: "users" }, { replace: true });
    } catch {
      reset();
      await session.signOut().catch(() => undefined);
      router.navigate({ id: "sign-in" }, { replace: true });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="outline" size="sm" pending={pending} onClick={() => void leave()}>
      <Icon name="log-out" />
      {t("leave")}
    </Button>
  );
}
