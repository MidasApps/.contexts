"use client";

import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "use-intl";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";

export type NoAccessStateProps = Omit<ComponentProps<typeof StatePanel>, "icon" | "tone" | "title"> & {
  /** Defaults to `common.noAccess.title`. */
  title?: ReactNode;
  /** Defaults to `common.noAccess.description` (ask an administrator). */
  description?: ReactNode;
};

/**
 * The user is signed in but lacks the permission for this page or section (API 403,
 * `FORBIDDEN`). Says what to do next; the `action` slot usually links back home. Resources the
 * user cannot see at all answer 404 and render the not-found view instead (SP2 spec §4).
 */
export function NoAccessState({ title, description, ...props }: NoAccessStateProps) {
  const t = useTranslations("common.noAccess");
  return (
    <StatePanel
      data-state="no-access"
      icon="lock"
      tone="amber"
      title={title ?? t("title")}
      description={description ?? t("description")}
      {...props}
    />
  );
}
