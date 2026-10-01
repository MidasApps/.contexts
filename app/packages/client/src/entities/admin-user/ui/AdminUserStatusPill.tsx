"use client";

import type { AdminUserSummary } from "@core/contracts";
import { useTranslations } from "use-intl";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

/** `active` or `disabled` (a disabled user holds no permission). */
export function AdminUserStatusPill({ status }: { status: AdminUserSummary["status"] }) {
  const t = useTranslations("admin.users.status");
  return <StatusPill tone={status === "active" ? "emerald" : "neutral"}>{t(status)}</StatusPill>;
}
