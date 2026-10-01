"use client";

import { useState } from "react";
import { useTranslations } from "use-intl";
import { useClientConfig } from "#/shared/config/config-context.tsx";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { authErrorCode } from "#/shared/lib/auth/auth-error-code.ts";
import type { EnrolledFactor } from "#/shared/lib/auth/auth-port.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { useEnrolledFactors } from "../model/use-enrolled-factors.ts";
import { EnrollSmsDialog } from "./EnrollSmsDialog.tsx";
import { EnrollTotpDialog } from "./EnrollTotpDialog.tsx";

function FactorRow({ factor, onRemove }: { factor: EnrolledFactor; onRemove: () => void }) {
  const t = useTranslations("profile.security.mfa");
  const formatDateTime = useFormatDateTime();
  const kind = factor.factor === "totp" ? t("kindTotp") : t("kindSms");
  const name = factor.displayName ?? kind;
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={factor.factor === "totp" ? "shield-check" : "smartphone"} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">
          {kind}
          {factor.phoneNumber === null ? null : <span className="font-mono tabular-nums"> · {factor.phoneNumber}</span>}
          {factor.enrolledAt === null ? null : <> · {t("enrolledAt", { date: formatDateTime(factor.enrolledAt, "date") })}</>}
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={onRemove} aria-label={t("removeNamed", { name })}>
        {t("remove")}
      </Button>
    </li>
  );
}

/** Unenroll with confirmation; the last factor's removal warns that sign-in drops to one step. */
function useRemoveFactor(factors: readonly EnrolledFactor[], refresh: () => Promise<void>) {
  const t = useTranslations("profile.security.mfa");
  const auth = useAuth();
  const [target, setTarget] = useState<EnrolledFactor | null>(null);
  const [error, setError] = useState<string | undefined>();
  const tAuth = useTranslations("auth.errors");
  const confirm = async (): Promise<boolean> => {
    if (target === null) return true;
    try {
      await auth.unenrollMfa(target.uid);
      await refresh();
      notify.success(t("removed"));
      return true;
    } catch (failure: unknown) {
      setError(tAuth(authErrorCode(failure)));
      return false;
    }
  };
  const open = (factor: EnrolledFactor | null) => {
    setError(undefined);
    setTarget(factor);
  };
  return { target, error, confirm, open, last: factors.length === 1 };
}

/**
 * Second factors of the signed-in user (SP2 spec §8 profile/security): the enrolled factors with
 * removal (confirmed), and enrollment of the factors this environment offers (`mfaFactors`: TOTP in
 * remote environments, SMS locally), each in its own dialog.
 */
export function MfaFactorsSection() {
  const t = useTranslations("profile.security.mfa");
  const offered = useClientConfig().mfaFactors;
  const { factors, refresh } = useEnrolledFactors();
  const [enrolling, setEnrolling] = useState<"totp" | "phone" | null>(null);
  const removal = useRemoveFactor(factors, refresh);
  const enrolled = async (): Promise<void> => {
    await refresh();
    notify.success(t("enrolled"));
  };
  const actions = (
    <div className="flex flex-wrap gap-2">
      {offered.includes("totp") ? (
        <Button variant={factors.length === 0 ? "default" : "outline"} onClick={() => setEnrolling("totp")}>
          <Icon name="plus" />
          {t("addTotp")}
        </Button>
      ) : null}
      {offered.includes("phone") ? (
        <Button variant={factors.length === 0 && !offered.includes("totp") ? "default" : "outline"} onClick={() => setEnrolling("phone")}>
          <Icon name="plus" />
          {t("addSms")}
        </Button>
      ) : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <StatusPill tone={factors.length > 0 ? "emerald" : "amber"} icon={factors.length > 0 ? "circle-check" : "alert-triangle"}>
          {factors.length > 0 ? t("statusOn") : t("statusOff")}
        </StatusPill>
      </div>
      {factors.length === 0 ? (
        <EmptyState icon="shield" headingLevel={3} title={t("emptyTitle")} description={offered.length === 0 ? t("unavailable") : t("emptyDescription")} action={offered.length === 0 ? undefined : actions} />
      ) : (
        <>
          <ul aria-label={t("listLabel")} className="divide-y divide-border rounded-lg border border-border">
            {factors.map((factor) => (
              <FactorRow key={factor.uid} factor={factor} onRemove={() => removal.open(factor)} />
            ))}
          </ul>
          {offered.length === 0 ? null : actions}
        </>
      )}
      <EnrollTotpDialog open={enrolling === "totp"} onOpenChange={(open) => setEnrolling(open ? "totp" : null)} onEnrolled={enrolled} />
      <EnrollSmsDialog open={enrolling === "phone"} onOpenChange={(open) => setEnrolling(open ? "phone" : null)} onEnrolled={enrolled} />
      <ConfirmDialog
        open={removal.target !== null}
        onOpenChange={(open) => !open && removal.open(null)}
        title={t("removeTitle")}
        description={removal.last ? t("removeLastDescription") : t("removeDescription")}
        confirmLabel={t("remove")}
        destructive
        onConfirm={removal.confirm}
        error={removal.error}
      />
    </div>
  );
}
