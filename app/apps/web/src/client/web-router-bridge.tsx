"use client";

import type { SupportedLocale } from "@core/i18n";
import { useLayoutEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import type { WebRouterAdapter } from "./web-router-adapter";

/**
 * Hands next-intl's router (a hook) to the router port (plain functions, decision 0012 §2). A
 * layout effect runs before the views' effects, so their first `navigate` already goes through it.
 */
export function WebRouterBridge({ adapter }: { adapter: WebRouterAdapter }) {
  const router = useRouter();
  useLayoutEffect(() => {
    adapter.attach({
      push: (href) => router.push(href),
      replace: (href) => router.replace(href),
      replaceInLocale: (href, locale: SupportedLocale) => router.replace(href, { locale }),
    });
    return () => adapter.attach(null);
  }, [adapter, router]);
  return null;
}
