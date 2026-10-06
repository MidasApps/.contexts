"use client";

import { WifiOffIcon } from "lucide-react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";

export type OfflineNoticeProps = {
  /** Offer a manual reconnect check (the app shell re-runs failed queries). */
  onRetry?: (() => void) | undefined;
  className?: string;
};

/**
 * Presentational offline banner (SP2 spec §9 "offline banner"); the app shell decides when to show
 * it from `navigator.onLine` and online/offline events. Polite status in the amber tint: it
 * degrades the page, it does not block it.
 */
export function OfflineNotice({ onRetry, className }: OfflineNoticeProps) {
  const t = useTranslations("common");
  return (
    <Alert variant="warning" data-state="offline" className={cn("items-center", className)}>
      <WifiOffIcon aria-hidden="true" />
      <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-2 text-inherit">
        <span>{t("states.offline")}</span>
        {onRetry === undefined ? null : (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("actions.retry")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
