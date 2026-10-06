"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { RequestPasswordResetForm } from "#/features/reset-password/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { AuthTemplate } from "#/shared/ui/templates/AuthTemplate/AuthTemplate.tsx";
import { AuthBrand, EntryLocaleSwitcher } from "#/widgets/auth-entry/index.ts";

/**
 * `/reset-password` (SH-02): asks for the account email and sends the Firebase reset link; the
 * new password is chosen on the page that link opens. Works signed in or out (no session needed).
 */
export function ResetPasswordView({ brand, footer }: { brand?: ReactNode; footer?: ReactNode }) {
  const t = useTranslations("auth.resetPassword");
  return (
    <AuthTemplate brand={brand ?? <AuthBrand />} footer={footer ?? <EntryLocaleSwitcher />}>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <RequestPasswordResetForm />
      <RouteLink to={{ id: "sign-in" }} className="text-center text-sm font-medium underline underline-offset-4">
        {t("backToSignIn")}
      </RouteLink>
    </AuthTemplate>
  );
}
