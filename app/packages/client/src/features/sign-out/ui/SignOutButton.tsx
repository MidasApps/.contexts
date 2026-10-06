"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { useSignOut } from "../model/use-sign-out.ts";

/** "Sign out" as a button (pages such as a failed invitation); menus call `useSignOut` directly. */
export function SignOutButton({
  children,
  landing,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "pending"> & { landing?: Route | null }) {
  const t = useTranslations("auth.signOut");
  const { signOut, pending } = useSignOut(landing);
  return (
    <Button variant="outline" {...props} pending={pending} onClick={() => void signOut()}>
      <Icon name="log-out" />
      {children ?? t("action")}
    </Button>
  );
}
