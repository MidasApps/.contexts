"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";

export { useOnlineStatus };

/**
 * Offline banner for the shell layouts (SP2 spec §9). The live region stays mounted so the notice is
 * announced when it appears; "Try again" re-runs the active queries.
 */
export function OfflineBanner({ className }: { className?: string }) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const retry = () => void queryClient.refetchQueries({ type: "active" });
  return (
    <div aria-live="polite" aria-atomic="true" data-slot="offline-banner" className={className}>
      {online ? null : <OfflineNotice onRetry={retry} />}
    </div>
  );
}
