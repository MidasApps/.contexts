import { useMe } from "@core/client/entities/session";
import { useEffect, type ReactNode } from "react";
import { resolveDesktopLocale, useLocale, type LocaleStore } from "@/adapters/desktop-locale.ts";
import type { DesktopApp } from "@/router-context.ts";
import { DesktopShell } from "./desktop-shell.tsx";

/** Applies the profile locale once `GET /v1/me` answers (and again whenever the user changes it). */
function ProfileLocaleSync({ store }: { store: LocaleStore }) {
  const profileLocale = useMe().data?.preferences.locale;
  useEffect(() => {
    // An unsupported profile locale keeps the current language (negotiated from the OS at start).
    if (profileLocale !== undefined) store.set(resolveDesktopLocale({ profileLocale, languages: [store.get()] }));
  }, [profileLocale, store]);
  return null;
}

/**
 * Root of the desktop UI (inside TanStack's provider): the shared `ClientApp` providers in the
 * current language, `<html lang>` kept in sync for assistive technology, then the shell frame.
 */
export function DesktopRoot({ app, children }: { app: DesktopApp; children: ReactNode }) {
  const locale = useLocale(app.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <app.ClientApp locale={locale}>
      <ProfileLocaleSync store={app.locale} />
      <DesktopShell sidebar={app.sidebar}>{children}</DesktopShell>
    </app.ClientApp>
  );
}
