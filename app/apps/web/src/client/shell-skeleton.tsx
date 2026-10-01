"use client";

import { LoadingState } from "@core/client/shared/ui/molecules/LoadingState/LoadingState";
import { useTranslations } from "use-intl";

/**
 * Fallback while a guarded layout checks the session on the server (Cache Components streams it
 * inside `<Suspense>`): one polite status, no shell chrome yet.
 */
export function ShellSkeleton() {
  const t = useTranslations("shell.home");
  return (
    <main id="main" className="mx-auto grid min-h-svh w-full max-w-[1280px] place-items-center px-6">
      <LoadingState variant="spinner" label={t("loading")} />
    </main>
  );
}

/** Fallback of the entry pages (sign-in, invitation) while their search params resolve. */
export function EntrySkeleton() {
  return (
    <main id="main" className="grid min-h-svh place-items-center px-6">
      <LoadingState variant="spinner" />
    </main>
  );
}
